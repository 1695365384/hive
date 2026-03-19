import { create } from 'zustand';
import type { Provider, AgentType } from '../types';

// 预定义的 Provider 和模型列表
const AVAILABLE_PROVIDERS: Provider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-coder', name: 'DeepSeek Coder' },
    ],
  },
];

const AVAILABLE_AGENTS: AgentType[] = [
  { id: 'general', name: '通用助手', description: '适用于一般对话和问题解答' },
  { id: 'explore', name: '代码探索', description: '探索和分析代码库' },
  { id: 'plan', name: '规划助手', description: '制定实现计划和架构设计' },
  { id: 'code-reviewer', name: '代码审查', description: '代码质量审查和改进建议' },
];

interface ConfigState {
  providers: Provider[];
  agents: AgentType[];
  selectedProvider: string;
  selectedModel: string;
  selectedAgent: string;
  isPanelOpen: boolean;
  isLoading: boolean;

  // Actions
  setProvider: (providerId: string) => void;
  setModel: (modelId: string) => void;
  setAgent: (agentId: string) => void;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  loadPreferences: () => Promise<void>;
  savePreferences: () => Promise<void>;
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  providers: AVAILABLE_PROVIDERS,
  agents: AVAILABLE_AGENTS,
  selectedProvider: 'anthropic',
  selectedModel: 'claude-sonnet-4-6',
  selectedAgent: 'general',
  isPanelOpen: false,
  isLoading: false,

  setProvider: (providerId) => {
    const provider = get().providers.find((p) => p.id === providerId);
    const firstModel = provider?.models[0]?.id || '';
    set({ selectedProvider: providerId, selectedModel: firstModel });
  },

  setModel: (modelId) => set({ selectedModel: modelId }),

  setAgent: (agentId) => set({ selectedAgent: agentId }),

  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  setPanelOpen: (open) => set({ isPanelOpen: open }),

  loadPreferences: async () => {
    try {
      const { getPreferences } = await import('../services/api');
      const prefs = await getPreferences();
      set({
        selectedProvider: prefs.provider || 'anthropic',
        selectedModel: prefs.model || 'claude-sonnet-4-6',
        selectedAgent: prefs.agentType || 'general',
      });
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  },

  savePreferences: async () => {
    try {
      const { setPreference } = await import('../services/api');
      const { selectedProvider, selectedModel, selectedAgent } = get();
      await Promise.all([
        setPreference('provider', selectedProvider),
        setPreference('model', selectedModel),
        setPreference('agentType', selectedAgent),
      ]);
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  },
}));
