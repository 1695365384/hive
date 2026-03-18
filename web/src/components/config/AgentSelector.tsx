import { ChevronDown } from 'lucide-react';
import type { AgentType } from '../../types';

interface AgentSelectorProps {
  agents: AgentType[];
  selectedAgent: string;
  onChange: (agentId: string) => void;
}

export function AgentSelector({
  agents,
  selectedAgent,
  onChange,
}: AgentSelectorProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700">Agent 类型</label>
      <div className="relative">
        <select
          value={selectedAgent}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent cursor-pointer"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
      </div>
      {selectedAgent && (
        <p className="text-xs text-gray-500">
          {agents.find((a) => a.id === selectedAgent)?.description}
        </p>
      )}
    </div>
  );
}
