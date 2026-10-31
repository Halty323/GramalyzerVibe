export type Channel = {
  id: string; name: string; handle: string; initials: string; color: string;
  subscribers: number; growth: number; views: number; engagement: number;
  description: string; paused: boolean; timezone: string; notifications: boolean;
  autoDelete: boolean; signature: string;
  telegramChatId?: number | null;
};
export type Post = {
  id: string; channelId: string; title: string; body: string;
  status: 'published' | 'scheduled' | 'draft'; scheduledAt: string;
  views: number; reactions: number; shares: number; category: string;
  deliveryState?: 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain';
  telegramMessageId?: number | null; deliveryError?: string | null;
  /** Up to 10 uploaded files (2+ go out as an album), link buttons (not on albums), sent without sound, pinned once sent. */
  media?: MediaRef[]; buttons?: LinkButton[]; silent?: boolean; pin?: boolean;
  /** An evergreen repost: the channel's own earlier message ids (an album's parts), copied as they were. */
  repostOf?: number[];
};
/** POST /api/media – an uploaded picture, video or GIF; GET /api/media/:id serves it. */
export type MediaRef = {id: string; kind: 'photo' | 'video' | 'animation'; name: string};
export type LinkButton = {text: string; url: string};
/** The server's "bring every channel up to date" pass (/api/refresh), run when the server, the website or Studio opens or closes. */
export type RefreshRun = { reason: string; startedAt: string; finishedAt: string | null; channels: number; refreshed: number; failed: number; left: number };
export type RefreshStatus = { running: boolean; current: RefreshRun | null; last: RefreshRun | null };
export type Workspace = { channels: Channel[]; posts: Post[]; demo: boolean; botEnabled: boolean; history: {channelId: string; date: string; subscribers: number}[] };

/**
 * GET /api/channels/:id/insights – what the bot's analysis says about one channel. "lift" multiplies what was usual
 * for the channel around each post (1 = typical): posts are compared with their neighbours, so growth or a slump isn't
 * credited to a format or a time. Sponsored posts are left out.
 */
export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
/** from/span: the hours the slot covers; channels under 100 posts get 4-hour blocks (span 4), bigger ones single hours. */
export type InsightSlot = { day: Weekday; hour: number; lift: number; support: number; from: number; span: number };
/** low–high: the 90% range of lift; a range that crosses 1 means the data can't tell yet. */
export type InsightGroup = { key: string; posts: number; lift: number; avgScore: number; low: number; high: number };
/** Whether the channel's post model predicted its newest posts: proven, unproven, or untested (too few posts). */
export type ModelCheck = {status: 'proven' | 'unproven' | 'untested'; rho: number | null; tested: number};
export type InsightMetric = 'AUTO' | 'ENGAGEMENT' | 'REACTIONS' | 'COMMENTS' | 'VIEWS';
export type ChannelInsights = {
  channelId: string;
  /** ready = enough posts; learning = fewer than 20 usable posts, times and content are empty; not_connected = the bot has no data for this channel. */
  status: 'ready' | 'learning' | 'not_connected';
  generatedAt: string; timezone: string; metric: InsightMetric; metricFormula: string; windowDays: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH'; notes: ('FEW_POSTS' | 'NO_SIGNAL' | 'LOW_TIME_VARIETY')[];
  /** ads: of excluded, how many were sponsored posts. */
  counts: {total: number; eligible: number; excluded: number; immature: number; ads: number}; check: ModelCheck; postsNeeded: number;
  avgReactions: number; avgComments: number;
  bestTimes: InsightSlot[]; experiments: InsightSlot[];
  /** Next real date-time (ISO) of each best slot, earliest first. */
  suggestions: {at: string; day: Weekday; hour: number; lift: number}[];
  days: {day: Weekday; posts: number; lift: number}[]; hours: {hour: number; posts: number; lift: number}[];
  /** [day][hour], day 0 = Monday, channel timezone. */
  heatmap: {lift: number[][]; posts: number[][]};
  /** kinds: TEXT/PHOTO/VIDEO/…; lengths: NONE/SHORT/MEDIUM/LONG/XLONG; links: LINK/NOLINK; topics: hashtags; frequency: days with "1"/"2"/"3+" posts, the day's total against a one-post day. */
  content: {kinds: InsightGroup[]; lengths: InsightGroup[]; links: InsightGroup[]; topics: InsightGroup[]; keywords: InsightGroup[]; frequency: InsightGroup[]};
  cadence: {postsPerWeek: number; mostPostedDay: Weekday | null; bestDay: Weekday | null; longestGapDays: number; lastPost: string | null};
  topPosts: {messageId: number; postedAt: string; kind: string; preview: string; reactions: number; comments: number; score: number; url: string | null}[];
  audience: {current: number | null; change: number | null; days: number; series: number[]};
};

