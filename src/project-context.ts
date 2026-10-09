import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isMap, parseDocument, stringify } from 'yaml';
import { projectTarget } from './project-files.js';
import { replaceAtomic } from './store.js';
import { FlowError } from './failure.js';
import { verifyConfirmation, confirmationDigest, type AuditScope, type ConfirmationTrust } from './context-trust.js';

export const contextRoot = 'docs/project-context';
export const contextHash = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const identifier = /^[a-zA-Z0-9_-]{1,64}$/;
const sha256 = /^[a-f0-9]{64}$/;
const sections = { overview: ['项目目标', '范围', '非目标', '总体结构'], module: ['职责', '边界', '入口与测试'], contract: ['约束', '检查方式'], decision: ['决定', '原因', '未采用方案'] };
export type ContextKind = keyof typeof sections;
export interface ContextDocument {
  trust?: ConfirmationTrust;
  kind: ContextKind; relative: string; path: string; content: string; hash: string; bytes: number;
  metadata: Record<string, any>; frontmatterEnd: number; newline: string;
}
export interface ModuleDocument extends ContextDocument { metadata: { schema: 1; kind: 'module'; id: string; name: string; paths: string[]; depends_on: string[]; checked_files: Record<string, string> } }
export interface ProjectContext { enabled: boolean; overview?: ContextDocument; modules: ModuleDocument[]; contracts: ContextDocument[]; decisions: ContextDocument[] }
function invalid(message: string): never { throw new FlowError('validation', `Project Context 文档错误：${message}`); }
function object(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === 'string' && !!value.trim(); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(text) && new Set(value).size === value.length; }
export function contextPath(relative: string, directory = false): boolean {
  const name = directory && relative.endsWith('/') ? relative.slice(0, -1) : relative;
  if (!name || /[\\:*?\[\]\x00-\x1f]/.test(name) || name.startsWith('/')) return false;
  return name.split('/').every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^(?:\.git|\.codex|\.claude|\.env(?:\..*)?|node_modules|dist|build|out|\.cache|\.tmp|\.runtime|auth\.json|\.?credentials\.json|.*\.(?:pem|key)|CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(part));
}
export function belongsToModule(module: ModuleDocument, file: string): boolean { return module.metadata.paths.some(declared => declared.endsWith('/') ? file.startsWith(declared) : file === declared); }
// Reject clearly unsuitable stamp targets, without restricting source languages.
export function stampEligible(file: string): boolean {
  return contextPath(file) && !/(^|\/)(?:tests?|__tests__|validation|coverage|artifacts|generated)(\/|$)/i.test(file)
    && !/(?:^|\/)(?:README(?:\.[^/]*)?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.gitignore|\.gitattributes|\.editorconfig|\.npmrc)$/i.test(file)
    && !/\.(?:md|markdown|rst|txt|json|lock|map|png|jpg|svg|zip)$/i.test(file)
    && !/(?:[.-](?:test|spec)\.[^/]+|(?:validation|验收)[^/]*\.[^/]+|(?:^|\/)validate[-_.][^/]+|[.-]acceptance\.[^/]+)$/i.test(file);
}
function docTarget(workspace: string, relative: string): string {
  const target = projectTarget(workspace, relative);
  if (existsSync(target) && (!lstatSync(target).isFile() || lstatSync(target).nlink > 1)) invalid(`不是普通文档文件：${relative}`);
  return target;
}
export function parseContextDocument(workspace: string, relative: string, kind: ContextKind, candidate?: Buffer): ContextDocument {
  const target = docTarget(workspace, relative), bytes = candidate ?? readFileSync(target), content = bytes.toString('utf8');
  if (!Buffer.from(content).equals(bytes) || bytes.includes(0)) invalid(`${relative} 必须是 UTF-8 文本`);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b|(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9_+\/=-]{20,}["']/i.test(content)) invalid(`${relative} 包含疑似敏感值，不装配进提示词`);
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), lines = normalized.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const limit = kind === 'overview' ? 60 : kind === 'module' ? 100 : 80;
  if (lines.length > limit || lines.some(line => [...line].length > 300)) invalid(`${relative} 超出 ${limit} 行或单行 300 字符`);
  const end = lines.indexOf('---', 1);
  if (lines[0] !== '---' || end < 1) invalid(`${relative} 缺少 YAML frontmatter`);
  const yaml = parseDocument(lines.slice(1, end).join('\n'), { uniqueKeys: true });
  if (yaml.errors.length) invalid(`${relative} YAML 格式错误`);
  let data: unknown;
  try { data = yaml.toJS({ maxAliasCount: 0 }); } catch { invalid(`${relative} 不支持 YAML 别名`); }
  if (!object(data) || data.schema !== 1 || data.kind !== kind) invalid(`${relative} schema/kind 无效`);
  const required = kind === 'overview' ? ['schema', 'kind', 'project_id', 'name'] : kind === 'module' ? ['schema', 'kind', 'id', 'name', 'paths', 'depends_on', 'checked_files'] : ['schema', 'kind', 'id', 'title', 'modules', 'status', 'basis'];
  const allowed = [...required, ...(kind === 'contract' || kind === 'decision' ? ['supersedes'] : [])];
  if (required.some(key => !Object.hasOwn(data, key)) || Object.keys(data).some(key => !allowed.includes(key))) invalid(`${relative} 必需字段缺失或包含额外字段`);
  if (kind === 'overview') {
    if (!text(data.name) || !text(data.project_id) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.project_id)) invalid(`${relative} project_id/name 无效`);
  } else {
    if (!text(data.id) || !identifier.test(data.id) || path.basename(relative) !== `${data.id}.md`) invalid(`${relative} ID/文件名无效`);
    if (kind === 'module') {
      if (!text(data.name) || !strings(data.paths) || !data.paths.length || !data.paths.every(p => contextPath(p, true)) || !strings(data.depends_on) || !data.depends_on.every(id => identifier.test(id)) || !object(data.checked_files) || Object.keys(data.checked_files).length > 20) invalid(`${relative} 模块字段无效`);
      for (const [file, hash] of Object.entries(data.checked_files)) if (!contextPath(file) || !sha256.test(String(hash)) || typeof hash !== 'string' || !data.paths.some(p => p.endsWith('/') ? file.startsWith(p) : file === p)) invalid(`${relative} checked_files 无效`);
    } else {
      if (!text(data.title) || !strings(data.modules) || !data.modules.length || !data.modules.every(id => identifier.test(id)) || !['proposed', 'accepted', 'rejected', 'superseded'].includes(data.status)) invalid(`${relative} 状态或关联模块无效`);
      const basis = Array.isArray(data.basis) ? data.basis : [data.basis];
      if (!basis.length) invalid(`${relative} basis 不能为空`);
      for (const entry of basis) {
        if (!object(entry) || Object.keys(entry).sort().join(',') !== 'kind,ref' || !['user-confirmation', 'agent-proposal', 'code', 'test', 'document'].includes(entry.kind) || !text(entry.ref)) invalid(`${relative} basis 必须使用 kind/ref`);
        if (['code', 'test', 'document'].includes(entry.kind)) {
          const reference = entry.ref.split('#')[0]!.replace(/:\d+(?:-\d+)?$/, '');
          if (!contextPath(reference) || !existsSync(docTarget(workspace, reference))) invalid(`${relative} 依据文件不存在或不安全`);
        }
      }
      if (data.supersedes !== undefined && (!text(data.supersedes) || !identifier.test(data.supersedes))) invalid(`${relative} supersedes 格式错误`);
    }
  }
  const actualSections = lines.slice(end + 1).filter(line => /^#{1,6}\s/.test(line)).map(line => line.replace(/^#{1,6}\s+/, ''));
  if (JSON.stringify(actualSections) !== JSON.stringify(sections[kind])) invalid(`${relative} 固定章节不匹配`);
  return { kind, relative, path: target, content, hash: contextHash(bytes), bytes: bytes.length, metadata: data, frontmatterEnd: end, newline: content.includes('\r\n') ? '\r\n' : '\n' };
}
export function loadProjectContext(workspace: string, required = false, scope?: AuditScope): ProjectContext {
  const overviewPath = projectTarget(workspace, `${contextRoot}/overview.md`);
  if (!existsSync(overviewPath)) {
    if (required) invalid('overview.md 丢失；当前 Run 不得降级为旧流程');
    return { enabled: false, modules: [], contracts: [], decisions: [] };
  }
  const overview = parseContextDocument(workspace, `${contextRoot}/overview.md`, 'overview');
  function read(kind: 'module' | 'contract' | 'decision'): ContextDocument[] {
    const folder = projectTarget(workspace, `${contextRoot}/${kind}s`);
    if (!existsSync(folder)) return [];
    return readdirSync(folder).sort().map(name => {
      if (!/^[a-zA-Z0-9_-]{1,64}\.md$/.test(name)) invalid(`${kind}s 中存在非约定文档`);
      return parseContextDocument(workspace, `${contextRoot}/${kind}s/${name}`, kind);
    });
  }
  const modules = read('module') as ModuleDocument[], contracts = read('contract'), decisions = read('decision');
  const documents = [...modules, ...contracts, ...decisions], ids = new Set<string>();
  for (const doc of documents) { if (ids.has(doc.metadata.id)) invalid(`重复 ID：${doc.metadata.id}`); ids.add(doc.metadata.id); }
  const moduleIds = new Set(modules.map(doc => doc.metadata.id));
  for (const module of modules) if (module.metadata.depends_on.some(id => !moduleIds.has(id) || id === module.metadata.id)) invalid(`${module.relative} 依赖模块不存在或指向自身`);
  for (const doc of [...contracts, ...decisions]) {
    doc.trust = verifyConfirmation(doc, overview.metadata.project_id, scope);
    if (doc.metadata.modules.some((id: string) => !moduleIds.has(id))) invalid(`${doc.relative} 关联模块不存在`);
    if (doc.metadata.supersedes && !documents.some(other => other.kind === doc.kind && other.metadata.id === doc.metadata.supersedes && other !== doc)) invalid(`${doc.relative} supersedes 引用不存在`);
  }
  for (const doc of [...contracts, ...decisions]) if (doc.metadata.status === 'superseded' && doc.trust?.verified) {
    const replacement = [...contracts, ...decisions].find(other => other.kind === doc.kind && other.metadata.id === doc.trust?.replacement?.id && other.relative === doc.trust?.replacement?.relative);
    if (!replacement || replacement.metadata.status !== 'accepted' || !replacement.trust?.verified || replacement.metadata.supersedes !== doc.metadata.id || confirmationDigest(replacement) !== doc.trust.replacement?.digest) doc.trust = { verified: false, effectiveStatus: 'unverifiable', reason: '替代方案内容或确认已变化，旧替代授权不能复用' };
  }
  return { enabled: true, overview, modules, contracts, decisions };
}
export function stampContext(workspace: string, moduleId: string, files: string[]): { module: string; files: Record<string, string> } {
  const root = realpathSync(workspace), context = loadProjectContext(root, true), module = context.modules.find(doc => doc.metadata.id === moduleId);
  if (!module || !files.length || new Set(files).size !== files.length) invalid('盖章需要有效模块和不重复的文件参数');
  const checked = { ...module.metadata.checked_files }, results: Record<string, string> = {};
  for (const file of files) {
    if (!stampEligible(file)) invalid(`盖章只允许核心源码入口或接口文件，不允许文档、测试、锁文件或生成结果：${file}`);
    if (!contextPath(file) || !belongsToModule(module, file)) invalid(`盖章文件不属于模块：${file}`);
    const target = docTarget(root, file);
    if (!existsSync(target)) invalid(`盖章文件不存在：${file}`);
    results[file] = checked[file] = contextHash(readFileSync(target));
  }
  if (Object.keys(checked).length > 20) invalid('checked_files 最多 20 项');
  const lines = module.content.split(/\r?\n/), end = lines.indexOf('---', 1);
  const header = lines.slice(1, end).join(module.newline), yaml = parseDocument(header, { uniqueKeys: true });
  if (!isMap(yaml.contents)) invalid('模块 frontmatter 不是映射');
  const pair = yaml.contents.items.find(item => String(item.key) === 'checked_files');
  const key = pair?.key as { range?: [number, number, number] } | undefined, value = pair?.value as { range?: [number, number, number] } | undefined;
  if (!key?.range || !value?.range) invalid('checked_files 字段无法定位');
  const removed = header.slice(key.range[0], value.range[2]);
  const replacement = stringify({ checked_files: checked }).trimEnd().replace(/\n/g, module.newline) + (removed.endsWith('\n') ? module.newline : '');
  const updatedHeader = header.slice(0, key.range[0]) + replacement + header.slice(value.range[2]);
  const updated = [lines[0]!, updatedHeader, ...lines.slice(end)].join(module.newline);
  // Validate the candidate before replacing the original; parsing never observes a partial write.
  const temp = `${module.path}.${randomUUID()}.tmp`, fd = openSync(temp, 'wx');
  try {
    writeFileSync(fd, updated); fsyncSync(fd);
  } finally { closeSync(fd); }
  try {
    const count = updated.replace(/\r\n/g, '\n').split('\n'); if (count.at(-1) === '') count.pop();
    if (count.length > 100 || count.some(line => [...line].length > 300)) invalid('盖章后模块文档超出行数/行长限制');
    parseContextDocument(root, module.relative, 'module', Buffer.from(updated));
    if (contextHash(readFileSync(module.path)) !== module.hash) invalid('模块文档在盖章期间改变');
    replaceAtomic(temp, module.path);
  } finally { if (existsSync(temp)) unlinkSync(temp); }
  return { module: moduleId, files: results };
}

// Only for the explicitly labelled local Mock onboarding flow, never a real project analysis.
export function mockContextDocuments(projectId: string, sourceFile: string): Record<string, string> {
  const format = (metadata: object, headings: string[]) => `---\n${stringify(metadata)}---\n${headings.map(heading => `## ${heading}\n本地 Mock 建档夹具；不代表真实 Agent 的代码分析。\n`).join('')}`;
  return {
    [`${contextRoot}/overview.md`]: format({ schema: 1, kind: 'overview', project_id: projectId, name: '本地 Mock 建档夹具' }, sections.overview),
    [`${contextRoot}/modules/fixture.md`]: format({ schema: 1, kind: 'module', id: 'fixture', name: '本地夹具', paths: [sourceFile], depends_on: [], checked_files: {} }, sections.module)
  };
}
