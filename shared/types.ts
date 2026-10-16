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
};
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
