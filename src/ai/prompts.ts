import type { Channel, ChannelInsights, FeedPost, InsightGroup, Post, TrackedStats, TrackedSummary } from '../../shared/types';
import type { ChatMessage } from './client';

/**
 * What the app asks the model, ported from Gramalyzer Studio (desktop/src/prompts.rs in GramalyzerBot); keep the two
 * in step. Prompts are English (models follow it best) and name the language to write in. Every request carries the
 * channel's context: what it is about, real posts to imitate, what the bot's analysis says works, and its voice.
 */
export type Context = {
  channel?: Channel;
  insights?: ChannelInsights | null;
  /** Workspace posts of every channel (drafts, queue, published). */
  posts: Post[];
  /** The channel's own published posts as Telegram has them, newest first. */
  feed: FeedPost[];
  voice: string;
  language: string;
  /** No language was chosen for drafts: write in the language of the channel's posts, `language` without any. */
  languageFromPosts: boolean;
};

export type Rewrite = 'draft' | 'improve' | 'shorten' | 'expand' | 'hook' | 'grammar' | 'hashtags' | 'headlines' | 'translate' | 'tone';

const LANGUAGES: Record<string, string> = {ru: 'Russian', uk: 'Ukrainian', hi: 'Hindi', id: 'Indonesian', pt: 'Portuguese (Brazil)', es: 'Spanish', ar: 'Arabic', fa: 'Persian', uz: 'Uzbek (Latin script)', tr: 'Turkish', vi: 'Vietnamese'};
export const languageName = (code: string) => LANGUAGES[code] ?? 'English';

const ROLE = 'You are the content strategist and copywriter inside Gramalyzer, a tool for running Telegram channels. '
  + 'Telegram posts are sent as plain text: never use Markdown (no **bold**, no # headings, no [links](…)); emoji and line breaks are fine. '
  + "A post's text may be at most 4096 characters. Be concrete and specific; avoid clichés and filler.";

const FIT = "Everything you write must fit this channel: its subject and audience, as the name, description and posts above show. "
  + 'Do not drift into generic topics (marketing, growth, AI, productivity, motivation) unless the channel is about them. '
  + "Write posts the way the channel's own posts are written: similar length, structure, emoji and hashtag habits, and voice. "
  + "Reuse the channel's hashtags rather than inventing new ones.";

/** How many of the channel's posts go into a prompt as examples, and how much of each. */
const EXAMPLES = 6;
const EXAMPLE_CHARS = 600;

const dayName = (day: string) => day.charAt(0) + day.slice(1).toLowerCase();
const chars = (s: string) => Array.from(s);

