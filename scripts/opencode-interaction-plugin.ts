import { hookDecision } from './codex-interaction-hook.js';

// Configured in PersonalAgent's own OpenCode service runtime, never user config.
export const InteractionPolicyPlugin = async ({ directory }: { directory: string }) => ({
  'tool.execute.before': async (input: { tool: string }, output: { args: Record<string, unknown> }) => {
    const result = hookDecision({ tool_name: input.tool, tool_input: output.args, cwd: directory });
    if (!result.allowed) throw new Error(result.reason);
  },
});
