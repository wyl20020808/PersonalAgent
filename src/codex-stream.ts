import type { ThreadEvent } from '@openai/codex-sdk';

/** Never replay tools whose result was not observed. */
export async function* ownedCodexEvents(events: AsyncGenerator<ThreadEvent>): AsyncGenerator<ThreadEvent> {
  const pending = new Set<string>();
  try {
    for await (const event of events) {
      if ('item' in event && ['command_execution', 'file_change', 'mcp_tool_call'].includes(event.item.type)) {
        if (event.type === 'item.completed') pending.delete(event.item.id);
        else pending.add(event.item.id);
      }
      if ((event.type === 'turn.failed' || event.type === 'turn.completed') && pending.size)
        throw Error('unsafe recovery: Codex tool results are unknown; manual recovery required');
      yield event;
    }
    if (pending.size) throw Error('unsafe recovery: Codex tool results are unknown; manual recovery required');
  } catch (error) {
    if (pending.size) throw Error('unsafe recovery: Codex tool results are unknown; manual recovery required', { cause: error });
    throw error;
  }
}