/** Cuts text to about max characters at a word boundary. */
export function clip(text: string, max: number): string {
  const t = text.trim();
  if (chars(t).length <= max) return t;
  const cut = chars(t).slice(0, max).join('');
  const space = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const isEmoji = (c: string) => {const n = c.codePointAt(0) ?? 0; return (n >= 0x1F000 && n <= 0x1FAFF) || (n >= 0x2600 && n <= 0x27BF) || (n >= 0x2B00 && n <= 0x2BFF);};

export function hashtags(text: string): string[] {
  return text.split(/\s+/).filter(w => w.startsWith('#')).map(w => w.slice(1).replace(/[^\p{L}\p{N}_]+$/u, '')).filter(t => /^\p{L}/u.test(t)).map(t => `#${t.toLowerCase()}`);
}

/** The channel's own posts that are worth imitating: the most engaging ones first, then the newest. */
function examples(feed: FeedPost[]): FeedPost[] {
  const own = feed.filter(p => !p.forwardedFrom && chars(p.text.trim()).length >= 20);
  const opening = (p: FeedPost) => (p.text.trim().split('\n')[0] ?? '').trim().toLowerCase();
  const out: FeedPost[] = [];
  // Recurring formats (a weekly digest, say) would otherwise fill every slot with the same opening.
  const add = (p: FeedPost) => {if (!out.some(q => q.id === p.id || opening(q) === opening(p))) out.push(p);};
  for (const p of [...own].sort((a, b) => b.reactions - a.reactions)) {if (out.length >= EXAMPLES / 2) break; add(p);}
  for (const p of own) {if (out.length >= EXAMPLES) break; add(p);}
  return out;
}

/** Habits the posts share, in numbers: length, emoji, hashtags, links. */
function houseStyle(feed: FeedPost[]): string | null {
  const texts = feed.filter(p => !p.forwardedFrom).map(p => p.text.trim()).filter(Boolean);
  if (texts.length < 5) return null;
  const share = (f: (t: string) => boolean) => Math.floor(texts.filter(f).length * 100 / texts.length);
  const lengths = texts.map(t => chars(t).length).sort((a, b) => a - b);
  const counts = new Map<string, number>();
  for (const t of texts) for (const tag of hashtags(t)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const tags = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k);
  return `House style of the last ${texts.length} posts: typically about ${lengths[Math.floor(lengths.length / 2)]} characters; `
    + `paragraphs in ${share(t => t.includes('\n\n'))}%; emoji in ${share(t => chars(t).some(isEmoji))}%; `
    + `links in ${share(t => /https?:\/\/|t\.me\//.test(t))}%; hashtags in ${share(t => hashtags(t).length > 0)}%`
    + (tags.length ? ` (most used: ${tags.join(' ')})` : '');
}

/** A description of the channel, its real posts and what its numbers say, for the system prompt. */
export function describe(ctx: Context): string {
  const lines: string[] = [];
  const shown = examples(ctx.feed);
  const c = ctx.channel;
  if (c) {
    lines.push(`Channel: ${c.name} ${c.handle}`);
    if (c.description.trim()) lines.push(`About: ${c.description.trim()}`);
    lines.push(`Subscribers: ${c.subscribers}`);
    const mine = ctx.posts.filter(p => p.channelId === c.id).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
    if (shown.length) {
      lines.push('', 'Posts from this channel, to learn its subject, voice and formatting (the most engaging first, then the newest):');
      shown.forEach((p, i) => lines.push(`[${i + 1}] ${p.reactions} reactions`, clip(p.text, EXAMPLE_CHARS), ''));
    } else {
      // Nothing from Telegram yet: the posts written in the workspace are the next best thing.
      const published = mine.filter(p => p.status === 'published').slice(0, EXAMPLES);
      if (published.length) {
        lines.push('', 'Posts from this channel, to learn its subject, voice and formatting:');
        published.forEach((p, i) => lines.push(`[${i + 1}] ${p.title}`, clip(p.body, EXAMPLE_CHARS), ''));
      }
    }
    const style = houseStyle(ctx.feed);
    if (style) lines.push(style);
    const planned = mine.filter(p => p.status !== 'published').map(p => p.title.trim()).filter(Boolean).slice(0, 8);
    if (planned.length) lines.push(`Already drafted or scheduled (do not repeat): ${planned.join('; ')}`);
  }
  const i = ctx.insights;
  if (i?.status === 'ready') {
    lines.push('', `Analytics (engagement lift vs. the channel's typical post, 1.0 = typical; timezone ${i.timezone}):`);
    const times = i.bestTimes.slice(0, 3).map(t => `${dayName(t.day)} ${String(t.hour).padStart(2, '0')}:00 (${t.lift.toFixed(1)}×)`);
    if (times.length) lines.push(`- Best times: ${times.join(', ')}`);
    const groups = (g: InsightGroup[]) => g.slice(0, 5).map(x => `${x.key} ${x.lift.toFixed(1)}×`).join(', ');
    if (i.content.kinds.length) lines.push(`- Formats: ${groups(i.content.kinds)}`);
    if (i.content.lengths.length) lines.push(`- Length (SHORT ≤120 chars, MEDIUM 121–400, LONG 401–800, XLONG 800+): ${groups(i.content.lengths)}`);
    if (i.content.topics.length) lines.push(`- Hashtags: ${groups(i.content.topics)}`);
    if (i.content.keywords.length) lines.push(`- Keywords: ${groups(i.content.keywords)}`);
    lines.push(`- Posts per week: ${i.cadence.postsPerWeek.toFixed(1)}; average reactions ${i.avgReactions.toFixed(1)}, comments ${i.avgComments.toFixed(1)}`);
    if (!shown.length) {
      const top = i.topPosts.slice(0, 4).filter(p => p.preview).map(p => `"${p.preview}" (${p.reactions} reactions, ${p.comments} comments)`);
      if (top.length) lines.push(`- Strongest posts: ${top.join('; ')}`);
    }
  }
  if (ctx.voice.trim()) lines.push(`Brand voice to follow: ${ctx.voice.trim()}`);
  return lines.join('\n') + '\n';
}

function system(ctx: Context, extra: string): ChatMessage {
  const c = ctx.channel;
  const hasPosts = ctx.feed.length > 0 || !!c && ctx.posts.some(p => p.channelId === c.id && p.status === 'published');
  const language = ctx.languageFromPosts && hasPosts
    ? "Write in the language the channel's posts are written in, unless asked otherwise."
    : `Write in ${ctx.language} unless asked otherwise.`;
  return {role: 'system', content: `${ROLE}\n\n${describe(ctx)}\n${c ? FIT : ''}\n${language}\n${extra}`};
}

export const TONES = ['friendly', 'expert', 'bold', 'playful', 'formal', 'inspiring'] as const;

export function rewrite(ctx: Context, kind: Rewrite, input: {title: string; body: string; brief: string; tone: string; target: string}): ChatMessage[] {
  const only = 'Answer with the post text only: no preface, no quotes around it, no explanation.';
  const tasks: Record<Rewrite, string> = {
    draft: `Write a new Telegram post for this channel from the brief below, on the channel's subject and in the style of its posts. Open with a strong first line (it is what shows in the chat list), keep paragraphs short, end with a natural call to action or question. ${only}\n\nBrief: ${input.brief}`,
    improve: `Edit this post to make it clearer, tighter and more engaging, keeping its meaning, facts and language. ${only}`,
    shorten: `Cut this post to about half its length without losing the key point. ${only}`,
    expand: `Expand this post with useful specifics, an example or a short list, staying under 1500 characters. ${only}`,
    hook: `Rewrite only the opening (first one or two lines) so it makes people stop scrolling, then keep the rest of the post as it is. ${only}`,
    grammar: `Fix spelling, grammar and punctuation only. Do not change wording or style otherwise. ${only}`,
    hashtags: 'Suggest 3 to 6 hashtags for this post that fit the channel (prefer the ones it already uses and the analytics show working). Answer with the hashtags on one line, separated by spaces, nothing else.',
    headlines: 'Suggest 5 short internal titles (under 70 characters) for this post, one per line, numbered. Nothing else.',
    translate: `Translate this post into ${input.target}, keeping its tone, emoji and line breaks; adapt idioms naturally. ${only}`,
    tone: `Rewrite this post in a ${input.tone} tone, keeping its facts and language. ${only}`,
  };
  const task = tasks[kind];
  return [system(ctx, ''), {role: 'user', content: kind === 'draft' ? task : `${task}\n\nTitle: ${input.title}\n\nPost:\n${input.body}`}];
}

export function plan(ctx: Context, count: number, brief: string): ChatMessage[] {
  const focus = brief.trim() || "what this channel's audience follows it for. Mix useful posts, a story or behind-the-scenes and a question to the audience, all on the channel's own subject.";
  return [
    system(ctx, "You plan content calendars. Base ideas on the channel's subject and on what the analytics show working; vary formats; never repeat a recent post."),
    {role: 'user', content: `Plan the next ${count} posts for this channel. Focus: ${focus}\n`
      + "Every post must be on the channel's subject and read like its own posts. Write each post in full, ready to publish. Return ONLY a JSON array, no prose, like:\n"
      + '[{"title": "short internal title", "category": "one or two words", "body": "the full post text"}]'},
  ];
}

export function review(ctx: Context): ChatMessage[] {
  return [
    system(ctx, 'You explain analytics to busy channel owners.'),
    {role: 'user', content: "Review this channel's analytics. Give: 1) three findings in plain words, 2) what to post more and less of, 3) a posting rhythm for next week with days and times, 4) three post ideas that use what works. Keep it under 300 words. Use short numbered sections and plain text."},
  ];
}

const opt = (v: number | null | undefined, digits = 0) => v === null || v === undefined ? '?' : v.toFixed(digits);
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', {weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'});

