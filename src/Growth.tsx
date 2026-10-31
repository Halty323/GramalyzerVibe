import { useEffect, useState, type FormEvent } from 'react';
import { Check, Copy, ExternalLink, Link2, LoaderCircle, Plus, Quote, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import type { Channel, ChannelGrowth, Citation, FormatEffect, PostEffect, PromoLinkStat } from '../shared/types';
import { api, ApiError, errorMessage } from './api';
import { isKey, useI18n, type I18n } from './i18n';

const WINDOWS = [7, 30, 90];

/** The backend's promo errors ("promo.err.rights") have their own texts here ("growth.err.rights"). */
function promoError(e: unknown, t: I18n['t']): string {
  const key = e instanceof ApiError && e.code?.startsWith('promo.err.') ? `growth.${e.code.slice(6)}` : '';
  return isKey(key) ? t(key) : errorMessage(e, t);
}

const kindName = (kind: string, t: I18n['t']) => {const k = `kind.${kind}`; return isKey(k) ? t(k) : t('ins.post');};

/** "$20", "450 UAH", "2.5 €": the amount with the currency as it was typed. */
function money(amount: number, currency: string | null, i18n: I18n) {
  const n = i18n.num(amount, 2);
  if (!currency) return n;
  return currency === '$' || currency === '£' ? `${currency}${n}` : `${n} ${currency}`;
}

/** Who joined and left a channel, after which post, and the promo links that brought people. */
export function GrowthSection({channel}: {channel: Channel}) {
  const i18n = useI18n();
  const {t} = i18n;
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ChannelGrowth | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    api.growth(channel.id, days).then(d => {if (live) setData(d);}).catch(e => {if (live) setError(e);});
    return () => {live = false;};
  }, [channel.id, days, reload]);

  if (error) return <div className="error-banner" role="alert">{errorMessage(error, t)}</div>;
  if (!data) return <section className="panel ins-empty"><LoaderCircle className="spin"/><p>{t('growth.loading')}</p></section>;
  if (!data.connected) return null;

  return <>
    <section className="panel growth-panel" aria-labelledby="growth-title">
      <div className="panel-heading">
        <div><div className="mini-eyebrow"><Users size={13}/>{t('growth.eyebrow')}</div><h2 id="growth-title">{t('growth.title')}</h2><p>{t('growth.text')}</p></div>
        <div className="growth-windows" role="group" aria-label={t('growth.window')}>{WINDOWS.map(d => <button key={d} className={d === days ? 'active' : ''} aria-pressed={d === days} onClick={() => setDays(d)}>{t('growth.days', {n: d})}</button>)}</div>
      </div>
      {!data.tracking ? <p className="growth-waiting">{t('growth.waiting')}</p> : <>
        <div className="growth-stats">
          <div><small><UserPlus size={13}/>{t('growth.joined')}</small><strong>{i18n.num(data.joined)}</strong></div>
          <div><small><UserMinus size={13}/>{t('growth.left')}</small><strong>{i18n.num(data.left)}</strong></div>
          <div><small>{t('growth.net')}</small><strong className={data.net >= 0 ? 'up' : 'down'}>{i18n.signed(data.net)}</strong></div>
          <div><small><Link2 size={13}/>{t('growth.from_links')}</small><strong>{i18n.num(data.fromLinks)}</strong></div>
        </div>
        <DailyChart data={data}/>
        {data.since && new Date(data.since) > new Date(Date.now() - days * 86_400_000) && <p className="growth-since">{t('growth.since', {date: i18n.date(data.since, {day: 'numeric', month: 'long'})})}</p>}
        <div className="growth-posts">
          <Effects title={t('growth.gainers')} empty={t('growth.gainers_empty')} posts={data.gainers}/>
          <Effects title={t('growth.losers')} empty={t('growth.losers_empty')} posts={data.losers}/>
        </div>
        {(data.formats ?? []).length > 0 && <Formats formats={data.formats}/>}
      </>}
      {(data.citations ?? []).length > 0 && <Citations citations={data.citations}/>}
    </section>
    <PromoLinks channel={channel} links={data.links} onChange={() => setReload(r => r + 1)}/>
  </>;
}

