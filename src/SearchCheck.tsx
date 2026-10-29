import { useEffect, useState, type CSSProperties } from 'react';
import { CircleAlert, CircleCheck, CircleX, LoaderCircle, Search, Sparkles } from 'lucide-react';
import type { Channel, SearchCheck } from '../shared/types';
import { CopyButton } from './Ai';
import { api, errorMessage } from './api';
import { isKey, useI18n } from './i18n';

const ICONS = {OK: CircleCheck, WARN: CircleAlert, BAD: CircleX};

/** How findable the channel is in Telegram's search: a score, what to fix, and better names to try. */
export function SearchCheckSection({channel, onAi}: {channel: Channel; onAi: (check: SearchCheck) => void}) {
  const {t} = useI18n();
  const [data, setData] = useState<SearchCheck | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    setError(null);
    api.searchCheck(channel.id).then(d => {if (live) setData(d);}).catch(e => {if (live) setError(e);});
    return () => {live = false;};
  }, [channel.id]);

  if (error) return <div className="error-banner" role="alert">{errorMessage(error, t)}</div>;
  if (!data) return <section className="panel ins-empty"><LoaderCircle className="spin"/><p>{t('sc.loading')}</p></section>;
  // a private channel has no username, so "make it public" says everything about the username
  const checks = data.checks.filter(c => data.username || !c.id.startsWith('username_'));

  return <section className="panel sc-panel" aria-labelledby="sc-title">
    <div className="panel-heading">
      <div><div className="mini-eyebrow"><Search size={13}/>{t('sc.eyebrow')}</div><h2 id="sc-title">{t('sc.title')}</h2><p>{t('sc.text')}</p></div>
      <button className="button lavender" onClick={() => onAi(data)}><Sparkles size={15}/>{t('sc.ai')}</button>
    </div>
    <div className="sc-body">
      <div className={`sc-score ${data.grade}`} role="img" aria-label={t('sc.score_aria', {score: data.score})} style={{'--score': data.score} as CSSProperties}>
        <span><strong>{data.score}</strong><small>/100</small></span>
        <em>{t(`sc.grade.${data.grade}`)}</em>
      </div>
      <ul className="sc-checks">{checks.map(c => {
        const key = `sc.check.${c.id}.${c.status.toLowerCase()}`;
        const Icon = ICONS[c.status];
        return <li key={c.id} className={c.status.toLowerCase()}><Icon size={16} aria-hidden="true"/><span>{isKey(key) ? t(key, {words: c.words.map(w => `«${w}»`).join(', ')}) : c.id}</span></li>;
      })}</ul>
    </div>
    {data.keywords.length > 0 && <div className="sc-words">
      <small>{t('sc.words')}</small>
      {data.keywords.map(k => <span key={k.word} className={`sc-word${k.inTitle ? ' in' : ''}`} dir="auto">{k.word}{k.inTitle && <CircleCheck size={12} aria-label={t('sc.in_title')}/>}</span>)}
    </div>}
    {(data.titleIdeas.length > 0 || data.usernameIdeas.length > 0) && <div className="sc-ideas">
      {data.titleIdeas.length > 0 && <div><h3>{t('sc.title_ideas')}</h3><ul>{data.titleIdeas.map(x => <li key={x}><span dir="auto">{x}</span><CopyButton text={x}/></li>)}</ul></div>}
      {data.usernameIdeas.length > 0 && <div><h3>{t('sc.username_ideas')}</h3><ul>{data.usernameIdeas.map(x => <li key={x}><bdi dir="ltr">@{x}</bdi><CopyButton text={`@${x}`}/></li>)}</ul><p className="ins-footnote">{t('sc.free_hint')}</p></div>}
    </div>}
    <p className="ins-footnote speed-foot">{t('sc.legend')}</p>
  </section>;
}
