import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RouteChip } from "../components/chat/RouteChip";
import { ActivityCard } from "../components/chat/ActivityCard";
import { MOTION_CATALOG, playMotion } from "../motion";

/**
 * Spike / QA page for shell motion presets.
 * Settings → 动效预览
 */
export function MotionSpikePage() {
  const { t } = useTranslation();
  const [tick, setTick] = useState(0);
  const dockRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const chipHostRef = useRef<HTMLDivElement>(null);

  const replayDock = useCallback(() => {
    playMotion("activity-dock-enter", dockRef.current);
  }, []);

  const replayLane = useCallback(() => {
    playMotion("worker-card-enter", laneRef.current, {
      childSelector: ":scope > .worker-lane__cell",
    });
  }, []);

  const replayChip = useCallback(() => {
    setTick((n) => n + 1);
    requestAnimationFrame(() => {
      const chip = chipHostRef.current?.querySelector<HTMLElement>(".route-chip");
      playMotion("route-chip-enter", chip ?? null);
    });
  }, []);

  const replayPulse = useCallback(() => {
    const card = laneRef.current?.querySelector<HTMLElement>(".activity-card");
    playMotion("success-pulse", card ?? null);
  }, []);

  const replayAll = useCallback(() => {
    replayDock();
    replayChip();
    window.setTimeout(replayLane, 80);
    window.setTimeout(replayPulse, 520);
  }, [replayChip, replayDock, replayLane, replayPulse]);

  useEffect(() => {
    const id = window.setTimeout(replayAll, 120);
    return () => window.clearTimeout(id);
  }, [replayAll]);

  return (
    <div className="p-6 space-y-6 text-stone-200">
      <div>
        <h2 className="text-lg font-medium text-stone-100">{t("settings.motion")}</h2>
        <p className="mt-1 text-sm text-stone-400 max-w-xl">{t("settings.motionHint")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="motion-spike__btn" onClick={replayAll}>
          {t("settings.motionReplayAll")}
        </button>
        <button type="button" className="motion-spike__btn motion-spike__btn--ghost" onClick={replayDock}>
          Dock
        </button>
        <button type="button" className="motion-spike__btn motion-spike__btn--ghost" onClick={replayChip}>
          Route chip
        </button>
        <button type="button" className="motion-spike__btn motion-spike__btn--ghost" onClick={replayLane}>
          Worker cards
        </button>
        <button type="button" className="motion-spike__btn motion-spike__btn--ghost" onClick={replayPulse}>
          Success pulse
        </button>
      </div>

      <section className="motion-spike__stage space-y-3">
        <div
          ref={dockRef}
          className="activity-dock activity-dock--working activity-dock--anime"
          role="status"
        >
          <span className="activity-dock__dot activity-dock__dot--working" aria-hidden />
          <span className="activity-dock__text">{t("settings.motionDockSample")}</span>
          <span className="activity-dock__time tabular-nums">0:12</span>
        </div>

        <div ref={chipHostRef} key={tick}>
          <RouteChip mode="delegate" workerTypes={["explore", "general"]} title="并行研究" />
        </div>

        <div ref={laneRef} className="worker-lane__grid">
          <div className="worker-lane__cell">
            <ActivityCard title="Explore · 扫仓库" status="running" stepCount={4}>
              <p className="text-xs text-stone-500 px-3 pb-2">{t("settings.motionCardSample")}</p>
            </ActivityCard>
          </div>
          <div className="worker-lane__cell">
            <ActivityCard title="General · 改桌面壳" status="completed" durationMs={8200} stepCount={6}>
              <p className="text-xs text-stone-500 px-3 pb-2">done</p>
            </ActivityCard>
          </div>
          <div className="worker-lane__cell">
            <ActivityCard title="Office · 演示稿" status="running" stepCount={2} badge="office">
              <p className="text-xs text-stone-500 px-3 pb-2">slide 2/5</p>
            </ActivityCard>
          </div>
        </div>
      </section>

      <div className="rounded-lg border border-stone-800 bg-stone-950/50 p-3">
        <p className="text-xs font-medium text-stone-400 mb-2">Catalog</p>
        <ul className="space-y-1 text-xs text-stone-500 font-mono">
          {MOTION_CATALOG.map((e) => (
            <li key={e.id}>
              <span className="text-amber-500/90">{e.id}</span>
              <span className="text-stone-600"> — </span>
              {e.description}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-stone-500">{t("settings.motionNote")}</p>
    </div>
  );
}