/** Joins above the line, leaves below it, one column per day. */
function DailyChart({data}: {data: ChannelGrowth}) {
  const i18n = useI18n();
  const {t} = i18n;
  const [table, setTable] = useState(false);
  // one scale for both: the halves above and below the line are as tall as their biggest day needs
  const maxJoined = Math.max(1, ...data.daily.map(d => d.joined)), maxLeft = Math.max(1, ...data.daily.map(d => d.left));
  const day = (date: string) => i18n.date(`${date}T12:00:00`, {day: 'numeric', month: 'short'});
  return <div className="growth-chart">
    <div className="growth-legend"><span><i className="joined"/>{t('growth.joined')}</span><span><i className="left"/>{t('growth.left')}</span><button className="text-button" onClick={() => setTable(v => !v)}>{table ? t('growth.show_chart') : t('growth.show_table')}</button></div>
    {table
      ? <div className="growth-table-scroll"><table className="growth-table"><thead><tr><th scope="col">{t('growth.day')}</th><th scope="col">{t('growth.joined')}</th><th scope="col">{t('growth.left')}</th></tr></thead><tbody>{[...data.daily].reverse().map(d => <tr key={d.date}><th scope="row">{day(d.date)}</th><td>{i18n.num(d.joined)}</td><td>{i18n.num(d.left)}</td></tr>)}</tbody></table></div>
      : <div className="growth-bars" role="img" aria-label={t('growth.chart_aria', {joined: i18n.num(data.joined), left: i18n.num(data.left)})}>
        {data.daily.map(d => <div className="growth-day" key={d.date} tabIndex={0} aria-label={`${day(d.date)}: +${d.joined} / −${d.left}`}>
          <span className="up" style={{flexGrow: maxJoined}}><span style={{height: `${d.joined / maxJoined * 100}%`}}/></span>
          <span className="down" style={{flexGrow: maxLeft}}><span style={{height: `${d.left / maxLeft * 100}%`}}/></span>
          <span className="growth-tip" role="tooltip"><strong>{day(d.date)}</strong><span><i className="joined"/>{t('growth.joined')} {i18n.num(d.joined)}</span><span><i className="left"/>{t('growth.left')} {i18n.num(d.left)}</span></span>
        </div>)}
      </div>}
  </div>;
}

function Effects({title, empty, posts}: {title: string; empty: string; posts: PostEffect[]}) {
  const i18n = useI18n();
  const {t} = i18n;
  return <div className="growth-effects"><h3>{title}</h3>
    {posts.length === 0 ? <p className="ins-muted">{empty}</p> : <ul className="ins-posts">{posts.slice(0, 4).map(p => <li key={p.messageId}>
      <span><strong dir="auto">{p.preview || kindName(p.kind, t)}</strong><small>{i18n.date(p.postedAt, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})} · {t('growth.in_hours', {h: i18n.num(p.hours, 1)})}</small></span>
      <span className="growth-effect"><span className="up">+{i18n.num(p.joined)}</span><span className="down">−{i18n.num(p.left)}</span></span>
      {p.url && <a className="icon-button" href={p.url} target="_blank" rel="noreferrer" aria-label={t('ins.open_tg')}><ExternalLink size={15}/></a>}
    </li>)}</ul>}
  </div>;
}

/** Organic subscribers each format brings, per post: the format that grows the channel isn't always the one with the most reactions. */
function Formats({formats}: {formats: FormatEffect[]}) {
  const i18n = useI18n();
  const {t, tn} = i18n;
  return <div className="growth-formats"><h3>{t('growth.formats')}</h3><p className="ins-muted">{t('growth.formats_text')}</p>
    <ul>{formats.map(f => {const net = Math.round((f.joined - f.left) * 10) / 10; return <li key={f.kind}>
      <span>{kindName(f.kind, t)} <small>{tn('ins.posts', f.posts)}</small></span>
      <strong className={net >= 0 ? 'up' : 'down'}>{t('growth.per_post', {n: i18n.signed(net)})}</strong>
      <small>+{i18n.num(f.joined, 1)} / −{i18n.num(f.left, 1)}</small>
    </li>;})}</ul>
  </div>;
}

/** Other channels that forwarded or mentioned this one lately: where most new subscribers come from. */
function Citations({citations}: {citations: Citation[]}) {
  const i18n = useI18n();
  const {t} = i18n;
  return <div className="growth-citations"><h3><Quote size={14}/>{t('growth.citations')}</h3><p className="ins-muted">{t('growth.citations_text')}</p>
    <ul className="ins-posts">{citations.map(c => <li key={c.username}>
      <span><strong dir="auto">{c.title}</strong><small><bdi dir="ltr">@{c.username}</bdi>{c.subscribers !== null && ` · ${i18n.compact(c.subscribers)}`} · {[c.forwards ? t('growth.forwards', {n: i18n.num(c.forwards)}) : '', c.mentions ? t('growth.mentions', {n: i18n.num(c.mentions)}) : ''].filter(Boolean).join(', ')} · {i18n.date(c.last, {day: 'numeric', month: 'short'})}</small></span>
      {c.url && <a className="icon-button" href={c.url} target="_blank" rel="noreferrer" aria-label={t('ins.open_tg')}><ExternalLink size={15}/></a>}
    </li>)}</ul>
  </div>;
}

