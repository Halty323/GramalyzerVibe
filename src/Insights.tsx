import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, ChartNoAxesCombined, Clock3, ExternalLink, FlaskConical, LoaderCircle, Radio, Sparkles, TrendingUp } from 'lucide-react';
import type { Channel, ChannelInsights, InsightGroup, Weekday } from '../shared/types';

const DAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const dayName = (d: Weekday) => d[0] + d.slice(1).toLowerCase();
const dayShort = (d: Weekday) => dayName(d).slice(0, 3);
const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;
const hourRange = (h: number) => `${hour(h)}–${hour((h + 1) % 24)}`;
const lift = (x: number) => `${x.toFixed(1)}×`;
const tone = (x: number) => x >= 1.05 ? 'up' : x <= 0.95 ? 'down' : 'flat';
const KINDS: Record<string, string> = {TEXT: 'Text', PHOTO: 'Photo', VIDEO: 'Video', ANIMATION: 'GIF', AUDIO: 'Audio', VOICE: 'Voice', VIDEO_NOTE: 'Video note', DOCUMENT: 'File', POLL: 'Poll', ALBUM: 'Album', STICKER: 'Sticker', OTHER: 'Other'};
const LENGTHS: Record<string, string> = {NONE: 'No text', SHORT: 'Short (≤120 chars)', MEDIUM: 'Medium (121–400)', LONG: 'Long (401–800)', XLONG: 'Very long (800+)'};
const CONFIDENCE = {LOW: 'Early data — treat as a hint', MEDIUM: 'Decent data', HIGH: 'Solid data'} as const;

