import React from 'react';
import type {AgentId} from '../../src/agent-capabilities.js';

const logos: Record<AgentId, string> = {
 'claude-code': new URL('./assets/agents/claude.svg', import.meta.url).href,
 opencode: new URL('./assets/agents/opencode.svg', import.meta.url).href,
 codex: new URL('./assets/agents/openai.svg', import.meta.url).href,
};
export default function AgentLogo({agent}: {agent: AgentId}) {
 return <span className="agent-logo" data-agent={agent} aria-hidden="true"><img src={logos[agent]} alt=""/></span>;
}
