import type { Channel, ChannelInsights, CompetitorGap, DraftFactor, FeedPost, GapReport, InsightGroup, InsightSlot, Post, SearchCheck, TrackedStats, TrackedSummary } from '../../shared/types';
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
  /** What the channel's pictures show, as a vision model described them; null when nobody looked. */
  look?: string | null;
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

/** How many of the channel's posts go into a prompt as examples, how much of each, and of all of them together. */
const EXAMPLES = 10;
const EXAMPLE_CHARS = 600;
const EXAMPLE_BUDGET = 3600;

const KIND_NAMES: Record<string, string> = {TEXT: 'text', PHOTO: 'photo', ALBUM: 'album', VIDEO: 'video', ANIMATION: 'GIF', VIDEO_NOTE: 'video message', STICKER: 'sticker', VOICE: 'voice message', AUDIO: 'audio', DOCUMENT: 'file', POLL: 'poll'};
const kindName = (kind: string) => KIND_NAMES[kind] ?? 'other';
/** Posts that are mainly something to look at: a photo, an album, a video, a GIF or a sticker. */
export const isPicture = (p: FeedPost) => ['PHOTO', 'ALBUM', 'VIDEO', 'ANIMATION', 'VIDEO_NOTE', 'STICKER'].includes(p.kind);
/** The channel's own posts: forwards are someone else's style, and an empty text post says nothing. */
export const ownPosts = (feed: FeedPost[]) => feed.filter(p => !p.forwardedFrom && (p.text.trim() || p.kind !== 'TEXT'));
/** The share of the channel's posts that are pictures, 0 to 1. */
export function pictureShare(feed: FeedPost[]): number {
  const own = ownPosts(feed);
  return own.length ? own.filter(isPicture).length / own.length : 0;
}
/** Picture channels: most posts are pictures with a short caption or none. */
const isPictureChannel = (ctx: Context) => ownPosts(ctx.feed).length >= 3 && pictureShare(ctx.feed) >= 0.5;

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

/**
 * The channel's own posts that are worth imitating: the most engaging ones first, then the newest. Picture posts
 * count too, with whatever caption they have: in a channel of pictures they are the style to learn.
 */
function examples(feed: FeedPost[]): FeedPost[] {
  const own = ownPosts(feed);
  const opening = (p: FeedPost) => (p.text.trim().split('\n')[0] ?? '').trim().toLowerCase();
  const out: FeedPost[] = [];
  let budget = EXAMPLE_BUDGET;
  // Recurring formats (a weekly digest, say) would otherwise fill every slot with the same opening.
  const add = (p: FeedPost) => {
    const o = opening(p), cost = Math.min(chars(p.text.trim()).length, EXAMPLE_CHARS) + 30;
    if (out.some(q => q.id === p.id || (o && opening(q) === o)) || (out.length >= 3 && cost > budget)) return;
    out.push(p); budget -= cost;
  };
  for (const p of [...own].sort((a, b) => b.reactions - a.reactions)) {if (out.length >= EXAMPLES / 2) break; add(p);}
  for (const p of own) {if (out.length >= EXAMPLES) break; add(p);}
  return out;
}

