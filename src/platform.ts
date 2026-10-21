import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * Where the code runs: the website (served next to the API, signed in with a cookie) or the Gramalyzer app (Tauri on
 * Android, iOS and desktop), which talks to whichever server the person connects it to, with the access token.
 */
export const isApp = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * fetch for the app's requests: the app's own HTTP client, so they are not bound by browser CORS. An empty Origin is
 * dropped, so the backend and AI providers see a plain API client rather than a foreign web page. The website uses the
 * browser's fetch.
 */
export function httpFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!isApp) return fetch(url, init);
  const headers = new Headers(init.headers);
  headers.set('Origin', '');
  return nativeFetch(url, {...init, headers});
}

export type Connection = {server: string; token: string};
const STORAGE = 'gramalyzer.connection';

/** The server the app is connected to; null on the website and before the first sign-in. */
export function connection(): Connection | null {
  if (!isApp) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? 'null') as Connection | null;
    return saved?.server ? saved : null;
  } catch {return null;}
}
export function saveConnection(c: Connection | null) {
  try {if (c) localStorage.setItem(STORAGE, JSON.stringify(c)); else localStorage.removeItem(STORAGE);} catch {/* nothing to keep it in */}
}

/** "gramalyzer.example.com/" → "https://gramalyzer.example.com"; local addresses default to http. */
export function normalizeServer(input: string): string {
  let s = input.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (s && !/^https?:\/\//i.test(s)) s = (/^(localhost|127\.|10\.|192\.168\.|\[?::1)/.test(s) ? 'http://' : 'https://') + s;
  return s;
}

/** The address of an API path ("/workspace") for this platform. */
export function apiUrl(path: string): string {
  const c = connection();
  return `${c ? c.server : ''}/api${path}`;
}
/** Headers that sign the app's requests in; the website's cookie does that on its own. */
export function authHeaders(): Record<string, string> {
  const c = connection();
  return c?.token ? {Authorization: `Bearer ${c.token}`} : {};
}

/** Opens a link in the system browser; inside the app a target="_blank" link would otherwise go nowhere. */
export function openExternal(url: string) {
  if (isApp) void openUrl(url).catch(() => undefined);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

/** In the app, sends every outside link to the system browser. */
export function routeExternalLinks() {
  if (!isApp) return;
  document.addEventListener('click', e => {
    const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!link || !/^https?:/i.test(link.href) || new URL(link.href).origin === location.origin) return;
    e.preventDefault();
    openExternal(link.href);
  });
}
