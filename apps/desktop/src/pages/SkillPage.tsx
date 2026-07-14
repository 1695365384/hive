import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, RefreshCw } from "lucide-react";
import { useWsClient } from "../hooks/use-ws-client";

interface CatalogSkill {
  name: string;
  category: string;
  categoryId: string;
  description: string;
  source: string;
  path: string;
}

interface CatalogCategory {
  id: string;
  label: string;
  count: number;
}

interface SkillCatalogResult {
  source: string;
  title: string;
  description: string;
  categories: CatalogCategory[];
  skills: CatalogSkill[];
  defaultSource?: string;
}

interface InstalledSkill {
  name: string;
  description: string;
  version: string;
  scope: "builtin" | "user";
}

const PAGE_SIZE = 40;

export function SkillPage() {
  const { t } = useTranslation();
  const { request, onEvent } = useWsClient();

  const [catalog, setCatalog] = useState<SkillCatalogResult | null>(null);
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const loadInstalled = useCallback(() => {
    request<InstalledSkill[]>("skill.list")
      .then(setInstalled)
      .catch(() => setInstalled([]));
  }, [request]);

  const loadCatalog = useCallback(
    async (force = false) => {
      setLoading(true);
      setError("");
      try {
        const data = await request<SkillCatalogResult>("skill.catalog", {
          force,
          query: query || undefined,
          categoryId: categoryId || undefined,
        });
        setCatalog(data);
        setVisibleCount(PAGE_SIZE);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t("skills.loadFailed"));
        setCatalog(null);
      }
      setLoading(false);
    },
    [request, query, categoryId, t],
  );

  useEffect(() => {
    loadInstalled();

    const unsub1 = onEvent("skill.installed", () => {
      loadInstalled();
    });
    const unsub2 = onEvent("skill.removed", () => {
      loadInstalled();
    });
    return () => {
      unsub1();
      unsub2();
    };
  }, [loadInstalled, onEvent]);

  // 首次加载 + 搜索 / 分类变化（防抖）
  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCatalog(false);
    }, query || categoryId ? 280 : 0);
    return () => clearTimeout(timer);
  }, [query, categoryId, loadCatalog]);

  const installedNames = useMemo(
    () => new Set(installed.map((s) => s.name)),
    [installed],
  );

  const skills = catalog?.skills ?? [];
  const visibleSkills = skills.slice(0, visibleCount);

  const handleInstall = async (skill: CatalogSkill) => {
    setInstalling(skill.name);
    setError("");
    try {
      await request("skill.install", {
        source: skill.source,
        skills: [skill.name],
      });
      loadInstalled();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("skills.installFailed"));
    }
    setInstalling(null);
  };

  const handleRemove = async (name: string) => {
    setRemoving(name);
    setError("");
    try {
      await request("skill.remove", { name });
      loadInstalled();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("skills.removeFailed"));
    }
    setRemoving(null);
  };

  const userInstalled = installed.filter((s) => s.scope === "user");
  const builtinInstalled = installed.filter((s) => s.scope === "builtin");

  return (
    <div className="h-full p-6 space-y-6 overflow-y-auto">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{t("skills.title")}</h2>
        <p className="text-xs text-stone-500">
          {t("skills.subtitle", {
            source: catalog?.title || catalog?.source || "findscripter/everything-skills",
            count: catalog?.skills.length ?? "…",
          })}
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* Catalog browser */}
      <div className="bg-stone-900 rounded-lg p-4 space-y-3 border border-stone-800">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">
            {t("skills.catalog", { count: skills.length })}
          </h3>
          <button
            type="button"
            onClick={() => void loadCatalog(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("skills.refresh")}
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("skills.searchPlaceholder")}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-stone-800 border border-stone-700 rounded text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-stone-500"
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="px-2 py-1.5 text-sm bg-stone-800 border border-stone-700 rounded text-stone-200 focus:outline-none focus:border-stone-500 max-w-[16rem]"
          >
            <option value="">{t("skills.allCategories")}</option>
            {(catalog?.categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} ({c.count})
              </option>
            ))}
          </select>
        </div>

        {loading && !catalog ? (
          <p className="text-sm text-stone-500">{t("skills.loading")}</p>
        ) : skills.length === 0 ? (
          <p className="text-sm text-stone-500">{t("skills.noCatalog")}</p>
        ) : (
          <div className="space-y-2">
            {visibleSkills.map((skill) => {
              const already = installedNames.has(skill.name);
              return (
                <div
                  key={`${skill.categoryId}:${skill.name}`}
                  className="flex items-center justify-between p-3 bg-stone-800 rounded gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{skill.name}</p>
                    <p className="text-xs text-stone-500 truncate">
                      {skill.category}
                      {skill.description && skill.description !== skill.category
                        ? ` · ${skill.description}`
                        : ""}
                    </p>
                  </div>
                  {already ? (
                    <span className="shrink-0 px-3 py-1 text-xs bg-stone-700 text-stone-500 rounded">
                      {t("skills.installed")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleInstall(skill)}
                      disabled={installing === skill.name}
                      className="shrink-0 px-3 py-1 text-xs bg-amber-600 hover:bg-amber-700 disabled:bg-stone-700 rounded transition-colors"
                    >
                      {installing === skill.name
                        ? t("skills.installing")
                        : t("skills.install")}
                    </button>
                  )}
                </div>
              );
            })}
            {visibleCount < skills.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="w-full py-2 text-xs text-stone-400 hover:text-stone-200 border border-stone-700 rounded transition-colors"
              >
                {t("skills.showMore", {
                  remaining: skills.length - visibleCount,
                })}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Installed */}
      <div className="bg-stone-900 rounded-lg p-4 space-y-3 border border-stone-800">
        <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">
          {t("skills.installedCount", { count: installed.length })}
        </h3>

        {installed.length === 0 ? (
          <p className="text-sm text-stone-500">{t("skills.noInstalled")}</p>
        ) : (
          <div className="space-y-2">
            {userInstalled.map((skill) => (
              <div
                key={`user:${skill.name}`}
                className="flex items-center justify-between p-3 bg-stone-800 rounded gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{skill.name}</p>
                  <p className="text-xs text-stone-500 truncate">
                    v{skill.version} · {t("skills.scopeUser")}
                    {skill.description ? ` · ${skill.description}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemove(skill.name)}
                  disabled={removing === skill.name}
                  className="shrink-0 px-3 py-1 text-xs text-red-400 hover:bg-red-400/10 disabled:opacity-50 rounded transition-colors"
                >
                  {removing === skill.name ? "…" : t("skills.remove")}
                </button>
              </div>
            ))}
            {builtinInstalled.map((skill) => (
              <div
                key={`builtin:${skill.name}`}
                className="flex items-center justify-between p-3 bg-stone-800/60 rounded gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-stone-300">
                    {skill.name}
                  </p>
                  <p className="text-xs text-stone-600 truncate">
                    v{skill.version} · {t("skills.scopeBuiltin")}
                    {skill.description ? ` · ${skill.description}` : ""}
                  </p>
                </div>
                <span className="shrink-0 px-3 py-1 text-xs text-stone-600">
                  {t("skills.builtin")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