/** What the channel posts, in numbers: formats, and for pictures how long their captions are. */
function contentMix(feed: FeedPost[]): string | null {
  const own = ownPosts(feed);
  if (own.length < 3) return null;
  const counts = new Map<string, number>();
  for (const p of own) counts.set(kindName(p.kind), (counts.get(kindName(p.kind)) ?? 0) + 1);
  const pct = (n: number, of = own.length) => Math.round(n * 100 / of);
  let line = `Formats of the last ${own.length} posts: ${[...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ${pct(n)}%`).join(', ')}.`;
  const pictures = own.filter(isPicture);
  if (pictures.length) {
    const captions = pictures.map(p => chars(p.text.trim()).length).filter(n => n > 0).sort((a, b) => a - b);
    line += ` Of the picture posts, ${pct(pictures.length - captions.length, pictures.length)}% have no caption`;
    line += captions.length ? `; captions are typically about ${captions[Math.floor(captions.length / 2)]} characters.` : '.';
  }
  return line;
}

/** One post as an example: what it is, how it did, and its text. */
function example(p: FeedPost, n: number): string[] {
  const text = p.text.trim();
  return [`[${n}] ${kindName(p.kind)}, ${p.reactions} reactions`, text ? clip(text, EXAMPLE_CHARS) : '(no caption)', ''];
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
      shown.forEach((p, i) => lines.push(...example(p, i + 1)));
    } else {
      // Nothing from Telegram yet: the posts written in the workspace are the next best thing.
      const published = mine.filter(p => p.status === 'published').slice(0, EXAMPLES);
      if (published.length) {
        lines.push('', 'Posts from this channel, to learn its subject, voice and formatting:');
        published.forEach((p, i) => lines.push(`[${i + 1}] ${p.title}`, clip(p.body, EXAMPLE_CHARS), ''));
      }
    }
    const mix = contentMix(ctx.feed);
    if (mix) lines.push(mix);
    const style = houseStyle(ctx.feed);
    if (style) lines.push(style);
    if (ctx.look?.trim()) lines.push('', 'What the channel\'s pictures show (from looking at recent ones):', ctx.look.trim(), '');
    const planned = mine.filter(p => p.status !== 'published').map(p => p.title.trim()).filter(Boolean).slice(0, 8);
    if (planned.length) lines.push(`Already drafted or scheduled (do not repeat): ${planned.join('; ')}`);
  }
  const i = ctx.insights;
  if (i?.status === 'ready') {
    lines.push('', `Analytics (lift vs. the channel's posts around the same time, 1.0 = typical; 90% range in brackets; a range that includes 1.0 means "can't tell yet"; sponsored posts left out; timezone ${i.timezone}):`);
    const slot = (t: InsightSlot) => t.span > 1 ? `${String(t.from).padStart(2, '0')}:00–${String((t.from + t.span) % 24).padStart(2, '0')}:00` : `${String(t.hour).padStart(2, '0')}:00`;
    const times = i.bestTimes.slice(0, 3).map(t => `${dayName(t.day)} ${slot(t)} (${t.lift.toFixed(1)}×)`);
    if (times.length) lines.push(`- Best times: ${times.join(', ')}`);
    const groups = (g: InsightGroup[]) => g.slice(0, 5).map(x => `${x.key} ${x.lift.toFixed(1)}× (${x.low.toFixed(1)}–${x.high.toFixed(1)})`).join(', ');
    if (i.content.kinds.length) lines.push(`- Formats: ${groups(i.content.kinds)}`);
    if (i.content.lengths.length) lines.push(`- Length (SHORT ≤120 chars, MEDIUM 121–400, LONG 401–800, XLONG 800+): ${groups(i.content.lengths)}`);
    if (i.content.topics.length) lines.push(`- Topics (by hashtag; the subject matters, adding a hashtag doesn't): ${groups(i.content.topics)}`);
    if (i.content.frequency.length) lines.push(`- Posts per day (the day's total vs. a one-post day): ${groups(i.content.frequency)}`);
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

const PICTURES = "Most of this channel's posts are pictures with a short caption or none: the picture carries the post. "
  + 'Gramalyzer sends only the text, so write what goes with a picture: as short as the channel\'s captions, in their voice, '
  + 'about the kind of thing its pictures show. Never turn that into a long text post the channel would not publish.';

function system(ctx: Context, extra: string): ChatMessage {
  const c = ctx.channel;
  const hasPosts = ctx.feed.length > 0 || !!c && ctx.posts.some(p => p.channelId === c.id && p.status === 'published');
  const language = ctx.languageFromPosts && hasPosts
    ? "Write in the language the channel's posts are written in, unless asked otherwise."
    : `Write in ${ctx.language} unless asked otherwise.`;
  const fit = c ? (isPictureChannel(ctx) ? `${FIT}\n${PICTURES}` : FIT) : '';
  return {role: 'system', content: `${ROLE}\n\n${describe(ctx)}\n${fit}\n${language}\n${extra}`};
}

export const TONES = ['friendly', 'expert', 'bold', 'playful', 'formal', 'inspiring'] as const;

/** Marks the line where a draft for a picture channel says what picture to attach. */
export const PICTURE_MARK = '🖼';

export function rewrite(ctx: Context, kind: Rewrite, input: {title: string; body: string; brief: string; tone: string; target: string}): ChatMessage[] {
  const only = 'Answer with the post text only: no preface, no quotes around it, no explanation.';
  const draft = isPictureChannel(ctx)
    ? `Write a new post for this channel from the brief below: the caption, as short as the channel's captions and in their voice, then on a last line starting with "${PICTURE_MARK} " what picture to attach, in a few words. No preface, no quotes, no explanation.`
    : `Write a new Telegram post for this channel from the brief below, on the channel's subject and in the style of its posts. Open with a strong first line (it is what shows in the chat list), keep paragraphs short, end with a natural call to action or question. ${only}`;
  const tasks: Record<Rewrite, string> = {
    draft: `${draft}\n\nBrief: ${input.brief}`,
    improve: `Edit this post to make it clearer, tighter and more engaging, keeping its meaning, facts and language. ${only}`,
    shorten: `Cut this post to about half its length without losing the key point. ${only}`,
    expand: `Expand this post with useful specifics, an example or a short list, staying under 1500 characters. ${only}`,
    hook: `Rewrite only the opening (first one or two lines) so it makes people stop scrolling, then keep the rest of the post as it is. ${only}`,
    grammar: `Fix spelling, grammar and punctuation only. Do not change wording or style otherwise. ${only}`,
    hashtags: 'Suggest 1 to 3 hashtags that label this post\'s subject, so readers can find similar posts in the channel. Prefer the ones it already uses; Telegram has no hashtag feed, so they don\'t bring new readers. Answer with the hashtags on one line, separated by spaces, nothing else.',
    headlines: 'Suggest 5 short internal titles (under 70 characters) for this post, one per line, numbered. Nothing else.',
    translate: `Translate this post into ${input.target}, keeping its tone, emoji and line breaks; adapt idioms naturally. ${only}`,
    tone: `Rewrite this post in a ${input.tone} tone, keeping its facts and language. ${only}`,
  };
  const task = tasks[kind];
  return [system(ctx, ''), {role: 'user', content: kind === 'draft' ? task : `${task}\n\nTitle: ${input.title}\n\nPost:\n${input.body}`}];
}

export function plan(ctx: Context, count: number, brief: string): ChatMessage[] {
  const focus = brief.trim() || "what this channel's audience follows it for. Mix useful posts, a story or behind-the-scenes and a question to the audience, all on the channel's own subject.";
  const pictures = isPictureChannel(ctx);
  return [
    system(ctx, "You plan content calendars. Base ideas on the channel's subject and on what the analytics show working; vary formats; never repeat a recent post."),
    {role: 'user', content: `Plan the next ${count} posts for this channel. Focus: ${focus}\n`
      + (pictures
        ? "Every post must be on the channel's subject and look like its own posts: a picture and its caption. Write each caption in full, as short as the channel's. Return ONLY a JSON array, no prose, like:\n"
          + '[{"title": "short internal title", "picture": "what the picture should show", "category": "one or two words", "body": "the caption"}]'
        : "Every post must be on the channel's subject and read like its own posts. Write each post in full, ready to publish. Return ONLY a JSON array, no prose, like:\n"
          + '[{"title": "short internal title", "category": "one or two words", "body": "the full post text"}]')},
  ];
}

export function review(ctx: Context): ChatMessage[] {
  return [
    system(ctx, 'You explain analytics to busy channel owners.'),
    {role: 'user', content: "Review this channel's analytics. Give: 1) three findings in plain words, only ones whose range is clearly above or below 1.0, and say when the data can't tell yet, 2) what to post more and less of, 3) a posting rhythm for next week with days and times (as tests to compare, not rules), 4) three post ideas that use what works. Don't recommend hashtags for reach or generic best times; Telegram shows posts to subscribers in order, so what matters is what this channel's readers respond to. Keep it under 300 words. Use short numbered sections and plain text."},
  ];
}

const opt = (v: number | null | undefined, digits = 0) => v === null || v === undefined ? '?' : v.toFixed(digits);
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', {weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'});

