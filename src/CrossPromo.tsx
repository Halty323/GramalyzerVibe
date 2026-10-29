import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Copy, ExternalLink, Handshake, LoaderCircle, Pencil, Users } from 'lucide-react';
import type { Channel, CrossPromo, PromoLinkStat, SwapMatch, SwapView } from '../shared/types';
import { api, ApiError, errorMessage } from './api';
import { isKey, useI18n, type I18n } from './i18n';

/** The backend's swap errors ("swap.err.already") have their own texts here ("cp.err.already"). */
function swapError(e: unknown, t: I18n['t']): string {
  const key = e instanceof ApiError && e.code?.startsWith('swap.err.') ? `cp.${e.code.slice(5)}` : '';
  return isKey(key) ? t(key) : errorMessage(e, t);
}

const topicName = (topic: string | null, t: I18n['t']) => {const k = `cp.topic.${topic}`; return topic && isKey(k) ? t(k) : '–';};

function status(s: SwapView): string {
  if (s.status === 'REQUESTED') return s.outgoing ? 'outgoing' : 'incoming';
  if (s.status === 'DECLINED' && !s.outgoing) return 'you_declined';
  return s.status.toLowerCase();
}

/** Cross-promo: the channel's profile, partners that fit, and swaps with what each side's post brought. */
export function CrossPromoSection({channel}: {channel: Channel}) {
  const {t} = useI18n();
  const [data, setData] = useState<CrossPromo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let live = true;
    setError(null);
    api.crossPromo(channel.id).then(d => {if (live) setData(d);}).catch(e => {if (live) setError(e);});
    return () => {live = false;};
  }, [channel.id, reload]);
  const refresh = () => setReload(r => r + 1);

  if (error) return <div className="error-banner" role="alert">{errorMessage(error, t)}</div>;
  if (!data) return <section className="panel ins-empty"><LoaderCircle className="spin"/><p>{t('cp.loading')}</p></section>;
  if (!data.connected) return null;

  return <section className="panel cp-panel" aria-labelledby="cp-title">
    <div className="panel-heading"><div><div className="mini-eyebrow"><Handshake size={13}/>{t('cp.eyebrow')}</div><h2 id="cp-title">{t('cp.title')}</h2><p>{t('cp.text')}</p></div></div>
    {!data.profile || editing
      ? <ProfileForm channel={channel} data={data} onDone={() => {setEditing(false); refresh();}} onCancel={data.profile ? () => setEditing(false) : undefined}/>
      : <div className="cp-profile">
        <span><strong>{topicName(data.profile.topic, t)}</strong> · <Language code={data.profile.language}/></span>
        {data.profile.pitch && <q dir="auto">{data.profile.pitch}</q>}
        {!data.profile.enabled && <em className="cp-paused">{t('cp.paused')}</em>}
        <button className="button cp-edit" onClick={() => setEditing(true)}><Pencil size={13}/>{t('cp.edit')}</button>
      </div>}
    {data.profile && <>
      <Swaps channel={channel} swaps={data.swaps} onChange={refresh}/>
      {data.profile.enabled && <Matches channel={channel} matches={data.matches} onChange={refresh}/>}
    </>}
  </section>;
}

function Language({code}: {code: string}) {
  const {locale} = useI18n();
  const name = useMemo(() => {try {return new Intl.DisplayNames([code], {type: 'language'}).of(code) ?? code;} catch {return code;}}, [code]);
  return <span lang={code}>{name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)}</span>;
}

function ProfileForm({channel, data, onDone, onCancel}: {channel: Channel; data: CrossPromo; onDone: () => void; onCancel?: () => void}) {
  const {t, lang} = useI18n();
  const [topic, setTopic] = useState(data.profile?.topic ?? 'OTHER');
  const [language, setLanguage] = useState(data.profile?.language ?? (data.languages.includes(lang) ? lang : 'en'));
  const [pitch, setPitch] = useState(data.profile?.pitch ?? '');
  const [enabled, setEnabled] = useState(data.profile?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const names = useMemo(() => new Map(data.languages.map(c => {
    try {const n = new Intl.DisplayNames([c], {type: 'language'}).of(c) ?? c; return [c, n.charAt(0).toUpperCase() + n.slice(1)];} catch {return [c, c];}
  })), [data.languages]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {await api.saveSwapProfile(channel.id, {topic, language, pitch: pitch.trim(), enabled}); onDone();}
    catch (err) {setError(swapError(err, t));}
    finally {setBusy(false);}
  }

  return <form className="cp-form" onSubmit={save}>
    <label><span>{t('cp.topic')}</span><select value={topic} onChange={e => setTopic(e.target.value)}>{data.topics.map(x => <option key={x} value={x}>{topicName(x, t)}</option>)}</select></label>
    <label><span>{t('cp.language')}</span><select value={language} onChange={e => setLanguage(e.target.value)}>{data.languages.map(c => <option key={c} value={c} lang={c}>{names.get(c)}</option>)}</select></label>
    <label className="cp-pitch"><span>{t('cp.pitch')}</span><textarea value={pitch} maxLength={300} rows={2} dir="auto" placeholder={t('cp.pitch_placeholder')} onChange={e => setPitch(e.target.value)}/></label>
    {data.profile && <label className="cp-toggle"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/>{t('cp.enabled')}</label>}
    <div className="cp-form-actions">
      <button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15}/> : <Handshake size={15}/>}{data.profile ? t('cp.save') : t('cp.join')}</button>
      {onCancel && <button type="button" className="button" onClick={onCancel}>{t('cp.cancel')}</button>}
    </div>
    {error && <p className="promo-error" role="alert">{error}</p>}
  </form>;
}

function Matches({channel, matches, onChange}: {channel: Channel; matches: SwapMatch[]; onChange: () => void}) {
  const i18n = useI18n();
  const {t} = i18n;
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  async function ask(m: SwapMatch) {
    setBusy(m.channelId); setError('');
    try {await api.proposeSwap(channel.id, m.channelId); onChange();}
    catch (e) {setError(swapError(e, t));}
    finally {setBusy(null);}
  }
  return <div className="cp-block">
    <h3>{t('cp.matches')}</h3>
    {matches.length === 0 ? <p className="ins-muted">{t('cp.matches_empty')}</p> : <>
      <p className="ins-muted">{t('cp.matches_hint')}</p>
      {error && <p className="promo-error" role="alert">{error}</p>}
      <ul className="cp-list">{matches.map(m => <li key={m.channelId} className="cp-card">
        <div className="cp-card-head">
          <strong dir="auto">{m.title}</strong>
          <span className="cp-fit" title={t('cp.fit', {n: m.score})}><span className="cp-meter" aria-hidden="true"><span style={{width: `${m.score}%`}}/></span>{t('cp.fit', {n: m.score})}</span>
        </div>
        <small className="cp-meta">{topicName(m.topic, t)}{m.subscribers !== null && <> · <Users size={12}/> {i18n.compact(m.subscribers)}</>}{m.engagement !== null && <> · {t('cp.engagement', {n: i18n.num(m.engagement, 1)})}</>}</small>
        {m.pitch && <p className="cp-pitch-text" dir="auto">{m.pitch}</p>}
        <button className="button primary" disabled={busy !== null} onClick={() => ask(m)}>{busy === m.channelId ? <LoaderCircle className="spin" size={14}/> : <Handshake size={14}/>}{t('cp.ask')}</button>
      </li>)}</ul>
    </>}
  </div>;
}

