import { useEffect, useState } from 'react';
import { CalendarCheck, CalendarClock, Check, ExternalLink, Gauge, LoaderCircle, Repeat2, Sparkles, WandSparkles, X } from 'lucide-react';
import type { Channel, DraftFactor, DraftScore, Evergreen, Post, SlotAssignment } from '../shared/types';
import { AiOutput, useAiRun } from './Ai';
import { channelContext } from './ai/context';
import * as prompts from './ai/prompts';
import { api, ApiError, errorMessage } from './api';
import { isKey, useI18n, type I18n } from './i18n';

const lift = (x: number, i18n: I18n) => `${i18n.num(x, 1)}×`;
const range = (low: number, high: number, i18n: I18n) => `${i18n.num(low, 1)}–${i18n.num(high, 1)}×`;
/** Hours are fitted in blocks of this many, so a few posts per hour don't decide the best time. */
const BLOCK = 4;
/** A datetime-local value for an instant, in the visitor's clock. */
export const localInput = (at: string) => {const d = new Date(at); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);};

/** What a draft has on one dimension (or the channel's better choice), in the reader's language. */
function factorLabel(f: DraftFactor, key: string, i18n: I18n): string {
  const known = (k: string) => isKey(k) ? i18n.t(k) : key;
  switch (f.dimension) {
    case 'FORMAT': return known(`kind.${key}`);
    case 'LENGTH': return known(`len.${key}`);
    case 'LINK': return i18n.t(key === 'LINK' ? 'ins.with_link' : 'ins.without_link');
    case 'TIME': {const h = Number(key); return `${i18n.hour(h)}–${i18n.hour((h + BLOCK) % 24)}`;}
    case 'TOPIC': return key;
    default: return key.split(', ').map(w => `«${w}»`).join(', ');
  }
}

/**
 * The draft's score in the post editor: how it's likely to do against what worked on the channel, factor by factor,
 * with the next free good times and a one-tap AI fix for what the text itself can change. The number only shows once
 * it has predicted the channel's newest posts; until then the factors are shown with their ranges and no score.
 */