export function assistant(ctx: Context, tracked: TrackedSummary[], history: ChatMessage[]): ChatMessage[] {
  const watch = tracked.length ? 'Channels on the user\'s watchlist (competitors/inspiration):\n'
    + tracked.slice(0, 10).map(s => `- ${s.title} @${s.username}: ${opt(s.subscribers)} subscribers, avg views ${opt(s.avgViews, 1)}, reach (views ÷ subscribers) ${opt(s.err, 1)}%, ${opt(s.postsPerDay, 1)} posts/day`).join('\n') + '\n' : '';
  const c = ctx.channel;
  const scheduled = c ? ctx.posts.filter(p => p.channelId === c.id && p.status === 'scheduled').map(p => `- ${when(p.scheduledAt)} ${p.title}`) : [];
  const queue = scheduled.length ? `Queue:\n${scheduled.join('\n')}` : 'Queue: nothing scheduled.';
  const pictures = isPictureChannel(ctx) ? ` This channel posts pictures: when you suggest a post, write its caption and say what picture goes with it on a separate line starting with "${PICTURE_MARK} ".` : '';
  return [system(ctx, `${watch}${queue}\nYou are a helpful assistant in a chat. When you write a post, put it in full, ready to paste.${pictures}`), ...history.slice(-16)];
}

