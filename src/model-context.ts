import { existsSync, readFileSync } from 'node:fs';
import { atomicJson, type State, type Store } from './store.js';
import { opencodeWindow, type WindowMetadata } from './opencode-context-limits.js';

export interface ModelContext {
  windowSource?: WindowMetadata['windowSource']; windowReference?: string; windowCheckedAt?: string;
  role: 'decision' | 'execution'; participantId?: string; backend: string;
  configuredModel: string | null; model: string | null; sessionId: string | null;
  usedTokens: number | null; windowTokens: number | null; compactAtTokens: number | null;
  measurement: 'native' | 'estimated' | 'unknown'; source: string;
  status: 'unknown' | 'normal' | 'near-limit' | 'compacting' | 'compacted' | 'exceeded';
  compactions: number; promptEstimate: number; updatedAt: string;
}
export const tokenCount = (n: unknown): number | null => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
const positive = (n: unknown) => { const v = tokenCount(n); return v && v > 0 ? v : null; };
function identity(state: State, role: ModelContext['role']) {
  const agent = role === 'execution' ? state.config.executionAgent : state.decisionAgent ?? state.config.decisionAgent;
  const backend = agent?.backend ?? (role === 'execution' ? 'codex' : 'claude-code');
  const opencode = agent?.backend === 'opencode' ? ('opencode' in agent ? agent.opencode : agent) : undefined;
  const configuredModel = opencode ? `${opencode.providerID}/${opencode.modelID}` : agent && 'model' in agent ? agent.model ?? null : null;
  const sessionId = role === 'execution' ? backend === 'codex' ? state.codexThreadId : state.executionSession?.sessionId ?? state.claudeExecutionSessionId ?? null : state.decisionSession?.sessionId ?? state.claudeSessionId;
  return { backend, configuredModel, sessionId };
}
function file(store: Store, role: ModelContext['role']) { return store.file(`context-window-${role}${store.decisionParticipant ? '-'+store.decisionParticipant.participantId : ''}.json`); }
export function previousContext(state: State, store: Store, role: ModelContext['role']): ModelContext | undefined {
  const p = file(store, role); if (!existsSync(p)) return;
  const row = JSON.parse(readFileSync(p, 'utf8')) as ModelContext, current = identity(state, role);
  if (row.backend === current.backend && row.configuredModel === current.configuredModel && current.sessionId && row.sessionId === current.sessionId) return row;
}
// A share of the window lets large-window models carry hundreds of thousands of tokens on every request.
// The working budget bounds occupancy per role; the window share still applies to small models.
export const CONTEXT_BUDGET = { decision: 120000, execution: 160000 } as const;
export function compactLimit(window: number | null, state: State, role: ModelContext['role']): number {
  const budget = state.config.contextManagement?.budgetTokens?.[role] ?? CONTEXT_BUDGET[role];
  return window ? Math.min(budget, Math.max(1, Math.floor(window * (state.config.contextManagement?.compactRatio ?? 0.85)))) : budget;
}
export function contextLimits(state: State, store: Store, role: ModelContext['role']) {
  const current = identity(state, role), previous = previousContext(state, store, role);
  const window = previous?.windowTokens ?? positive(state.config.contextManagement?.modelWindows?.[current.configuredModel ?? '']) ?? (current.backend === 'opencode' ? opencodeWindow(current.configuredModel)?.windowTokens : undefined) ?? null;
  return { window, compactAt: compactLimit(window, state, role) };
}

