import { useEffect, useState } from "react";

/** Elapsed ms since startedAt, refreshed at most every intervalMs (Codex-style throttle). */
export function useThrottledElapsed(startedAt: number | undefined, intervalMs = 250): number | null {
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(null);
      return;
    }

    const tick = () => setElapsed(Date.now() - startedAt);
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [startedAt, intervalMs]);

  return elapsed;
}
