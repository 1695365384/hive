import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLogPolling } from "../hooks/use-log-polling";
import { useSessionStore } from "../stores/session-store";
import { useRunStore } from "../stores/run-store";
import { cancelSessionRun } from "../lib/cancel-session-run";
import { ConfigPage } from "./ConfigPage";
import { PluginPage } from "./PluginPage";
import { SkillPage } from "./SkillPage";
import { McpPage } from "./McpPage";
import { MotionSpikePage } from "./MotionSpikePage";
import { ChatPage } from "./ChatPage";
import { LogDrawer } from "../components/LogDrawer";
import { StatusBar } from "../components/StatusBar";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  X,
  MessageSquare,
  Settings,
  Plug,
  Puzzle,
  Sparkles,
  Clapperboard,
  Square,
} from "lucide-react";
import type { Session } from "../types/chat";
import { formatRelativeTime } from "../lib/session-utils";
import {
  buildSettingsNavGroups,
  type SettingsNavIcon,
  type SettingsTab,
} from "./settings-navigation";

type DrawerHeight = "collapsed" | "half" | "full";

const settingsNavIcons: Record<SettingsNavIcon, React.ReactNode> = {
  settings: <Settings className="w-4 h-4" />,
  plug: <Plug className="w-4 h-4" />,
  sparkles: <Sparkles className="w-4 h-4" />,
  puzzle: <Puzzle className="w-4 h-4" />,
  motion: <Clapperboard className="w-4 h-4" />,
};

export function Dashboard() {
  const { t } = useTranslation();
  const [drawerHeight, setDrawerHeight] = useState<DrawerHeight>("collapsed");
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const closeSettings = useCallback(() => setSettingsTab(null), []);
  useLogPolling();

  // Session store
  const sessions = useSessionStore((s) => s.sessions);
  const currentId = useSessionStore((s) => s.currentId);
  const selectSession = useSessionStore((s) => s.selectSession);
  const createSession = useSessionStore((s) => s.createSession);
  const deleteSession = useSessionStore((s) => s.deleteSession);
  const renameSession = useSessionStore((s) => s.renameSession);
  const init = useSessionStore((s) => s.init);
  const available = useSessionStore((s) => s.available);
  const loading = useSessionStore((s) => s.loading);

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    init();
  }, [init]);

  const filtered = search
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(search.toLowerCase()),
      )
    : sessions;

  const toggleDrawer = () =>
    setDrawerHeight((h) => (h === "collapsed" ? "half" : "collapsed"));

  return (
    <div className="app-shell bg-stone-900 text-stone-100">
      <div className="app-shell__workspace">
        {/* ---- Unified sidebar ---- */}
        <aside className="app-shell__sidebar bg-stone-900 border-r border-stone-800 flex flex-col">
          {/* New chat */}
          <div className="px-3 py-2.5">
            <button
              onClick={() => createSession()}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-stone-100 text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("session.newChat")}
            </button>
          </div>

          {/* Search */}
          <div className="px-2 py-1">
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-stone-800/70 border border-stone-600/70 text-stone-400 text-xs focus-within:border-amber-500/60 focus-within:ring-1 focus-within:ring-amber-500/30">
              <Search className="w-3 h-3 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("session.search")}
                className="flex-1 bg-transparent outline-none text-stone-300 placeholder-stone-600"
              />
              {search && (
                <button onClick={() => setSearch("")} className="hover:text-stone-400">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-1 space-y-0.5">
            {!available && null}
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-4 h-4 border-2 border-stone-700 border-t-amber-500 rounded-full animate-spin" />
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="text-center py-8 px-4">
                <p className="text-xs text-stone-600">
                  {search ? t("session.noMatchingSessions") : t("session.noSessions")}
                </p>
              </div>
            )}
            {filtered.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === currentId}
                isEditing={session.id === editingId}
                editValue={editValue}
                onSelect={() => selectSession(session.id)}
                onEditValueChange={setEditValue}
                onRenameConfirm={async () => {
                  if (editingId) {
                    await renameSession(editingId, editValue.trim() || t("session.newChat"));
                    setEditingId(null);
                  }
                }}
                onRenameCancel={() => setEditingId(null)}
                onRenameStart={() => {
                  setEditingId(session.id);
                  setEditValue(session.title);
                }}
                onDelete={async (e) => {
                  e.stopPropagation();
                  const live = useRunStore.getState().hasLiveRun(session.id);
                  if (live) {
                    const ok = window.confirm(
                      t("session.deleteRunningConfirm", { title: session.title }),
                    );
                    if (!ok) return;
                    await cancelSessionRun(session.id);
                  }
                  await deleteSession(session.id);
                  setEditingId(null);
                }}
              />
            ))}
          </div>

          {/* Bottom: Settings */}
          <div className="border-t border-stone-800 p-2">
            <button
              onClick={() => setSettingsTab("config")}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-stone-500 hover:bg-stone-800 hover:text-stone-300 transition-colors text-xs"
            >
              <Settings className="w-3.5 h-3.5" />
              {t("settings.title")}
            </button>
          </div>
        </aside>

        {/* ---- Main content ---- */}
        <main className="app-shell__main">
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatPage />
          </div>
          <LogDrawer height={drawerHeight} onHeightChange={setDrawerHeight} />
        </main>
      </div>

      <StatusBar drawerHeight={drawerHeight} onToggle={toggleDrawer} />

      {/* ---- Settings modal ---- */}
      {settingsTab && (
        <SettingsModal
          tab={settingsTab}
          onTabChange={setSettingsTab}
          onClose={closeSettings}
        />
      )}
    </div>
  );
}

