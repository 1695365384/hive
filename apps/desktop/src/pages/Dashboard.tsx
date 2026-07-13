import { useState, useEffect } from "react";
import { useLogPolling } from "../hooks/use-log-polling";
import { useSessionStore } from "../stores/session-store";
import { ConfigPage } from "./ConfigPage";
import { PluginPage } from "./PluginPage";
import { StatusPage } from "./StatusPage";
import { ChatPage } from "./ChatPage";
import { LogDrawer } from "../components/LogDrawer";
import { StatusBar } from "../components/StatusBar";
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  X,
  MessageSquare,
  Settings,
  Activity,
  Puzzle,
} from "lucide-react";
import type { Session } from "../types/chat";
import { formatRelativeTime } from "../lib/session-utils";

type SettingsTab = "config" | "status" | "plugins";
type DrawerHeight = "collapsed" | "half" | "full";

export function Dashboard() {
  const [drawerHeight, setDrawerHeight] = useState<DrawerHeight>("collapsed");
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
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
              New Chat
            </button>
          </div>

          {/* Search */}
          <div className="px-2 py-1">
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-stone-800/50 border border-stone-700/50 text-stone-500 text-xs">
              <Search className="w-3 h-3 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
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
                  {search ? "No matching sessions" : "No sessions yet"}
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
                    await renameSession(editingId, editValue.trim() || "New Chat");
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
              Settings
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
          onClose={() => setSettingsTab(null)}
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
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onRenameConfirm();
    if (e.key === "Escape") onRenameCancel();
  };

  return (
    <div
      onClick={isEditing ? undefined : onSelect}
      className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
        isActive
          ? "bg-stone-800/80 text-stone-200"
          : "hover:bg-stone-800/50 text-stone-400"
      }`}
    >
      <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-50" />
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={onRenameConfirm}
            className="w-full text-xs font-medium bg-stone-800 text-stone-200 rounded px-1 py-0.5 outline-none border border-amber-500/40"
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <p className={`text-xs font-medium truncate leading-tight ${isActive ? "text-stone-200" : "text-stone-400"}`}>
            {session.title}
          </p>
        )}
        <p className="text-[10px] text-stone-600 mt-0.5">
          {session.messageCount > 0
            ? `${session.messageCount} msg`
            : "Empty"}
          <span className="mx-1">·</span>
          {formatRelativeTime(session.updatedAt)}
        </p>
      </div>
      {!isEditing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onRenameStart(); }}
            className="p-0.5 rounded text-stone-600 hover:text-stone-300 hover:bg-stone-700"
            title="Rename"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={onDelete}
            className="p-0.5 rounded text-stone-600 hover:text-red-400 hover:bg-stone-700"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
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
  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: "config", label: "Provider", icon: <Settings className="w-3.5 h-3.5" /> },
    { id: "status", label: "Status", icon: <Activity className="w-3.5 h-3.5" /> },
    { id: "plugins", label: "Plugins", icon: <Puzzle className="w-3.5 h-3.5" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-stone-900 border border-stone-700 rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header with tabs */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => onTabChange(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  tab === t.id
                    ? "bg-stone-800 text-stone-100 font-medium"
                    : "text-stone-500 hover:text-stone-300 hover:bg-stone-800/50"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-stone-500 hover:text-stone-200 hover:bg-stone-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {tab === "config" && <ConfigPage />}
          {tab === "status" && <StatusPage />}
          {tab === "plugins" && <PluginPage />}
        </div>
      </div>
    </div>
  );
}