export function teardown(ctx: Context, title: string, posts: FeedPost[], stats: TrackedStats | null): ChatMessage[] {
  let s = `Channel to analyse: ${title}\n`;
  if (stats) s += `Subscribers ${opt(stats.subscribers)}, avg views ${opt(stats.avgViews, 1)}, reach (views ÷ subscribers) ${opt(stats.err, 1)}%, reactions per 100 views ${opt(stats.reactionRate, 2)}, posts/day ${opt(stats.postsPerDay, 1)}\n`;
  s += 'Recent posts (format, views, reactions):\n' + posts.slice(0, 20).map(p => `- [${kindName(p.kind)}, ${p.views ?? '?'} views, ${p.reactions} reactions] ${chars(p.text).slice(0, 220).join('').replace(/\n/g, ' ') || '(no caption)'}`).join('\n') + '\n';
  return [
    system(ctx, 'You analyse other Telegram channels so the user can learn from them.'),
    {role: 'user', content: `${s}\nBreak down this channel: what topics and formats get the most views and reactions (with 20 posts that's a hint, not proof; skip sponsored posts), how they write openings, posting rhythm, and 3 concrete ideas my channel could adapt (not copy). Under 300 words, plain text with short numbered sections.`},
  ];
}

export function compare(ctx: Context, tracked: TrackedSummary[]): ChatMessage[] {
  const s = 'Watchlist:\n' + tracked.slice(0, 15).map(t => `- ${t.title} @${t.username}: ${opt(t.subscribers)} subscribers, 7-day change ${opt(t.change7)}, avg views ${opt(t.avgViews, 1)}, reach (views ÷ subscribers) ${opt(t.err, 1)}%, ${opt(t.postsPerDay, 1)} posts/day`).join('\n') + '\n';
  return [
    system(ctx, 'You compare Telegram channels.'),
    {role: 'user', content: `${s}\nCompare these channels with mine: who is growing and what might explain it (say it's a guess: these numbers can't show causes), what reach is realistic for my size (reach usually falls as channels grow), and 3 moves for me this month. Under 250 words, plain text.`},
  ];
}

function gapLine(g: CompetitorGap): string {
  const what = g.dimension === 'FORMAT' ? `format ${kindName(g.key)}` : g.dimension === 'HOURS' ? `posting between ${g.key}:00 and ${(Number(g.key) + 4) % 24}:00`
    : g.dimension === 'LENGTH' ? `length ${g.key} (SHORT ≤120 chars, MEDIUM 121–400, LONG 401–800, XLONG 800+)` : `topic "${g.key}"`;
  const you = g.yourPosts === 0 ? 'I never do this' : g.missing ? `${Math.round(g.yourShare * 100)}% of my posts` : `my lift ${opt(g.yourLift, 2)}`;
  const example = g.example?.preview ? `; their best: "${g.example.preview}" (@${g.example.channel})` : '';
  return `- ${what}: their lift ${g.theirLift.toFixed(2)} in ${Math.round(g.theirShare * 100)}% of their posts; ${you}${example}`;
}

export function gaps(ctx: Context, report: GapReport): ChatMessage[] {
  const rivals = report.rivals.map(r => `- ${r.title} @${r.username}: ${opt(r.subscribers)} subscribers, avg views ${opt(r.avgViews)}, ${opt(r.postsPerDay, 1)} posts/day, mostly ${r.topFormat ? kindName(r.topFormat) : '?'}`).join('\n');
  const s = `Competitors on my watchlist:\n${rivals}\n\nWhere they win (lift = a post's views a day after posting over the posts around it on its own channel, 1.0 = typical; sponsored posts left out):\n${report.gaps.map(gapLine).join('\n') || '- nothing clear'}\n`
    + (report.edges.length ? `\nWhere I'm ahead:\n${report.edges.map(g => `- ${g.dimension} ${g.key}: my lift ${opt(g.yourLift, 2)}`).join('\n')}\n` : '');
  return [
    system(ctx, 'You compare a Telegram channel with its competitors and turn the gaps into a plan.'),
    {role: 'user', content: `${s}\nExplain these gaps in plain words: what my competitors do that works for them and I skip (it may not transfer to my audience, so suggest testing rather than switching), which 3 gaps are worth closing first for my channel, and how (one concrete post idea for each, adapted to my voice, not copied). End with one strength I should keep. Under 280 words, plain text with short numbered sections.`},
  ];
}

