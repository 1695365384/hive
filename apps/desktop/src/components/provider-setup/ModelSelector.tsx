import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const selectedModel = models.find((m) => m.id === value);
  const toolsWarning = selectedModel && selectedModel.supportsTools === false;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-stone-300">
          {t("provider.defaultModel")}
          {models.length > 0 && (
            <span className="text-stone-500 ml-1">
              {t("provider.availableModels", { count: models.length })}
            </span>
          )}
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-stone-500 py-2">
          <div className="animate-spin h-4 w-4 border-2 border-stone-600 border-t-amber-500 rounded-full" />
          {t("provider.loadingModels")}
        </div>
      ) : models.length > 0 ? (
        <ModelDropdown models={models} value={value} onChange={onChange} />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("provider.modelIdPlaceholder")}
          className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2.5 text-stone-100 placeholder-stone-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
        />
      )}

      {toolsWarning && (
        <p className="text-xs text-amber-400/80">{t("provider.toolsWarning")}</p>
      )}
    </div>
  );
}

function ModelDropdown({
  models,
  value,
  onChange,
}: {
  models: ModelInfo[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const groups = new Map<string, ModelInfo[]>();
  for (const m of models) {
    const family = m.family || t("common.other");
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family)!.push(m);
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2.5 text-stone-100 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
    >
      <option value="">{t("setup.autoRecommended")}</option>
      {Array.from(groups.entries()).map(([family, items]) => (
        <optgroup key={family} label={family}>
          {items.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.id}
              {m.supportsTools === false ? t("provider.noToolsSuffix") : ""}
              {m.contextWindow > 0 &&
                t("provider.ctxSuffix", { ctx: formatContextWindow(m.contextWindow) })}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
