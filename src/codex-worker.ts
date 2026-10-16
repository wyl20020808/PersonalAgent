import {streamingCodex} from './codex-live.js';
import {codexBudgetNotice} from './resource-budget.js';
import { runCodexTurn, type WorkerRequest } from './native-agent.js';

// A dedicated child owns SDK descendants so Windows taskkill /T stops them.
let input = ''; for await (const chunk of process.stdin) input += chunk;
try {
  const request = JSON.parse(input) as WorkerRequest;
  const env = Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined));
  // Inherit installed CLI settings, default model, instructions, Skills and MCP.
  const result = await runCodexTurn(streamingCodex({ env, budgetNotice:codexBudgetNotice(request.prompt), compactBeforeTurn: request.compactBeforeTurn, ...(request.compactAtTokens ? { config: { model_auto_compact_token_limit: request.compactAtTokens } } : {}) }), request, event => console.log(JSON.stringify(event)));
  console.log(JSON.stringify({ type: 'result', data: result }));
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }
