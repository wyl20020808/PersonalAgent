import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRun, drive } from '../dist/src/controller.js';
import { MockAgents } from '../dist/src/adapters.js';
import { readProject } from '../dist/src/project-files.js';
import { mockContextDocuments, loadProjectContext } from '../dist/src/project-context.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { _electron } = await import(pathToFileURL(process.env.PERSONAL_AGENT_PLAYWRIGHT ?? 'D:/PersonalAgent/snake-validation/node_modules/playwright-core/index.mjs').href);
const directory = path.join('D:/PersonalAgent-validation/project-context-v11', randomUUID().slice(0, 8));
const source = path.join(directory, 'source'), runtimeDir = path.join(directory, 'runtime'), configFile = path.join(directory, 'mock.config.json');
fs.mkdirSync(path.join(source, 'src'), { recursive: true }); fs.mkdirSync(path.join(directory, 'tmp'));
fs.writeFileSync(path.join(source, 'src/main.ts'), 'export const original = true;\n');
fs.writeFileSync(path.join(source, 'README.md'), '# Disposable local Mock fixture\n');
const config = { allowedRepositories: [source], runtimeDir, projectMode: 'isolated', executionMode: 'native', mode: 'mock', claudeExecutable: 'NEVER-PAID', timeoutMs: 30000, maxClaudeCalls: 4, maxLoops: 2, maxReworks: 1, tests: [{ executable: process.execPath, args: [path.join(root, 'dist/src/cli.js'), 'context-check', '--workspace', '.'] }], mockScenario: 'pass' };
fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
const seeded = mockContextDocuments(randomUUID(), 'src/main.ts');
seeded['docs/project-context/overview.md'] = seeded['docs/project-context/overview.md'].replace('本地 Mock 建档夹具', '既有测试项目');
seeded['docs/project-context/modules/obsolete.md'] = seeded['docs/project-context/modules/fixture.md'].replaceAll('fixture', 'obsolete');
delete seeded['docs/project-context/modules/fixture.md'];
for (const [name, content] of Object.entries(seeded)) { fs.mkdirSync(path.dirname(path.join(source,name)),{recursive:true}); fs.writeFileSync(path.join(source,name),content); }
const original = readProject(source), store = await createRun(config, source, '本地 Mock 建档：仅验证现有预览、批准、应用流程', { purpose: 'context-onboarding' });
const mock = new MockAgents(config);
const agents = { executionMode: 'native', plan: (...args)=>mock.plan(...args), execute: async (...args)=>{ const result=await mock.execute(...args); fs.unlinkSync(path.join(args[0].workspace,'docs/project-context/modules/obsolete.md')); return result; }, review: (...args)=>mock.review(...args) };
const state = await drive(store, agents); assert.equal(state.phase, 'completed', state.reason);
assert.equal(readProject(source).digest, original.digest); assert.equal(loadProjectContext(source).enabled, true);
const env = { ...process.env, PERSONAL_AGENT_DESKTOP_DATA: path.join(directory, 'data'), TEMP: path.join(directory, 'tmp'), TMP: path.join(directory, 'tmp') }; delete env.ELECTRON_RUN_AS_NODE;
let app, page, base; const checks = [], screenshots = [], errors = [];
const overview = () => page.evaluate(() => window.personalAgent.invoke({ operation: 'overview' }));
const deliveries = () => page.evaluate(base => window.personalAgent.invoke({ ...base, operation: 'deliveries' }), base);
const nav = name => page.locator('.rail').getByRole('button', { name: new RegExp('^' + name) }).click();
async function shot(name) { const file = path.join(directory, name + '.png'); await page.locator('h1').scrollIntoViewIfNeeded(); await page.screenshot({ path: file }); screenshots.push(file); }
async function check(name, action) { await action(); checks.push({ name, passed: true }); console.log('PASS ' + name); }
try {
  app = await _electron.launch({ executablePath: path.join(root, 'desktop/node_modules/electron/dist/electron.exe'), args: [path.join(root, 'desktop')], env, timeout: 30000 });
  page = await app.firstWindow(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message)); await page.waitForSelector('.group-workspace');
  // Deterministic native-dialog replies apply ONLY to this newly created local Mock fixture.
  await app.evaluate(({ dialog }, { source, configFile }) => {
    globalThis.__contextDialogs = []; globalThis.__contextApproved = false;
    dialog.showMessageBox = async (_window, options) => {
      if (/真实|额度/.test(options.message)) throw Error('No real-call authorization in this fixture');
      if (options.message.startsWith('确认信任')) { if (!options.detail.includes(configFile)) throw Error('Unexpected config'); }
      else if (options.message.startsWith('批准')) { if (!options.detail.includes(source) || !options.detail.includes('DELETE docs/project-context/modules/obsolete.md')) throw Error('Unexpected delivery'); globalThis.__contextApproved = true; }
      else if (options.message.startsWith('应用')) { if (!globalThis.__contextApproved) throw Error('Approval missing'); }
      else throw Error('Unexpected native dialog');
      globalThis.__contextDialogs.push(options.message); return { response: 1, checkboxChecked: false };
    };
  }, { source, configFile });
  await check('正式 CLI/Controller 创建的隔离 Mock 建档 Run 可在现有 Electron 查看', async () => {
    await page.evaluate(file => window.personalAgent.invoke({ operation: 'importProfile', file }), configFile);
    const info = await overview(), run = info.runs.find(run => run.id === store.id); assert.equal(run.phase, 'completed'); assert.equal(run.mode, 'mock'); assert.equal(run.claudeCalls, 0);
    base = { profileId: run.profileId, runId: run.id }; await nav('运行记录');
    await page.locator('.run-row').filter({ hasText: '本地 Mock 建档' }).click();
    await nav('成果交付'); await shot('01-onboarding-completed');
  });
  await check('现有交付预览显示新增、修改和删除文档；夹具原项目未写入，未批准不可应用', async () => {
    await page.getByRole('button', { name: '生成交付预览', exact: true }).click(); assert.equal(await page.locator('#branch').count(), 0);
    await page.getByRole('button', { name: '生成预览', exact: true }).click(); await page.waitForSelector('.approval-panel');
    const delivery = (await deliveries()).at(-1); assert.equal(delivery.phase, 'preview');
    assert.deepEqual(delivery.changes.map(change => change.path).sort(), ['docs/project-context/modules/fixture.md', 'docs/project-context/modules/obsolete.md', 'docs/project-context/overview.md']);
    assert.equal(readProject(source).digest, original.digest); assert.equal(loadProjectContext(source).enabled, true);
    assert.equal(await page.getByRole('button', { name: '应用已批准内容', exact: true }).isDisabled(), true); await shot('02-preview-documents');
  });
  await check('摘要明确批准与应用分离；批准后夹具原项目仍未改变', async () => {
    const delivery = (await deliveries()).at(-1); await page.getByRole('button', { name: '批准具体交付', exact: true }).click();
    await page.locator('#decision').fill('仅批准新建本地 Mock 文档夹具；不批准真实项目或 proposed 提议');
    assert.equal(await page.getByRole('button', { name: '明确批准', exact: true }).isDisabled(), true);
    await page.locator('#approval-digest').fill(delivery.digest); await page.getByRole('button', { name: '明确批准', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.delivery-header')?.textContent?.includes('已批准'));
    assert.equal(readProject(source).digest, original.digest); assert.equal(loadProjectContext(source).enabled, true); await shot('03-approved-not-applied');
  });
  await check('受控应用删除旧模块；原源码逐字节不变，无 Git 初始化', async () => {
    await page.getByRole('button', { name: '应用已批准内容', exact: true }).click(); await page.getByRole('button', { name: '受控应用', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.delivery-header')?.textContent?.includes('已应用'));
    assert.equal((await deliveries()).at(-1).phase, 'applied'); assert.equal(loadProjectContext(source).enabled, true);
    const after = readProject(source); assert.equal(after.files['src/main.ts'],original.files['src/main.ts']); assert.equal(after.files['README.md'],original.files['README.md']); assert.equal(fs.existsSync(path.join(source,'docs/project-context/modules/obsolete.md')),false);
    assert.equal(fs.existsSync(path.join(source, '.git')), false); assert.deepEqual(errors, []); await shot('04-applied-enabled');
  });
} catch (error) { checks.push({ name: 'flow-failure', passed: false, error: error.stack }); if (page) await shot('failure').catch(() => {}); }
finally { if (app) await app.close().catch(() => {}); }
const report = { directory, source, runId: store.id, workspace: state.workspace, checks, screenshots, errors, realAgentCalls: 0, nativeDialogs: 'Injected responses restricted to fresh local Mock fixture; not a real user approval', passed: checks.filter(check => check.passed).length, failed: checks.filter(check => !check.passed).length };
fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(report, null, 2)); fs.mkdirSync(path.join(root, '.validation/project-context-v11'), { recursive: true }); fs.writeFileSync(path.join(root, '.validation/project-context-v11/electron-deletion.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2)); process.exitCode = report.failed ? 1 : 0;
