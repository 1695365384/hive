import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, RefreshCw, Flame, Download, Check, PackageSearch } from "lucide-react";
import { useWsClient } from "../hooks/use-ws-client";
import { SkillIcon } from "../components/skills/SkillIcon";

interface CatalogSkill {
  name: string;
  category: string;
  categoryId: string;
  description: string;
  title?: string;
  source: string;
  path: string;
  version?: string;
  downloads?: number;
  iconUrl?: string;
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
  folder?: string;
  aliases?: string[];
  description: string;
  version: string;
  scope: "builtin" | "user";
}

const PAGE_SIZE = 30;

function formatDownloads(n?: number): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "";
  if (n >= 10_000) {
    const v = n / 10_000;
    return `${v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, "")}万`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

function addInstalledKey(keys: Set<string>, value?: string) {
  const trimmed = value?.trim();
  if (!trimmed) return;
  keys.add(trimmed);
  keys.add(trimmed.toLowerCase());
}

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

  useEffect(() => {
    const timer = setTimeout(
      () => {
        void loadCatalog(false);
      },
      query || categoryId ? 280 : 0,
    );
    return () => clearTimeout(timer);
  }, [query, categoryId, loadCatalog]);

  const installedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const s of installed) {
      addInstalledKey(keys, s.name);
      addInstalledKey(keys, s.folder);
      for (const alias of s.aliases ?? []) {
        addInstalledKey(keys, alias);
      }
    }
    return keys;
  }, [installed]);

  const skills = catalog?.skills ?? [];
  const visibleSkills = skills.slice(0, visibleCount);
  const isHotBrowse = !query.trim() && !categoryId;

  const handleInstall = async (skill: CatalogSkill) => {
    const slug = skill.path || skill.name;
    setInstalling(slug);
    setError("");
    try {
      await request("skill.install", {
        source: skill.source || "skillhub",
        skills: [slug],
        slug,
      });
      setInstalled((items) => {
        const aliases = [slug, skill.name, skill.path, skill.title].filter(
          (v): v is string => Boolean(v),
        );
        const exists = items.some((item) =>
          [item.name, item.folder, ...(item.aliases ?? [])].some((v) => aliases.includes(v ?? "")),
        );
        if (exists) return items;
        return [
          ...items,
          {
            name: skill.name,
            folder: slug,
            aliases,
            description: skill.description,
            version: skill.version ?? "0.0.0",
            scope: "user",
          },
        ];
      });
      loadInstalled();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("skills.installFailed"));
    }
    setInstalling(null);
  };

  const handleRemove = async (skill: InstalledSkill) => {
    const key = skill.folder || skill.name;
    setRemoving(key);
    setError("");
    try {
      await request("skill.remove", { name: key });
      loadInstalled();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("skills.removeFailed"));
    }
    setRemoving(null);
  };

  const userInstalled = installed.filter((s) => s.scope === "user");
  const builtinInstalled = installed.filter((s) => s.scope === "builtin");

  return (
    <div className="skill-store">
      <div className="skill-store__sticky">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">{t("skills.title")}</h2>
            <p className="text-xs text-stone-400">
              {isHotBrowse
                ? t("skills.hotSubtitle", {
                    source: catalog?.title || "SkillHub",
                    count: catalog?.skills.length ?? "…",
                  })
                : t("skills.subtitle", {
                    source: catalog?.title || catalog?.source || "SkillHub",
                    count: catalog?.skills.length ?? "…",
                  })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadCatalog(true)}
            disabled={loading}
            className="skill-store__ghost-btn"
            title={t("skills.refresh")}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("skills.refresh")}
          </button>
        </header>

        {error && (
          <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="skill-store__toolbar">
          <Search className="skill-store__toolbar-icon" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("skills.searchPlaceholder")}
            className="skill-store__search"
          />
        </div>

        {(catalog?.categories?.length ?? 0) > 0 && (
          <div className="skill-store__chips" role="listbox" aria-label={t("skills.allCategories")}>
            <button
              type="button"
              role="option"
              aria-selected={!categoryId}
              className={`skill-store__chip ${!categoryId ? "is-active" : ""}`}
              onClick={() => setCategoryId("")}
            >
              {t("skills.allCategories")}
            </button>
            {catalog!.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={categoryId === c.id}
                className={`skill-store__chip ${categoryId === c.id ? "is-active" : ""}`}
                onClick={() => setCategoryId(categoryId === c.id ? "" : c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        <div className="skill-store__section-head">
          <h3 className="skill-store__section-label">
            {isHotBrowse ? (
              <>
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                {t("skills.hotRank")}
              </>
            ) : (
              t("skills.catalog", { count: skills.length })
            )}
          </h3>
          {loading && catalog ? (
            <span className="text-[11px] text-stone-500">{t("skills.loading")}</span>
          ) : null}
        </div>
      </div>

      <div className="skill-store__scroll">
        {loading && !catalog ? (
          <div className="skill-store__skeleton-list">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skill-store__skeleton-row">
                <div className="skill-store__skeleton-icon" />
                <div className="skill-store__skeleton-lines">
                  <div className="skill-store__skeleton-bar" style={{ width: "40%" }} />
                  <div className="skill-store__skeleton-bar" style={{ width: "70%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="skill-store__empty">
            <PackageSearch className="w-6 h-6" strokeWidth={1.5} />
            <p>{t("skills.noCatalog")}</p>
          </div>
        ) : (
          <div className="skill-store__list">
            {visibleSkills.map((skill, index) => {
              const slug = skill.path || skill.name;
              const already =
                installedKeys.has(slug) ||
                installedKeys.has(slug.toLowerCase()) ||
                installedKeys.has(skill.name) ||
                installedKeys.has(skill.name.toLowerCase()) ||
                (skill.title
                  ? installedKeys.has(skill.title) || installedKeys.has(skill.title.toLowerCase())
                  : false);
              const title = skill.title || skill.name;
              const downloads = formatDownloads(skill.downloads);
              const rank = isHotBrowse ? index + 1 : null;
              const rankTier = rank != null && rank <= 3 ? rank : rank != null ? "rest" : null;
              const desc =
                skill.description && skill.description.trim() !== skill.category?.trim()
                  ? skill.description
                  : "";

              return (
                <article key={`${skill.categoryId}:${slug}`} className="skill-store__row">
                  {rankTier != null ? (
                    <span className={`skill-store__rank skill-store__rank--${rankTier}`}>{rank}</span>
                  ) : null}

                  <SkillIcon title={title} iconUrl={skill.iconUrl} />

                  <div className="skill-store__body min-w-0">
                    <h4 className="skill-store__title truncate">{title}</h4>
                    <div className="skill-store__meta">
                      {slug !== title ? (
                        <span className="skill-store__slug truncate">{slug}</span>
                      ) : null}
                      {skill.category ? (
                        <span className="skill-store__tag">{skill.category}</span>
                      ) : null}
                      {downloads ? (
                        <span className="inline-flex items-center gap-1">
                          <Download className="w-3 h-3 opacity-60" />
                          {t("skills.downloads", { count: downloads })}
                        </span>
                      ) : null}
                      {skill.version ? <span>v{skill.version}</span> : null}
                    </div>
                    {desc ? <p className="skill-store__desc">{desc}</p> : null}
                  </div>

                  {already ? (
                    <span className="skill-store__installed">
                      <Check className="w-3 h-3" />
                      {t("skills.installed")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleInstall(skill)}
                      disabled={installing === slug}
                      className="skill-store__install"
                    >
                      {installing === slug ? t("skills.installing") : t("skills.install")}
                    </button>
                  )}
                </article>
              );
            })}

            {visibleCount < skills.length && (
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="skill-store__more"
              >
                {t("skills.showMore", {
                  remaining: skills.length - visibleCount,
                })}
              </button>
            )}
          </div>
        )}

        <section className="skill-store__section skill-store__installed-block">
          <div className="skill-store__section-head">
            <h3 className="skill-store__section-label">
              {t("skills.installedCount", { count: installed.length })}
            </h3>
          </div>

          {installed.length === 0 ? (
            <p className="text-sm text-stone-500 py-3">{t("skills.noInstalled")}</p>
          ) : (
            <div className="skill-store__list">
              {userInstalled.map((skill) => (
                <article
                  key={`user:${skill.folder || skill.name}`}
                  className="skill-store__row skill-store__row--compact"
                >
                  <SkillIcon title={skill.name} className="skill-icon--sm" />
                  <div className="skill-store__body min-w-0">
                    <h4 className="skill-store__title truncate">{skill.name}</h4>
                    <p className="skill-store__desc skill-store__desc--single">
                      v{skill.version} · {t("skills.scopeUser")}
                      {skill.description ? ` · ${skill.description}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemove(skill)}
                    disabled={removing === (skill.folder || skill.name)}
                    className="skill-store__remove"
                  >
                    {removing === (skill.folder || skill.name) ? "…" : t("skills.remove")}
                  </button>
                </article>
              ))}
              {builtinInstalled.map((skill) => (
                <article
                  key={`builtin:${skill.folder || skill.name}`}
                  className="skill-store__row skill-store__row--compact skill-store__row--muted"
                >
                  <SkillIcon title={skill.name} className="skill-icon--sm" />
                  <div className="skill-store__body min-w-0">
                    <h4 className="skill-store__title truncate">{skill.name}</h4>
                    <p className="skill-store__desc skill-store__desc--single">
                      v{skill.version} · {t("skills.scopeBuiltin")}
                      {skill.description ? ` · ${skill.description}` : ""}
                    </p>
                  </div>
                  <span className="skill-store__installed">{t("skills.builtin")}</span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
