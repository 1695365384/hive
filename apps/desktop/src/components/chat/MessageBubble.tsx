import { FileText } from "lucide-react";
import type { ChatMessage } from "../../types/chat";
import { groupContentParts } from "../../lib/group-content-parts";
import { GroupedContentRenderer } from "./ContentRenderer";

type MessageBubbleProps = {
  message: ChatMessage;
  isLast: boolean;
  isRunning: boolean;
  activeToolTime: number | null;
  onOpenImage: (src: string) => void;
};

function findLastTextPartIndex(parts: ReturnType<typeof groupContentParts>): number {
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].type === "text") return i;
  }
  return -1;
}

export function MessageBubble({
  message,
  isLast,
  isRunning,
  activeToolTime,
  onOpenImage,
}: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] group">
          <div className="flex items-center gap-2 justify-end mb-1">
            <span className="text-[11px] text-stone-600">
              {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span className="text-[11px] font-medium text-stone-500">You</span>
          </div>
          <div className="px-4 py-2.5 rounded-2xl rounded-tr-md bg-stone-800/80 border border-stone-700/50">
            {message.content.map((part, idx) => {
              if (part.type === "file-attachment") {
                const isImage = part.mimeType?.startsWith("image/");
                return isImage ? (
                  <img
                    key={idx}
                    src={`http://127.0.0.1:4450${part.src}`}
                    alt={part.name}
                    className="max-w-[200px] max-h-[150px] rounded-lg mb-1 object-cover cursor-pointer"
                    onClick={() => onOpenImage(`http://127.0.0.1:4450${part.src}`)}
                  />
                ) : (
                  <a
                    key={idx}
                    href={`http://127.0.0.1:4450${part.src}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs mb-1 text-amber-400/80 hover:text-amber-300 transition-colors"
                  >
                    <FileText className="w-3 h-3 shrink-0" />
                    <span>{part.name}</span>
                    <span className="text-stone-600">
                      {part.size >= 1024 ? `${(part.size / 1024).toFixed(1)}KB` : `${part.size}B`}
                    </span>
                  </a>
                );
              }
              return null;
            })}
            {message.content.some((p) => p.type === "text") && (
              <p className="text-sm text-stone-200 whitespace-pre-wrap leading-relaxed">
                {(message.content.find((p) => p.type === "text") as { type: "text"; text: string })?.text}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const grouped = groupContentParts(message.content);
  const lastTextIdx = findLastTextPartIndex(grouped);

  return (
    <div className="flex justify-start">
      <div className="w-full min-w-0 max-w-[68ch]">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] font-medium text-stone-500">Hive</span>
          <span className="text-[11px] text-stone-700">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        <div className="space-y-3">
          {grouped.map((part, idx) => (
            <GroupedContentRenderer
              key={idx}
              part={part}
              sourceMessageId={message.id}
              autoPreview={isLast && isRunning && part.type === "text"}
              isStreaming={isLast && isRunning && part.type === "text" && idx === lastTextIdx}
              activeToolTime={isLast && isRunning ? activeToolTime : null}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
