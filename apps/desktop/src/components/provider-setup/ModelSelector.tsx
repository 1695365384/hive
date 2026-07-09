/**
 * ModelSelector — 模型选择下拉框
 *
 * 支持两种模式：
 * - 有模型列表时：下拉选择（按 family 分组）
 * - 无模型列表时：文本输入（手动填 model ID）
 *
 * 在 SetupWizard Step 3 和 ConfigPage 中复用。
 */

import { type ModelInfo, formatContextWindow } from "../../types/provider";

interface ModelSelectorProps {
  models: ModelInfo[];
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
}

export function ModelSelector({
  models,
  value,
  onChange,
  loading,
}: ModelSelectorProps) {
  const selectedModel = models.find(m => m.id === value);
  const toolsWarning = selectedModel && selectedModel.supportsTools === false;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-stone-300">
          Default Model
          {models.length > 0 && (
            <span className="text-stone-500 ml-1">({models.length} available)</span>
          )}
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-stone-500 py-2">
          <div className="animate-spin h-4 w-4 border-2 border-stone-600 border-t-amber-500 rounded-full" />
          Loading models...
        </div>
      ) : models.length > 0 ? (
        <ModelDropdown models={models} value={value} onChange={onChange} />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Model ID (e.g., glm-4-flash)"
          className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2.5 text-stone-100 placeholder-stone-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        />
      )}

      {toolsWarning && (
        <p className="text-xs text-amber-400/80">
          此模型可能不支持工具调用。如果任务需要 Worker 执行代码或命令，建议选择支持 tools 的模型。
        </p>
      )}
    </div>
  );
}

/** 按 family 分组的下拉选择器 */
function ModelDropdown({
  models,
  value,
  onChange,
}: {
  models: ModelInfo[];
  value: string;
  onChange: (v: string) => void;
}) {
  // 按 family 分组（无 family 的归到 "Other"）
  const groups = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const family = m.family || "Other";
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family)!.push(m);
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2.5 text-stone-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
    >
      <option value="">Auto (recommended)</option>
      {Array.from(groups.entries()).map(([family, items]) => (
        <optgroup key={family} label={family}>
          {items.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.id}
              {m.supportsTools === false ? " (⚠ no tools)" : ""}
              {m.contextWindow > 0 && ` (${formatContextWindow(m.contextWindow)} ctx)`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
