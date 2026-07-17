import { useTranslation } from "react-i18next";
import type { ProviderInfo } from "../../types/provider";
import {
  type ProviderVerifyStatus,
  heroVerifyBadge,
} from "./provider-verify-status";
import { ProviderLogo } from "./ProviderLogo";
import { getProviderBrand } from "./provider-brand";

interface ProviderHeroProps {
  provider: ProviderInfo | undefined;
  providerId: string;
  model: string;
  isDirty: boolean;
  verifyStatus: ProviderVerifyStatus;
  latencyMs?: number;
}

export function ProviderHero({
  provider,
  providerId,
  model,
  isDirty,
  verifyStatus,
  latencyMs,
}: ProviderHeroProps) {
  const { t } = useTranslation();
  const badge = heroVerifyBadge(verifyStatus, isDirty);
  const name = provider?.name ?? providerId;
  const brand = getProviderBrand(providerId);

  return (
    <div
      className="rounded-lg border border-stone-800 bg-stone-900/80 p-4 flex items-start gap-3"
      style={{
        boxShadow: `inset 3px 0 0 0 ${brand.accent}`,
      }}
    >
      <ProviderLogo
        providerId={providerId}
        name={name}
        logo={provider?.logo}
        size="lg"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-semibold text-stone-100 truncate">
            {name || t("config.noProviderSelected")}
          </h3>
          {isDirty && (
            <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
              {t("config.unsaved")}
            </span>
          )}
        </div>
        <p className="text-sm text-stone-400 truncate mt-0.5">
          {model || t("config.noModelSelected")}
        </p>
      </div>

      <VerifyBadge badge={badge} latencyMs={latencyMs} />
    </div>
  );
}

function VerifyBadge({
  badge,
  latencyMs,
}: {
  badge: ReturnType<typeof heroVerifyBadge>;
  latencyMs?: number;
}) {
  const { t } = useTranslation();

  const styles: Record<typeof badge, string> = {
    unknown: "bg-stone-800 text-stone-400 border-stone-700",
    testing: "bg-stone-800 text-stone-300 border-stone-600",
    verified: "bg-green-500/10 text-green-400 border-green-500/30",
    failed: "bg-red-500/10 text-red-400 border-red-500/30",
    unverified: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  };

  const label =
    badge === "unknown"
      ? t("config.verifyUnknown")
      : badge === "testing"
        ? t("config.verifyTesting")
        : badge === "verified"
          ? latencyMs != null
            ? t("config.verifyOkMs", { ms: latencyMs })
            : t("config.verifyOk")
          : badge === "failed"
            ? t("config.verifyFailed")
            : t("config.verifyUnverified");

  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border ${styles[badge]}`}
    >
      {badge === "testing" && (
        <span className="animate-spin h-3 w-3 border-2 border-stone-600 border-t-amber-500 rounded-full" />
      )}
      {label}
    </span>
  );
}
