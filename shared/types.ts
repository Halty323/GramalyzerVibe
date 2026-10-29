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
};
/** POST /api/media – an uploaded picture, video or GIF; GET /api/media/:id serves it. */
export type MediaRef = {id: string; kind: 'photo' | 'video' | 'animation'; name: string};
export type LinkButton = {text: string; url: string};
export type Workspace = { channels: Channel[]; posts: Post[]; demo: boolean; botEnabled: boolean; history: {channelId: string; date: string; subscribers: number}[] };

/** GET /api/channels/:id/insights – what the bot's analysis says about one channel. "lift" multiplies the channel's typical engagement (1 = typical). */
export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export type InsightSlot = { day: Weekday; hour: number; lift: number; support: number };
export type InsightGroup = { key: string; posts: number; lift: number; avgScore: number };
export type ChannelInsights = {
  channelId: string;
  /** ready = enough posts; learning = fewer than 20 usable posts, times and content are empty; not_connected = the bot has no data for this channel. */
  status: 'ready' | 'learning' | 'not_connected';
  generatedAt: string; timezone: string; metric: 'ENGAGEMENT' | 'REACTIONS' | 'COMMENTS'; metricFormula: string; windowDays: number;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH'; notes: ('FEW_POSTS' | 'NO_SIGNAL' | 'LOW_TIME_VARIETY')[];
  counts: {total: number; eligible: number; excluded: number; immature: number}; postsNeeded: number;
  avgReactions: number; avgComments: number;
  bestTimes: InsightSlot[]; experiments: InsightSlot[];
  /** Next real date-time (ISO) of each best slot, earliest first. */
  suggestions: {at: string; day: Weekday; hour: number; lift: number}[];
  days: {day: Weekday; posts: number; lift: number}[]; hours: {hour: number; posts: number; lift: number}[];
  /** [day][hour], day 0 = Monday, channel timezone. */
  heatmap: {lift: number[][]; posts: number[][]};
  /** kinds: TEXT/PHOTO/VIDEO/…; lengths: NONE/SHORT/MEDIUM/LONG/XLONG; links: LINK/NOLINK; topics: hashtags; frequency: "1"/"2"/"3+" posts that day. */
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
  /** er: average views ÷ subscribers, in %; reactionRate: reactions per 100 views. */
  avgViews: number | null; er: number | null; avgReactions: number | null; reactionRate: number | null;
  postsPerDay: number | null; lastPost: string | null;
  kinds: {kind: string; posts: number; avgViews: number | null}[];
  hashtags: {tag: string; posts: number; avgViews: number | null}[];
  /** Posts per hour of day in the requested timezone, and per weekday (Monday first). */
  hours: number[]; days: number[];
  sample: number;
};
/** GET /api/channels/:id/feed – a workspace channel's messages. source: preview = its public t.me page (with views), bot = what the bot collected, workspace = posts sent from here. */
export type ChannelFeed = {channelId: string; source: 'preview' | 'bot' | 'workspace'; posts: FeedPost[]; scheduled: FeedPost[]; stats: TrackedStats | null};
/** A row of GET /api/tracked: a public channel on the website's watchlist. error is an error code from the last failed refresh. */
export type TrackedSummary = {
  username: string; title: string; description: string | null; photoUrl: string | null; verified: boolean;
  subscribers: number | null; change7: number | null; avgViews: number | null; er: number | null; postsPerDay: number | null;
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
/** An invite link made for one promo, over its whole life. stayed: joined through it and haven't left. */
export type PromoLinkStat = {
  id: number; name: string; url: string; cost: number | null; currency: string | null; createdAt: string; revoked: boolean;
  joined: number; left: number; stayed: number; costPerSubscriber: number | null;
};
/** tracking is false until the bot has seen a first join or leave; since is when that was. */
export type ChannelGrowth = {
  connected: boolean; tracking: boolean; since: string | null; days: number; joined: number; left: number; net: number; fromLinks: number;
  daily: GrowthDay[]; gainers: PostEffect[]; losers: PostEffect[]; links: PromoLinkStat[];
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
