import type { Channel, ChannelInsights, FeedPost, Post } from '../../shared/types';
import { api } from '../api';
import { languageName, type Context } from './prompts';
import type { AiSettings } from './settings';

type Grounding = {insights: ChannelInsights | null; feed: FeedPost[]};
const cache = new Map<string, {at: number; data: Promise<Grounding>}>();
const FRESH = 5 * 60_000;

/** What the AI needs to write like a channel: its insights and its recent posts. Either may be missing. */
export function grounding(channelId: string): Promise<Grounding> {
  const hit = cache.get(channelId);
  if (hit && Date.now() - hit.at < FRESH) return hit.data;
  const data = Promise.all([api.insights(channelId).catch(() => null), api.feed(channelId).then(f => f.posts).catch(() => [])]).then(([insights, feed]) => ({insights, feed}));
  cache.set(channelId, {at: Date.now(), data});
  return data;
}

/** The context every prompt carries, for one channel (or none). uiLang is the interface's language code. */
export async function channelContext(channel: Channel | undefined, posts: Post[], settings: AiSettings, uiLang: string): Promise<Context> {
  const {insights, feed} = channel ? await grounding(channel.id) : {insights: null, feed: []};
  return {channel, insights, posts, feed, voice: settings.voice, language: languageName(settings.contentLang || uiLang), languageFromPosts: !settings.contentLang};
}
