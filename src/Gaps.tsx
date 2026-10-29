import { useEffect, useState } from 'react';
import { ExternalLink, LoaderCircle, Sparkles, Swords } from 'lucide-react';
import type { Channel, CompetitorGap, CompetitorGaps, GapReport } from '../shared/types';
import { api, errorMessage } from './api';
import { isKey, useI18n, type I18n } from './i18n';

/** A format, a 4-hour block, a length or a word, in the reader's language. */
export function gapLabel(g: CompetitorGap, i18n: I18n): string {
  const known = (k: string) => isKey(k) ? i18n.t(k) : g.key;
  switch (g.dimension) {
    case 'FORMAT': return known(`kind.${g.key}`);
    case 'LENGTH': return known(`len.${g.key}`);
    case 'HOURS': {const h = Number(g.key); return `${i18n.hour(h)}–${i18n.hour((h + 4) % 24)}`;}
    default: return g.key.startsWith('#') ? g.key : `«${g.key}»`;
  }
}

/** Where the channels on the watchlist win and this one doesn't, and where it's ahead. */
export function GapsSection({channel, onAi}: {channel: Channel; onAi: (report: GapReport) => void}) {
  const i18n = useI18n();
  const {t} = i18n;
  const [data, setData] = useState<CompetitorGaps | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    setError(null);
    api.gaps(channel.id).then(d => {if (live) setData(d);}).catch(e => {if (live) setError(e);});
    return () => {live = false;};
  }, [channel.id]);

  if (error) return <div className="error-banner" role="alert">{errorMessage(error, t)}</div>;
  if (!data) return <section className="panel ins-empty"><LoaderCircle className="spin"/><p>{t('gp.loading')}</p></section>;
  if (!data.connected || !data.report) return null;
  const r = data.report;

  return <section className="panel gap-panel" aria-labelledby="gap-title">
    <div className="panel-heading">
      <div><div className="mini-eyebrow"><Swords size={13}/>{t('gp.eyebrow')}</div><h2 id="gap-title">{t('gp.title')}</h2><p>{t('gp.text')}</p></div>
      {r.status === 'ready' && <button className="button lavender" onClick={() => onAi(r)}><Sparkles size={15}/>{t('gp.ai')}</button>}
    </div>
    {r.status === 'no_competitors' && <p className="growth-waiting">{t('gp.none')}</p>}
    {r.status === 'learning' && <p className="growth-waiting">{t('gp.learning', {theirs: r.theirPosts, yours: r.yourPosts})}</p>}
    {r.status === 'ready' && <>
      <div className="gap-rivals">
        <small>{t('gp.compared')}</small>
        {r.rivals.map(x => <span key={x.username} className="gap-rival"><strong dir="auto">{x.title}</strong><bdi dir="ltr">@{x.username}</bdi>{x.subscribers !== null && <em>{i18n.compact(x.subscribers)}</em>}</span>)}
      </div>
      {r.measure === 'ENGAGEMENT' && <p className="speed-note">{t('gp.by_engagement')}</p>}
      <h3 className="gap-heading">{t('gp.they_win')}</h3>
      {r.gaps.length === 0 ? <p className="ins-muted speed-note">{t('gp.no_gaps')}</p>
        : <ul className="gap-list">{r.gaps.map(g => <GapRow key={`${g.dimension}-${g.key}`} gap={g}/>)}</ul>}
      {r.edges.length > 0 && <>
        <h3 className="gap-heading">{t('gp.you_win')}</h3>
        <ul className="gap-list">{r.edges.map(g => <li key={`${g.dimension}-${g.key}`} className="gap-row edge">
          <div className="gap-what"><small>{t(`gp.dim.${g.dimension}`)}</small><strong dir="auto">{gapLabel(g, i18n)}</strong></div>
          <span className="gap-chip edge">{t('gp.yours', {lift: `${i18n.num(g.yourLift ?? 0, 1)}×`})}</span>
        </li>)}</ul>
      </>}
      <p className="ins-footnote speed-foot">{t('gp.legend')}</p>
    </>}
  </section>;
}

function GapRow({gap: g}: {gap: CompetitorGap}) {
  const i18n = useI18n();
  const {t} = i18n;
  const max = Math.max(2, g.theirLift, g.yourLift ?? 0);
  const you = g.yourPosts === 0 ? t('gp.you_never') : g.missing ? t('gp.you_rarely', {share: Math.round(g.yourShare * 100)}) : t('gp.you_weaker', {lift: `${i18n.num(g.yourLift ?? 0, 1)}×`});
  return <li className="gap-row">
    <div className="gap-what">
      <small>{t(`gp.dim.${g.dimension}`)}</small>
      <strong dir="auto">{gapLabel(g, i18n)}</strong>
    </div>
    <div className="gap-bars" aria-hidden="true">
      <span className="gap-bar them"><span style={{width: `${g.theirLift / max * 100}%`}}/></span>
      <span className="gap-bar you"><span style={{width: `${(g.yourLift ?? 0) / max * 100}%`}}/></span>
    </div>
    <div className="gap-numbers">
      <span>{t('gp.their', {lift: `${i18n.num(g.theirLift, 1)}×`, share: Math.round(g.theirShare * 100)})}</span>
      <span className="gap-chip">{you}</span>
    </div>
    {g.example?.preview && <p className="gap-example">
      <small>{t('gp.example')}</small> <span dir="auto">{g.example.preview}</span> <bdi dir="ltr">@{g.example.channel}</bdi>
      {g.example.url && <a className="icon-button" href={g.example.url} target="_blank" rel="noreferrer" aria-label={t('ins.open_tg')}><ExternalLink size={14}/></a>}
    </p>}
  </li>;
}
