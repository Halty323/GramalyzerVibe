import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { CalendarDays, ChartNoAxesCombined, Clock3, ExternalLink, FlaskConical, LoaderCircle, Radio, Sparkles, TrendingUp } from 'lucide-react';
import type { Channel, ChannelInsights, GapReport, InsightGroup, SearchCheck, Weekday } from '../shared/types';
import { errorMessage } from './api';
import { CrossPromoSection } from './CrossPromo';
import { GapsSection } from './Gaps';
import { GrowthSection } from './Growth';
import { SearchCheckSection } from './SearchCheck';
import { ViewSpeedSection } from './ViewSpeed';
import { isKey, useI18n, type I18n } from './i18n';

const DAYS: Weekday[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const lift = (x: number, i18n: I18n) => `${i18n.num(x, 1)}×`;
const tone = (x: number) => x >= 1.05 ? 'up' : x <= 0.95 ? 'down' : 'flat';
/** The translated name of a post kind or length bucket; the raw key if it's one we don't know. */
const label = (i18n: I18n, prefix: 'kind' | 'len', key: string) => {const k = `${prefix}.${key}`; return isKey(k) ? i18n.t(k) : key;};
/** Weekday names start a phrase here, and some languages write them in lower case. */
const cap = (s: string, i18n: I18n) => s.charAt(0).toLocaleUpperCase(i18n.locale) + s.slice(1);
function useDays() {
  const i18n = useI18n();
  const index = (d: Weekday) => DAYS.indexOf(d);
  return {
    i18n,
    dayName: (d: Weekday) => cap(i18n.weekday(index(d), 'long'), i18n),
    dayShort: (d: Weekday) => cap(i18n.weekday(index(d), 'short'), i18n),
    hourRange: (h: number) => `${i18n.hour(h)}–${i18n.hour((h + 1) % 24)}`,
    when: (at: string) => i18n.date(at, {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}),
  };
}

/** Best times and content signals from the bot's analysis of one channel. */
export function InsightsPage({channel, showingFirst, fetchInsights, onPlan, onGapsAi, onSearchAi}: {channel: Channel; showingFirst: boolean; fetchInsights: (id: string) => Promise<ChannelInsights>; onPlan: (at: string) => void; onGapsAi: (report: GapReport) => void; onSearchAi: (check: SearchCheck) => void}) {
  const {i18n, dayName, dayShort, hourRange, when} = useDays();
  const {t, tn, rich} = i18n;
  const [data, setData] = useState<ChannelInsights | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    setData(null); setError(null);
    fetchInsights(channel.id).then(d => {if (live) setData(d);}).catch(e => {if (live) setError(e);});
    return () => {live = false;};
  }, [channel.id, fetchInsights]);

  const scope = showingFirst && <p className="ins-scope">{rich('ins.scope', {name: <strong>{channel.name}</strong>})}</p>;
  if (error) return <>{scope}<div className="error-banner" role="alert">{errorMessage(error, t)}</div></>;
  if (!data) return <>{scope}<section className="panel ins-empty"><LoaderCircle className="spin"/><p>{t('ins.reading', {name: channel.name})}</p></section></>;
  if (data.status === 'not_connected') return <>{scope}<section className="notice connect-notice"><Radio size={20}/><div><strong>{t('ins.nc_title', {name: channel.name})}</strong><p>{t('ins.nc_text')}</p></div></section></>;
  if (data.status === 'learning') return <>{scope}<section className="panel ins-learning"><div className="panel-heading"><div><div className="mini-eyebrow"><Sparkles size={13}/>{t('ins.learning')}</div><h2>{tn('ins.learning_title', data.postsNeeded)}</h2><p>{[tn('ins.usable', data.counts.eligible), data.counts.immature ? tn('ins.immature', data.counts.immature) : '', data.counts.excluded ? tn('ins.excluded', data.counts.excluded) : ''].filter(Boolean).join(' · ')}.</p></div></div><div className="ins-progress" role="progressbar" aria-valuemin={0} aria-valuemax={20} aria-valuenow={data.counts.eligible}><span style={{width: `${Math.min(100, data.counts.eligible / (data.counts.eligible + data.postsNeeded) * 100)}%`}}/></div></section><ViewSpeedSection channel={channel}/><GapsSection channel={channel} onAi={onGapsAi}/><SearchCheckSection channel={channel} onAi={onSearchAi}/><GrowthSection channel={channel}/><CrossPromoSection channel={channel}/></>;

  const maxCell = Math.max(1, ...data.heatmap.lift.flat());
  const winners = data.content.topics.filter(g => g.lift >= 1.1).slice(0, 3);
  const losers = data.content.topics.filter(g => g.lift <= 0.8).slice(-2).reverse();
  return <>
    {scope}
    <div className="ins-grid">
      <section className="panel ins-times">
        <div className="panel-heading"><div><div className="mini-eyebrow"><Clock3 size={13}/>{t('ins.when')}</div><h2>{t('ins.best_times')} <span className="subtle-badge">{data.timezone}</span></h2><p>{t('ins.best_times_text')}</p></div></div>
        <ol className="ins-slots">{data.bestTimes.map((s, i) => <li key={`${s.day}-${s.hour}`}><span className="ins-rank">{i + 1}</span><span><strong>{dayName(s.day)}</strong> {hourRange(s.hour)}</span><span className="ins-lift">{lift(s.lift, i18n)}</span><small>{tn('ins.nearby', s.support)}</small></li>)}</ol>
        {data.experiments.length > 0 && <p className="ins-note"><FlaskConical size={14}/>{t('ins.worth_test', {slots: data.experiments.slice(0, 3).map(s => `${dayShort(s.day)} ${i18n.hour(s.hour)}`).join(' · ')})}</p>}
      </section>
      <section className="panel ins-next">
        <div className="panel-heading"><div><div className="mini-eyebrow"><CalendarDays size={13}/>{t('ins.coming')}</div><h2>{t('ins.next_slots')}</h2><p>{t('ins.next_slots_text')}</p></div></div>
        <ul className="ins-suggestions">{data.suggestions.slice(0, 4).map(s => <li key={s.at}><span><strong>{when(s.at)}</strong><small>{t('ins.your_time', {lift: lift(s.lift, i18n)})}</small></span><button className="button" onClick={() => onPlan(s.at)}>{t('ins.plan')}</button></li>)}</ul>
      </section>
    </div>
    <ViewSpeedSection channel={channel}/><GapsSection channel={channel} onAi={onGapsAi}/><SearchCheckSection channel={channel} onAi={onSearchAi}/>
    <GrowthSection channel={channel}/>
    <CrossPromoSection channel={channel}/>
    <section className="panel ins-heat">
      <div className="panel-heading"><div><h2>{t('ins.heatmap')} <span className="subtle-badge">{tn('ins.posts', data.counts.eligible)}</span></h2><p>{t('ins.heatmap_text')}</p></div></div>
      <div className="ins-heat-scroll"><table className="ins-heatmap" aria-label={t('ins.heatmap_aria')}><thead><tr><th/>{Array.from({length: 24}, (_, h) => <th key={h} scope="col">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</th>)}</tr></thead><tbody>{DAYS.map((d, di) => <tr key={d} style={{'--row': di} as CSSProperties}><th scope="row">{dayShort(d)}</th>{data.heatmap.lift[di].map((v, h) => <td key={h} title={`${dayName(d)} ${hourRange(h)}: ${lift(v, i18n)} · ${tn('ins.posts', data.heatmap.posts[di][h])}`} style={{opacity: 0.12 + 0.88 * Math.max(0, Math.min(1, (v - 0.5) / (maxCell - 0.5)))}}/>)}</tr>)}</tbody></table></div>
    </section>
    <div className="ins-grid">
      <section className="panel ins-content">
        <div className="panel-heading"><div><div className="mini-eyebrow"><TrendingUp size={13}/>{t('ins.what')}</div><h2>{t('ins.resonates')}</h2><p>{t('ins.resonates_text')}</p></div></div>
        <Groups title={t('ins.format')} groups={data.content.kinds} label={k => label(i18n, 'kind', k)}/>
        <Groups title={t('ins.topics')} groups={[...winners, ...losers]} label={k => `#${k}`} empty={t('ins.topics_empty')}/>
        <Groups title={t('ins.length')} groups={data.content.lengths} label={k => label(i18n, 'len', k)}/>
        <Groups title={t('ins.links')} groups={data.content.links} label={k => k === 'LINK' ? t('ins.with_link') : t('ins.without_link')}/>
      </section>
      <section className="panel ins-top">
        <div className="panel-heading"><div><div className="mini-eyebrow"><ChartNoAxesCombined size={13}/>{t('ins.top')}</div><h2>{t('ins.strongest')}</h2><p>{data.metricFormula ? t('ins.ranked_by', {formula: data.metricFormula}) : t('ins.ranked')}</p></div></div>
        <ul className="ins-posts">{data.topPosts.slice(0, 5).map(p => <li key={p.messageId}><span><strong>{p.preview || (isKey(`kind.${p.kind}`) ? label(i18n, 'kind', p.kind) : t('ins.post'))}</strong><small>{i18n.date(p.postedAt, {day: 'numeric', month: 'short'})} · {tn('ins.reactions', p.reactions)}{p.comments ? ` · ${tn('ins.comments', p.comments)}` : ''}</small></span>{p.url && <a className="icon-button" href={p.url} target="_blank" rel="noreferrer" aria-label={t('ins.open_tg')}><ExternalLink size={15}/></a>}</li>)}</ul>
      </section>
    </div>
    <p className="ins-footnote">{t(`conf.${data.confidence}`)} · {data.windowDays ? tn('ins.window', data.windowDays) : t('ins.all_time')} · {t('ins.per_week', {n: i18n.num(Math.round(data.cadence.postsPerWeek * 10) / 10)})}. {t('ins.footnote_views', {formula: data.metricFormula || t('ins.reactions_and_comments')})}</p>
  </>;
}

