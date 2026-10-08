export const failureKinds = ['executor', 'supervisor', 'timeout', 'authentication', 'budget', 'validation', 'safety', 'rejected', 'interrupted', 'unknown'] as const;
export type FailureKind = typeof failureKinds[number];
export interface Failure { kind: FailureKind; stage: string; message: string; recoverable: boolean }
export class FlowError extends Error {
  constructor(readonly kind: FailureKind, message: string) { super(message); }
}
export function classifyFailure(error: unknown, stage: string): Failure {
  const message = error instanceof Error ? error.message : String(error);
  let kind: FailureKind = error instanceof FlowError ? error.kind : 'unknown';
  if (kind === 'unknown') {
    if (/\b(?:401|403)\b|authentication|authenticate|oauth|log.?in|credentials/i.test(message)) kind = 'authentication';
    else if (/quota.*exceed|usage limit|rate.?limit|\b429\b/i.test(message)) kind = 'budget';
    else if (/Timeout|timed out/i.test(message)) kind = 'timeout';
    else if (/JSON Schema|invalid JSON|Duplicate task|Plan must|fewer tasks/i.test(message)) kind = 'validation';
    else if (/unsafe|protected|escape|symlink|junction|Duplicate edit|Ignored edit|Workspace changed|Tests modified|Git HEAD|Deletion detected|journal|read-only.*modification/i.test(message)) kind = 'safety';
    else if (/Mock executor failed|Codex.*exited/i.test(message)) kind = 'executor';
  }
  return { kind, stage, message, recoverable: ['executor', 'supervisor', 'timeout', 'authentication', 'budget', 'interrupted'].includes(kind) };
}
