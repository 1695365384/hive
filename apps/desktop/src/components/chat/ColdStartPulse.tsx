/** Single-dot pulse for cold-start wait (no worker/reasoning yet). */
export function ColdStartPulse() {
  return (
    <div className="flex items-center gap-2 px-1 py-2" role="status" aria-label="思考中">
      <span className="activity-pulse-dot" aria-hidden />
      <span className="text-xs text-stone-500">思考中…</span>
    </div>
  );
}
