import { create } from 'zustand';
import type { Provider, AgentType } from '../types';
import { getConfig } from '../api/agent';

// 本地存储 key
const PREF_KEY = 'aiclaw-preferences';

interface ConfigState {
  providers: Provider[];
  agents: AgentType[];
  selectedProvider: string;
  selectedModel: string;
  selectedAgent: string;
  isPanelOpen: boolean;
  isLoading: boolean;
  isConfigLoaded: boolean;

  // Actions
  setProvider: (providerId: string) => void;
  setModel: (modelId: string) => void;
  setAgent: (agentId: string) => void;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  loadConfig: () => Promise<void>;
  loadPreferences: () => void;
  savePreferences: () => void;
}

// 从本地存储加载偏好设置
function loadFromLocalStorage(): { provider?: string; model?: string; agentType?: string } | null {
  try {
    const stored = localStorage.getItem(PREF_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // 忽略解析错误
  }
  return null;
}

// 保存偏好设置到本地存储
function saveToLocalStorage(prefs: { provider: string; model: string; agentType: string }): void {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    // 忽略存储错误
  }
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  providers: [],
  agents: [],
  selectedProvider: '',
  selectedModel: '',
  selectedAgent: '',
  isPanelOpen: false,
  isLoading: false,
  isConfigLoaded: false,

  setProvider: (providerId) => {
    const provider = get().providers.find((p) => p.id === providerId);
    const firstModel = provider?.models[0]?.id || '';
    set({ selectedProvider: providerId, selectedModel: firstModel });
  },

  setModel: (modelId) => set({ selectedModel: modelId }),

  setAgent: (agentId) => set({ selectedAgent: agentId }),

  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  setPanelOpen: (open) => set({ isPanelOpen: open }),

  loadConfig: async () => {
    try {
      set({ isLoading: true });
      const config = await getConfig();
      set({
        providers: config.providers,
        agents: config.agents,
        isConfigLoaded: true,
        // 设置默认选择
        selectedProvider: config.providers[0]?.id || '',
        selectedModel: config.providers[0]?.models[0]?.id || '',
        selectedAgent: config.agents[0]?.id || '',
      });
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  loadPreferences: () => {
    try {
      const prefs = loadFromLocalStorage();
      if (prefs) {
        set({
          selectedProvider: prefs.provider || get().selectedProvider,
          selectedModel: prefs.model || get().selectedModel,
          selectedAgent: prefs.agentType || get().selectedAgent,
        });
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  },

  savePreferences: () => {
    try {
      const { selectedProvider, selectedModel, selectedAgent } = get();
      saveToLocalStorage({
        provider: selectedProvider,
        model: selectedModel,
        agentType: selectedAgent,
      });
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  },
}));
