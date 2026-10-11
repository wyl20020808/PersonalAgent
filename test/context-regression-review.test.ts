import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { regressionFixture, writeFixture, initialFiles, fixtureReview } from '../scripts/context-regression-fixtures.js';
import { assertT2ReviewStage } from '../scripts/context-regression-review.js';
import { driveWithUserAcceptance as drive } from './helpers/accepted-flow.js';
import { stampContext } from '../src/project-context.js';
import { auditRecords } from '../src/context-trust.js';

async function replay(kind: 'restored' | 'different' | 'missing-contract' | 'independent-failure') {
  const folder = process.platform === 'win32' ? `D:/pa-hfix/${randomUUID().slice(0, 8)}` : path.resolve('.validation', randomUUID());
  const fixture = await regressionFixture(folder, 'T2');
  const initial = fixture.store.load(); initial.config.maxLoops = 1; initial.config.maxReworks = 0; initial.config.maxClaudeCalls = 4; fixture.store.save(initial);
  const stages: ReturnType<typeof assertT2ReviewStage>[] = []; let reviews = 0;
  const result = await drive(fixture.store, {
    executionMode: 'native',
    async plan() { return { humanDecision: null, tasks: [{ id: 'fixed-T2', moduleIds: ['combat'], instruction: 'Mock 测试脚本阶段断言', acceptance: ['固定独立验收'] }] }; },
    async execute(state, store) {
      writeFixture(state.workspace, 'combat/core.js', 'export const reach = 4;\nexport const unit = "m";\n');
      writeFixture(state.workspace, 'world/geometry.js', 'export const wallX = 10;\nexport const unit = "cm";\n// test-injected\n');
      store.audit('regression-candidate-origin', { provenance: 'test-injected', autonomousModelError: false });
      return { mode: 'native' as const, summary: 'Mock only; no paid Agent' };
    },
    async review(state, store) {
      reviews++;
      if (kind === 'missing-contract' && reviews === 2) state.evidence!.contextReport!.contracts = [];
      stages.push(assertT2ReviewStage(state, store));
      if (kind === 'different' && reviews === 2) {
        const report = state.evidence!.contextReport!;
        const expanded = report.expandedModules;
        report.expandedModules = [];
        assert.throws(() => assertT2ReviewStage(state, store), /expansion missing/);
        report.expandedModules = expanded;
        const contract = report.contracts.find(doc => doc.id === 'geometry')!, content = contract.content;
        contract.content = content.slice(0, -1);
        assert.throws(() => assertT2ReviewStage(state, store), /contract missing/);
        contract.content = content;
      }
      if (reviews === 1) {
        assert.equal(state.evidence!.passed, false);
        writeFixture(state.workspace, 'combat/core.js', 'export const reach = 3;\nexport const unit = "m";\n');
        writeFixture(state.workspace, 'world/geometry.js', initialFiles['world/geometry.js'] + (kind === 'different' ? '// harmless actual difference\n' : ''));
        if (kind === 'independent-failure') writeFixture(state.workspace, 'combat/core.js', 'export const reach = 4;\nexport const unit = "m";\n');
        stampContext(state.workspace, 'combat', ['combat/core.js']); stampContext(state.workspace, 'world', ['world/geometry.js']);
      }
      if(reviews>1 && !state.evidence!.passed)return {verdict:'rework',reason:'Fixture decision maker requests repair of failed checks'};return fixtureReview(state.evidence!.contextReport!);
    }
  });
  return { result, stages, reviews, events: auditRecords(fixture.store.file('audit.jsonl')) };
}

test('T2 restored world permits empty expansion after CC repair; independent recheck and formal Review both complete', async () => {
  const f = await replay('restored'); assert.equal(f.result.phase, 'completed', f.result.reason);
  assert.equal(f.reviews, 2); assert.equal(f.stages[0]!.stage, 'test-injected-candidate');
  assert.equal(f.stages[1]!.worldRestored, true); assert.deepEqual(f.stages[1]!.expandedModules, []);
  assert.equal(f.result.evidence!.userAccepted, true); assert.equal(f.events.filter(e => e.event === 'fixture-decision-check').length, 2);
  assert.equal(f.events.filter(e => e.event === 'review').length, 2);
});

test('T2 remaining world bytes require expansion and full geometry; omitted expansion rejects', async () => {
  const f = await replay('different'); assert.equal(f.result.phase, 'completed', f.result.reason);
  assert.equal(f.stages[1]!.worldRestored, false); assert.deepEqual(f.stages[1]!.expandedModules, ['world']);
  assert.ok(f.stages[1]!.worldChanges.includes('world/geometry.js'));
  const report = f.result.evidence!.contextReport!; assert.ok(report.contracts.some(doc => doc.id === 'geometry'));
});

test('T2 restored world cannot omit required geometry contract', async () => {
  const f = await replay('missing-contract'); assert.equal(f.result.phase, 'failed');
  assert.match(f.result.reason!, /contract missing/); assert.equal(f.reviews, 2);
  assert.equal(f.events.filter(e => e.event === 'review').length, 1);
});

test('T2 Review pass cannot bypass failed independent recheck after repair', async () => {
  const f = await replay('independent-failure'); assert.notEqual(f.result.phase, 'completed');
  assert.equal(f.reviews, 2); assert.equal(f.result.evidence!.passed, false);
  assert.ok(f.events.some(e => e.event === 'review' && e.data.verdict==='rework')); assert.equal(f.result.totalReworks ?? 0, 0);
});
