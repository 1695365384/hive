import { X, Check } from 'lucide-react';
import { useConfig } from '../../hooks/useConfig';
import { ProviderSelector } from './ProviderSelector';
import { ModelSelector } from './ModelSelector';
import { AgentSelector } from './AgentSelector';
import { useState, useEffect } from 'react';

export function ConfigPanel() {
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
    setPanelOpen,
  } = useConfig();

  const [localProvider, setLocalProvider] = useState(selectedProvider);
  const [localModel, setLocalModel] = useState(selectedModel);
  const [localAgent, setLocalAgent] = useState(selectedAgent);
  const [isSaving, setIsSaving] = useState(false);

  // 同步外部状态
  useEffect(() => {
    setLocalProvider(selectedProvider);
    setLocalModel(selectedModel);
    setLocalAgent(selectedAgent);
  }, [selectedProvider, selectedModel, selectedAgent, isPanelOpen]);

  const handleProviderChange = (providerId: string) => {
    setLocalProvider(providerId);
    // 重置模型到新 provider 的第一个
    const provider = providers.find((p) => p.id === providerId);
    if (provider?.models[0]) {
      setLocalModel(provider.models[0].id);
    }
  };

  const handleSave = () => {
    setIsSaving(true);
    setProvider(localProvider);
    setModel(localModel);
    setAgent(localAgent);
    setPanelOpen(false);
    setIsSaving(false);
  };

  const handleCancel = () => {
    setLocalProvider(selectedProvider);
    setLocalModel(selectedModel);
    setLocalAgent(selectedAgent);
    setPanelOpen(false);
  };

  // 获取当前 provider 的模型列表
  const currentModels =
    providers.find((p) => p.id === localProvider)?.models || [];

  if (!isPanelOpen) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/30 z-40"
        onClick={handleCancel}
      />

      {/* 配置面板 */}
      <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-xl z-50 flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">配置</h2>
          <button
            onClick={handleCancel}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <ProviderSelector
            providers={providers}
            selectedProvider={localProvider}
            onChange={handleProviderChange}
          />

          <ModelSelector
            models={currentModels}
            selectedModel={localModel}
            onChange={setLocalModel}
          />

          <AgentSelector
            agents={agents}
            selectedAgent={localAgent}
            onChange={setLocalAgent}
          />
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                保存
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
