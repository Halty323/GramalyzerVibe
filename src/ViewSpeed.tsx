import { useEffect, useState } from 'react';
import { ExternalLink, Gauge, LoaderCircle } from 'lucide-react';
import type { Channel, PostSpeed, ViewPace, ViewSpeed } from '../shared/types';
import { api, errorMessage } from './api';
import { isKey, useI18n, type I18n } from './i18n';

const MARKS = ['h1', 'h6', 'h24'] as const;
const kindName = (kind: string, t: I18n['t']) => {const k = `kind.${kind}`; return isKey(k) ? t(k) : t('ins.post');};

/** How fast an own channel's posts gather views: the usual pace at 1, 6 and 24 hours, and each recent post against it. */
export function ViewSpeedSection({channel}: {channel: Channel}) {
  const i18n = useI18n();
  const {t} = i18n;
  const [data, setData] = useState<ViewSpeed | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    setError(null);
    api.viewSpeed(channel.id).then(d => {if (live) setData(d);}).catch(e => {if (live) setError(e);});
    return () => {live = false;};
  }, [channel.id]);

  if (error) return <div className="error-banner" role="alert">{errorMessage(error, t)}</div>;
  if (!data) return <section className="panel ins-empty"><LoaderCircle className="spin"/><p>{t('sp.loading')}</p></section>;
  if (!data.connected) return null;
  const known = MARKS.some(m => data.usual[m] !== null);

  return <section className="panel speed-panel" aria-labelledby="speed-title">
    <div className="panel-heading"><div><div className="mini-eyebrow"><Gauge size={13}/>{t('sp.eyebrow')}</div><h2 id="speed-title">{t('sp.title')}</h2><p>{t('sp.text')}</p></div></div>
    {!data.available ? <p className="growth-waiting">{t('sp.private')}</p> : <>
      <div className="growth-stats speed-usual">
        {MARKS.map(m => <div key={m}><small>{t(`sp.usual_${m}`)}</small><strong>{data.usual[m] === null ? '–' : i18n.compact(data.usual[m]!)}</strong></div>)}
      </div>
      {!known && <p className="speed-note">{t('sp.learning')}</p>}
      {data.posts.length === 0 ? <p className="ins-muted speed-note">{t('sp.empty')}</p> : <ul className="speed-list">{data.posts.map(p => <SpeedRow key={p.messageId} post={p} usual={data.usual}/>)}</ul>}
      <p className="ins-footnote speed-foot">{t('sp.hint')}</p>
    </>}
  </section>;
}

function SpeedRow({post: p, usual}: {post: PostSpeed; usual: ViewPace}) {
  const i18n = useI18n();
  const {t} = i18n;
  return <li className={`speed-row ${p.status}`}>
    <div className="speed-what">
      <strong dir="auto">{p.preview || kindName(p.kind, t)}</strong>
      <small>{i18n.ago(p.postedAt)}{p.views !== null && <> · {t('sp.views_now', {n: i18n.compact(p.views)})}</>}</small>
    </div>
    <div className="speed-marks">
      {MARKS.map(m => {
        const v = p[m], u = usual[m];
        const share = v !== null && u ? Math.min(v / u, 2) / 2 : 0;
        return <div key={m} className="speed-mark" title={v !== null && u ? t('sp.of_usual', {n: Math.round(v / u * 100)}) : undefined}>
          <small>{t(`sp.mark_${m}`)}</small>
          <span className="speed-bar" aria-hidden="true"><span style={{width: `${share * 100}%`}}/><i/></span>
          <b>{v === null ? '–' : i18n.compact(v)}</b>
        </div>;
      })}
    </div>
    <span className={`speed-status ${p.status}`}>{t(`sp.status.${p.status}`)}{p.ratio !== null && p.status !== 'early' && <small>{t('sp.of_usual', {n: Math.round(p.ratio * 100)})}</small>}</span>
    {p.url && <a className="icon-button" href={p.url} target="_blank" rel="noreferrer" aria-label={t('ins.open_tg')}><ExternalLink size={15}/></a>}
  </li>;
}
