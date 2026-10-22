import type { Channel, FeedPost } from '../../shared/types';
import { httpFetch } from '../platform';
import { AiError, complete, type VisionMessage } from './client';
import { isPicture } from './prompts';
import type { AiSettings } from './settings';

/**
 * What a channel's pictures show, in words, from a model that can see images. A channel of pictures with short
 * captions gives a text model almost nothing to learn from; this description is what lets it write posts that fit.
 * It is remembered on this device for a few days, per channel.
 */
export type Look = {state: 'off' | 'none' | 'ready' | 'failed'; text: string; error: {kind: AiError['kind']; detail: string} | null; pictures: number};

/** How many pictures the model sees, and the longest side they are scaled down to first. */
const PICTURES = 4;
const SIDE = 768;
/** A description holds for three days; after a failure, ask again after six hours. */
const FRESH = 3 * 86400_000;
const RETRY = 6 * 3600_000;
const STORAGE = 'gramalyzer.ai.looks';

type Saved = {key: string; at: number; text?: string; error?: Look['error']};

/** The pictures to show: the channel's two most engaging, then the newest. */
export function picturesOf(feed: FeedPost[]): FeedPost[] {
  const own = feed.filter(p => !p.forwardedFrom && isPicture(p) && p.mediaUrl);
  const out = [...own].sort((a, b) => b.reactions - a.reactions).slice(0, PICTURES / 2);
  for (const p of own) {if (out.length >= PICTURES) break; if (!out.includes(p)) out.push(p);}
  return out;
}

export function lookPrompt(channel: Channel, posts: FeedPost[]): string {
  const about = channel.description.trim() ? ` It describes itself as: ${channel.description.trim()}` : '';
  const captions = posts.map((p, i) => `${i + 1}) ${p.text.trim() ? `"${Array.from(p.text.trim()).slice(0, 200).join('')}"` : '(no caption)'}`).join('\n');
  return `These are ${posts.length} recent pictures from the Telegram channel "${channel.name}" (${channel.handle}).${about}\n`
    + `Their captions, in order:\n${captions}\n\n`
    + 'In 4 to 6 short lines starting with "- ", describe what this channel\'s pictures are like, so a copywriter can write posts that fit: '
    + 'their subjects and recurring themes, the humour or mood, the visual style (photos, memes, screenshots, illustrations…), '
    + 'any text on them and its language, and what makes them recognisable. Describe what they have in common, not each picture. Plain text, no preface.';
}

function saved(): Record<string, Saved> {
  try {return JSON.parse(localStorage.getItem(STORAGE) ?? '{}');} catch {return {};}
}
function remember(channelId: string, entry: Saved) {
  try {localStorage.setItem(STORAGE, JSON.stringify({...saved(), [channelId]: entry}));} catch {/* kept for this visit only */}
}

/** A picture as a data: URL, scaled down; the URL itself when it can't be fetched here (the provider fetches it then). */
async function inline(url: string): Promise<string> {
  try {
    const res = await httpFetch(url);
    if (!res.ok) return url;
    const image = await createImageBitmap(await res.blob());
    const scale = Math.min(1, SIDE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {return url;}
}

const running = new Map<string, Promise<Look>>();

/** The description of a channel's pictures: remembered, or asked for now. force asks again even if one is remembered. */
export function channelLook(channel: Channel, feed: FeedPost[], s: AiSettings, force = false): Promise<Look> {
  const posts = picturesOf(feed);
  const model = s.visionModel.trim();
  const base = {text: '', error: null, pictures: posts.length};
  if (!posts.length) return Promise.resolve({...base, state: 'none'});
  if (!model) return Promise.resolve({...base, state: 'off'});
  const key = `${s.baseUrl.trim()}|${model}`;
  const old = saved()[channel.id];
  if (!force && old?.key === key) {
    if (old.text && Date.now() - old.at < FRESH) return Promise.resolve({...base, state: 'ready', text: old.text});
    if (old.error && Date.now() - old.at < RETRY) return Promise.resolve({...base, state: 'failed', error: old.error});
  }
  const id = `${channel.id}|${key}`;
  const busy = running.get(id);
  if (busy) return busy;
  const job = (async (): Promise<Look> => {
    try {
      const images = await Promise.all(posts.map(p => inline(p.mediaUrl!)));
      const message: VisionMessage = {role: 'user', content: [{type: 'text', text: lookPrompt(channel, posts)}, ...images.map(url => ({type: 'image_url' as const, image_url: {url}}))]};
      const text = (await complete({...s, model}, [message], 0.3)).trim();
      remember(channel.id, {key, at: Date.now(), text});
      return {...base, state: 'ready', text};
    } catch (e) {
      const error = e instanceof AiError ? {kind: e.kind, detail: e.detail} : {kind: 'network' as const, detail: e instanceof Error ? e.message : String(e)};
      remember(channel.id, {key, at: Date.now(), error});
      return {...base, state: 'failed', error};
    } finally {running.delete(id);}
  })();
  running.set(id, job);
  return job;
}