// ============================================
// Session item (inline, simplified from SessionSidebar)
// ============================================

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  onSelect: () => void;
  onEditValueChange: (v: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onRenameStart: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

function SessionItem({
  session,
  isActive,
  isEditing,
  editValue,
  onSelect,
  onEditValueChange,
  onRenameConfirm,
  onRenameCancel,
  onRenameStart,
  onDelete,
}: SessionItemProps) {
  const { t } = useTranslation();
  const runPhase = useRunStore((s) => {
    const run = s.runs[session.id];
    if (!run) return null;
    if (run.phase === "running" || run.phase === "waiting") return run.phase;
    return null;
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onRenameConfirm();
    if (e.key === "Escape") onRenameCancel();
  };

  const handleStop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = window.confirm(t("session.stopConfirm", { title: session.title }));
    if (!ok) return;
    await cancelSessionRun(session.id);
  };

  return (
    <div
      className={`group relative flex items-center gap-1 px-1.5 py-1 rounded-lg transition-all duration-150 ${
        isActive
          ? "bg-stone-800/80 text-stone-200"
          : "hover:bg-stone-800/50 text-stone-400"
      }`}
    >
      {isEditing ? (
        <>
          {runPhase ? (
            <span
              className={`session-run-dot session-run-dot--${runPhase}`}
              title={runPhase === "waiting" ? t("session.waiting") : t("session.running")}
              aria-label={runPhase === "waiting" ? t("session.waiting") : t("session.running")}
            />
          ) : (
            <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" />
          )}
          <div className="flex-1 min-w-0 px-1">
          <input
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={onRenameConfirm}
            className="w-full text-xs font-medium bg-stone-800 text-stone-200 rounded px-1 py-0.5 outline-none border border-amber-500/40"
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
            <p className="text-[10px] text-stone-500 mt-0.5">
              {formatRelativeTime(session.updatedAt)}
            </p>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          aria-current={isActive ? "true" : undefined}
          className="flex flex-1 min-w-0 items-center gap-2 px-1 py-1 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500/70"
        >
          {runPhase ? (
            <span
              className={`session-run-dot session-run-dot--${runPhase}`}
              title={runPhase === "waiting" ? t("session.waiting") : t("session.running")}
              aria-label={runPhase === "waiting" ? t("session.waiting") : t("session.running")}
            />
          ) : (
            <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />
          )}
          <span className="flex-1 min-w-0">
            <span className={`block text-xs font-medium truncate leading-tight ${isActive ? "text-stone-200" : "text-stone-400"}`}>
              {session.title}
            </span>
            <span className="block text-[10px] text-stone-500 mt-0.5">
              {runPhase === "waiting"
                ? t("session.waiting")
                : runPhase === "running"
                  ? t("session.running")
                  : session.messageCount > 0
                    ? t("session.messageCount", { count: session.messageCount })
                    : t("common.empty")}
              <span className="mx-1">·</span>
              {formatRelativeTime(session.updatedAt)}
            </span>
          </span>
        </button>
      )}
      {!isEditing && (
        <div className={`flex items-center gap-0.5 transition-opacity shrink-0 ${
          isActive
            ? "opacity-70 group-hover:opacity-100 group-focus-within:opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}>
          {runPhase && (
            <button
              onClick={handleStop}
              className="w-8 h-8 flex items-center justify-center rounded-md text-stone-400 hover:text-amber-300 hover:bg-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              title={t("session.stopRun")}
              aria-label={t("session.stopRun")}
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRenameStart(); }}
            className="w-8 h-8 flex items-center justify-center rounded-md text-stone-400 hover:text-stone-100 hover:bg-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            title={t("common.rename")}
            aria-label={t("common.rename")}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="w-8 h-8 flex items-center justify-center rounded-md text-stone-400 hover:text-red-300 hover:bg-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            title={t("common.delete")}
            aria-label={t("common.delete")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Settings modal
// ============================================

function SettingsModal({
  tab,
  onTabChange,
  onClose,
}: {
  tab: SettingsTab;
  onTabChange: (t: SettingsTab) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const groups = buildSettingsNavGroups(import.meta.env.DEV, {
    connection: t("settings.groupConnection"),
    extensions: t("settings.groupExtensions"),
    developer: t("settings.groupDeveloper"),
    provider: t("settings.provider"),
    mcp: t("settings.mcp"),
    skills: t("settings.skills"),
    plugins: t("settings.plugins"),
    motion: t("settings.motion"),
  });

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => activeTabRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      requestAnimationFrame(() => previouslyFocused?.focus());
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl flex flex-col sm:flex-row overflow-hidden w-[min(64rem,calc(100vw-2rem))] h-[min(84vh,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-dialog-title" className="sr-only">
          {t("settings.title")}
        </h2>
        <aside className="w-full sm:w-52 shrink-0 border-b sm:border-b-0 sm:border-r border-stone-800 bg-stone-950/55 flex sm:flex-col min-h-0">
          <div className="hidden sm:flex items-center justify-between px-4 pt-4 pb-3">
            <h2 className="text-sm font-semibold text-stone-100">
              {t("settings.title")}
            </h2>
          </div>
          <nav
            role="tablist"
            aria-label={t("settings.navigation")}
            className="flex sm:flex-col gap-1 overflow-x-auto sm:overflow-y-auto scrollbar-thin px-2 py-2 sm:py-0 flex-1 min-w-0"
          >
            {groups.map((group) => (
              <div key={group.label} className="contents sm:block sm:mb-4">
                <p className="hidden sm:block px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                  {group.label}
                </p>
                <div className="contents sm:flex sm:flex-col sm:gap-1">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      ref={tab === item.id ? activeTabRef : undefined}
                      type="button"
                      role="tab"
                      aria-selected={tab === item.id}
                      aria-controls={`settings-panel-${item.id}`}
                      onClick={() => onTabChange(item.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                        tab === item.id
                          ? "bg-stone-800 text-stone-100 font-medium"
                          : "text-stone-400 hover:text-stone-200 hover:bg-stone-800/60"
                      }`}
                    >
                      {settingsNavIcons[item.icon]}
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="hidden sm:block border-t border-stone-800 p-3">
            <LanguageSwitcher />
          </div>
        </aside>

        <section className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 shrink-0 sm:justify-end">
            <h2 id="settings-dialog-title-mobile" className="sm:hidden text-sm font-semibold text-stone-100">
              {t("settings.title")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="w-8 h-8 flex items-center justify-center rounded-md text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div
            id={`settings-panel-${tab}`}
            role="tabpanel"
            aria-label={groups.flatMap((group) => group.items).find((item) => item.id === tab)?.label}
            className="flex-1 min-h-0 overflow-hidden"
          >
            {tab === "config" && <ConfigPage />}
            {tab === "mcp" && <McpPage />}
            {tab === "skills" && <SkillPage />}
            {tab === "plugins" && <PluginPage />}
            {tab === "motion" && import.meta.env.DEV && <MotionSpikePage />}
          </div>
          <div className="sm:hidden border-t border-stone-800 p-3">
            <LanguageSwitcher />
          </div>
        </section>
      </div>
    </div>
  );
}
