import { useTranslation } from "react-i18next";
import { getAppLocale, setAppLocale, type AppLocale } from "../i18n";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const locale = getAppLocale();

  const set = (lng: AppLocale) => {
    if (lng !== locale) setAppLocale(lng);
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
      <span className="text-xs text-stone-500">{t("settings.language")}</span>
      <div className="inline-flex rounded-md border border-stone-700 p-0.5 bg-stone-800/50">
        <button
          type="button"
          onClick={() => set("zh-CN")}
          className={`px-2.5 py-1 text-xs rounded transition-colors ${
            locale === "zh-CN"
              ? "bg-stone-700 text-stone-100"
              : "text-stone-500 hover:text-stone-300"
          }`}
        >
          {t("settings.languageZh")}
        </button>
        <button
          type="button"
          onClick={() => set("en")}
          className={`px-2.5 py-1 text-xs rounded transition-colors ${
            locale === "en"
              ? "bg-stone-700 text-stone-100"
              : "text-stone-500 hover:text-stone-300"
          }`}
        >
          {t("settings.languageEn")}
        </button>
      </div>
    </div>
  );
}