function Swaps({channel, swaps, onChange}: {channel: Channel; swaps: SwapView[]; onChange: () => void}) {
  const {t} = useI18n();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  async function act(s: SwapView, action: 'accept' | 'decline' | 'cancel' | 'end') {
    if (action === 'end' && !window.confirm(t('cp.end_confirm', {name: s.partnerTitle}))) return;
    setBusy(s.id); setError('');
    try {await api.swapAction(channel.id, s.id, action); onChange();}
    catch (e) {setError(swapError(e, t));}
    finally {setBusy(null);}
  }
  return <div className="cp-block">
    <h3>{t('cp.swaps')}</h3>
    {error && <p className="promo-error" role="alert">{error}</p>}
    {swaps.length === 0 ? <p className="ins-muted">{t('cp.swaps_empty')}</p> : <ul className="cp-list">{swaps.map(s => <SwapCard key={s.id} swap={s} busy={busy === s.id} onAct={a => act(s, a)}/>)}</ul>}
  </div>;
}

function SwapCard({swap: s, busy, onAct}: {swap: SwapView; busy: boolean; onAct: (a: 'accept' | 'decline' | 'cancel' | 'end') => void}) {
  const i18n = useI18n();
  const {t} = i18n;
  const st = status(s);
  const live = s.status === 'ACTIVE' || s.status === 'DONE';
  return <li className={`cp-card cp-${st}`}>
    <div className="cp-card-head">
      <strong dir="auto">{s.partnerTitle}</strong>
      <span className={`cp-status ${st}`}>{t(`cp.status.${st}` as never)}</span>
    </div>
    <small className="cp-meta">{topicName(s.partnerTopic, t)}{s.partnerSubscribers !== null && <> · <Users size={12}/> {i18n.compact(s.partnerSubscribers)}</>}
      {s.partnerContact && <> · {t('cp.owner', {name: s.partnerContact})}</>}
      {s.partnerUrl && <> · <a href={s.partnerUrl} target="_blank" rel="noreferrer">{t('cp.open_channel')}<ExternalLink size={11}/></a></>}
    </small>
    {s.partnerPitch && <p className="cp-pitch-text" dir="auto">{s.partnerPitch}</p>}
    {live && <div className="cp-links">
      {s.theirs && <LinkRow title={t('cp.their_link')} link={s.theirs} showUrl={s.status === 'ACTIVE'} result={t('cp.brought_them', {joined: i18n.num(s.theirs.joined), stayed: i18n.num(s.theirs.stayed)})}/>}
      {s.mine && <LinkRow title={t('cp.your_link')} link={s.mine} showUrl={s.status === 'ACTIVE'} result={t('cp.brought_you', {joined: i18n.num(s.mine.joined), stayed: i18n.num(s.mine.stayed)})}/>}
    </div>}
    {s.status === 'ACTIVE' && <p className="ins-muted cp-agree">{t('cp.agree')}</p>}
    <div className="cp-actions">
      {st === 'incoming' && <><button className="button primary" disabled={busy} onClick={() => onAct('accept')}>{busy ? <LoaderCircle className="spin" size={14}/> : <Check size={14}/>}{t('cp.accept')}</button><button className="button" disabled={busy} onClick={() => onAct('decline')}>{t('cp.decline')}</button></>}
      {st === 'outgoing' && <button className="button" disabled={busy} onClick={() => onAct('cancel')}>{t('cp.take_back')}</button>}
      {s.status === 'ACTIVE' && <button className="button" disabled={busy} onClick={() => onAct('end')}>{t('cp.end')}</button>}
    </div>
  </li>;
}

function LinkRow({title, link, showUrl, result}: {title: string; link: PromoLinkStat; showUrl: boolean; result: string}) {
  const {t} = useI18n();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {await navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 1500);} catch {/* the link stays visible to copy by hand */}
  }
  return <div className="cp-link">
    <small>{title}</small>
    {showUrl && <span className="promo-url"><bdi>{link.url.replace(/^https:\/\//, '')}</bdi><button className="icon-button" onClick={copy} aria-label={t('growth.copy')} title={t('growth.copy')}>{copied ? <Check size={14}/> : <Copy size={14}/>}</button></span>}
    <strong>{result}</strong>
  </div>;
}
