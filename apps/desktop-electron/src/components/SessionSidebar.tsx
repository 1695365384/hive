import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSessionStore } from "../stores/session-store";
import type { Session } from "../types/chat";
import { formatRelativeTime } from "../lib/session-utils";
import {
  Plus,
  MessageSquare,
  Trash2,
  Pencil,
  X,
  Search,
} from "lucide-react";

interface SessionSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function SessionSidebar({ collapsed, onToggle }: SessionSidebarProps) {
  const { t } = useTranslation();
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
  const [menuId, setMenuId] = useState<string | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Init on first mount
  useEffect(() => {
    init();
  }, [init]);

  // Focus edit input
  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuId]);

  const filtered = search
    ? sessions.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    : sessions;

  const handleNew = useCallback(async () => {
    await createSession();
  }, [createSession]);

  const handleSelect = useCallback(
    (id: string) => {
      selectSession(id);
    },
    [selectSession]
  );

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setMenuId(null);
      await deleteSession(id);
    },
    [deleteSession]
  );

  const handleRenameStart = useCallback(
    (e: React.MouseEvent, session: Session) => {
      e.stopPropagation();
      setMenuId(null);
      setEditingId(session.id);
      setEditValue(session.title);
    },
    []
  );

  const handleRenameConfirm = useCallback(async () => {
    const id = editingId;
    if (!id) return;
    const title = editValue.trim() || t("session.newChat");
    await renameSession(id, title);
    setEditingId(null);
  }, [editingId, editValue, renameSession, t]);

  const handleRenameCancel = useCallback(() => {
    setEditingId(null);
  }, []);

  if (!available) return null;

  return (
    <div
      className={`flex flex-col bg-stone-900/80 border-r border-stone-800 transition-all duration-200 ${
        collapsed ? "w-0 overflow-hidden border-r-0" : "w-60"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-1 px-3 h-11 border-b border-stone-800 shrink-0">
        <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider flex-1">
          {t("session.sessions")}
        </span>
        <button
          onClick={handleNew}
          className="p-1 rounded-md text-stone-500 hover:text-stone-200 hover:bg-stone-800 transition-colors"
          title={t("session.newSession")}
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={onToggle}
          className="p-1 rounded-md text-stone-500 hover:text-stone-200 hover:bg-stone-800 transition-colors"
          title={t("session.collapseSidebar")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 pt-2 pb-1">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-stone-800/50 border border-stone-700/50 text-stone-500 text-xs">
          <Search className="w-3 h-3 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("session.searchSessions")}
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
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
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
            {!search && (
              <button
                onClick={handleNew}
                className="mt-2 text-xs text-amber-500 hover:text-amber-400 transition-colors"
              >
                {t("session.createFirstSession")}
              </button>
            )}
          </div>
        )}

        {filtered.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === currentId}
            isEditing={session.id === editingId}
            editValue={editValue}
            onSelect={() => handleSelect(session.id)}
            onEditValueChange={setEditValue}
            onRenameConfirm={handleRenameConfirm}
            onRenameCancel={handleRenameCancel}
            onRenameStart={(e) => handleRenameStart(e, session)}
            onDelete={(e) => handleDelete(e, session.id)}
            editRef={editRef}
          />
        ))}
      </div>
    </div>
  );
}

// ── Session Item ──

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  isEditing: boolean;
  editValue: string;
  onSelect: () => void;
  onEditValueChange: (v: string) => void;
  onRenameConfirm: () => void;
  onRenameCancel: () => void;
  onRenameStart: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  editRef: React.RefObject<HTMLInputElement | null>;
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
  editRef,
}: SessionItemProps) {
  const { t } = useTranslation();
  const ago = formatRelativeTime(session.updatedAt);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onRenameConfirm();
    if (e.key === "Escape") onRenameCancel();
  };

  return (
    <div
      onClick={isEditing ? undefined : onSelect}
      className={`group relative flex items-start gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 ${
        isActive
          ? "bg-amber-500/10 border border-amber-500/20"
          : "border border-transparent hover:bg-stone-800/60"
      }`}
    >
      {/* Icon */}
      <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-stone-500" />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={editRef}
            value={editValue}
            onChange={(e) => onEditValueChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={onRenameConfirm}
            className="w-full text-xs font-medium bg-stone-800 text-stone-200 rounded px-1 py-0.5 outline-none border border-amber-500/40"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <p className="text-xs font-medium text-stone-300 truncate leading-tight">
            {session.title}
          </p>
        )}
        <p className="text-[10px] text-stone-600 mt-0.5">
          {session.messageCount > 0
            ? t("session.messageCount", { count: session.messageCount })
            : t("common.empty")}
          <span className="mx-1">&middot;</span>
          {ago}
        </p>
      </div>

      {/* Actions (visible on hover or when active) */}
      {!isEditing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={onRenameStart}
            className="p-0.5 rounded text-stone-600 hover:text-stone-300 hover:bg-stone-800"
            title={t("common.rename")}
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={onDelete}
            className="p-0.5 rounded text-stone-600 hover:text-red-400 hover:bg-stone-800"
            title={t("common.delete")}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
