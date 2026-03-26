// Brava i18n — Hebrew + English
export type Locale = "en" | "he";

const translations = {
  // App-level
  "app.clipboard": { en: "Clipboard", he: "לוח" },
  "app.converter": { en: "Converter", he: "המרה" },
  "app.snippets": { en: "Snippets", he: "קטעים" },
  "app.ai": { en: "AI Tools", he: "כלי AI" },
  "app.settings": { en: "Settings", he: "הגדרות" },

  // Clipboard
  "clip.title": { en: "Clipboard History", he: "היסטוריית לוח" },
  "clip.search": { en: "Search clipboard history...", he: "חיפוש בהיסטוריית הלוח..." },
  "clip.empty": { en: "No clipboard items yet", he: "אין פריטים בלוח עדיין" },
  "clip.empty.hint": { en: "Copy something to see it here", he: "העתק משהו כדי לראות אותו כאן" },
  "clip.clearAll": { en: "Clear All", he: "נקה הכל" },
  "clip.allCats": { en: "All Categories", he: "כל הקטגוריות" },
  "clip.copied": { en: "Copied to clipboard", he: "הועתק ללוח" },
  "clip.justNow": { en: "just now", he: "הרגע" },
  "clip.mAgo": { en: "m ago", he: "ד' לפני" },
  "clip.hAgo": { en: "h ago", he: "ש' לפני" },
  "clip.cat.text": { en: "Text", he: "טקסט" },
  "clip.cat.url": { en: "URLs", he: "קישורים" },
  "clip.cat.email": { en: "Emails", he: "אימיילים" },
  "clip.cat.phone": { en: "Phone Numbers", he: "מספרי טלפון" },
  "clip.cat.code": { en: "Code", he: "קוד" },
  "clip.cat.color": { en: "Colors", he: "צבעים" },
  "clip.cat.path": { en: "File Paths", he: "נתיבי קבצים" },

  // Converter
  "conv.title": { en: "Layout Converter", he: "המרת מקלדת" },
  "conv.desc": { en: "Typed in the wrong keyboard layout? Paste or type your text below to convert it.", he: "הקלדת בפריסת מקלדת שגויה? הדבק או הקלד את הטקסט למטה כדי להמיר אותו." },
  "conv.auto": { en: "Auto-detect", he: "זיהוי אוטומטי" },
  "conv.convert": { en: "Convert", he: "המר" },
  "conv.clear": { en: "Clear", he: "נקה" },
  "conv.paste": { en: "Paste", he: "הדבק" },
  "conv.copy": { en: "Copy", he: "העתק" },
  "conv.placeholder": { en: "Type or paste text in the wrong layout...", he: "הקלד או הדבק טקסט בפריסה השגויה..." },
  "conv.detected": { en: "Detected", he: "זוהה" },
  "conv.confidence": { en: "confidence", he: "ביטחון" },

  // Snippets
  "snip.title": { en: "Snippets", he: "קטעי טקסט" },
  "snip.new": { en: "+ New Snippet", he: "+ קטע חדש" },
  "snip.cancel": { en: "Cancel", he: "ביטול" },
  "snip.search": { en: "Search snippets...", he: "חיפוש קטעים..." },
  "snip.empty": { en: "No snippets yet", he: "אין קטעים עדיין" },
  "snip.empty.hint": { en: "Create text shortcuts that expand as you type", he: "צור קיצורי טקסט שמתרחבים בזמן ההקלדה" },
  "snip.noMatch": { en: "No snippets match your search", he: "אין קטעים התואמים לחיפוש" },
  "snip.trigger": { en: "Trigger (type this to expand)", he: "מפעיל (הקלד זאת כדי להרחיב)" },
  "snip.content": { en: "Content (expands to this)", he: "תוכן (מתרחב לזה)" },
  "snip.description": { en: "Description (optional)", he: "תיאור (אופציונלי)" },
  "snip.variables": { en: "Dynamic Variables", he: "משתנים דינמיים" },
  "snip.preview": { en: "Preview", he: "תצוגה מקדימה" },
  "snip.create": { en: "Create Snippet", he: "צור קטע" },
  "snip.update": { en: "Update Snippet", he: "עדכן קטע" },
  "snip.used": { en: "Used", he: "שימושים" },
  "snip.times": { en: "times", he: "פעמים" },

  // AI Tools
  "ai.title": { en: "AI Tools", he: "כלי AI" },
  "ai.enhance": { en: "Enhance Prompt", he: "שיפור פרומפט" },
  "ai.translate": { en: "Translate", he: "תרגום" },
  "ai.ask": { en: "Ask AI", he: "שאל AI" },
  "ai.processing": { en: "Processing...", he: "מעבד..." },
  "ai.copyResult": { en: "Copy Result", he: "העתק תוצאה" },
  "ai.enhancePlaceholder": { en: "Paste your prompt here to enhance it...", he: "הדבק את הפרומפט שלך כאן לשיפור..." },
  "ai.translatePlaceholder": { en: "Enter text to translate...", he: "הכנס טקסט לתרגום..." },
  "ai.askPlaceholder": { en: "Ask anything...", he: "שאל כל דבר..." },

  // Settings
  "set.title": { en: "Settings", he: "הגדרות" },
  "set.general": { en: "General", he: "כללי" },
  "set.aiProviders": { en: "AI Providers", he: "ספקי AI" },
  "set.layouts": { en: "Layouts", he: "פריסות" },
  "set.about": { en: "About", he: "אודות" },
  "set.appearance": { en: "Appearance", he: "מראה" },
  "set.theme": { en: "Theme", he: "ערכת נושא" },
  "set.system": { en: "System", he: "מערכת" },
  "set.light": { en: "Light", he: "בהיר" },
  "set.dark": { en: "Dark", he: "כהה" },
  "set.launchAtLogin": { en: "Launch at login", he: "הפעל בעת כניסה" },
  "set.clipboard": { en: "Clipboard", he: "לוח" },
  "set.enableClipboard": { en: "Enable clipboard monitoring", he: "הפעל ניטור לוח" },
  "set.maxItems": { en: "Max history items", he: "מקסימום פריטים בהיסטוריה" },
  "set.autoCategorize": { en: "Auto-categorize items", he: "סיווג אוטומטי" },
  "set.snippets": { en: "Snippets", he: "קטעים" },
  "set.enableSnippets": { en: "Enable snippet expansion", he: "הפעל הרחבת קטעים" },
  "set.utilities": { en: "Utilities", he: "כלים" },
  "set.caffeine": { en: "Caffeine Mode", he: "מצב ערנות" },
  "set.caffeineDesc": { en: "Prevent system from sleeping", he: "מנע מהמערכת ללכת לישון" },
  "set.keyboardLock": { en: "Keyboard Lock", he: "נעילת מקלדת" },
  "set.keyboardLockDesc": { en: "Block keyboard input for cleaning", he: "חסום קלט מקלדת לניקיון" },
  "set.lock": { en: "Lock", he: "נעל" },
  "set.save": { en: "Save Settings", he: "שמור הגדרות" },
  "set.saved": { en: "Settings saved", he: "ההגדרות נשמרו" },
  "set.activeProvider": { en: "Active Provider", he: "ספק פעיל" },
  "set.freeTier": { en: "Free tier available", he: "שכבה חינמית זמינה" },
  "set.layoutConversion": { en: "Layout Conversion", he: "המרת פריסה" },
  "set.autoDetect": { en: "Auto-detect source layout", he: "זיהוי אוטומטי של פריסת מקור" },
  "set.realtimeDetection": { en: "Real-time wrong-layout detection", he: "זיהוי פריסה שגויה בזמן אמת" },
  "set.supportedLayouts": { en: "Supported Layouts", he: "פריסות נתמכות" },
  "set.moreLayouts": { en: "More layouts can be added via JSON definition files", he: "ניתן להוסיף פריסות נוספות באמצעות קבצי JSON" },
  "set.dataManagement": { en: "Data Management", he: "ניהול נתונים" },
  "set.export": { en: "Export Settings", he: "ייצוא הגדרות" },
  "set.import": { en: "Import Settings", he: "ייבוא הגדרות" },
  "set.exportHint": { en: "Export copies settings JSON to clipboard. Import reads from clipboard.", he: "הייצוא מעתיק JSON של הגדרות ללוח. הייבוא קורא מהלוח." },
  "set.language": { en: "Language", he: "שפה" },

  // Onboarding
  "onb.welcome": { en: "Welcome to Brava", he: "ברוכים הבאים ל-Brava" },
  "onb.welcomeDesc": { en: "Your cross-platform productivity toolkit. Smart keyboard layout conversion, clipboard management, and AI-powered text tools.", he: "ערכת הכלים שלך לפרודוקטיביות חוצת פלטפורמות. המרת פריסת מקלדת חכמה, ניהול לוח, וכלי טקסט מונעי AI." },
  "onb.skip": { en: "Skip", he: "דלג" },
  "onb.next": { en: "Next", he: "הבא" },
  "onb.back": { en: "Back", he: "חזרה" },
  "onb.getStarted": { en: "Get Started", he: "בואו נתחיל" },

  // Keyboard Lock
  "lock.title": { en: "Keyboard Locked", he: "המקלדת נעולה" },
  "lock.elapsed": { en: "Time elapsed", he: "זמן שעבר" },
  "lock.clickUnlock": { en: "Click the button below to unlock", he: "לחץ על הכפתור למטה כדי לפתוח" },
  "lock.unlock": { en: "Unlock Keyboard", he: "פתח מקלדת" },
} as const;

