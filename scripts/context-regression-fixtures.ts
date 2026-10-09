import fs from 'node:fs';
import path from 'node:path';
import { stringify } from 'yaml';
import { createRun } from '../src/controller.js';
import { git } from '../src/workspace.js';
import { stampContext, contextHash } from '../src/project-context.js';
import type { Config, Review } from '../src/schema.js';

export type RegressionTask = 'T1' | 'T2' | 'T3';
export const geometry = '共享几何约束：combat 和 world 坐标单位均为 m；world.wallX 必须为 10；combat.reach 不得超过 3（T2）。';
const headings = { overview: ['项目目标', '范围', '非目标', '总体结构'], module: ['职责', '边界', '入口与测试'], contract: ['约束', '检查方式'] };
const document = (kind: keyof typeof headings, metadata: object, body: string) => `---\n${stringify({ schema: 1, kind, ...metadata })}---\n${headings[kind].map(title => `## ${title}\n${body}\n`).join('')}`;
export function writeFixture(root: string, relative: string, content: string) { const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); }
export const initialFiles = {
  'package.json': '{"type":"module","private":true,"name":"fixed-context-regression"}\n',
  'app/hud.js': 'export const label = health => `HP ${health}`;\n',
  'app/hud.css': '.hud { font-size: 12px; gap: 4px; display: flex; }\n',
  'combat/core.js': 'export const reach = 2;\nexport const unit = "m";\n',
  'world/geometry.js': 'export const wallX = 10;\nexport const unit = "m";\n'
};
export const requirements: Record<RegressionTask, string> = {
  T1: 'game-app HUD 的字号改为 16px，间距改为 8px；保留 HP 文字逻辑；combat/world 源码不得变化。按实际源码核对模块说明和 HUD 契约。',
  T2: 'combat 的 reach 改为 3，检查 world 共享几何约束。测试会预置一份明确标记错误候选：reach=4、world.unit=cm。该候选是测试注入，不是 Codex 自主犯错。必须以正式 Diff、完整几何契约和独立测试核对；修正 reach=3、world.unit=m、wallX=10。',
  T3: 'combat 分支核对：根据当前目标工作区核对实际 reach；main=2，dev=5 属于固定分支差异。预置过期说明时核对当前源码并更新说明、checked_files；不得改变任一分支的业务源码，不从历史 manifest 复用知识。'
};
export function seedFiles(root: string, task: RegressionTask) {
  for (const [relative, content] of Object.entries(initialFiles)) writeFixture(root, relative, content);
  writeFixture(root, 'docs/project-context/overview.md', document('overview', { project_id: 'a0000000-0000-4000-8000-000000000003', name: '固定上下文回归项目' }, '固定多模块游戏夹具；独立于用户真实游戏和 PersonalAgent 源码；不包含历史实战成果。'));
  for (const [id, paths] of [['game-app', ['app/']], ['combat', ['combat/']], ['world', ['world/']]] as const) writeFixture(root, `docs/project-context/modules/${id}.md`, document('module', { id, name: id, paths, depends_on: [], checked_files: {} }, id === 'combat' ? 'main 分支 reach=2；T3 必须现场核对源码，不盲信此说明。' : `${id} 业务模块。测试以外部可信验收程序验证。`));
  for (const [id, modules, body] of [['hud', ['game-app'], '仅修改 HUD 样式，文字和游戏逻辑保持不变。'], ['geometry', ['combat', 'world'], geometry]] as const) writeFixture(root, `docs/project-context/contracts/${id}.md`, document('contract', { id, title: id, modules, status: 'proposed', basis: { kind: 'document', ref: 'requirements.txt' } }, body));
  writeFixture(root, 'requirements.txt', requirements[task] + '\n固定测试要求来自用户需求；文档 proposed 状态不自动转换为 accepted。\n');
  stampContext(root, 'game-app', ['app/hud.js', 'app/hud.css']); stampContext(root, 'combat', ['combat/core.js']); stampContext(root, 'world', ['world/geometry.js']);
}
export async function regressionFixture(directory: string, task: RegressionTask, version: 'main' | 'dev' = 'main', useGit = false) {
  if (fs.existsSync(directory)) throw Error('Fixture directory already exists; never overwrite');
  const source = path.join(directory, 's'); seedFiles(source, task);
  if (useGit) { await git(source, ['init', '-b', 'main']); await git(source, ['add', '.']); await git(source, ['-c', 'user.name=Fixed Mock Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Fixed regression main seed']); }
  if (version === 'dev') {
    if (useGit) await git(source, ['checkout', '-b', 'dev']);
    writeFixture(source, 'combat/core.js', 'export const reach = 5;\nexport const unit = "m";\n');
    if (useGit) { await git(source, ['add', 'combat/core.js']); await git(source, ['-c', 'user.name=Fixed Mock Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Fixed dev version with intentionally stale knowledge']); }
  }
  const verifier = path.join(directory, 'independent.cjs');
  const expected = Object.fromEntries(Object.entries(initialFiles).filter(([relative]) => task === 'T1' ? relative.startsWith('combat/') || relative.startsWith('world/') || relative.endsWith('hud.js') : task === 'T3' ? !relative.endsWith('package.json') : relative.startsWith('app/')));
  if (version === 'dev' && task === 'T3') expected['combat/core.js'] = 'export const reach = 5;\nexport const unit = "m";\n';
  writeFixture(directory, 'independent.cjs', `const fs=require('fs'),assert=require('node:assert/strict');\n(async()=>{const expected=${JSON.stringify(expected)};for(const [file,text] of Object.entries(expected))assert.equal(fs.readFileSync(file,'utf8'),text,'unnecessary source modification: '+file);\n${task === 'T1' ? `const css=fs.readFileSync('app/hud.css','utf8');assert.match(css,/font-size:\\s*16px/);assert.match(css,/gap:\\s*8px/);assert.match(css,/display:\\s*flex/);` : task === 'T2' ? `const {pathToFileURL}=require('url'),path=require('path');const combat=await import(pathToFileURL(path.resolve('combat/core.js'))),world=await import(pathToFileURL(path.resolve('world/geometry.js')));assert.equal(combat.reach,3,'geometry reach');assert.equal(combat.unit,'m');assert.equal(world.unit,'m','shared geometry units');assert.equal(world.wallX,10,'shared world geometry');` : ''}\nconsole.log(JSON.stringify({fixture:true,task:${JSON.stringify(task)},version:${JSON.stringify(version)},constraintFailures:0,wrongVersionReferences:0}));})().catch(error=>{console.error(error);process.exitCode=1;});\n`);
  const config: Config = { allowedRepositories: [source], runtimeDir: path.join(directory, 'r'), projectMode: 'isolated', executionMode: 'native', mode: 'mock', claudeExecutable: 'NEVER-PAID-IN-FIXTURES', timeoutMs: 30000, maxLoops: task === 'T2' ? 2 : 1, maxReworks: task === 'T2' ? 1 : 0, maxClaudeCalls: task === 'T2' ? 3 : 2, tests: [{ executable: process.execPath, args: [verifier] }], mockScenario: 'pass' };
  writeFixture(directory, 'config.json', JSON.stringify(config, null, 2));
  const store = await createRun(config, source, requirements[task]);
  writeFixture(directory, 'fixture.json', JSON.stringify({ task, version, origin: 'fixed-local-fixture-no-paid-agent', requirements: requirements[task], seedHash: contextHash(JSON.stringify(initialFiles)), source, runId: store.id, workspace: store.load().workspace, verifier }, null, 2));
  return { directory, source, store, config, task, version };
}
export function fixtureReview(report: any): Review {
  return { verdict: 'pass', reason: '本地注入式 Review；最终以 Controller 独立断言和实际 Diff 判定。', contextReview: { expansionReason: '测试候选实际跨模块，共享几何必须核对；预置错误来源保留。', unmappedReason: '', checkedContracts: report.contracts.map((doc: any) => doc.id), modules: report.affectedModules.map((module: any) => ({ moduleId: module.moduleId, documentUpdated: module.documentUpdated, noUpdateReason: module.documentUpdated ? '' : '内部修改，模块职责和接口未改变；核对源码和哈希', checkedFiles: module.checkedFiles, constraintsChanged: false, disposition: '本地 Mock 核对固定约束与当前分支源码' })) } };
}
