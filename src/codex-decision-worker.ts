import { Codex } from '@openai/codex-sdk';
import { runCodexDecisionTurn, type CodexDecisionTurn } from './codex-decision-turn.js';
import { codexDecisionRuntime } from './codex-decision-runtime.js';

let input = ''; for await (const chunk of process.stdin) input += chunk;
try {
  const request = JSON.parse(input) as CodexDecisionTurn;
  const scope = { runId: request.runId, workspace: request.workspace, role: request.role,
    participantId: request.participantId ?? null, discussionStage: request.discussionStage ?? null };
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined));
  const result = await runCodexDecisionTurn(new Codex(codexDecisionRuntime(env)), request, event => console.log(JSON.stringify({ ...event, scope })));
  console.log(JSON.stringify({ type: 'result', data: result, scope }));
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