function Groups({title, groups, label, empty}: {title: string; groups: InsightGroup[]; label: (key: string) => string; empty?: string}) {
  const i18n = useI18n();
  if (!groups.length) return empty ? <div className="ins-group"><h3>{title}</h3><p className="ins-muted">{empty}</p></div> : null;
  const max = Math.max(1.5, ...groups.map(g => g.lift));
  return <div className="ins-group"><h3>{title}</h3>{groups.map(g => <div className="ins-bar" key={g.key}><span>{label(g.key)}</span><span className="ins-track"><span className={tone(g.lift)} style={{width: `${Math.min(100, g.lift / max * 100)}%`}}/></span><span className={`ins-lift ${tone(g.lift)}`}>{lift(g.lift, i18n)}</span></div>)}</div>;
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
  const {i18n, dayShort} = useDays();
  const {t, tn} = i18n;
  const data = useInsights(channelId, fetchInsights);
  if (!data) return <div><strong>…</strong><small>{t('ins.best_time')}</small></div>;
  if (data.status === 'ready' && data.bestTimes[0]) return <div><strong>{dayShort(data.bestTimes[0].day)} {i18n.hour(data.bestTimes[0].hour)}</strong><small>{t('ins.best_time_lift', {lift: lift(data.bestTimes[0].lift, i18n)})}</small></div>;
  if (data.status === 'learning') return <div><strong>{t('ins.learning_short')}</strong><small>{tn('ins.more_for_insights', data.postsNeeded)}</small></div>;
  return <div><strong>—</strong><small>{t('ins.not_collecting')}</small></div>;
}

/** The heading and text of the Overview's posting-rhythm card, from one channel's insights; {@code fallback} when there is nothing specific to say. */
export function RhythmText({channel, fetchInsights, onPlan, fallback}: {channel: Channel | undefined; fetchInsights: (id: string) => Promise<ChannelInsights>; onPlan: (at: string) => void; fallback: ReactNode}) {
  const {i18n, dayName, when} = useDays();
  const {t, tn} = i18n;
  const data = useInsights(channel?.id, fetchInsights);
  if (!channel || !data) return <>{fallback}</>;
  const next = data.suggestions[0];
  if (data.status === 'ready' && next) return <><h3>{t('ins.next_slot', {date: when(next.at)})}</h3><p>{t('ins.next_slot_text', {day: dayName(next.day), hour: i18n.hour(next.hour), name: channel.name, lift: lift(next.lift, i18n)})}</p><button className="button lavender full-width" onClick={() => onPlan(next.at)}>{t('ins.plan_then')}<CalendarDays size={16}/></button></>;
  if (data.status === 'learning') return <><h3>{t('ins.learning_rhythm', {name: channel.name})}</h3><p>{tn('ins.learning_rhythm_text', data.postsNeeded)}</p></>;
  return <>{fallback}</>;
}
