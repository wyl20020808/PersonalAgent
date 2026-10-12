import { Ajv } from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: true });
const text = { type: 'string', minLength: 1, maxLength: 100000 };
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const codexEfforts = ['minimal','low','medium','high','xhigh','max','ultra','persistent'] as const;
export const claudeEfforts = ['low','medium','high','xhigh','max'] as const;
export const decisionAgentSchema = { oneOf: [{ ...object({ backend: { const: 'codex' }, model: { type: 'string', pattern: '^[a-zA-Z0-9._:/-]{1,200}$' }, reasoningEffort: { enum: codexEfforts } }), required: ['backend'] }, { ...object({ backend: { const: 'claude-code' }, model: { type: 'string', pattern: '^[a-zA-Z0-9._:/-]{1,200}$' }, reasoningEffort: { enum: claudeEfforts } }), required: ['backend'] }, object({ backend: { const: 'opencode' }, opencode: { ...object({ providerID: text, modelID: text, executable: text, variant: { type:'string',pattern:'^[a-zA-Z0-9._-]{1,100}$' } }), required: ['providerID', 'modelID'] } })] };
export const decisionDiscussionSchema = object({ participants: { type: 'array', minItems: 2, maxItems: 3, items: object({ id: { enum: ['a', 'b', 'c'] }, agent: decisionAgentSchema }) }, primary: { enum: ['a', 'b', 'c'] }, rounds: { anyOf: [{const:'auto'}, {type:'integer',minimum:0}] } });
export type DecisionChoice = { backend: 'codex'; model?: string; reasoningEffort?: typeof codexEfforts[number] } | { backend: 'claude-code'; model?: string; reasoningEffort?: typeof claudeEfforts[number] } | { backend: 'opencode'; opencode: { providerID: string; modelID: string; executable?: string; variant?: string } };
export type ExecutionChoice = DecisionChoice;
export const executionAgentSchema = decisionAgentSchema;
export interface DecisionDiscussion { participants: { id: 'a' | 'b' | 'c'; agent: DecisionChoice }[]; primary: 'a' | 'b' | 'c'; rounds: number | 'auto' }
export const taskSchema = object({ id: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$' }, instruction: text, acceptance: { type: 'array', items: text, minItems: 1 } });
Object.assign(taskSchema.properties, { dependsOn: { type: 'array', uniqueItems: true, items: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$' } }, acceptanceStage: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$' } });
Object.assign(taskSchema.properties, { moduleIds: { type: 'array', uniqueItems: true, items: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$' } } });
export const planSchema = object({ tasks: { type: 'array', items: taskSchema, minItems: 0 }, humanDecision: { type: ['string', 'null'], minLength: 1 } });
Object.assign(planSchema.properties, {discussionRounds:{type:'integer',minimum:0}});
const contextModuleReview = object({ moduleId: text, documentUpdated: { type: 'boolean' }, noUpdateReason: { type: 'string' }, checkedFiles: { type: 'array', items: text }, constraintsChanged: { type: 'boolean' }, disposition: text });
const contextReviewSchema = { ...object({ expansionReason: { type: 'string' }, unmappedReason: { type: 'string' }, checkedContracts: { type: 'array', description: '实际已核对的精确契约 ID，例如 ["hud","geometry"]；不填标题或文件名，不编造核对。旧输出的精确相对路径仅由 Controller 按本轮安全清单兼容。', items: text }, modules: { type: 'array', items: contextModuleReview }, confirmationNotes: { type: 'array', items: object({ path: text, reason: text }) } }), required: ['expansionReason', 'unmappedReason', 'checkedContracts', 'modules'] };
export const reviewSchema = { ...object({ verdict: { type: 'string', enum: ['pass', 'rework', 'human', 'fail'] }, reason: text, contextReview: contextReviewSchema, contextConfirmations: { type: 'array', items: object({ relative: text, action: { enum: ['accepted', 'rejected', 'superseded'] } }) } }), required: ['verdict', 'reason'] };
export const editSchema = object({ summary: text, changes: { type: 'array', maxItems: 50, items: object({ path: { type: 'string', minLength: 1, maxLength: 240 }, content: { type: 'string', maxLength: 1000000 } }) } });
export const nativeResultSchema = object({ mode: { const: 'native' }, summary: text });
export const configSchema = object({
  allowedRepositories: { type: 'array', minItems: 1, items: text },
  runtimeDir: text,
  mode: { type: 'string', enum: ['mock', 'real'] },
  claudeExecutable: text,
  timeoutMs: { anyOf: [{ const: 0 }, { type: 'integer', minimum: 100, maximum: 3600000 }], description: '0 disables elapsed-time limits; explicit stop remains available.' },
  maxLoops: { type: 'integer', minimum: 1, maximum: 100 },
  maxReworks: { type: 'integer', minimum: 0, maximum: 20 },
  tests: { type: 'array', minItems: 0, maxItems: 20, items: { ...object({ executable: text, args: { type: 'array', items: { type: 'string' }, maxItems: 50 }, interaction: { type: 'object', additionalProperties: false, properties: { kind: { enum: ['shell','browser','desktop','system','resource'] }, capability: { enum: ['BACKGROUND_SAFE','DESKTOP_INTERACTIVE','SYSTEM_HIGH_RISK','RESOURCE_HEAVY'] }, headless: { type: 'boolean' }, isolatedBrowser: { type: 'boolean' } } } }), required: ['executable','args'] } },
  mockScenario: { type: 'string', enum: ['pass', 'rework', 'human', 'fail', 'timeout', 'invalid', 'escape', 'nochange'] }
});
// Optional workflow limits: absent means unlimited. Desktop Runs never set them.
configSchema.required = configSchema.required.filter(key => key !== 'maxLoops' && key !== 'maxReworks');
Object.assign(configSchema.properties, { executionMode: { enum: ['native', 'proposal'] }, claudeStreaming: { type: 'boolean' }, maxClaudeCalls: { type: 'integer', minimum: 1, maximum: 100 }, minTasks: { type: 'integer', minimum: 1 } });
Object.assign(configSchema.properties, { projectMode: { enum: ['direct', 'isolated'] }, workspaceMode: { enum: ['direct', 'isolated'] }, directAuthorization: object({ projectPath: text, acknowledgedAt: { type: 'string', minLength: 1 } }) });
Object.assign(configSchema.properties, { acceptanceStages: { type: 'object', minProperties: 1, propertyNames: { pattern: '^[a-zA-Z0-9_-]{1,64}$' }, additionalProperties: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'integer', minimum: 0, maximum: 19 } } }, globalBudget: object({ file: text, limit: { type: 'integer', minimum: 1, maximum: 100000 } }) });
Object.assign(configSchema.properties, { decisionAgent: decisionAgentSchema, decisionDiscussion: decisionDiscussionSchema });
Object.assign(configSchema.properties, { executionAgent: executionAgentSchema });
Object.assign(configSchema.properties, { transportRetryDelaysMs: { type: 'array', maxItems: 5, items: { type: 'integer', minimum: 0, maximum: 60000 }, description: 'Additional retries after provider recovery, default [5000,15000,30000,45000,60000]; [] disables them.' } });
export interface Task { id: string; instruction: string; acceptance: string[]; dependsOn?: string[]; acceptanceStage?: string; moduleIds?: string[] }
Object.assign(configSchema.properties, { taskStages: { type: 'object', minProperties: 1, propertyNames: { pattern: '^[a-zA-Z0-9_-]{1,64}$' }, additionalProperties: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$' } } });
export interface Plan { tasks: Task[]; humanDecision: string | null; discussionRounds?: number }
export interface Review { verdict: 'pass' | 'rework' | 'human' | 'fail'; reason: string; contextReview?: { confirmationNotes?: { path: string; reason: string }[]; expansionReason: string; unmappedReason: string; checkedContracts: string[]; modules: { moduleId: string; documentUpdated: boolean; noUpdateReason: string; checkedFiles: string[]; constraintsChanged: boolean; disposition: string }[] }; contextConfirmations?: { relative: string; action: 'accepted' | 'rejected' | 'superseded' }[] }
export interface Edits { summary: string; changes: { path: string; content: string }[] }
export interface NativeResult { mode: 'native'; summary: string }
export type ExecutionResult = Edits | NativeResult;
export interface Config {
  transportRetryDelaysMs?: number[];
  executionAgent?: ExecutionChoice;
  decisionAgent?: DecisionChoice; decisionDiscussion?: DecisionDiscussion;
  projectMode?: 'direct' | 'isolated';
  workspaceMode?: 'direct' | 'isolated'; // Deprecated input alias; never persisted in new Runs.
  directAuthorization?: { projectPath: string; acknowledgedAt: string };
  executionMode?: 'native' | 'proposal';
  // Legacy paid-budget metadata, accepted for history; never an execution gate.
  maxClaudeCalls?: number; minTasks?: number; claudeStreaming?: boolean;
  acceptanceStages?: Record<string, number[]>; globalBudget?: { file: string; limit: number };
  taskStages?: Record<string, string>;
  allowedRepositories: string[]; runtimeDir: string; mode: 'mock' | 'real'; claudeExecutable: string;
  timeoutMs: number; maxLoops?: number; maxReworks?: number;
  tests: { executable: string; args: string[]; interaction?: import('./interaction-policy.js').OperationMetadata }[];
  mockScenario: 'pass' | 'rework' | 'human' | 'fail' | 'timeout' | 'invalid' | 'escape' | 'nochange';
}
export function normalizeConfig(config: Config): Config {
  if (config.executionAgent?.backend === 'opencode' && config.executionMode === 'proposal') throw new Error('OpenCode execution requires native execution mode');
  if (config.executionAgent?.backend === 'claude-code' && config.executionMode === 'proposal') throw new Error('Claude Code execution requires native execution mode');
  if (config.projectMode && config.workspaceMode && config.projectMode !== config.workspaceMode) throw new Error('Conflicting projectMode and workspaceMode');
  const { workspaceMode, ...canonical } = config;
  const discussion = config.decisionDiscussion;
  if (discussion && (new Set(discussion.participants.map(p => p.id)).size !== discussion.participants.length || !discussion.participants.some(p => p.id === discussion.primary))) throw new Error('Distinct decision participant IDs and selected primary required');
  const primary = discussion?.participants.find(p => p.id === discussion.primary)?.agent;
  if (primary && config.decisionAgent && JSON.stringify(primary) !== JSON.stringify(config.decisionAgent)) throw new Error('Primary decision configuration mismatch');
  return { ...canonical, ...(primary ? { decisionAgent: primary } : {}), ...(config.projectMode || workspaceMode ? { projectMode: config.projectMode ?? workspaceMode } : {}) };
}
export function validate<T>(schema: object, value: unknown): T {
  const check = ajv.compile(schema);
  if (!check(value)) throw new Error(`JSON Schema validation failed: ${ajv.errorsText(check.errors)}`);
  return (schema === configSchema ? normalizeConfig(value as Config) : value) as T;
}
