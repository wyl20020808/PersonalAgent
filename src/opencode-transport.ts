import { Agent } from 'undici';

/** Dedicated to our owned local OpenCode server; never changes global fetch. */
export function createOpencodeTransport() {
  const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
  const fetch: typeof globalThis.fetch = (input, init) => globalThis.fetch(input, {
    ...init, redirect: 'error', dispatcher
  } as RequestInit & { dispatcher: Agent });
  return { fetch, close: () => dispatcher.destroy() };
}

/** Persist causes without recording request headers, URLs or credentials. */
export function transportErrorDetails(error: unknown) {
  const cause = (error as { cause?: { name?: unknown; code?: unknown } } | null)?.cause;
  return cause ? {
    causeName: typeof cause.name === 'string' && /^[a-zA-Z0-9_]{1,80}$/.test(cause.name) ? cause.name : undefined,
    causeCode: typeof cause.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(cause.code) ? cause.code : undefined
  } : {};
}
