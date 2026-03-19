import { useEffect } from 'react';
import { useConfigStore } from '../stores/configStore';
import type { Provider } from '../types';

export function useConfig() {
  const {
    providers,
    agents,
    selectedProvider,
    selectedModel,
    selectedAgent,
    isPanelOpen,
    setProvider,
    setModel,
    setAgent,
    togglePanel,
    setPanelOpen,
    loadPreferences,
    savePreferences,
  } = useConfigStore();

  // 初始化时加载偏好设置
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // 获取当前选中的 provider
  const currentProvider = providers.find((p: Provider) => p.id === selectedProvider);

  // 获取当前可用的模型列表
  const availableModels = currentProvider?.models || [];

  return {
    providers,
    agents,
    selectedProvider,
    selectedModel,
    selectedAgent,
    isPanelOpen,
    availableModels,
    setProvider,
    setModel,
    setAgent,
    togglePanel,
    setPanelOpen,
    savePreferences,
  };
}
