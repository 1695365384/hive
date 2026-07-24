import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Presentation, FileSpreadsheet, Eye, Download } from "lucide-react";
import { isPreviewableFile, type PreviewFileType } from "../preview/detect-preview";
import { resolveArtifactPreviewSrc } from "../../lib/artifact-file";
import { isDockVisible, useActivityStore } from "../../stores/activity-store";
import { usePreviewStore } from "../../stores/preview-store";
import type { ChatMessage, ContentPart } from "../../types/chat";

export type ArtifactItem = {
  key: string;
  name: string;
  path: string;
  servedPath?: string;
  src?: string;
  previewType: PreviewFileType;
  sourceMessageId?: string;
};

const DELIVERABLE_TYPES = new Set<PreviewFileType>(["ppt", "doc", "pdf", "xlsx"]);

function isDeliverableAttachment(
  part: ContentPart,
): part is Extract<ContentPart, { type: "file-attachment" }> {
  if (part.type !== "file-attachment") return false;
  if (part.mimeType?.startsWith("image/")) return false;
  const previewType = isPreviewableFile(part.name);
  return previewType != null && DELIVERABLE_TYPES.has(previewType);
}

/** Collect unique Office/PDF deliverables from message history. */
export function collectSessionArtifacts(messages: ChatMessage[]): ArtifactItem[] {
  const byKey = new Map<string, ArtifactItem>();
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.content) {
      if (!isDeliverableAttachment(part)) continue;
      const key = part.path || part.name;
      if (byKey.has(key)) continue;
      const pt = isPreviewableFile(part.name);
      if (!pt) continue;
      byKey.set(key, {
        key,
        name: part.name,
        path: part.path,
        servedPath: part.servedPath,
        src: part.src,
        previewType: pt,
        sourceMessageId: msg.id,
      });
    }
  }
  return Array.from(byKey.values());
}

function ArtifactIcon({ type }: { type: PreviewFileType }) {
  if (type === "ppt") return <Presentation className="w-5 h-5" aria-hidden />;
  if (type === "xlsx") return <FileSpreadsheet className="w-5 h-5" aria-hidden />;
  return <FileText className="w-5 h-5" aria-hidden />;
}


type ArtifactsStripProps = {
  messages: ChatMessage[];
  isRunning: boolean;
};

function ArtifactsStripInner({ messages, isRunning }: ArtifactsStripProps) {
  const { t } = useTranslation();
  const openFor = usePreviewStore((s) => s.openFor);
  const rollup = useActivityStore((s) => s.rollup);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);

  const artifacts = useMemo(() => collectSessionArtifacts(messages), [messages]);

  const justCompleted = rollup.phase === "completed";
  const showPanel = artifacts.length > 0 && (isRunning || isDockVisible(rollup));

  useEffect(() => {
    setVisible(showPanel);
    if (showPanel) {
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf);
    }
    setEntered(false);
  }, [showPanel]);

  // Fade out panel alongside dock
  useEffect(() => {
    if ((rollup.phase !== "completed" && rollup.phase !== "idle") || !rollup.fadeIdleAt || artifacts.length === 0) return;
    const ms = rollup.fadeIdleAt - Date.now();
    if (ms <= 0) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setVisible(false), ms);
    return () => window.clearTimeout(id);
  }, [rollup.phase, rollup.fadeIdleAt, artifacts.length]);

  if (!visible || artifacts.length === 0) return null;

  const handleOpen = (item: ArtifactItem) => {
    const previewSrc = resolveArtifactPreviewSrc(item.path, item.src);
    if (!previewSrc) return;
    openFor({
      id: `file-${item.path || item.name}`,
      title: item.name,
      type: item.previewType,
      content: "",
      src: previewSrc,
      filePath: item.path,
      servedPath: item.servedPath,
      sourceMessageId: item.sourceMessageId || item.path || item.name,
    });
  };

  const handleDownload = (item: ArtifactItem) => {
    const src = item.servedPath
      ? `http://127.0.0.1:4450${item.servedPath}`
      : item.path;
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = item.name;
    a.click();
  };

  // Running: compact strip (keep existing behavior)
  if (isRunning && !justCompleted) {
    return (
      <div
        className={`artifacts-strip ${entered ? "artifacts-strip--entered" : ""}`}
        role="navigation"
        aria-label={t("preview.artifacts")}
      >
        <span className="artifacts-strip__label">{t("preview.artifacts")}</span>
        <div className="artifacts-strip__list">
          {artifacts.map((item) => (
            <button
              key={item.key}
              type="button"
              className="artifacts-strip__item app-no-drag"
              onClick={() => handleOpen(item)}
              title={t("preview.artifactsHint")}
            >
              <ArtifactIcon type={item.previewType} />
              <span className="artifacts-strip__name">{item.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Completed / idle: prominent delivery panel
  return (
    <div
      className={`delivery-panel ${entered ? "delivery-panel--entered" : ""} ${justCompleted ? "delivery-panel--fresh" : ""}`}
      role="region"
      aria-label={t("preview.artifacts")}
    >
      <div className="delivery-panel__header">
        <span className="delivery-panel__title">
          {justCompleted ? t("chat.deliveryTitle") : t("preview.artifacts")}
        </span>
        <span className="delivery-panel__count">{artifacts.length} {t("preview.artifacts")}</span>
      </div>
      <div className="delivery-panel__list">
        {artifacts.map((item) => (
          <div key={item.key} className="delivery-card">
            <div className="delivery-card__icon">
              <ArtifactIcon type={item.previewType} />
            </div>
            <div className="delivery-card__body">
              <span className="delivery-card__name">{item.name}</span>
              <span className="delivery-card__type">
                {item.previewType === "ppt" ? "演示文稿" : item.previewType === "xlsx" ? "表格" : "文档"}
              </span>
            </div>
            <div className="delivery-card__actions">
              <button
                type="button"
                className="delivery-card__btn app-no-drag"
                onClick={() => handleOpen(item)}
              >
                <Eye className="w-4 h-4" />
                <span>预览</span>
              </button>
              <button
                type="button"
                className="delivery-card__btn delivery-card__btn--secondary app-no-drag"
                onClick={() => handleDownload(item)}
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const ArtifactsStrip = memo(ArtifactsStripInner);
