export const failureKinds = ['context', 'transport', 'executor', 'supervisor', 'timeout', 'authentication', 'budget', 'validation', 'safety', 'git', 'git-integrity', 'rejected', 'interrupted', 'unknown'] as const;
export type FailureKind = typeof failureKinds[number];
export interface Failure { kind: FailureKind; stage: string; message: string; recoverable: boolean }
export class FlowError extends Error {
  runId?: string;
  constructor(readonly kind: FailureKind, message: string) { super(message); }
}
export function classifyFailure(error: unknown, stage: string): Failure {
  const message = error instanceof Error ? error.message : String(error);
  let kind: FailureKind = error instanceof FlowError ? error.kind : 'unknown';
  if (kind === 'unknown') {
    if (/context[_ ](?:length[_ ]exceeded|window[_ ]exceeded)|maximum context length|prompt is too long|too many tokens|input.*exceeds.*context/i.test(message)) kind = 'context';
    else if (/\b(?:401|403)\b|authentication|authenticate|ProviderAuthError|unauthorized|invalid.*api.?key|oauth|log.?in|credentials/i.test(message)) kind = 'authentication';
    else if (/quota|usage limit|session limit|hit your limit|rate.?limit|credit.*(?:exhaust|insufficient)|insufficient.*credit|out of credits|\b429\b/i.test(message)) kind = 'budget';
    else if (/Timeout|timed out/i.test(message)) kind = 'timeout';
    else if (/tool results are unknown; manual recovery required/i.test(message)) kind = 'interrupted';
    else if (/JSON Schema|invalid JSON|Duplicate task|Plan must|fewer tasks/i.test(message)) kind = 'validation';
    else if (/unsafe|protected|escape|symlink|junction|Duplicate edit|Ignored edit|Workspace changed|Tests modified|Git HEAD|Deletion detected|journal|read-only.*modification|coverage incomplete|snapshot.*(?:limit|fingerprint)|backup directory outside Run/i.test(message)) kind = 'safety';
    else if (/stream disconnected|Transport error|network error|fetch failed|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket.*closed|\b(?:502|503|504)\b|overloaded|\b(?:selected\s+)?model\s+(?:is\s+)?at\s+capacity\b|upstream_error|upstream request failed|\bunknown certificate verification error\b/i.test(message)) kind = 'transport';
    else if (/Mock executor failed|Codex.*exited/i.test(message)) kind = 'executor';
  }
  return { kind, stage, message, recoverable: ['context', 'transport', 'executor', 'supervisor', 'timeout', 'authentication', 'budget', 'interrupted'].includes(kind) };
}

/** Preserve native provider details before classification; UnknownError alone is not retryable. */
export function providerFailure(error: unknown, fallback: FailureKind): FlowError {
  const native = error as { name?: string; data?: { message?: string; statusCode?: number }; message?: string };
  const message = [native?.name, native?.data?.statusCode, native?.data?.message ?? native?.message].filter(value => value !== undefined).join(': ');
  const classified = classifyFailure(new Error(message), 'provider');
  return new FlowError(classified.kind === 'unknown' ? fallback : classified.kind, message || 'Unknown provider error');
}
