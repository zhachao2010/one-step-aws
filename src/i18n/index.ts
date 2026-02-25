import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "./ja.json";
import en from "./en.json";
import zh from "./zh.json";

const systemLang = navigator.language.toLowerCase();
const defaultLng = systemLang.startsWith("ja") ? "ja"
  : systemLang.startsWith("zh") ? "zh"
  : "en";

i18n.use(initReactI18next).init({
  resources: { ja: { translation: ja }, en: { translation: en }, zh: { translation: zh } },
  lng: defaultLng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