type TranslationKey = keyof typeof translations;

let currentLocale: Locale = "en";
const localeListeners: ((locale: Locale) => void)[] = [];

export function setLocale(locale: Locale) {
  currentLocale = locale;
  localStorage.setItem("brava_locale", locale);
  document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
  document.documentElement.lang = locale;
  localeListeners.forEach((fn) => fn(locale));
}

export function getLocale(): Locale {
  return currentLocale;
}

export function initLocale() {
  const stored = localStorage.getItem("brava_locale") as Locale | null;
  if (stored && (stored === "en" || stored === "he")) {
    setLocale(stored);
  }
}

export function onLocaleChange(fn: (locale: Locale) => void) {
  localeListeners.push(fn);
  return () => {
    const idx = localeListeners.indexOf(fn);
    if (idx >= 0) localeListeners.splice(idx, 1);
  };
}

export function t(key: TranslationKey): string {
  const entry = translations[key];
  return entry?.[currentLocale] ?? entry?.en ?? key;
}

// Hook for React components
import { useState, useEffect } from "react";

export function useLocale(): [Locale, typeof t] {
  const [locale, setLocaleState] = useState<Locale>(currentLocale);

  useEffect(() => {
    return onLocaleChange(setLocaleState);
  }, []);

  return [locale, t];
}