/** One message in the channel viewer. views is null when the source can't see them (the Bot API never reports views). */
/**
 * A photo, or a video's thumbnail, with its place in the album as Telegram lays it out: x and w from 0 to 1 of the
 * album's width, y and h in the same unit (a square picture as wide as the album has h 1). All null when unknown.
 */
export type FeedMedia = {url: string; video: boolean; x: number | null; y: number | null; w: number | null; h: number | null};
export type FeedPost = {
  id: string; messageId: number | null; postedAt: string; kind: string; text: string;
  views: number | null; reactions: number; reactionList: {emoji: string; count: number}[];
  /** mediaUrl: the first picture (also a link preview's or a sticker); media: every photo and video, empty when the source has no pictures. */
  comments: number | null; mediaUrl: string | null; media?: FeedMedia[]; url: string | null; forwardedFrom: string | null;
  edited: boolean; status: 'published' | 'scheduled';
};
/** Statistics of a public channel, from the posts its t.me preview shows and the daily snapshots taken while tracked. */
export type TrackedStats = {
  subscribers: number | null; change7: number | null; change30: number | null;
  series: {day: string; subscribers: number | null; avgViews: number | null}[];
  /**
   * err: reach, views ÷ subscribers in % (TGStat's ERR), from views a day after posting (errBasis "24h") or, until
   * enough posts have those, the latest views ("latest"). reactionRate: ER, reactions per 100 views.
   */
  avgViews: number | null; err: number | null; errBasis: '24h' | 'latest' | null; avgReactions: number | null; reactionRate: number | null;
  postsPerDay: number | null; lastPost: string | null;
  kinds: {kind: string; posts: number; avgViews: number | null}[];
  hashtags: {tag: string; posts: number; avgViews: number | null}[];
  /** Posts per hour of day in the requested timezone, and per weekday (Monday first). */
  hours: number[]; days: number[];
  sample: number;
  /** Hints worth checking before buying a placement, not proof: LOW_REACH, FLAT_VIEWS, SUBSCRIBER_JUMP. */
  flags: ('LOW_REACH' | 'FLAT_VIEWS' | 'SUBSCRIBER_JUMP')[];
};
/** GET /api/channels/:id/feed – a workspace channel's messages. source: preview = its public t.me page (with views), bot = what the bot collected, workspace = posts sent from here. */
export type ChannelFeed = {channelId: string; source: 'preview' | 'bot' | 'workspace'; posts: FeedPost[]; scheduled: FeedPost[]; stats: TrackedStats | null};
/** A row of GET /api/tracked: a public channel on the website's watchlist. error is an error code from the last failed refresh. */
export type TrackedSummary = {
  username: string; title: string; description: string | null; photoUrl: string | null; verified: boolean;
  subscribers: number | null; change7: number | null; avgViews: number | null; err: number | null; postsPerDay: number | null;
  lastPost: string | null; fetchedAt: string | null; error: TrackingError | null; demo: boolean; tracked: boolean;
  /** Daily subscriber counts while tracked, oldest first (at most 30). */
  series: number[]; url: string | null;
};
/** GET /api/tracked/:username – any public channel, tracked or not. */
export type TrackedDetail = {channel: TrackedSummary; counters: {photos?: number; videos?: number; files?: number; links?: number}; stats: TrackedStats; top: FeedPost[]; posts: FeedPost[]};
/** The "code" of an /api/tracked error response. */
export type TrackingError = 'invalid_username' | 'private_link' | 'not_found' | 'not_channel' | 'unreachable' | 'limit' | 'not_tracked';
/** GET /api/channels/:id/growth – who joined and left an own channel, after which post, and through which promo link. */
export type GrowthDay = {date: string; joined: number; left: number};
/** What happened while a post was the newest (up to 24 h, hours long); joins through promo links aren't counted here. */
export type PostEffect = {messageId: number; postedAt: string; kind: string; preview: string; joined: number; left: number; hours: number; url: string | null};
/**
 * An invite link made for one promo, over its whole life. stayed: joined through it and haven't left. kept7/kept30:
 * the share still there 7 and 30 days after joining, of those who joined that long ago (null until anyone has).
 */
