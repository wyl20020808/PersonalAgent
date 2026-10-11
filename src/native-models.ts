import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { assertOperationPolicy } from './interaction-policy.js';
import { terminateTree } from './process.js';
import { redact } from './telemetry.js';

export interface NativeModels { models: { id: string; name: string; description: string; reasoningEfforts?: string[]; defaultReasoningEffort?: string }[]; reason?: string }
/** Read-only catalog from the installed CLI; no model turn or project Session is created. */
export async function discoverNativeModels(backend: 'claude-code' | 'codex', nodeExecutable = process.execPath): Promise<NativeModels> {
  if (backend === 'claude-code') return { models: [
    { id: 'sonnet', name: 'Sonnet', description: 'Claude Code Sonnet 别名', reasoningEfforts: ['low','medium','high','xhigh','max'] },
    { id: 'opus', name: 'Opus', description: 'Claude Code Opus 别名', reasoningEfforts: ['low','medium','high','xhigh','max'] },
    { id: 'haiku', name: 'Haiku', description: 'Claude Code Haiku 别名', reasoningEfforts: ['low','medium','high','xhigh','max'] }
  ] };
  assertOperationPolicy({ kind: 'model' });
  try {
    const entry = path.join(path.dirname(createRequire(import.meta.url).resolve('@openai/codex/package.json')), 'bin/codex.js');
    const child = spawn(nodeExecutable, [entry, 'app-server'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'ignore'] });
    let pending = '', nextId = 0, failure: Error | undefined;
    const requests = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    const fail = (error: Error) => { failure = error; for (const request of requests.values()) request.reject(error); requests.clear(); };
    const timer = setTimeout(() => fail(new Error('Codex 模型查询超时')), 10000);
    const closed = new Promise<void>(resolve => { child.on('close', () => { fail(new Error('Codex 模型服务已退出')); resolve(); }); child.on('error', error => { fail(error); resolve(); }); });
    child.stdin.on('error', fail); child.stdout.on('error', fail); child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      pending += chunk;
      if (pending.length > 1024 * 1024) { fail(new Error('Codex 模型响应过大')); return; }
      let index: number;
      while ((index = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, index); pending = pending.slice(index + 1);
        try { const event = JSON.parse(line), request = requests.get(event.id); if (!request) continue; requests.delete(event.id); if (event.error) request.reject(new Error(event.error.message || 'Codex 模型查询失败')); else request.resolve(event.result); }
        catch { fail(new Error('Codex 模型服务返回无效协议')); }
      }
    });
    const send = (method: string, params: object) => new Promise<any>((resolve, reject) => {
      if (failure) { reject(failure); return; }
      const id = ++nextId; requests.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
    });
    try {
      await send('initialize', { clientInfo: { name: 'personalagent-model-picker', version: '1.0.0' }, capabilities: {} });
      child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
      const models: NativeModels['models'] = []; let cursor: string | null = null;
      do {
        const result = await send('model/list', { limit: 100, cursor });
        if (!Array.isArray(result?.data)) throw new Error('Codex 模型列表格式无效');
        for (const item of result.data) if (typeof item.model === 'string' && /^[a-zA-Z0-9._:/-]{1,200}$/.test(item.model)) models.push({ id: item.model, name: String(item.displayName || item.model).slice(0,200), description: String(item.description || '').slice(0,500), reasoningEfforts: (item.supportedReasoningEfforts ?? []).map((option:any) => option.reasoningEffort).filter((effort:unknown) => typeof effort === 'string'), defaultReasoningEffort: item.defaultReasoningEffort });
        cursor = result.nextCursor ?? null;
      } while (cursor && models.length < 1000);
      return { models: [...new Map(models.map(model => [model.id, model])).values()] };
    } finally {
      clearTimeout(timer); if (child.pid && child.exitCode === null) await terminateTree(child.pid); await closed;
    }
  } catch (error) { return { models: [], reason: redact((error as Error).message).slice(0,300) }; }
}
