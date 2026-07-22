import { memo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useRunStore } from "../../stores/run-store";
import { useSessionStore } from "../../stores/session-store";
import { X } from "lucide-react";

function BgToastHostInner() {
  const { t } = useTranslation();
  const toasts = useRunStore((s) => s.toasts);
  const dismissToast = useRunStore((s) => s.dismissToast);
  const selectSession = useSessionStore((s) => s.selectSession);

  useEffect(() => {
    const timers: number[] = [];
    for (const toast of toasts) {
      if (toast.kind === "waiting") continue;
      const age = Date.now() - toast.createdAt;
      const remaining = Math.max(0, 8000 - age);
      timers.push(
        window.setTimeout(() => dismissToast(toast.id), remaining),
      );
    }
    return () => timers.forEach((id) => clearTimeout(id));
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="bg-toast-host" role="region" aria-label={t("run.toastRegion")}>
      {toasts.map((toast) => {
        const label =
          toast.kind === "waiting"
            ? t("run.toastWaiting", { title: toast.title })
            : t("run.toastComplete", { title: toast.title });
        return (
          <div key={toast.id} className={`bg-toast bg-toast--${toast.kind}`} role="status">
            <button
              type="button"
              className="bg-toast__body"
              onClick={() => {
                selectSession(toast.sessionId);
                dismissToast(toast.id);
              }}
            >
              <span className="bg-toast__text">{label}</span>
            </button>
            <button
              type="button"
              className="bg-toast__dismiss"
              aria-label={t("common.close")}
              onClick={() => dismissToast(toast.id)}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export const BgToastHost = memo(BgToastHostInner);
