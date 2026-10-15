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