/** Current session occupancy, deliberately separate from billable/cumulative usage. */
export class ContextObservation {
  readonly snapshot: ModelContext;
  private compactItems = new Set<string>();
  private measurements = new Map<string, number>();
  get shouldCompact(): boolean {
    return this.snapshot.usedTokens !== null && this.snapshot.compactAtTokens !== null && this.snapshot.usedTokens + this.snapshot.promptEstimate >= this.snapshot.compactAtTokens;
  }
  constructor(private state: State, private store: Store, phase: string, prompt: string) {
    const role = phase === 'execute' ? 'execution' : 'decision', previous = previousContext(state, store, role), limits = contextLimits(state, store, role);
    this.snapshot = { role, ...identity(state, role), ...(store.decisionParticipant ? { participantId: store.decisionParticipant.participantId } : {}), model: previous?.model ?? null, usedTokens: previous?.usedTokens ?? null, windowTokens: limits.window, compactAtTokens: limits.compactAt, measurement: previous?.measurement ?? 'unknown', source: previous?.source ?? 'native-not-reported', status: previous?.status ?? 'unknown', compactions: previous?.compactions ?? 0, promptEstimate: Math.ceil(Buffer.byteLength(prompt, 'utf8') / 3), updatedAt: new Date().toISOString() };
    if (previous?.windowTokens) {
      this.snapshot.windowSource = previous.windowSource;
      this.snapshot.windowReference = previous.windowReference;
      this.snapshot.windowCheckedAt = previous.windowCheckedAt;
    } else if (positive(state.config.contextManagement?.modelWindows?.[this.snapshot.configuredModel ?? ''])) {
      this.snapshot.windowSource = 'controller-config';
    } else if (this.snapshot.backend === 'opencode') {
      Object.assign(this.snapshot, opencodeWindow(this.snapshot.configuredModel));
    }
    this.persist();
  }
  private persist(sampleId?: string) {
    this.snapshot.sessionId = identity(this.state, this.snapshot.role).sessionId;
    this.snapshot.updatedAt = new Date().toISOString();
    atomicJson(file(this.store, this.snapshot.role), this.snapshot);
    this.store.audit('model-context', { ...this.snapshot, sampleKind: sampleId ? 'measurement' : 'snapshot', ...(sampleId ? { sampleId } : {}) });
  }
  window(value: unknown, model?: string) {
    const n = positive(value); if (!n) return;
    if (n === this.snapshot.windowTokens && (!model || model === this.snapshot.model) && this.snapshot.windowSource === 'native') return;
    this.snapshot.windowTokens = n; this.snapshot.compactAtTokens = compactLimit(n, this.state, this.snapshot.role);
    this.snapshot.windowSource = 'native'; delete this.snapshot.windowReference; delete this.snapshot.windowCheckedAt;
    if (model) this.snapshot.model = model;
    this.persist();
  }
  private usage(used: unknown, source: string, measurement: ModelContext['measurement'], sampleId?: string) {
    const n = tokenCount(used); if (n === null) return;
    if (sampleId && this.measurements.get(sampleId) === n) return;
    if (sampleId) this.measurements.set(sampleId, n);
    this.snapshot.usedTokens = n; this.snapshot.measurement = measurement; this.snapshot.source = source;
    if (this.snapshot.status !== 'compacting') this.snapshot.status = this.snapshot.windowTokens && n >= this.snapshot.windowTokens ? 'exceeded' : this.snapshot.compactAtTokens && n >= this.snapshot.compactAtTokens ? 'near-limit' : 'normal';
    this.persist(sampleId ?? `${source}:${this.snapshot.updatedAt}:${this.measurements.size}`);
  }
  compact(status: 'compacting' | 'compacted', id: string) {
    if (status === 'compacted') {
      if (this.compactItems.has(id)) return;
      this.compactItems.add(id); this.snapshot.compactions++;
      // A completion receipt is not a token count. Await the next native measurement.
      this.snapshot.usedTokens = null; this.snapshot.measurement = 'unknown';
    }
    this.snapshot.status = status; this.persist();
  }
  observe(event: any) {
    if (!event || event.isReplay || event.parent_tool_use_id) return;
    if (event.type === 'context.compaction-failed') {
      this.snapshot.status = 'unknown'; this.persist();
      this.store.audit('context-compact-unconfirmed', { role: this.snapshot.role, sessionId: this.snapshot.sessionId, message: event.message, recovery: 'Inspect original Session; do not automatically repeat compaction.' });
    } else if (event.type === 'context.usage') {
      this.window(event.windowTokens, event.model);
      this.usage(event.usedTokens, 'codex.thread/tokenUsage/updated.last', 'native', event.measurementId);
    } else if (event.type === 'context.compaction') this.compact(event.status, event.id);
    else if (event.type === 'system' && event.subtype === 'compact_boundary') this.compact('compacted', event.uuid ?? event.session_id ?? this.snapshot.updatedAt);
    else if (event.type === 'system' && event.subtype === 'status' && event.status === 'compacting') this.compact('compacting', 'claude');
    else if (event.type === 'result' && event.modelUsage) {
      // modelUsage token totals may be session-cumulative; ONLY read its window metadata.
      const rows = Object.entries(event.modelUsage) as [string, any][];
      const selected = rows.find(([model]) => model === this.snapshot.model) ?? (rows.length === 1 ? rows[0] : undefined);
      if (selected) this.window(selected[1].contextWindow, selected[0]);
    } else {
      const message = event.type === 'assistant' ? event.message : event.type === 'stream_event' && event.event?.type === 'message_start' ? event.event.message : undefined;
      if (message?.usage) {
        this.snapshot.model = message.model ?? this.snapshot.model;
        const u = message.usage, values = [u.input_tokens, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0].map(tokenCount);
        if (values.every(n => n !== null)) this.usage(values.reduce<number>((sum, n) => sum + n!, 0), 'claude.main-request.input+cache', 'estimated', message.id);
      }
    }
  }
  opencode(info: any) {
    if (info?.role !== 'assistant' || !info.time?.completed) return;
    this.snapshot.model = info.providerID+'/'+info.modelID;
    const u = info.tokens, values = [u?.input, u?.output, u?.reasoning ?? 0, u?.cache?.read ?? 0, u?.cache?.write ?? 0].map(tokenCount);
    if (values.every(n => n !== null)) this.usage(values.reduce<number>((sum,n) => sum+n!,0), 'opencode.last-assistant.tokens', 'estimated', info.id);
  }
}
export function modelContexts(events: { event: string; data: any }[]): ModelContext[] {
  const rows = new Map<string, ModelContext>();
  for (const e of events) if (e.event === 'model-context') rows.set(`${e.data.role}:${e.data.participantId ?? ''}`, e.data);
  return [...rows.values()].map(row => {
    if (row.backend !== 'opencode' || positive(row.windowTokens)) return row;
    const fallback = opencodeWindow(row.model ?? row.configuredModel);
    // Read-time enrichment leaves historical audit records untouched.
    return fallback ? { ...row, ...fallback } : row;
  });
}