export function DraftScoreBox({channel, posts, postId, body, media, buttons, at, onAt, onBody, onSetup}: {
  channel: Channel | undefined; posts: Post[]; postId: string | null; body: string; media: string[]; buttons: number; at: string | null;
  onAt: (at: string) => void; onBody: (text: string) => void; onSetup: () => void;
}) {
  const i18n = useI18n();
  const {t, lang} = i18n;
  const ai = useAiRun();
  const [data, setData] = useState<DraftScore | null>(null);
  const [loading, setLoading] = useState(false);
  const mediaKey = media.join(',');
  useEffect(() => {
    if (!channel) return;
    const controller = new AbortController();
    setLoading(true);
    // typing shouldn't send a request per key
    const timer = setTimeout(() => {
      api.draftScore(channel.id, {body, media, buttons, scheduledAt: at, postId}, controller.signal)
        .then(d => setData(d)).catch(() => {/* the score is a hint; the editor works without it */}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    }, 600);
    return () => {clearTimeout(timer); controller.abort();};
  }, [channel?.id, body, mediaKey, buttons, at, postId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!channel || !data?.connected || !data.score) return null;
  const r = data.score;
  const fixes = prompts.fixable(r.factors);
  const best = data.slots.length ? [...data.slots].sort((a, b) => b.lift - a.lift || a.at.localeCompare(b.at))[0] : null;
  const topSlot = best && !best.guess ? best : null;
  const onBest = best && at && Math.abs(Date.parse(best.at) - Date.parse(at)) < 60_000;
  // the editor's times are the visitor's clock, so the time factor reads the draft's own time and the best slot, not the channel's weekday/hour
  const when = (iso: string) => i18n.date(iso, {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
  const label = (f: DraftFactor, best: boolean) => f.dimension !== 'TIME' ? factorLabel(f, best ? f.bestKey! : f.key, i18n)
    : best ? (topSlot ? when(topSlot.at) : factorLabel(f, f.bestKey!, i18n)) : at ? when(at) : factorLabel(f, f.key, i18n);
  const grade = r.status !== 'ready' ? 'unproven' : r.score >= 60 ? 'good' : r.score >= 40 ? 'fair' : 'poor';
  const result = ai.output.trim();

  return <section className={`draft-score ${grade}`} aria-labelledby="ds-title" aria-busy={loading}>
    <div className="ds-head">
      <h3 id="ds-title"><Gauge size={15}/>{t('ds.title')}</h3>
      {r.status === 'ready' ? <span className="ds-score"><strong>{r.score}</strong>/100</span> : <span className="subtle-badge">{t(r.status === 'learning' ? 'ds.learning_badge' : 'ds.unproven_badge')}</span>}
      {loading && <LoaderCircle size={14} className="spin"/>}
    </div>
    {r.status === 'learning' ? <p className="ds-note">{t('ds.learning', {n: i18n.num(r.postsRead)})}</p> : <>
      {r.status === 'ready' ? <>
        <div className="ds-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.score} aria-label={t('ds.title')}><span style={{width: `${r.score}%`}}/></div>
        <p className="ds-note">{t('ds.expected', {x: lift(r.expected, i18n)})} <small>({t('ds.range', {range: range(r.low, r.high, i18n)})})</small>{r.potential > r.expected + 0.05 && <> · <strong>{t('ds.potential', {x: lift(r.potential, i18n)})}</strong></>}</p>
        <p className="ds-proof">{t('ds.proven', {n: i18n.num(r.check.tested)})}</p>
      </> : <p className="ds-note">{r.check.status === 'untested' ? t('ds.untested') : t('ds.unproven', {n: i18n.num(r.check.tested)})}</p>}
      <ul className="ds-factors">{r.factors.map(f => <li key={f.dimension} className={!f.counted ? 'context' : f.weak ? 'weak' : f.low > 1 ? 'strong' : ''}>
        <span className="ds-dim">{t(`ds.dim.${f.dimension}`)}{!f.counted && <small>{t('ds.context')}</small>}</span>
        <span className="ds-key" dir="auto">{label(f, false)}{f.key && <small title={t('ds.range', {range: range(f.low, f.high, i18n)})}>{lift(f.lift, i18n)} · {range(f.low, f.high, i18n)}</small>}</span>
        {f.weak && f.bestKey && <span className="ds-better">{t('ds.better', {what: label(f, true), x: lift(f.bestLift!, i18n)})}</span>}
      </li>)}</ul>
    </>}
    <div className="ds-actions">
      {best && !onBest && <button type="button" className="button small-button" onClick={() => onAt(localInput(best.at))}><CalendarCheck size={14}/>{t('ds.use_best', {when: when(best.at)})}</button>}
      {onBest && <span className="ds-ok"><Check size={14}/>{t('ds.on_best')}</span>}
      {fixes.length > 0 && body.trim() && (ai.ready
        ? <button type="button" className="button small-button lavender" disabled={ai.running} onClick={() => void ai.run(async () => prompts.fixDraft(await channelContext(channel, posts, ai.settings, lang), body, r.factors), 0.5)}><WandSparkles size={14}/>{t('ds.fix')}</button>
        : <button type="button" className="button small-button" onClick={onSetup}><Sparkles size={14}/>{t('ds.fix_setup')}</button>)}
    </div>
    {data.slots.length > 0 && <p className="ds-slots"><CalendarClock size={13}/>{t('ds.free')} {data.slots.map(s => <button type="button" key={s.at} className="chip" onClick={() => onAt(localInput(s.at))}>{when(s.at)}{!s.guess && ` · ${lift(s.lift, i18n)}`}</button>)}{data.slots.every(s => s.guess) && <small className="ds-guess">{t('ds.guess')}</small>}</p>}
    <AiOutput text={ai.output} running={ai.running} error={ai.error} onStop={ai.stop}>
      <button type="button" className="button small-button primary" onClick={() => {onBody(result.slice(0, 4096)); ai.reset();}}><Check size={14}/>{t('ai.replace')}</button>
      <button type="button" className="button small-button" onClick={ai.reset}><X size={14}/>{t('ai.discard')}</button>
    </AiOutput>
  </section>;
}

/** On the Schedule page: the channel's drafts spread over its next free good times in one go. */
export function FillSlots({channel, drafts, onDone}: {channel: Channel; drafts: number; onDone: (n: number) => Promise<void>}) {
  const i18n = useI18n();
  const {t, tn} = i18n;
  const [preview, setPreview] = useState<SlotAssignment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {setPreview(null); setError('');}, [channel.id, drafts]);
  async function go(apply: boolean) {
    setBusy(true); setError('');
    try {
      const list = await api.fillSlots(channel.id, apply);
      if (apply) {setPreview(null); await onDone(list.length);} else setPreview(list);
    } catch (e) {setError(e instanceof ApiError && e.status === 409 ? t('fill.no_bot') : errorMessage(e, t));} finally {setBusy(false);}
  }
  return <section className="panel fill-panel" aria-labelledby="fill-title">
    <div className="panel-heading"><div><div className="mini-eyebrow"><CalendarCheck size={13}/>{channel.name}</div><h2 id="fill-title">{t('fill.title')}</h2><p>{t('fill.text')}</p></div>
      {!preview && <button className="button primary" disabled={busy || !drafts} onClick={() => void go(false)}>{busy ? <LoaderCircle size={15} className="spin"/> : <CalendarCheck size={15}/>}{drafts ? tn('fill.button', drafts) : t('fill.no_drafts')}</button>}</div>
    {preview && (preview.length ? <>
      <ul className="fill-list">{preview.map(a => <li key={a.postId}><strong dir="auto">{a.title}</strong><span>{i18n.date(a.at, {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}</span><small>{lift(a.lift, i18n)}</small></li>)}</ul>
      {preview.length < drafts && <p className="ds-note">{tn('fill.left', drafts - preview.length)}</p>}
      <div className="ds-actions"><button className="button primary" disabled={busy} onClick={() => void go(true)}>{busy ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>}{tn('fill.confirm', preview.length)}</button><button className="button" onClick={() => setPreview(null)}>{t('app.cancel')}</button></div>
    </> : <p className="ds-note">{t('fill.none')}</p>)}
    {error && <p className="error-text" role="alert">{error}</p>}
  </section>;
}

/** On the Schedule page: the channel's best posts from 3+ months ago, each one tap away from a silent repost. */
export function EvergreenPanel({channel, onQueued}: {channel: Channel; onQueued: (post: Post) => Promise<void>}) {
  const i18n = useI18n();
  const {t} = i18n;
  const [data, setData] = useState<Evergreen | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let live = true;
    api.evergreen(channel.id).then(d => {if (live) setData(d);}).catch(e => {if (live) setError(errorMessage(e, t));});
    return () => {live = false;};
  }, [channel.id, again]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data?.connected) return error ? <div className="error-banner" role="alert">{error}</div> : null;
  async function repost(messageId: number) {
    setBusy(messageId); setError('');
    try {await onQueued(await api.repost(channel.id, messageId)); setAgain(n => n + 1);}
    catch (e) {setError(e instanceof ApiError && e.status === 409 ? t('ever.busy') : errorMessage(e, t));}
    finally {setBusy(null);}
  }
  const kind = (kind: string) => {const k = `kind.${kind}`; return isKey(k) ? t(k) : t('ins.post');};
  return <section className="panel evergreen-panel" aria-labelledby="ever-title">
    <div className="panel-heading"><div><div className="mini-eyebrow"><Repeat2 size={13}/>{t('ever.eyebrow')}</div><h2 id="ever-title">{t('ever.title')}</h2><p>{t('ever.text')}</p></div></div>
    {data.posts.length ? <ul className="evergreen-list">{data.posts.map(p => <li key={p.messageId}>
      <span className="ever-lift">{lift(p.lift, i18n)}</span>
      <div><strong dir="auto">{p.preview || kind(p.kind)}</strong><small>{kind(p.kind)} · {i18n.date(p.postedAt, {day: 'numeric', month: 'short', year: 'numeric'})}{p.url && <> · <a href={p.url} target="_blank" rel="noreferrer">{t('ever.open')}<ExternalLink size={11}/></a></>}</small></div>
      {p.queuedAt ? <span className="ever-queued"><CalendarClock size={13}/>{t('ever.queued_for', {when: i18n.date(p.queuedAt, {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})})}</span>
        : <button className="button small-button" disabled={busy !== null} onClick={() => void repost(p.messageId)}>{busy === p.messageId ? <LoaderCircle size={14} className="spin"/> : <Repeat2 size={14}/>}{t('ever.repost')}</button>}
    </li>)}</ul> : <p className="ds-note">{t('ever.empty')}</p>}
    <p className="ever-legend">{t('ever.legend')}</p>
    {error && <p className="error-text" role="alert">{error}</p>}
  </section>;
}
