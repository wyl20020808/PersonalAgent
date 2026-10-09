import { Ajv } from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: true });
const text = { type: 'string', minLength: 1, maxLength: 100000 };
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const decisionAgentSchema = { oneOf: [{ ...object({ backend: { const: 'claude-code' }, model: { type: 'string', pattern: '^[a-zA-Z0-9._:/-]{1,200}$' } }), required: ['backend'] }, object({ backend: { const: 'opencode' }, opencode: { ...object({ providerID: text, modelID: text, executable: text }), required: ['providerID', 'modelID'] } })] };
export const decisionDiscussionSchema = object({ participants: { type: 'array', minItems: 2, maxItems: 2, items: object({ id: { enum: ['a', 'b'] }, agent: decisionAgentSchema }) }, primary: { enum: ['a', 'b'] }, rounds: { enum: [0, 1] } });
export type DecisionChoice = { backend: 'claude-code'; model?: string } | { backend: 'opencode'; opencode: { providerID: string; modelID: string; executable?: string } };
export interface DecisionDiscussion { participants: { id: 'a' | 'b'; agent: DecisionChoice }[]; primary: 'a' | 'b'; rounds: 0 | 1 }
export const taskSchema = object({ id: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$' }, instruction: text, acceptance: { type: 'array', items: text, minItems: 1, maxItems: 30 } });
Object.assign(taskSchema.properties, { dependsOn: { type: 'array', uniqueItems: true, maxItems: 20, items: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$' } }, acceptanceStage: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$' } });
Object.assign(taskSchema.properties, { moduleIds: { type: 'array', uniqueItems: true, maxItems: 20, items: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$' } } });
export const planSchema = object({ tasks: { type: 'array', items: taskSchema, minItems: 0, maxItems: 20 }, humanDecision: { type: ['string', 'null'], minLength: 1 } });
const contextModuleReview = object({ moduleId: text, documentUpdated: { type: 'boolean' }, noUpdateReason: { type: 'string' }, checkedFiles: { type: 'array', items: text }, constraintsChanged: { type: 'boolean' }, disposition: text });
const contextReviewSchema = { ...object({ expansionReason: { type: 'string' }, unmappedReason: { type: 'string' }, checkedContracts: { type: 'array', description: '实际已核对的精确契约 ID，例如 ["hud","geometry"]；不填标题或文件名，不编造核对。旧输出的精确相对路径仅由 Controller 按本轮安全清单兼容。', items: text }, modules: { type: 'array', items: contextModuleReview }, confirmationNotes: { type: 'array', items: object({ path: text, reason: text }) } }), required: ['expansionReason', 'unmappedReason', 'checkedContracts', 'modules'] };
export const reviewSchema = { ...object({ verdict: { type: 'string', enum: ['pass', 'rework', 'human', 'fail'] }, reason: text, contextReview: contextReviewSchema, contextConfirmations: { type: 'array', maxItems: 20, items: object({ relative: text, action: { enum: ['accepted', 'rejected', 'superseded'] } }) } }), required: ['verdict', 'reason'] };
export const editSchema = object({ summary: text, changes: { type: 'array', maxItems: 50, items: object({ path: { type: 'string', minLength: 1, maxLength: 240 }, content: { type: 'string', maxLength: 1000000 } }) } });
export const nativeResultSchema = object({ mode: { const: 'native' }, summary: text });
export const configSchema = object({
  allowedRepositories: { type: 'array', minItems: 1, items: text },
  runtimeDir: text,
  mode: { type: 'string', enum: ['mock', 'real'] },
  claudeExecutable: text,
  timeoutMs: { type: 'integer', minimum: 100, maximum: 3600000 },
  maxLoops: { type: 'integer', minimum: 1, maximum: 100 },
  maxReworks: { type: 'integer', minimum: 0, maximum: 20 },
  tests: { type: 'array', minItems: 0, maxItems: 20, items: object({ executable: text, args: { type: 'array', items: { type: 'string' }, maxItems: 50 } }) },
  mockScenario: { type: 'string', enum: ['pass', 'rework', 'human', 'fail', 'timeout', 'invalid', 'escape', 'nochange'] }
});
Object.assign(configSchema.properties, { executionMode: { enum: ['native', 'proposal'] }, claudeStreaming: { type: 'boolean' }, maxClaudeCalls: { type: 'integer', minimum: 1, maximum: 100 }, minTasks: { type: 'integer', minimum: 1, maximum: 20 } });
Object.assign(configSchema.properties, { projectMode: { enum: ['direct', 'isolated'] }, workspaceMode: { enum: ['direct', 'isolated'] }, directAuthorization: object({ projectPath: text, acknowledgedAt: { type: 'string', minLength: 1 } }) });
Object.assign(configSchema.properties, { acceptanceStages: { type: 'object', minProperties: 1, maxProperties: 20, propertyNames: { pattern: '^[a-zA-Z0-9_-]{1,64}$' }, additionalProperties: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'integer', minimum: 0, maximum: 19 } } }, globalBudget: object({ file: text, limit: { type: 'integer', minimum: 1, maximum: 100000 } }) });
Object.assign(configSchema.properties, { decisionAgent: decisionAgentSchema, decisionDiscussion: decisionDiscussionSchema });
export interface Task { id: string; instruction: string; acceptance: string[]; dependsOn?: string[]; acceptanceStage?: string; moduleIds?: string[] }
Object.assign(configSchema.properties, { taskStages: { type: 'object', minProperties: 1, maxProperties: 20, propertyNames: { pattern: '^[a-zA-Z0-9_-]{1,64}$' }, additionalProperties: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,64}$' } } });
export interface Plan { tasks: Task[]; humanDecision: string | null }
export interface Review { verdict: 'pass' | 'rework' | 'human' | 'fail'; reason: string; contextReview?: { confirmationNotes?: { path: string; reason: string }[]; expansionReason: string; unmappedReason: string; checkedContracts: string[]; modules: { moduleId: string; documentUpdated: boolean; noUpdateReason: string; checkedFiles: string[]; constraintsChanged: boolean; disposition: string }[] }; contextConfirmations?: { relative: string; action: 'accepted' | 'rejected' | 'superseded' }[] }
export interface Edits { summary: string; changes: { path: string; content: string }[] }
export interface NativeResult { mode: 'native'; summary: string }
export type ExecutionResult = Edits | NativeResult;
export interface Config {
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
  timeoutMs: number; maxLoops: number; maxReworks: number;
  tests: { executable: string; args: string[] }[];
  mockScenario: 'pass' | 'rework' | 'human' | 'fail' | 'timeout' | 'invalid' | 'escape' | 'nochange';
}
export function normalizeConfig(config: Config): Config {
  if (config.projectMode && config.workspaceMode && config.projectMode !== config.workspaceMode) throw new Error('Conflicting projectMode and workspaceMode');
  const { workspaceMode, ...canonical } = config;
  const discussion = config.decisionDiscussion;
  if (discussion && new Set(discussion.participants.map(p => p.id)).size !== 2) throw new Error('Two distinct decision participant IDs required');
  const primary = discussion?.participants.find(p => p.id === discussion.primary)?.agent;
  if (primary && config.decisionAgent && JSON.stringify(primary) !== JSON.stringify(config.decisionAgent)) throw new Error('Primary decision configuration mismatch');
  return { ...canonical, ...(primary ? { decisionAgent: primary } : {}), ...(config.projectMode || workspaceMode ? { projectMode: config.projectMode ?? workspaceMode } : {}) };
}
export function validate<T>(schema: object, value: unknown): T {
  const check = ajv.compile(schema);
  if (!check(value)) throw new Error(`JSON Schema validation failed: ${ajv.errorsText(check.errors)}`);
  return (schema === configSchema ? normalizeConfig(value as Config) : value) as T;
}
