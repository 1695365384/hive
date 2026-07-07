/**
 * ProviderGrid — 厂商选择卡片网格
 *
 * 在 SetupWizard Step 1 和 ConfigPage 中复用。
 */

import type { ProviderInfo } from "../../types/provider";

interface ProviderGridProps {
  providers: ProviderInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** 每行卡片数（默认 3） */
  columns?: 3 | 4;
  /** 空状态加载提示 */
  loading?: boolean;
}

export function ProviderGrid({
  providers,
  selectedId,
  onSelect,
  columns = 3,
  loading,
}: ProviderGridProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-stone-500">
        <div className="animate-spin h-5 w-5 border-2 border-stone-600 border-t-amber-500 rounded-full mr-2" />
        Loading providers...
      </div>
    );
  }

  const gridCols = columns === 4 ? "grid-cols-4" : "grid-cols-3";

  return (
    <div className={`grid ${gridCols} gap-2 max-h-48 overflow-y-auto pr-1`}>
      {providers.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.id)}
          className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors ${
            selectedId === p.id
              ? "border-amber-500 bg-amber-500/10"
              : "border-stone-700 hover:border-stone-500 bg-stone-900"
          }`}
        >
          {p.logo ? (
            <div className="w-8 h-8 rounded bg-white/10 p-1">
              <img
                src={p.logo}
                alt={p.name}
                className="w-full h-full object-contain"
                style={{ filter: "invert(1) brightness(2)" }}
                onError={(e) => {
                  (e.target as HTMLImageElement).parentElement!.style.display = "none";
                }}
              />
            </div>
          ) : (
            <div className="w-8 h-8 rounded bg-stone-700 flex items-center justify-center text-xs text-stone-400">
              {p.name.slice(0, 2)}
            </div>
          )}
          <span className="text-xs text-stone-300 truncate w-full text-center">
            {p.name}
          </span>
        </button>
      ))}
    </div>
  );
}