export type PromoLinkStat = {
  id: number; name: string; url: string; cost: number | null; currency: string | null; createdAt: string; revoked: boolean;
  joined: number; left: number; stayed: number; costPerSubscriber: number | null; kept7: number | null; kept30: number | null;
};
/** Organic joins and leaves per post of one format, while each was the newest. */
export type FormatEffect = {kind: string; posts: number; joined: number; left: number};
/** Another channel (among those anyone watches) that forwarded or mentioned this one in the last 60 days. */
export type Citation = {username: string; title: string; subscribers: number | null; forwards: number; mentions: number; last: string; url: string | null};
/** tracking is false until the bot has seen a first join or leave; since is when that was. */
export type ChannelGrowth = {
  connected: boolean; tracking: boolean; since: string | null; days: number; joined: number; left: number; net: number; fromLinks: number;
  daily: GrowthDay[]; gainers: PostEffect[]; losers: PostEffect[]; links: PromoLinkStat[]; formats: FormatEffect[]; citations: Citation[];
};
/** GET /api/channels/:id/cross-promo – a channel's cross-promo profile, partners that fit and swaps. profile is null until it joins. */
export type SwapProfile = {topic: string; language: string; pitch: string | null; enabled: boolean};
/** A possible partner; score is 0–100. Its username and owner stay hidden until a swap is accepted. */
export type SwapMatch = {channelId: number; title: string; topic: string; language: string; pitch: string | null; subscribers: number | null; engagement: number | null; score: number};
export type SwapStatus = 'REQUESTED' | 'ACTIVE' | 'DECLINED' | 'CANCELLED' | 'DONE';
/** A swap from this channel's side: mine is the link here that the partner posts, theirs the partner's link that this channel posts. */
export type SwapView = {
  id: number; status: SwapStatus; outgoing: boolean; partnerId: number; partnerTitle: string; partnerTopic: string | null;
  partnerSubscribers: number | null; partnerPitch: string | null; partnerUrl: string | null; partnerContact: string | null;
  createdAt: string; respondedAt: string | null; mine: PromoLinkStat | null; theirs: PromoLinkStat | null;
};
export type CrossPromo = {connected: boolean; profile: SwapProfile | null; topics: string[]; languages: string[]; matches: SwapMatch[]; swaps: SwapView[]};
/** GET /api/channels/:id/views – how fast an own channel's posts gather views (public channels only: views come from the web preview). */
export type ViewPace = {h1: number | null; h6: number | null; h24: number | null};
/** status: early (under an hour old), lag, fast, normal, or unknown (no reading yet). ratio: views at the latest mark over the usual. */
export type PostSpeed = {
  messageId: number; postedAt: string; kind: string; preview: string; url: string | null; views: number | null;
  h1: number | null; h6: number | null; h24: number | null; status: 'early' | 'lag' | 'fast' | 'normal' | 'unknown'; ratio: number | null;
};
export type ViewSpeed = {connected: boolean; available: boolean; usual: ViewPace; posts: PostSpeed[]};
/** Where watched channels win and an own channel doesn't. Lifts are against each channel's neighbouring posts (1.0 = typical), views a day after posting, sponsored posts left out. */
export type GapDimension = 'FORMAT' | 'HOURS' | 'LENGTH' | 'TOPIC';
export type CompetitorGap = {
  dimension: GapDimension; key: string; missing: boolean; theirLift: number; yourLift: number | null; theirShare: number; yourShare: number;
  theirPosts: number; yourPosts: number; channels: number; example: {channel: string; preview: string; url: string | null; lift: number} | null;
};
export type GapRival = {username: string; title: string; subscribers: number | null; avgViews: number | null; err: number | null; postsPerDay: number | null; topFormat: string | null; posts: number};
export type GapReport = {
  status: 'no_competitors' | 'learning' | 'ready'; measure: 'VIEWS' | 'ENGAGEMENT';
  you: {title: string; subscribers: number | null; postsPerDay: number | null; topFormat: string | null; posts: number};
  rivals: GapRival[]; gaps: CompetitorGap[]; edges: CompetitorGap[]; theirPosts: number; yourPosts: number;
};
export type CompetitorGaps = {connected: boolean; report: GapReport | null};
/**
 * How findable a channel is in Telegram's search. Check ids match the sc.check.* translation keys; group "find" checks
 * decide whether search can show the channel (out of 60 points), "join" ones whether people open it (out of 40).
 * notes: facts about ranking no wording changes (sc.note.*). positions: where the owner found the channel themselves.
 */