/** Best times and content signals from the bot's analysis of one channel. */
export function InsightsPage({channel, showingFirst, fetchInsights, onPlan}: {channel: Channel; showingFirst: boolean; fetchInsights: (id: string) => Promise<ChannelInsights>; onPlan: (at: string) => void}) {
  const [data, setData] = useState<ChannelInsights | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(null); setError('');
    fetchInsights(channel.id).then(d => {if (live) setData(d);}).catch(e => {if (live) setError((e as Error).message);});
    return () => {live = false;};
  }, [channel.id, fetchInsights]);

  const scope = showingFirst && <p className="ins-scope">Showing <strong>{channel.name}</strong>. Pick another channel in the filter above.</p>;
  if (error) return <>{scope}<div className="error-banner" role="alert">{error}</div></>;
  if (!data) return <>{scope}<section className="panel ins-empty"><LoaderCircle className="spin"/><p>Reading the analysis for {channel.name}…</p></section></>;
  if (data.status === 'not_connected') return <>{scope}<section className="notice connect-notice"><Radio size={20}/><div><strong>The bot isn’t collecting data for {channel.name} yet</strong><p>Add the bot to the channel as an administrator, or connect the channel from a private chat with the bot. Collection starts then. To use earlier posts, the channel owner can import a Telegram Desktop export with /import in the bot.</p></div></section></>;
  if (data.status === 'learning') return <>{scope}<section className="panel ins-learning"><div className="panel-heading"><div><div className="mini-eyebrow"><Sparkles size={13}/>STILL LEARNING</div><h2>{data.postsNeeded} more {data.postsNeeded === 1 ? 'post' : 'posts'} until the first recommendations</h2><p>{data.counts.eligible} usable posts so far{data.counts.immature ? ` · ${data.counts.immature} newer than a day (reactions still coming in)` : ''}{data.counts.excluded ? ` · ${data.counts.excluded} excluded` : ''}.</p></div></div><div className="ins-progress" role="progressbar" aria-valuemin={0} aria-valuemax={20} aria-valuenow={data.counts.eligible}><span style={{width: `${Math.min(100, data.counts.eligible / (data.counts.eligible + data.postsNeeded) * 100)}%`}}/></div></section></>;

  const maxCell = Math.max(1, ...data.heatmap.lift.flat());
  const winners = data.content.topics.filter(g => g.lift >= 1.1).slice(0, 3);
  const losers = data.content.topics.filter(g => g.lift <= 0.8).slice(-2).reverse();
  return <>
    {scope}
    <div className="ins-grid">
      <section className="panel ins-times">
        <div className="panel-heading"><div><div className="mini-eyebrow"><Clock3 size={13}/>WHEN TO POST</div><h2>Best times <span className="subtle-badge">{data.timezone}</span></h2><p>Weekday and hour in the channel’s timezone, compared with your typical post.</p></div></div>
        <ol className="ins-slots">{data.bestTimes.map((s, i) => <li key={`${s.day}-${s.hour}`}><span className="ins-rank">{i + 1}</span><span><strong>{dayName(s.day)}</strong> {hourRange(s.hour)}</span><span className="ins-lift">{lift(s.lift)}</span><small>{s.support} {s.support === 1 ? 'post' : 'posts'} nearby</small></li>)}</ol>
        {data.experiments.length > 0 && <p className="ins-note"><FlaskConical size={14}/>Worth a test: {data.experiments.slice(0, 3).map(s => `${dayShort(s.day)} ${hour(s.hour)}`).join(' · ')}</p>}
      </section>
      <section className="panel ins-next">
        <div className="panel-heading"><div><div className="mini-eyebrow"><CalendarDays size={13}/>COMING UP</div><h2>Your next good slots</h2><p>Plan a post straight into one of them.</p></div></div>
        <ul className="ins-suggestions">{data.suggestions.slice(0, 4).map(s => <li key={s.at}><span><strong>{new Date(s.at).toLocaleString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}</strong><small>your time · {lift(s.lift)} typical</small></span><button className="button" onClick={() => onPlan(s.at)}>Plan a post</button></li>)}</ul>
      </section>
    </div>
    <section className="panel ins-heat">
      <div className="panel-heading"><div><h2>Weekly heatmap <span className="subtle-badge">{data.counts.eligible} posts</span></h2><p>Darker means more engagement than usual for posts at that time.</p></div></div>
      <div className="ins-heat-scroll"><table className="ins-heatmap" aria-label="Engagement by weekday and hour"><thead><tr><th/>{Array.from({length: 24}, (_, h) => <th key={h} scope="col">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</th>)}</tr></thead><tbody>{DAYS.map((d, di) => <tr key={d}><th scope="row">{dayShort(d)}</th>{data.heatmap.lift[di].map((v, h) => <td key={h} title={`${dayName(d)} ${hourRange(h)}: ${lift(v)} · ${data.heatmap.posts[di][h]} posts`} style={{opacity: 0.12 + 0.88 * Math.max(0, Math.min(1, (v - 0.5) / (maxCell - 0.5)))}}/>)}</tr>)}</tbody></table></div>
    </section>
    <div className="ins-grid">
      <section className="panel ins-content">
        <div className="panel-heading"><div><div className="mini-eyebrow"><TrendingUp size={13}/>WHAT TO WRITE</div><h2>What resonates</h2><p>Each bar compares a kind of post with your typical one.</p></div></div>
        <Groups title="Format" groups={data.content.kinds} label={k => KINDS[k] ?? k}/>
        <Groups title="Topics (hashtags)" groups={[...winners, ...losers]} label={k => `#${k}`} empty="Use hashtags to see which topics work best."/>
        <Groups title="Length" groups={data.content.lengths} label={k => LENGTHS[k] ?? k}/>
        <Groups title="Links" groups={data.content.links} label={k => k === 'LINK' ? 'With a link' : 'Without a link'}/>
      </section>
      <section className="panel ins-top">
        <div className="panel-heading"><div><div className="mini-eyebrow"><ChartNoAxesCombined size={13}/>TOP POSTS</div><h2>Your strongest posts</h2><p>{data.metricFormula ? `Ranked by ${data.metricFormula}.` : 'Ranked by engagement.'}</p></div></div>
        <ul className="ins-posts">{data.topPosts.slice(0, 5).map(p => <li key={p.messageId}><span><strong>{p.preview || KINDS[p.kind] || 'Post'}</strong><small>{new Date(p.postedAt).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})} · {p.reactions} reactions{p.comments ? ` · ${p.comments} comments` : ''}</small></span>{p.url && <a className="icon-button" href={p.url} target="_blank" rel="noreferrer" aria-label="Open in Telegram"><ExternalLink size={15}/></a>}</li>)}</ul>
      </section>
    </div>
    <p className="ins-footnote">{CONFIDENCE[data.confidence]} · {data.windowDays ? `last ${data.windowDays} days` : 'all time'} · about {Math.round(data.cadence.postsPerWeek * 10) / 10} posts a week. Telegram doesn’t share view counts with bots, so engagement here means {data.metricFormula || 'reactions and comments'}.</p>
  </>;
}

