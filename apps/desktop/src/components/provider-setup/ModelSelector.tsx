import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Search } from "lucide-react";
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

function modelLabel(m: ModelInfo): string {
  return m.name ?? m.id;
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuBox, setMenuBox] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = models.find((m) => m.id === value);
  const triggerTitle = selected
    ? modelLabel(selected)
    : t("setup.autoRecommended");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.name?.toLowerCase().includes(q) ?? false) ||
        (m.family?.toLowerCase().includes(q) ?? false),
    );
  }, [models, query]);

  const groups = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const m of filtered) {
      const family = m.family || t("common.other");
      if (!map.has(family)) map.set(family, []);
      map.get(family)!.push(m);
    }
    return Array.from(map.entries());
  }, [filtered, t]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setMenuBox(null);
  };

  const syncMenuBox = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 12;
    const spaceAbove = rect.top - gap - 12;
    const preferBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;
    const maxHeight = Math.min(320, Math.max(160, preferBelow ? spaceBelow : spaceAbove));
    const top = preferBelow
      ? rect.bottom + gap
      : Math.max(12, rect.top - gap - maxHeight);
    setMenuBox({
      top,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
  };

  useEffect(() => {
    if (!open) return;
    syncMenuBox();
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onReposition = () => syncMenuBox();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    close();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (open) {
            close();
          } else {
            setOpen(true);
            syncMenuBox();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
          open
            ? "border-amber-500/60 bg-stone-800 ring-2 ring-amber-500/30"
            : "border-stone-700 bg-stone-800 hover:border-stone-500"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm text-stone-100 truncate">{triggerTitle}</div>
          {selected ? (
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {selected.contextWindow > 0 && (
                <MetaChip>
                  {formatContextWindow(selected.contextWindow)}{" "}
                  {t("provider.contextShort")}
                </MetaChip>
              )}
              {selected.supportsTools === false && (
                <MetaChip tone="warn">{t("provider.noToolsShort")}</MetaChip>
              )}
              {selected.family && (
                <span className="text-[11px] text-stone-500 truncate">
                  {selected.family}
                </span>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-stone-500 mt-0.5">
              {t("provider.autoModelHint")}
            </div>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-stone-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && menuBox && (
        <div
          ref={menuRef}
          className="fixed z-[80] rounded-xl border border-stone-700 bg-stone-900 shadow-xl shadow-black/50 overflow-hidden"
          style={{
            top: menuBox.top,
            left: menuBox.left,
            width: menuBox.width,
            maxHeight: menuBox.maxHeight,
          }}
          role="listbox"
        >
          <div className="p-2 border-b border-stone-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500 pointer-events-none" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("provider.searchModels")}
                className="w-full bg-stone-800 border border-stone-700 rounded-lg pl-8 pr-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
          </div>

          <div
            className="overflow-y-auto py-1"
            style={{ maxHeight: Math.max(120, menuBox.maxHeight - 52) }}
          >
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => pick("")}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                !value
                  ? "bg-amber-500/10 text-amber-100"
                  : "text-stone-200 hover:bg-stone-800"
              }`}
            >
              <span className="w-4 shrink-0 flex justify-center">
                {!value && <Check className="w-3.5 h-3.5 text-amber-400" />}
              </span>
              <div className="min-w-0">
                <div className="truncate">{t("setup.autoRecommended")}</div>
                <div className="text-[11px] text-stone-500">
                  {t("provider.autoModelHint")}
                </div>
              </div>
            </button>

            {groups.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-stone-500">
                {t("provider.noMatchingModels")}
              </div>
            ) : (
              groups.map(([family, items]) => (
                <div key={family} className="mt-1">
                  <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-500 sticky top-0 bg-stone-900/95 backdrop-blur-sm">
                    {family}
                  </div>
                  {items.map((m) => {
                    const active = m.id === value;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => pick(m.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                          active
                            ? "bg-amber-500/10"
                            : "hover:bg-stone-800"
                        }`}
                      >
                        <span className="w-4 shrink-0 flex justify-center">
                          {active && (
                            <Check className="w-3.5 h-3.5 text-amber-400" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-sm truncate ${active ? "text-amber-100" : "text-stone-100"}`}
                          >
                            {modelLabel(m)}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {m.id !== modelLabel(m) && (
                              <span className="text-[11px] text-stone-500 truncate font-mono">
                                {m.id}
                              </span>
                            )}
                            {m.contextWindow > 0 && (
                              <MetaChip>
                                {formatContextWindow(m.contextWindow)}{" "}
                                {t("provider.contextShort")}
                              </MetaChip>
                            )}
                            {m.supportsTools === false && (
                              <MetaChip tone="warn">
                                {t("provider.noToolsShort")}
                              </MetaChip>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaChip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warn";
}) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] leading-none border ${
        tone === "warn"
          ? "bg-amber-500/10 text-amber-400/90 border-amber-500/25"
          : "bg-stone-800 text-stone-400 border-stone-700"
      }`}
    >
      {children}
    </span>
  );
}