export type SearchCheckStatus = 'OK' | 'WARN' | 'BAD';
export type SearchPosition = {word: string; position: number | null; checkedAt: string; previous: number | null};
export type SearchCheck = {
  score: number; grade: 'good' | 'fair' | 'poor'; find: number; join: number;
  checks: {id: string; group: 'find' | 'join'; status: SearchCheckStatus; points: number; max: number; words: string[]}[];
  keywords: {word: string; posts: number; inTitle: boolean; inDescription: boolean}[];
  titleIdeas: string[]; usernameIdeas: string[]; title: string; username: string | null; description: string; postsRead: number;
  notes: string[]; positions: SearchPosition[];
};
/**
 * POST /api/channels/:id/draft-score – a draft against what worked on the channel. Lifts: 1.0 = a typical post.
 * Format, length, link and time are fitted together, so traits that travel together aren't counted twice.
 */
export type DraftDimension = 'FORMAT' | 'LENGTH' | 'LINK' | 'TIME' | 'TOPIC' | 'KEYWORDS';
/**
 * key: what the draft has (a kind, a length bucket, LINK/NOLINK, the first hour of a 4-hour block, hashtags, words);
 * low–high: the 90% range of lift; bestKey: the channel's clearly better choice; counted: false for topics and words,
 * which are shown for context only (adding a hashtag doesn't bring the readers its subject does).
 */
export type DraftFactor = {dimension: DraftDimension; key: string; lift: number; low: number; high: number; bestKey: string | null; bestLift: number | null; weak: boolean; counted: boolean};
/** ready: the score predicted the channel's newest posts, so it's shown; unproven: factors only; learning: too few posts. */
export type DraftResult = {status: 'learning' | 'ready' | 'unproven'; score: number; expected: number; potential: number; low: number; high: number; factors: DraftFactor[]; postsRead: number; check: ModelCheck};
/** guess: the channel has too few posts to know its best times, so this is a time to try (rotating, not a known best). */
export type FreeSlot = {at: string; lift: number; guess: boolean};
export type DraftScore = {connected: boolean; score: DraftResult | null; slots: FreeSlot[]};
export type SlotAssignment = {postId: string; title: string; at: string; lift: number};
/** GET /api/channels/:id/evergreen – best posts from 3+ months ago; queuedAt is set when a repost is already queued. */
export type EvergreenPost = {messageId: number; postedAt: string; kind: string; preview: string; url: string | null; lift: number; queuedAt: string | null};
export type Evergreen = {connected: boolean; posts: EvergreenPost[]};
