import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const demos = fs.readdirSync(path.join(root, 'validation/phase3')).filter(name => /^mock-demo-\d+\.json$/.test(name)).sort();
const demo = JSON.parse(fs.readFileSync(path.join(root, 'validation/phase3', demos.at(-1)), 'utf8'));
const directory = `D:/pa3electron/${randomUUID().slice(0, 8)}`; fs.mkdirSync(path.join(directory, 'tmp'), { recursive: true });
const { _electron } = await import(pathToFileURL(process.env.PERSONAL_AGENT_PLAYWRIGHT ?? 'D:/PersonalAgent/snake-validation/node_modules/playwright-core/index.mjs').href);
const env = { ...process.env, PERSONAL_AGENT_DESKTOP_DATA: path.join(directory, 'data'), TEMP: path.join(directory, 'tmp'), TMP: path.join(directory, 'tmp') }; delete env.ELECTRON_RUN_AS_NODE;
let app, page; const checks = [], screenshots = [], errors = [];
try {
  app = await _electron.launch({ executablePath: path.join(root, 'desktop/node_modules/electron/dist/electron.exe'), args: [path.join(root, 'desktop')], env, timeout: 30000 });
  page = await app.firstWindow(); page.setDefaultTimeout(20000); page.on('pageerror', error => errors.push(error.message)); await page.waitForSelector('.group-workspace');
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async (_window, options) => { if (!options.message.startsWith('确认信任') || !options.detail.includes('pa-pc3-demo')) throw Error('Only local fixed Mock profile imports are authorized'); return { response: 1 }; }; });
  const nav = name => page.locator('.rail').getByRole('button', { name: new RegExp('^' + name) }).click();
  for (const result of demo.results) {
    const configFile = path.join(result.directory, 'config.json');
    const overview = await page.evaluate(file => window.personalAgent.invoke({ operation: 'importProfile', file }), configFile);
    const profile = { id: overview.runs.find(run => run.id === result.runId).profileId };
    const detail = await page.evaluate(({ profileId, runId }) => window.personalAgent.invoke({ operation: 'detail', profileId, runId }), { profileId: profile.id, runId: result.runId });
    assert.equal(detail.run.usage.controllerCalls, result.usage.controllerCalls); assert.equal(detail.run.mode, 'mock'); assert.equal(detail.run.usage.calls.every(call => call.runId === result.runId), true);
    await nav('运行记录'); await page.locator('.run-row').filter({ hasText: detail.run.goal }).first().click(); await nav('运行详情');
    await page.locator('.usage-summary').waitFor();
    const card = page.locator('.usage-summary');
    assert.equal(await card.locator('tbody tr').count(), result.usage.controllerCalls);
    assert.match(await card.innerText(), /未知/); assert.match(await card.innerText(), /Prompt UTF-8 字节/); assert.match(await card.innerText(), /最终计费金额/);
    assert.match(await card.innerText(), /CC plan/); assert.match(await card.innerText(), /Codex execute/); assert.match(await card.innerText(), /CC review/);
    if (result.task === 'T2') assert.match(await card.innerText(), /返工/);
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    const background = await card.evaluate(element => getComputedStyle(element).backgroundColor); assert.equal(background, 'rgb(255, 255, 255)');
    await card.scrollIntoViewIfNeeded(); const file = path.join(directory, `${result.task}-${result.version}-usage.png`); await page.screenshot({ path: file }); screenshots.push(file);
    checks.push({ name: `${result.task}/${result.version} 真实实窗展示固定 Mock 调用归属、Token、未知缓存和返工；白色 UI 保持`, passed: true });
  }
  assert.deepEqual(errors, []);
} catch (error) { errors.push(error.stack ?? error.message); throw error; } finally {
  if (app) await app.close();
  const result = { directory, demoRoot: demo.root, checks, screenshots, errors, actualPaidCalls: 0, nativeDialogs: 'Injected trust responses only for newly created Mock fixtures', passed: checks.length, failed: errors.length };
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(root, 'validation/phase3', `electron-phase3-${Date.now()}.json`), JSON.stringify(result, null, 2), { flag: 'wx' }); console.log(JSON.stringify(result, null, 2));
}
