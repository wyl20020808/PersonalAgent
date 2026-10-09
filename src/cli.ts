import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { configSchema, validate, type Config } from './schema.js';
import { Store } from './store.js';
import { createRun, drive } from './controller.js';
import { MockAgents } from './adapters.js';
import { RealAgents } from './real-agents.js';
import { discoverOpencodeModels } from './opencode-decision-agent.js';
import { previewDelivery, approveDelivery, applyDelivery, deliveryStatus } from './delivery.js';
import { acceptManual } from './manual-acceptance.js';
import { restoreProject, inspectProject } from './project-files.js';
import { loadProjectContext, stampContext } from './project-context.js';
import { prepareContextConfirmation, decideContextConfirmation, pendingContextConfirmations, type ConfirmationAction } from './context-confirmation.js';

const help = `PersonalAgent CLI MVP
  start --config FILE --repo D:\\REPO --goal "GOAL"
  project-scan --repo DIRECTORY [--scan-max-files N] [--scan-max-manifest-bytes N] (read-only metadata diagnosis)
  decision-models [--executable PATH] [--workspace DIRECTORY]
  context-start --config FILE --repo D:\\REPO --goal "ONBOARDING GOAL"
  context-check --workspace D:\\REPO
  context-stamp --workspace D:\\REPO --module ID --file RELATIVE_PATH [--file RELATIVE_PATH ...]
  context-request --config FILE --id UUID --document RELATIVE_PATH --action accepted|rejected|superseded
  context-decide --config FILE --id UUID --request UUID --approval SHA256 --decision "EXPLICIT DOCUMENT DECISION" [--cancel]
  context-pending --config FILE --id UUID
  resume --config FILE --id UUID [--decision "USER INSTRUCTIONS"] [--max-loops N] [--max-reworks N]
  status --config FILE --id UUID
  stop --config FILE --id UUID
  manual-accept --config FILE --id UUID --approval SHA256 --decision "OBSERVATIONS"
  project-restore --config FILE --id UUID --checkpoint recovery-UUID.json --decision "EXPLICIT RESTORE"
  delivery-preview --config FILE --id RUN_UUID --repo D:\\TARGET --branch BRANCH
  delivery-approve --config FILE --id RUN_UUID --delivery UUID --approval SHA256 --decision "EXPLICIT APPROVAL"
  delivery-apply --config FILE --id RUN_UUID --delivery UUID [--resume]
  delivery-status --config FILE --id RUN_UUID --delivery UUID
Projects may be on any drive; internal runtime data must be on D:. Real agents require authentication.
`;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'scan-max-files': {type:'string'}, 'scan-max-manifest-bytes': {type:'string'}, executable: {type:'string'}, document: { type: 'string' }, action: { type: 'string' }, request: { type: 'string' }, cancel: { type: 'boolean' }, workspace: { type: 'string' }, module: { type: 'string' }, file: { type: 'string', multiple: true }, config: { type: 'string' }, repo: { type: 'string' }, goal: { type: 'string' }, id: { type: 'string' }, decision: { type: 'string' }, 'max-loops': { type: 'string' }, 'max-reworks': { type: 'string' }, help: { type: 'boolean' }, branch: { type: 'string' }, delivery: { type: 'string' }, approval: { type: 'string' }, checkpoint: { type: 'string' }, resume: { type: 'boolean' } } });
  const command = positionals[0];
  if (values.help || !command) { console.log(help); }
  else if (command === 'project-scan') {
    if (!values.repo) throw new Error('--repo is required');
    console.log(JSON.stringify(inspectProject(path.resolve(values.repo), { maxFiles: values['scan-max-files'] === undefined ? undefined : Number(values['scan-max-files']), maxManifestBytes: values['scan-max-manifest-bytes'] === undefined ? undefined : Number(values['scan-max-manifest-bytes']) }), null, 2));
  }
  else if (command === 'decision-models') {
    console.log(JSON.stringify(await discoverOpencodeModels(values.executable, values.workspace),null,2));
  }
  else if (command === 'context-stamp') {
    if (!values.workspace || !values.module || !values.file?.length) throw Error('--workspace, --module and --file are required');
    console.log(JSON.stringify(stampContext(path.resolve(values.workspace), values.module, values.file), null, 2));
  } else if (command === 'context-check') {
    if (!values.workspace) throw Error('--workspace is required');
    const config = values.config ? validate<Config>(configSchema, JSON.parse(readFileSync(path.resolve(values.config), 'utf8'))) : undefined;
    const context = loadProjectContext(path.resolve(values.workspace), true, config ? { runtimeDir: config.runtimeDir, source: path.resolve(values.repo ?? values.workspace) } : undefined);
    const confirmationStates = [...context.contracts, ...context.decisions].map(doc => ({ id: doc.metadata.id, path: doc.relative, declaredStatus: doc.metadata.status, ...doc.trust }));
    console.log(JSON.stringify({ enabled: true, projectId: context.overview!.metadata.project_id, modules: context.modules.length, contracts: context.contracts.length, decisions: context.decisions.length, proposalStatus: 'proposed 未确认；正式状态按本机审计逐份核验', confirmationStates }, null, 2));
    if (confirmationStates.some(doc => doc.effectiveStatus === 'unverifiable')) process.exitCode = 1;
  }
  else {
    if (!values.config) throw new Error('--config is required');
    const config = validate<Config>(configSchema, JSON.parse(readFileSync(path.resolve(values.config), 'utf8')));
    let store: Store;
    if (command === 'start' || command === 'context-start') {
      if (!values.repo || !values.goal) throw new Error('--repo and --goal are required');
      store = await createRun(config, values.repo, values.goal, command === 'context-start' ? { purpose: 'context-onboarding' } : {}); console.log(`Run ID: ${store.id}`);
    } else {
      if (!['context-request', 'context-decide', 'context-pending', 'resume', 'status', 'stop', 'manual-accept', 'project-restore', 'delivery-preview', 'delivery-approve', 'delivery-apply', 'delivery-status'].includes(command)) throw new Error('Unknown command');
      if (!values.id) throw new Error('--id is required'); store = new Store(config.runtimeDir, values.id);
    }
    if (command === 'context-request') console.log(JSON.stringify(prepareContextConfirmation(store, values.document ?? '', values.action as ConfirmationAction), null, 2));
    else if (command === 'context-decide') console.log(JSON.stringify(decideContextConfirmation(store, values.request ?? '', values.approval ?? '', values.decision ?? '', values.cancel, values.action as 'accepted' | 'rejected' | undefined), null, 2));
    else if (command === 'context-pending') console.log(JSON.stringify(pendingContextConfirmations(store), null, 2));
    else if(command==='manual-accept'){console.log(JSON.stringify(await acceptManual(store,values.approval??'',values.decision??''),null,2));}
    else if (command.startsWith('delivery-')) {
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
    else if (command === 'project-restore') {restoreProject(store,values.checkpoint ?? '',values.decision ?? '');console.log('Project restored to initial snapshot.');}
    else if (command === 'status') console.log(JSON.stringify(store.load(), null, 2));
    else if (command === 'stop') { store.load(); writeFileSync(store.file('stop.request'), 'stop'); console.log('Stop requested; active process will terminate.'); }
    else {
      const storedConfig = store.load().config;
      const agents = storedConfig.mode === 'mock' ? new MockAgents(storedConfig) : new RealAgents(storedConfig);
      const cancellation = new AbortController(); process.once('SIGINT', () => cancellation.abort()); process.once('SIGTERM', () => cancellation.abort());
      const state = await drive(store, agents, values.decision, cancellation.signal, { maxLoops: values['max-loops'] === undefined ? undefined : Number(values['max-loops']), maxReworks: values['max-reworks'] === undefined ? undefined : Number(values['max-reworks']) });
      console.log(JSON.stringify({ id: state.id, phase: state.phase, reason: state.reason, loops: state.loops, workspace: state.workspace, stateFile: store.file('state.json') }, null, 2));
      process.exitCode = state.phase === 'completed' ? 0 : state.phase === 'paused' ? 2 : state.phase === 'stopped' ? 130 : 1;
    }
  }
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