export function assistant(ctx: Context, tracked: TrackedSummary[], history: ChatMessage[]): ChatMessage[] {
  const watch = tracked.length ? 'Channels on the user\'s watchlist (competitors/inspiration):\n'
    + tracked.slice(0, 10).map(s => `- ${s.title} @${s.username}: ${opt(s.subscribers)} subscribers, avg views ${opt(s.avgViews, 1)}, ER ${opt(s.er, 1)}%, ${opt(s.postsPerDay, 1)} posts/day`).join('\n') + '\n' : '';
  const c = ctx.channel;
  const scheduled = c ? ctx.posts.filter(p => p.channelId === c.id && p.status === 'scheduled').map(p => `- ${when(p.scheduledAt)} ${p.title}`) : [];
  const queue = scheduled.length ? `Queue:\n${scheduled.join('\n')}` : 'Queue: nothing scheduled.';
  return [system(ctx, `${watch}${queue}\nYou are a helpful assistant in a chat. When you write a post, put it in full, ready to paste.`), ...history.slice(-16)];
}

export function teardown(ctx: Context, title: string, posts: FeedPost[], stats: TrackedStats | null): ChatMessage[] {
  let s = `Channel to analyse: ${title}\n`;
  if (stats) s += `Subscribers ${opt(stats.subscribers)}, avg views ${opt(stats.avgViews, 1)}, ER ${opt(stats.er, 1)}%, posts/day ${opt(stats.postsPerDay, 1)}\n`;
  s += 'Recent posts (views, reactions):\n' + posts.slice(0, 20).map(p => `- [${p.views ?? '?'} views, ${p.reactions} reactions] ${chars(p.text).slice(0, 220).join('').replace(/\n/g, ' ')}`).join('\n') + '\n';
  return [
    system(ctx, 'You analyse other Telegram channels so the user can learn from them.'),
    {role: 'user', content: `${s}\nBreak down this channel: what topics and formats get the most views and reactions, how they write openings, posting rhythm, and 3 concrete ideas my channel could adapt (not copy). Under 300 words, plain text with short numbered sections.`},
  ];
}

export function compare(ctx: Context, tracked: TrackedSummary[]): ChatMessage[] {
  const s = 'Watchlist:\n' + tracked.slice(0, 15).map(t => `- ${t.title} @${t.username}: ${opt(t.subscribers)} subscribers, 7-day change ${opt(t.change7)}, avg views ${opt(t.avgViews, 1)}, ER ${opt(t.er, 1)}%, ${opt(t.postsPerDay, 1)} posts/day`).join('\n') + '\n';
  return [
    system(ctx, 'You compare Telegram channels.'),
    {role: 'user', content: `${s}\nCompare these channels with mine: who is growing and why it might be, which engagement levels are realistic for my size, and 3 moves for me this month. Under 250 words, plain text.`},
  ];
}

/** A title and body from an answer: the first short line becomes the title. */
export function splitTitle(answer: string): {title: string; body: string} {
  const body = answer.trim();
  const first = (body.split('\n').map(l => l.trim()).find(Boolean) ?? '').replace(/[*#"]/g, '');
  return {title: chars(first.trim()).slice(0, 70).join(''), body};
}
