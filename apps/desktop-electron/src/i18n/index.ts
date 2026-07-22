import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "./locales/zh-CN.json";
import en from "./locales/en.json";

export const LOCALE_STORAGE_KEY = "hive.locale";
export type AppLocale = "zh-CN" | "en";

const resources = {
  "zh-CN": { translation: zhCN },
  en: { translation: en },
} as const;

function detectLocale(): AppLocale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "zh-CN" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "zh-CN";
  return nav.startsWith("zh") ? "zh-CN" : "en";
}

function applyDocumentLang(lng: AppLocale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lng === "zh-CN" ? "zh-CN" : "en";
}

const initialLocale = detectLocale();
applyDocumentLang(initialLocale);

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: "zh-CN",
  interpolation: { escapeValue: false },
  pluralSeparator: "_",
});

export function setAppLocale(lng: AppLocale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
  applyDocumentLang(lng);
  void i18n.changeLanguage(lng);
}

export function getAppLocale(): AppLocale {
  const lng = i18n.language;
  return lng === "en" ? "en" : "zh-CN";
}

export default i18n;
