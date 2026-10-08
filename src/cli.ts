import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { configSchema, validate, type Config } from './schema.js';
import { Store } from './store.js';
import { createRun, drive } from './controller.js';
import { MockAgents } from './adapters.js';
import { RealAgents } from './real-agents.js';
import { previewDelivery, approveDelivery, applyDelivery, deliveryStatus } from './delivery.js';

const help = `PersonalAgent CLI MVP
  start --config FILE --repo D:\\REPO --goal "GOAL"
  resume --config FILE --id UUID [--decision "USER INSTRUCTIONS"] [--max-loops N] [--max-reworks N] [--max-claude-calls N]
  status --config FILE --id UUID
  stop --config FILE --id UUID
  delivery-preview --config FILE --id RUN_UUID --repo D:\\TARGET --branch BRANCH
  delivery-approve --config FILE --id RUN_UUID --delivery UUID --approval SHA256 --decision "EXPLICIT APPROVAL"
  delivery-apply --config FILE --id RUN_UUID --delivery UUID [--resume]
  delivery-status --config FILE --id RUN_UUID --delivery UUID
All mutable directories must be on D:. Real agents require authentication.
`;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { config: { type: 'string' }, repo: { type: 'string' }, goal: { type: 'string' }, id: { type: 'string' }, decision: { type: 'string' }, 'max-loops': { type: 'string' }, 'max-reworks': { type: 'string' }, 'max-claude-calls': { type: 'string' }, help: { type: 'boolean' }, branch: { type: 'string' }, delivery: { type: 'string' }, approval: { type: 'string' }, resume: { type: 'boolean' } } });
  const command = positionals[0];
  if (values.help || !command) { console.log(help); }
  else {
    if (!values.config) throw new Error('--config is required');
    const config = validate<Config>(configSchema, JSON.parse(readFileSync(path.resolve(values.config), 'utf8')));
    let store: Store;
    if (command === 'start') {
      if (!values.repo || !values.goal) throw new Error('--repo and --goal are required');
      store = await createRun(config, values.repo, values.goal); console.log(`Run ID: ${store.id}`);
    } else {
      if (!['resume', 'status', 'stop', 'delivery-preview', 'delivery-approve', 'delivery-apply', 'delivery-status'].includes(command)) throw new Error('Unknown command');
      if (!values.id) throw new Error('--id is required'); store = new Store(config.runtimeDir, values.id);
    }
    if (command.startsWith('delivery-')) {
      if (command === 'delivery-preview') {
        if (!values.repo || !values.branch) throw new Error('--repo and --branch required for delivery preview');
        console.log(JSON.stringify(await previewDelivery(store, values.repo, values.branch), null, 2));
      } else {
        if (!values.delivery) throw new Error('--delivery required');
        const result = command === 'delivery-approve'
          ? await approveDelivery(store, values.delivery, values.approval ?? '', values.decision ?? '')
          : command === 'delivery-apply' ? await applyDelivery(store, values.delivery, { resume: values.resume })
          : await deliveryStatus(store, values.delivery);
        console.log(JSON.stringify(result, null, 2));
      }
    }
    else if (command === 'status') console.log(JSON.stringify(store.load(), null, 2));
    else if (command === 'stop') { store.load(); writeFileSync(store.file('stop.request'), 'stop'); console.log('Stop requested; active process will terminate.'); }
    else {
      const storedConfig = store.load().config;
      const agents = storedConfig.mode === 'mock' ? new MockAgents(storedConfig) : new RealAgents(storedConfig);
      const cancellation = new AbortController(); process.once('SIGINT', () => cancellation.abort()); process.once('SIGTERM', () => cancellation.abort());
      const state = await drive(store, agents, values.decision, cancellation.signal, { maxLoops: values['max-loops'] === undefined ? undefined : Number(values['max-loops']), maxReworks: values['max-reworks'] === undefined ? undefined : Number(values['max-reworks']), maxClaudeCalls: values['max-claude-calls'] === undefined ? undefined : Number(values['max-claude-calls']) });
      console.log(JSON.stringify({ id: state.id, phase: state.phase, reason: state.reason, loops: state.loops, workspace: state.workspace, stateFile: store.file('state.json') }, null, 2));
      process.exitCode = state.phase === 'completed' ? 0 : state.phase === 'paused' ? 2 : state.phase === 'stopped' ? 130 : 1;
    }
  }
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
