import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import type { ProviderInfo } from "../../types/provider";
import { filterProviders } from "./filter-providers";
import { ProviderLogo } from "./ProviderLogo";

interface ProviderGridProps {
  providers: ProviderInfo[];
  selectedId: string;
  onSelect: (id: string) => void;
  columns?: 3 | 4;
  loading?: boolean;
  /** ConfigPage: true. SetupWizard: false. */
  showSearch?: boolean;
  density?: "comfortable" | "compact";
}

export function ProviderGrid({
  providers,
  selectedId,
  onSelect,
  columns = 3,
  loading,
  showSearch = false,
  density = "comfortable",
}: ProviderGridProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => filterProviders(providers, query),
    [providers, query],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-stone-500">
        <div className="animate-spin h-5 w-5 border-2 border-stone-600 border-t-amber-500 rounded-full mr-2" />
        {t("provider.loadingProviders")}
      </div>
    );
  }

  const gridCols = columns === 4 ? "grid-cols-4" : "grid-cols-3";
  const maxH = density === "compact" ? "max-h-56" : "max-h-48";
  const pad = density === "compact" ? "p-2.5" : "p-3";

  return (
    <div className="space-y-2">
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("provider.searchProviders")}
            aria-label={t("provider.searchProviders")}
            className="w-full bg-stone-800 border border-stone-700 rounded-lg pl-8 pr-8 py-2 text-sm text-stone-100 placeholder-stone-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-stone-500 hover:text-stone-300"
              aria-label={t("provider.clearSearch")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-stone-500">
          {query.trim()
            ? t("provider.noMatchingProviders")
            : t("provider.noProviders")}
          {query.trim() ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="ml-2 text-amber-500 hover:text-amber-400"
            >
              {t("provider.clearSearch")}
            </button>
          ) : null}
        </div>
      ) : (
        <div className={`grid ${gridCols} gap-2 ${maxH} overflow-y-auto pr-1`}>
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              aria-pressed={selectedId === p.id}
              className={`flex flex-col items-center gap-1.5 ${pad} rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                selectedId === p.id
                  ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/40"
                  : "border-stone-700 hover:border-stone-500 bg-stone-900"
              }`}
            >
              <ProviderLogo
                providerId={p.id}
                name={p.name}
                logo={p.logo}
                size="md"
              />
              <span className="text-xs text-stone-300 truncate w-full text-center">
                {p.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