function Groups({title, groups, label, empty}: {title: string; groups: InsightGroup[]; label: (key: string) => string; empty?: string}) {
  if (!groups.length) return empty ? <div className="ins-group"><h3>{title}</h3><p className="ins-muted">{empty}</p></div> : null;
  const max = Math.max(1.5, ...groups.map(g => g.lift));
  return <div className="ins-group"><h3>{title}</h3>{groups.map(g => <div className="ins-bar" key={g.key}><span>{label(g.key)}</span><span className="ins-track"><span className={tone(g.lift)} style={{width: `${Math.min(100, g.lift / max * 100)}%`}}/></span><span className={`ins-lift ${tone(g.lift)}`}>{lift(g.lift)}</span></div>)}</div>;
}

/** Loads a channel's insights; null while loading or when there is no channel. */
export function useInsights(channelId: string | undefined, fetchInsights: (id: string) => Promise<ChannelInsights>) {
  const [data, setData] = useState<ChannelInsights | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    if (channelId) fetchInsights(channelId).then(d => {if (live) setData(d);}).catch(() => {/* the card falls back to its general text */});
    return () => {live = false;};
  }, [channelId, fetchInsights]);
  return data;
}

/** The "best time" figure on a channel card. */
export function ChannelBestTime({channelId, fetchInsights}: {channelId: string; fetchInsights: (id: string) => Promise<ChannelInsights>}) {
  const data = useInsights(channelId, fetchInsights);
  if (!data) return <div><strong>…</strong><small>Best time to post</small></div>;
  if (data.status === 'ready' && data.bestTimes[0]) return <div><strong>{dayShort(data.bestTimes[0].day)} {hour(data.bestTimes[0].hour)}</strong><small>Best time · {lift(data.bestTimes[0].lift)} typical</small></div>;
  if (data.status === 'learning') return <div><strong>Learning</strong><small>{data.postsNeeded} more {data.postsNeeded === 1 ? 'post' : 'posts'} for insights</small></div>;
  return <div><strong>—</strong><small>Bot isn’t collecting yet</small></div>;
}

/** The heading and text of the Overview's posting-rhythm card, from one channel's insights; {@code fallback} when there is nothing specific to say. */
export function RhythmText({channel, fetchInsights, onPlan, fallback}: {channel: Channel | undefined; fetchInsights: (id: string) => Promise<ChannelInsights>; onPlan: (at: string) => void; fallback: ReactNode}) {
  const data = useInsights(channel?.id, fetchInsights);
  if (!channel || !data) return <>{fallback}</>;
  const next = data.suggestions[0];
  if (data.status === 'ready' && next) return <><h3>Next good slot: {new Date(next.at).toLocaleString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}</h3><p>{dayName(next.day)} around {hour(next.hour)} is one of the best times for {channel.name}: about {lift(next.lift)} your typical engagement.</p><button className="button lavender full-width" onClick={() => onPlan(next.at)}>Plan a post then<CalendarDays size={16}/></button></>;
  if (data.status === 'learning') return <><h3>Still learning {channel.name}’s rhythm</h3><p>{data.postsNeeded} more {data.postsNeeded === 1 ? 'post' : 'posts'} until the first timing recommendations. Keep posting as usual.</p></>;
  return <>{fallback}</>;
}
