import {streamingCodex} from './codex-live.js';
import {codexBudgetNotice} from './resource-budget.js';
import { runCodexDecisionTurn, type CodexDecisionTurn } from './codex-decision-turn.js';
import { codexDecisionRuntime } from './codex-decision-runtime.js';

let input = ''; for await (const chunk of process.stdin) input += chunk;
try {
  const request = JSON.parse(input) as CodexDecisionTurn;
  const scope = { runId: request.runId, workspace: request.workspace, role: request.role,
    participantId: request.participantId ?? null, discussionStage: request.discussionStage ?? null };
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined));
  const runtime = codexDecisionRuntime(env);
  if (request.compactAtTokens) runtime.config = { ...runtime.config, model_auto_compact_token_limit: request.compactAtTokens };
  const result = await runCodexDecisionTurn(streamingCodex({ ...runtime, budgetNotice:codexBudgetNotice(request.prompt), compactBeforeTurn: request.compactBeforeTurn }), request, event => console.log(JSON.stringify({ ...event, scope })));
  console.log(JSON.stringify({ type: 'result', data: result, scope }));
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
