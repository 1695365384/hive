import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppWindow, ChevronDown, FolderOpen, Save } from "lucide-react";
import {
  type ArtifactFileRef,
  openArtifactDefault,
  openArtifactWithApp,
  revealArtifactInFolder,
  saveArtifactAs,
} from "../../lib/artifact-file";
import { fetchOpenTargets, type OpenTarget } from "../../lib/artifact-open-apps";

type ArtifactFileMenuProps = ArtifactFileRef & {
  variant?: "compact" | "panel";
  className?: string;
};

type MenuAnchor = {
  top: number;
  right: number;
};

function revealLabel(): string {
  const p = navigator.platform.toLowerCase();
  if (p.includes("mac")) return "在 Finder 中显示";
  if (p.includes("win")) return "在资源管理器中显示";
  return "在文件夹中显示";
}

export function ArtifactFileMenu({
  name,
  path,
  servedPath,
  src,
  variant = "compact",
  className = "",
}: ArtifactFileMenuProps) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apps, setApps] = useState<OpenTarget[]>([]);
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);

  const ref: ArtifactFileRef = { name, path, servedPath, src };

  const syncAnchor = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchOpenTargets(name).then((installed) => {
      if (!cancelled) setApps(installed);
    });
    return () => {
      cancelled = true;
    };
  }, [open, name]);

  useEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    syncAnchor();
    const onLayout = () => syncAnchor();
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    return () => {
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("scroll", onLayout, true);
    };
  }, [open, syncAnchor]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = useCallback(
    async (action: () => Promise<{ ok: boolean; error?: string }>) => {
      setBusy(true);
      setError(null);
      const result = await action();
      setBusy(false);
      if (!result.ok) {
        setError(result.error ?? "操作失败");
        return;
      }
      setOpen(false);
    },
    [],
  );

  const isPanel = variant === "panel";

  const dropdown =
    open && anchor
      ? createPortal(
          <div
            ref={dropdownRef}
            id={menuId}
            role="menu"
            className="artifact-file-menu__dropdown artifact-file-menu__dropdown--portal"
            style={{ top: anchor.top, right: anchor.right }}
          >
            <button
              type="button"
              role="menuitem"
              className="artifact-file-menu__item"
              onClick={() => void run(() => openArtifactDefault(ref))}
            >
              用默认应用打开
            </button>

          {apps.map((app) => (
            <button
              key={app.openWith}
              type="button"
              role="menuitem"
              className="artifact-file-menu__item"
              onClick={() => void run(() => openArtifactWithApp(ref, app.openWith))}
            >
              {app.icon ? (
                <img src={app.icon} alt="" className="artifact-file-menu__app-icon" />
              ) : (
                <AppWindow className="artifact-file-menu__app-icon-fallback" aria-hidden />
              )}
              <span>用 {app.label} 打开</span>
            </button>
          ))}

            <div className="artifact-file-menu__sep" role="separator" />

            <button
              type="button"
              role="menuitem"
              className="artifact-file-menu__item artifact-file-menu__item--icon"
              onClick={() => void run(() => revealArtifactInFolder(ref))}
            >
              <FolderOpen className="w-3.5 h-3.5 shrink-0 opacity-70" />
              {revealLabel()}
            </button>
            <button
              type="button"
              role="menuitem"
              className="artifact-file-menu__item artifact-file-menu__item--icon"
              onClick={() => void run(() => saveArtifactAs(ref))}
            >
              <Save className="w-3.5 h-3.5 shrink-0 opacity-70" />
              另存为…
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={`artifact-file-menu ${className}`.trim()}>
      <div className={`artifact-file-menu__group ${isPanel ? "artifact-file-menu__group--panel" : ""}`}>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => openArtifactDefault(ref))}
          className={`artifact-file-menu__primary ${isPanel ? "artifact-file-menu__primary--panel" : ""}`}
        >
          {busy ? "…" : "打开"}
        </button>
        <button
          type="button"
          disabled={busy}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-controls={menuId}
          onClick={() => setOpen((v) => !v)}
          className={`artifact-file-menu__caret ${isPanel ? "artifact-file-menu__caret--panel" : ""}`}
          title="更多打开方式"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {dropdown}

      {error && (
        <p className={`artifact-file-menu__error ${isPanel ? "artifact-file-menu__error--panel" : ""}`}>
          {error}
        </p>
      )}
    </div>
  );
}