export function searchFix(ctx: Context, check: SearchCheck): ChatMessage[] {
  const issues = check.checks.filter(c => c.status !== 'OK').map(c => `- ${c.group === 'find' ? 'findability' : 'convincing'}: ${c.id}${c.words.length ? ` (${c.words.join(', ')})` : ''}`).join('\n');
  const words = check.keywords.map(k => `${k.word} (${k.posts} posts)`).join(', ');
  const s = `Current title: ${check.title}\nUsername: ${check.username ? '@' + check.username : 'none, the channel is private'}\nDescription: ${check.description || '(empty)'}\n`
    + `Search score ${check.score}/100 (can people find it ${check.find}/60, will they join ${check.join}/40). Issues:\n${issues || '- none'}\nWords the channel's posts are about: ${words || 'unknown'}\n`;
  return [
    system(ctx, 'You make Telegram channels easier to find in Telegram search. What is known: only public channels appear; results match the words people type against the title and username; Telegram ranks by genuine subscribers (Premium ones count more) and favours the searcher\'s country, and wording can\'t change that. Whether search reads the description is not known, so treat the description as what convinces people to join.'),
    {role: 'user', content: `${s}\nSuggest: 1) three better titles (under 32 characters, keep the channel's name recognisable, include the word people would search for, at most one emoji), 2) three usernames (Latin letters, digits and underscores, 5–32 characters, readable, no trailing numbers; say to check they're free), 3) a description under 255 characters: first line says what the channel gives the reader, then the topics using the channel's words, then how often it posts. Write titles and the description in the language of the channel's posts. Plain text with numbered sections.`},
  ];
}

const LENGTHS: Record<string, string> = {NONE: 'no text', SHORT: 'up to 120 characters', MEDIUM: '121 to 400 characters', LONG: '401 to 800 characters', XLONG: 'over 800 characters'};

/** The draft-score factors the text itself can fix: length and link. Hashtags are never advice: adding one doesn't bring readers. */
export const fixable = (factors: DraftFactor[]) => factors.filter(f => f.weak && f.bestKey && ['LENGTH', 'LINK'].includes(f.dimension));

/** Rewrites a draft so its weak spots match what has worked on the channel, keeping everything else. */
export function fixDraft(ctx: Context, body: string, factors: DraftFactor[]): ChatMessage[] {
  const steps = fixable(factors).map(f => {
    const lift = `${f.bestLift}× a typical post here, against ${f.lift}× now`;
    switch (f.dimension) {
      case 'LENGTH': return `- Make it ${LENGTHS[f.bestKey!] ?? f.bestKey} long (${lift}). Cut filler or add one useful specific; keep the point.`;
      case 'LINK': return f.bestKey === 'LINK'
        ? `- Posts with a link do better here (${lift}). Add one natural call to action with a link; if the right URL isn't in the post, write [link] where it goes.`
        : `- Posts without links do better here (${lift}). Remove the links and keep what they pointed to in a sentence.`;
      default: return '';
    }
  }).filter(Boolean).join('\n');
  return [
    system(ctx, 'You edit Telegram drafts so they match what has worked on this channel.'),
    {role: 'user', content: `Change this draft as follows, and nothing else: same language, voice, facts and emoji.\n${steps}\n\nAnswer with the post text only: no preface, no quotes around it, no explanation.\n\nDraft:\n${body}`},
  ];
}

/** A draft and the picture it asks for: the lines marked 🖼 come out of the text. */
export function splitPicture(answer: string): {text: string; picture: string} {
  const lines = answer.trim().split('\n');
  const marked = lines.filter(l => l.trim().startsWith(PICTURE_MARK));
  return {text: lines.filter(l => !l.trim().startsWith(PICTURE_MARK)).join('\n').trim(), picture: marked.map(l => l.trim().slice(PICTURE_MARK.length).replace(/^[\s\uFE0F:：-]+/, '').trim()).filter(Boolean).join('; ')};
}

/** A title and body from an answer: the first short line becomes the title, or the picture it asks for. */
export function splitTitle(answer: string): {title: string; body: string} {
  const {text, picture} = splitPicture(answer);
  const first = (text.split('\n').map(l => l.trim()).find(Boolean) ?? '').replace(/[*#"]/g, '');
  return {title: chars(picture ? `${PICTURE_MARK} ${picture}` : first.trim()).slice(0, 70).join(''), body: text};
}