const pct = (x: number | null, i18n: I18n) => x === null ? '—' : `${i18n.num(Math.round(x * 100))}%`;

function PromoLinks({channel, links, onChange}: {channel: Channel; links: PromoLinkStat[]; onChange: () => void}) {
  const i18n = useI18n();
  const {t} = i18n;
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [currency, setCurrency] = useState('$');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<number | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    const amount = cost.trim() ? Number(cost.replace(',', '.')) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {setError(t('growth.err.cost')); return;}
    setBusy(true); setError('');
    try {
      await api.createPromoLink(channel.id, {name: name.trim(), cost: amount, currency: amount ? currency.trim() || null : null});
      setName(''); setCost('');
      onChange();
    } catch (err) {setError(promoError(err, t));}
    finally {setBusy(false);}
  }
  async function revoke(l: PromoLinkStat) {
    if (!window.confirm(t('growth.revoke_confirm', {name: l.name}))) return;
    try {await api.revokePromoLink(channel.id, l.id); onChange();} catch (err) {setError(promoError(err, t));}
  }
  async function copy(l: PromoLinkStat) {
    try {await navigator.clipboard.writeText(l.url); setCopied(l.id); setTimeout(() => setCopied(c => c === l.id ? null : c), 1500);} catch {/* the link stays visible to copy by hand */}
  }

  return <section className="panel promo-panel" aria-labelledby="promo-title">
    <div className="panel-heading"><div><div className="mini-eyebrow"><Link2 size={13}/>{t('growth.promo_eyebrow')}</div><h2 id="promo-title">{t('growth.promo_title')}</h2><p>{t('growth.promo_text')}</p></div></div>
    <form className="promo-form" onSubmit={create}>
      <label className="promo-name"><span>{t('growth.promo_name')}</span><input value={name} maxLength={32} required placeholder={t('growth.promo_name_placeholder')} onChange={e => {setName(e.target.value); setError('');}}/></label>
      <label className="promo-cost"><span>{t('growth.promo_cost')}</span><span className="promo-money"><input inputMode="decimal" value={cost} placeholder="0" onChange={e => {setCost(e.target.value); setError('');}}/><input aria-label={t('growth.promo_currency')} value={currency} maxLength={8} onChange={e => setCurrency(e.target.value)}/></span></label>
      <button className="button primary" disabled={busy || !name.trim()}>{busy ? <LoaderCircle className="spin" size={15}/> : <Plus size={15}/>}{t('growth.promo_create')}</button>
    </form>
    {error && <p className="promo-error" role="alert">{error}</p>}
    {links.length === 0 ? <p className="ins-muted promo-empty">{t('growth.promo_empty')}</p> : <div className="promo-scroll"><table className="promo-table">
      <thead><tr><th scope="col">{t('growth.promo_name')}</th><th scope="col">{t('growth.joined')}</th><th scope="col">{t('growth.stayed')}</th><th scope="col">{t('growth.left')}</th><th scope="col" title={t('growth.kept_hint')}>{t('growth.kept7')}</th><th scope="col" title={t('growth.kept_hint')}>{t('growth.kept30')}</th><th scope="col">{t('growth.per_subscriber')}</th><th/></tr></thead>
      <tbody>{links.map(l => <tr key={l.id} className={l.revoked ? 'revoked' : ''}>
        <th scope="row"><strong dir="auto">{l.name}</strong><span className="promo-url">{l.revoked ? <em>{t('growth.revoked')}</em> : <><bdi>{l.url.replace(/^https:\/\//, '')}</bdi><button className="icon-button" onClick={() => copy(l)} aria-label={t('growth.copy')} title={t('growth.copy')}>{copied === l.id ? <Check size={14}/> : <Copy size={14}/>}</button></>}</span></th>
        <td>{i18n.num(l.joined)}</td><td>{i18n.num(l.stayed)}</td><td>{i18n.num(l.left)}</td>
        <td className={l.kept7 !== null && l.kept7 < 0.6 ? 'down' : ''}>{pct(l.kept7 ?? null, i18n)}</td><td className={l.kept30 !== null && l.kept30 < 0.5 ? 'down' : ''}>{pct(l.kept30 ?? null, i18n)}</td>
        <td>{l.costPerSubscriber !== null ? <><strong>{money(l.costPerSubscriber, l.currency, i18n)}</strong><small>{t('growth.of_cost', {cost: money(l.cost!, l.currency, i18n)})}</small></> : l.cost ? '—' : <small>{t('growth.free')}</small>}</td>
        <td>{!l.revoked && <button className="icon-button" onClick={() => revoke(l)} aria-label={t('growth.revoke', {name: l.name})} title={t('growth.revoke', {name: l.name})}><Trash2 size={14}/></button>}</td>
      </tr>)}</tbody>
    </table></div>}
  </section>;
}
