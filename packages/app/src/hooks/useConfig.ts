import { useEffect, useRef } from 'react';
import { useConfigStore } from '../stores/configStore';
import type { Provider } from '../types';

// 全局加载标记，防止多个组件同时触发加载
let configLoadingStarted = false;

export function useConfig() {
  const {
    providers,
    agents,
    selectedProvider,
    selectedModel,
    selectedAgent,
    isPanelOpen,
    isConfigLoaded,
    isLoading,
    setProvider,
    setModel,
    setAgent,
    togglePanel,
    setPanelOpen,
    loadConfig,
    loadPreferences,
    savePreferences,
  } = useConfigStore();

  // 使用 ref 确保只执行一次
  const initializedRef = useRef(false);

  // 初始化时加载配置（从后端获取）
  useEffect(() => {
    // 使用双重检查：ref + store 状态 + 全局标记
    if (!initializedRef.current && !configLoadingStarted && !isConfigLoaded && !isLoading) {
      initializedRef.current = true;
      configLoadingStarted = true;
      loadConfig()
        .then(() => {
          loadPreferences();
        })
        .finally(() => {
          configLoadingStarted = false;
        });
    }
  }, [isConfigLoaded, isLoading, loadConfig, loadPreferences]);

  // 获取当前选中的 provider
  const currentProvider = providers.find((p: Provider) => p.id === selectedProvider);

  // 获取当前可用的模型列表
  const availableModels = currentProvider?.models || [];

  // 自动保存偏好设置
  useEffect(() => {
    if (isConfigLoaded) {
      savePreferences();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, selectedModel, selectedAgent, isConfigLoaded]);

  return {
    providers,
    agents,
    selectedProvider,
    selectedModel,
    selectedAgent,
    isPanelOpen,
    isLoading,
    availableModels,
    setProvider,
    setModel,
    setAgent,
    togglePanel,
    setPanelOpen,
  };
}
