export function ReasoningBlock({ text }: { text: string }) {
  if (!text) return null;

  const preview = text.length > 80 ? text.slice(0, 80) + "..." : text;

  return (
    <div className="px-1 py-0.5 text-[11px] text-stone-600">
      <span className="truncate italic">{preview}</span>
    </div>
  );
}
