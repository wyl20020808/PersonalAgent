import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRun, drive } from '../dist/src/controller.js';
import { loadProjectContext } from '../dist/src/project-context.js';
import { readProject } from '../dist/src/project-files.js';
import { auditRecords } from '../dist/src/context-trust.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const demo = JSON.parse(fs.readFileSync(path.join(root, 'validation/phase2/mock-demo.json'), 'utf8'));
const configFile = path.join(demo.directory, 'config.json'), config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
demo.source = config.allowedRepositories[0];
const directory = `D:/PersonalAgent-validation/project-context-phase2/${randomUUID().slice(0, 8)}`;
fs.mkdirSync(path.join(directory, 'tmp'), { recursive: true });
const original = readProject(demo.source).digest;
const relative = 'docs/project-context/contracts/geometry.md';
const stores = [];
for (const [action, requestedAction] of [['accepted', 'accepted'], ['rejected', 'accepted'], ['accepted', 'rejected']]) {
  const goal = `Electron Phase2 Mock ${action}-from-${requestedAction} ${path.basename(directory)}`;
  const store = await createRun(config, demo.source, goal);
  const agents = { executionMode: 'native', plan: async () => ({ humanDecision: null, tasks: [{ id: 'combat', moduleIds: ['combat'], instruction: '明确标记 Mock 修改 combat', acceptance: ['Mock 检查'] }] }), execute: async state => {
    fs.writeFileSync(path.join(state.workspace, 'src/combat.js'), 'export const hit=2;\n'); fs.writeFileSync(path.join(state.workspace, 'src/world.js'), 'export const wall=2;\n'); return { mode: 'native', summary: '明确标记 Mock 同时修改 combat 和 world' };
  }, review: async () => ({ verdict: 'human', reason: '明确标记 Mock：需要正式确认契约并核对文档及哈希', contextConfirmations: [{ relative, action: requestedAction }] }) };
  assert.equal((await drive(store, agents)).phase, 'paused'); stores.push({ store, action, requestedAction, goal });
}
const { _electron } = await import(pathToFileURL(process.env.PERSONAL_AGENT_PLAYWRIGHT ?? 'D:/PersonalAgent/snake-validation/node_modules/playwright-core/index.mjs').href);
const env = { ...process.env, PERSONAL_AGENT_DESKTOP_DATA: path.join(directory, 'data'), TEMP: path.join(directory, 'tmp'), TMP: path.join(directory, 'tmp') }; delete env.ELECTRON_RUN_AS_NODE;
let app, page; const checks = [], screenshots = [], errors = [];
async function check(name, action) { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name); }
async function shot(name) { const file = path.join(directory, name + '.png'); await page.screenshot({ path: file }); screenshots.push(file); }
const nav = name => page.locator('.rail').getByRole('button', { name: new RegExp('^' + name) }).click();
try {
  app = await _electron.launch({ executablePath: path.join(root, 'desktop/node_modules/electron/dist/electron.exe'), args: [path.join(root, 'desktop')], env, timeout: 30000 });
  page = await app.firstWindow(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message)); await page.waitForSelector('.group-workspace');
  await app.evaluate(({ dialog }, configFile) => {
    globalThis.__phase2Dialogs = [];
    dialog.showMessageBox = async (_window, options) => {
      if (options.message.startsWith('确认信任')) { if (!options.detail.includes(configFile)) throw Error('Unexpected config'); }
      else if (options.message === '正式契约/决策确认；不批准成果交付') { if (!options.detail.includes('geometry') || !options.detail.includes('同一世界坐标系') || !options.detail.includes('摘要：')) throw Error('Document/digest missing'); }
      else throw Error('Unexpected authorization dialog');
      globalThis.__phase2Dialogs.push(options); return { response: 1 };
    };
  }, configFile);
  await page.evaluate(file => window.personalAgent.invoke({ operation: 'importProfile', file }), configFile);
  for (const { store, action, requestedAction, goal } of stores) {
    await nav('运行记录'); await page.locator('.run-row').filter({ hasText: goal }).click(); await nav('项目群');
    await check(`真实 Electron 展示 ${action} 请求的项目、工作区、全文、摘要与扩展模块`, async () => {
      await page.getByText('正式文档确认：共享几何契约（Mock）（geometry）', { exact: true }).waitFor();
      const text = await page.locator('.group-workspace').innerText(); assert.match(text, /额外模块：world/); assert.match(text, /MODULE_DOC_UNCHANGED/); assert.match(text, /MODULE_HASH_MISMATCH/); assert.match(text, /未确认|proposed/); assert.match(text, /同一世界坐标系/); assert.match(text, /内容摘要 SHA-256/);
      await page.getByText('Project Context · 当前快照检查', { exact: true }).scrollIntoViewIfNeeded(); await shot(action + '-from-' + requestedAction + '-scope');
      const card = page.locator('.decision-workbench').filter({ has: page.getByText('正式文档确认：共享几何契约（Mock）（geometry）', { exact: true }) });
      const cardImage = path.join(directory, action + '-from-' + requestedAction + '-request.png'); await card.screenshot({ path: cardImage }); screenshots.push(cardImage);
    });
    await check(`正式 ${action} 按钮仅更新隔离文档，审计真实落盘且不批准 Delivery`, async () => {
      await page.getByRole('button', { name: action === 'accepted' ? requestedAction === 'accepted' ? '明确接受此文档' : '明确接受此提议' : '明确拒绝此提议', exact: true }).click();
      await page.waitForFunction(async id => { const overview = await window.personalAgent.invoke({ operation: 'overview' }); const run = overview.runs.find(run => run.id === id); return run?.contextConfirmations?.length === 0; }, store.id);
      const state = store.load(), context = loadProjectContext(state.workspace, true, { runtimeDir: config.runtimeDir, source: demo.source });
      assert.equal(context.contracts[0].metadata.status, action); assert.equal(context.contracts[0].trust.verified, true); assert.equal(state.phase, 'paused'); assert.equal(state.evidence, null); assert.equal(readProject(demo.source).digest, original);
      assert.equal(fs.existsSync(store.file('deliveries')), false); assert.ok(auditRecords(store.file('audit.jsonl')).some(record => record.event === 'human-decision' && record.data.action === action)); await shot(action + '-from-' + requestedAction + '-decided');
    });
  }
  await check('取消默认按钮、无页面错误、白色群聊与无横向溢出保持', async () => {
    const dialogs = await app.evaluate(() => globalThis.__phase2Dialogs); assert.equal(dialogs.filter(dialog => dialog.message === '正式契约/决策确认；不批准成果交付').length, 3); assert.ok(dialogs.every(dialog => dialog.defaultId === 0)); assert.equal(errors.length, 0);
    const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, color: getComputedStyle(document.querySelector('.group-workspace')).backgroundColor })); assert.ok(layout.scroll <= layout.width); assert.ok(!['rgb(0, 0, 0)', 'rgb(16, 16, 16)'].includes(layout.color));
  });
} catch (error) { checks.push({ name: 'flow-failure', passed: false, error: error.stack }); if (page) await shot('failure').catch(() => {}); }
finally { if (app) await app.close().catch(() => {}); }
const report = { label: '明确标记 Mock；真实 Electron 实窗，正式 Controller API；无真实付费 Agent、无真实项目修改', directory, checks, screenshots, errors, realAgentCalls: 0, sourceProtected: readProject(demo.source).digest === original, passed: checks.filter(check => check.passed).length, failed: checks.filter(check => !check.passed).length };
fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(report, null, 2)); fs.writeFileSync(path.join(root, 'validation/phase2/electron-phase2.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
