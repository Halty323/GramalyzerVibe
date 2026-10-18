import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en, { type Key, type Messages, type Plural } from './locales/en';

/** The bot's languages: the ones Telegram is used in most. `locale` is what Intl formats numbers and dates with. */
export const LANGS = [
  {code: 'en', name: 'English', locale: 'en-GB'},
  {code: 'ru', name: 'Русский', locale: 'ru'},
  {code: 'uk', name: 'Українська', locale: 'uk'},
  {code: 'hi', name: 'हिन्दी', locale: 'hi'},
  {code: 'id', name: 'Bahasa Indonesia', locale: 'id'},
  {code: 'pt', name: 'Português', locale: 'pt-BR'},
  {code: 'es', name: 'Español', locale: 'es'},
  {code: 'ar', name: 'العربية', locale: 'ar'},
  {code: 'fa', name: 'فارسی', locale: 'fa'},
  {code: 'uz', name: 'Oʻzbekcha', locale: 'uz-Latn'},
  {code: 'tr', name: 'Türkçe', locale: 'tr'},
  {code: 'vi', name: 'Tiếng Việt', locale: 'vi'},
] as const;
export type Lang = typeof LANGS[number]['code'];
const RTL = new Set<Lang>(['ar', 'fa']);
/** Languages we don't have, mapped to the one their speakers most often read Telegram in (as the bot does). */
const NEAREST: Record<string, Lang> = {be: 'ru', kk: 'ru', ky: 'ru', tg: 'ru', ms: 'id'};
const STORAGE = 'gramalyzer.lang';

const loaders: Record<Exclude<Lang, 'en'>, () => Promise<{default: Messages}>> = {
  ru: () => import('./locales/ru'), uk: () => import('./locales/uk'), hi: () => import('./locales/hi'),
  id: () => import('./locales/id'), pt: () => import('./locales/pt'), es: () => import('./locales/es'),
  ar: () => import('./locales/ar'), fa: () => import('./locales/fa'), uz: () => import('./locales/uz'),
  tr: () => import('./locales/tr'), vi: () => import('./locales/vi'),
};
const loaded: Partial<Record<Lang, Messages>> = {en};
export async function loadLang(lang: Lang): Promise<Messages> {
  if (!loaded[lang]) loaded[lang] = (await loaders[lang as Exclude<Lang, 'en'>]()).default;
  return loaded[lang]!;
}

const isLang = (code: string): code is Lang => LANGS.some(l => l.code === code);
/** The saved choice, else the browser's first language we speak, else English. */
export function detectLang(): Lang {
  try {const saved = localStorage.getItem(STORAGE); if (saved && isLang(saved)) return saved;} catch {/* storage can be blocked */}
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLang(base)) return base;
    if (NEAREST[base]) return NEAREST[base];
  }
  return 'en';
}

export type StringKey = {[K in Key]: Messages[K] extends string ? K : never}[Key];
export type PluralKey = Exclude<Key, StringKey>;
type Vars = Record<string, string | number>;
/** Whether key is one of ours, for keys built from data (a post kind, an error code). */
export const isKey = (key: string): key is StringKey => key in en;
const fill = (text: string, vars?: Vars) => vars ? text.replace(/\{(\w+)\}/g, (m, name) => name in vars ? String(vars[name]) : m) : text;

export type I18n = {
  lang: Lang; locale: string; rtl: boolean;
  setLang: (lang: Lang) => Promise<void>;
  t: (key: StringKey, vars?: Vars) => string;
  /** A counted phrase: picks the plural form for n and fills {n} with the formatted number. */
  tn: (key: PluralKey, n: number, vars?: Vars) => string;
  /** Like t, but the placeholders can be elements. */
  rich: (key: StringKey, vars: Record<string, ReactNode>) => ReactNode;
  num: (n: number, digits?: number) => string;
  /** 48.2K, 1.3M – Telegram's short counts, in the reader's language. */
  compact: (n: number) => string;
  /** +389 / −12 */
  signed: (n: number) => string;
  date: (at: string | Date, options: Intl.DateTimeFormatOptions) => string;
  /** 13:00, in the reader's language. */
  hour: (h: number) => string;
  /** Day 0 is Monday. */
  weekday: (day: number, width: 'long' | 'short') => string;
  /** "3 hours ago" */
  ago: (at: string | Date) => string;
};

const Context = createContext<I18n | null>(null);
export function useI18n() {
  const value = useContext(Context);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}

export function I18nProvider({initial, children}: {initial: Lang; children: ReactNode}) {
  const [state, setState] = useState<{lang: Lang; messages: Messages}>(() => ({lang: initial, messages: loaded[initial] ?? en}));
  const {lang, messages} = state;
  const meta = LANGS.find(l => l.code === lang)!;
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL.has(lang) ? 'rtl' : 'ltr';
  }, [lang]);
  const value = useMemo<I18n>(() => {
    const locale = meta.locale;
    const numbers = new Intl.NumberFormat(locale);
    const short = new Intl.NumberFormat(locale, {notation: 'compact', maximumFractionDigits: 1});
    const plural = new Intl.PluralRules(locale);
    const relative = new Intl.RelativeTimeFormat(locale, {numeric: 'auto'});
    const hours = new Intl.DateTimeFormat(locale, {hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC'});
    const lookup = (key: Key) => (messages[key] ?? en[key]) as string | Plural;
    const t = (key: StringKey, vars?: Vars) => fill(lookup(key) as string, vars);
    return {
      lang, locale, rtl: RTL.has(lang),
      setLang: async next => {
        const m = await loadLang(next);
        try {localStorage.setItem(STORAGE, next);} catch {/* still switch for this visit */}
        setState({lang: next, messages: m});
      },
      t,
      tn: (key, n, vars) => {
        const forms = lookup(key) as Plural;
        const form = forms[plural.select(n)] ?? forms.other;
        return fill(form, {...vars, n: numbers.format(n)});
      },
      rich: (key, vars) => (lookup(key) as string).split(/\{(\w+)\}/).map((part, i) => i % 2 ? <Fragment key={i}>{vars[part] ?? `{${part}}`}</Fragment> : part),
      num: (n, digits) => digits === undefined ? numbers.format(n) : new Intl.NumberFormat(locale, {maximumFractionDigits: digits, minimumFractionDigits: 0}).format(n),
      compact: n => short.format(n),
      signed: n => (n > 0 ? '+' : n < 0 ? '−' : '') + numbers.format(Math.abs(n)),
      date: (at, options) => new Date(at).toLocaleString(locale, options),
      hour: h => hours.format(Date.UTC(2024, 0, 1, h)),
      weekday: (day, width) => new Date(Date.UTC(2024, 0, 1 + day)).toLocaleDateString(locale, {weekday: width, timeZone: 'UTC'}),
      ago: at => {
        const seconds = (new Date(at).getTime() - Date.now()) / 1000;
        const abs = Math.abs(seconds);
        if (abs < 60) return relative.format(0, 'second');
        if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute');
        if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
        if (abs < 86400 * 30) return relative.format(Math.round(seconds / 86400), 'day');
        return relative.format(Math.round(seconds / (86400 * 30)), 'month');
      },
    };
  }, [lang, messages, meta.locale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
