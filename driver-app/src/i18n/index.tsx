import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { I18nManager, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';
import { ar as arDateLocale } from 'date-fns/locale/ar';
import en from './locales/en.json';
import ar from './locales/ar.json';

// ── Types ──

export type Locale = 'en' | 'ar';

type NestedRecord = { [key: string]: string | NestedRecord };

const translations: Record<Locale, NestedRecord> = { en, ar };

const LANGUAGE_KEY = 'app_language';

// ── Helpers ──

/** Resolve a dot-path key like "dashboard.greeting" from a nested object */
function resolve(obj: NestedRecord, path: string): string | undefined {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Simple interpolation: replaces {{key}} tokens */
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? `{{${key}}}`));
}

// ── Context ──

interface I18nContextType {
  locale: Locale;
  isRTL: boolean;
  dateLocale: typeof arDateLocale | undefined;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  isRTL: false,
  dateLocale: undefined,
  setLocale: async () => {},
  t: (key) => key,
});

// ── Provider ──

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [ready, setReady] = useState(false);

  // Load saved language on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(LANGUAGE_KEY);
        if (saved === 'ar' || saved === 'en') {
          setLocaleState(saved);
          applyRTL(saved);
        } else {
          // Auto-detect from device locale
          const deviceLocales = getLocales();
          const primary = deviceLocales?.[0]?.languageCode;
          const detected: Locale = primary === 'ar' ? 'ar' : 'en';
          setLocaleState(detected);
          applyRTL(detected);
        }
      } catch {
        // Default to English
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setLocale = useCallback(async (newLocale: Locale) => {
    setLocaleState(newLocale);
    await SecureStore.setItemAsync(LANGUAGE_KEY, newLocale);
    applyRTL(newLocale);
  }, []);

  const isRTL = locale === 'ar';
  const dateLocale = locale === 'ar' ? arDateLocale : undefined;

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>): string => {
      const str = resolve(translations[locale], key) ?? resolve(translations.en, key) ?? key;
      return interpolate(str, vars);
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, isRTL, dateLocale, setLocale, t }), [locale, isRTL, dateLocale, setLocale, t]);

  if (!ready) return null;

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// ── Hook ──

export function useI18n() {
  return useContext(I18nContext);
}

// ── RTL helper ──

function applyRTL(locale: Locale) {
  const shouldBeRTL = locale === 'ar';
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.allowRTL(shouldBeRTL);
    I18nManager.forceRTL(shouldBeRTL);
    // Note: On Android, RTL changes take full effect after app restart.
    // The provider still applies text alignment via style overrides.
  }
}
