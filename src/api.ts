import type { Channel, ChannelFeed, ChannelInsights, TrackedDetail, TrackedSummary, TrackingError } from '../shared/types';
import type { I18n } from './i18n';

/** A failed API call. code is set when the backend sends a translatable one (the /api/tracked errors). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {super(message);}
}

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${url}`, {...options, headers: {'Content-Type': 'application/json', ...options?.headers}});
  if (!res.ok) {
    const data: {error?: string; code?: string} = await res.json().catch(() => ({}));
    throw new ApiError(data.error ?? '', res.status, data.code);
  }
  return res.status === 204 ? undefined as T : res.json();
}

const TRACKING_ERRORS: TrackingError[] = ['invalid_username', 'private_link', 'not_found', 'not_channel', 'unreachable', 'limit', 'not_tracked'];
/** The tracking error code of e, if it has one. */
export function trackingError(e: unknown): TrackingError | null {
  const code = e instanceof ApiError ? e.code : undefined;
  return code && (TRACKING_ERRORS as string[]).includes(code) ? code as TrackingError : null;
}

/** What to tell the visitor about a failed call: the translated reason when the backend gave a code, else its message. */
export function errorMessage(e: unknown, t: I18n['t']): string {
  const code = trackingError(e);
  if (code) return t(`err.${code}`);
  return (e instanceof Error && e.message) || t('app.error');
}

/** The visitor's timezone, so posting hours line up with their clock. */
export const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const tz = () => `tz=${encodeURIComponent(zone())}`;

export const api = {
  insights: (id: string) => request<ChannelInsights>(`/channels/${encodeURIComponent(id)}/insights`),
  feed: (id: string) => request<ChannelFeed>(`/channels/${encodeURIComponent(id)}/feed?${tz()}`),
  tracked: () => request<TrackedSummary[]>(`/tracked?${tz()}`),
  lookup: (username: string) => request<TrackedDetail>(`/tracked/${encodeURIComponent(username)}?${tz()}`),
  track: (username: string) => request<TrackedDetail>(`/tracked?${tz()}`, {method: 'POST', body: JSON.stringify({username})}),
  refresh: (username: string) => request<TrackedDetail>(`/tracked/${encodeURIComponent(username)}/refresh?${tz()}`, {method: 'POST'}),
  untrack: (username: string) => request<void>(`/tracked/${encodeURIComponent(username)}`, {method: 'DELETE'}),
};

/** Own channels' profile photos come through the backend, which fetches them with the bot; null until the bot has seen the channel. */
export const channelPhoto = (c: Channel) => c.telegramChatId ? `/api/channels/${encodeURIComponent(c.id)}/photo` : null;

/** "@durov", "t.me/durov", "https://t.me/s/durov/123" → "durov"; null when it can't be a public channel username. */
export function usernameFrom(input: string): string | null {
  const text = input.trim();
  const link = text.match(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\/(?:s\/)?([A-Za-z][\w]{3,31})(?:[/?#].*)?$/i)
    ?? text.match(/^tg:\/\/resolve\?domain=([A-Za-z][\w]{3,31})/i)
    ?? text.match(/^@?([A-Za-z][\w]{3,31})$/);
  return link ? link[1] : null;
}
