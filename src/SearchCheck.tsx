import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { CircleAlert, CircleCheck, CircleX, Info, LoaderCircle, MapPin, Plus, Search, Sparkles } from 'lucide-react';
import type { Channel, SearchCheck, SearchPosition } from '../shared/types';
import { CopyButton } from './Ai';
import { api, errorMessage } from './api';
import { isKey, useI18n } from './i18n';

const ICONS = {OK: CircleCheck, WARN: CircleAlert, BAD: CircleX};

/**
 * How findable the channel is in Telegram's search: a score in two parts (can people find it, will they join), what to
 * fix, better names to try, what no wording changes, and the positions the owner found when searching themselves.
 */
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
      <div className="sc-groups">{(['find', 'join'] as const).map(group => <div key={group}>
        <h3>{t(`sc.group.${group}`)} <span className="subtle-badge">{group === 'find' ? data.find : data.join}/{group === 'find' ? 60 : 40}</span></h3>
        <ul className="sc-checks">{checks.filter(c => (c.group ?? 'find') === group).map(c => {
          const key = `sc.check.${c.id}.${c.status.toLowerCase()}`;
          const Icon = ICONS[c.status];
          return <li key={c.id} className={c.status.toLowerCase()}><Icon size={16} aria-hidden="true"/><span>{isKey(key) ? t(key, {words: c.words.map(w => `«${w}»`).join(', ')}) : c.id}</span></li>;
        })}</ul>
      </div>)}</div>
    </div>
    {data.keywords.length > 0 && <div className="sc-words">
      <small>{t('sc.words')}</small>
      {data.keywords.map(k => <span key={k.word} className={`sc-word${k.inTitle ? ' in' : ''}`} dir="auto">{k.word}{k.inTitle && <CircleCheck size={12} aria-label={t('sc.in_title')}/>}</span>)}
    </div>}
    {(data.titleIdeas.length > 0 || data.usernameIdeas.length > 0) && <div className="sc-ideas">
      {data.titleIdeas.length > 0 && <div><h3>{t('sc.title_ideas')}</h3><ul>{data.titleIdeas.map(x => <li key={x}><span dir="auto">{x}</span><CopyButton text={x}/></li>)}</ul></div>}
      {data.usernameIdeas.length > 0 && <div><h3>{t('sc.username_ideas')}</h3><ul>{data.usernameIdeas.map(x => <li key={x}><bdi dir="ltr">@{x}</bdi><CopyButton text={`@${x}`}/></li>)}</ul><p className="ins-footnote">{t('sc.free_hint')}</p></div>}
    </div>}
    <Positions channel={channel} positions={data.positions ?? []} words={data.keywords.map(k => k.word)}/>
    {(data.notes ?? []).length > 0 && <div className="sc-notes"><h3><Info size={14}/>{t('sc.notes')}</h3><ul>{data.notes.map(n => {const k = `sc.note.${n}`; return isKey(k) ? <li key={n}>{t(k)}</li> : null;})}</ul></div>}
  </section>;
}

/** Where the owner found the channel when they searched a word in Telegram, and where it was the time before. */
function Positions({channel, positions, words}: {channel: Channel; positions: SearchPosition[]; words: string[]}) {
  const i18n = useI18n();
  const {t} = i18n;
  const [list, setList] = useState(positions);
  const [word, setWord] = useState('');
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setList(positions), [positions]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const n = place.trim() ? Number(place) : null;
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 1000)) {setError(t('sc.pos_bad')); return;}
    setBusy(true); setError('');
    try {setList(await api.notePosition(channel.id, word.trim(), n)); setWord(''); setPlace('');}
    catch (err) {setError(errorMessage(err, t));}
    finally {setBusy(false);}
  }
  const shown = (p: number | null) => p === null ? t('sc.pos_none') : `#${p}`;

  return <div className="sc-positions">
    <h3><MapPin size={14}/>{t('sc.positions')}</h3>
    <p className="ins-muted">{t('sc.positions_text')}</p>
    {list.length > 0 && <ul>{list.map(p => <li key={p.word}>
      <span dir="auto">{p.word}</span>
      <strong className={p.previous === null || p.position === p.previous ? '' : (p.position ?? 9999) < (p.previous ?? 9999) ? 'up' : 'down'}>{shown(p.position)}</strong>
      <small>{i18n.date(p.checkedAt, {day: 'numeric', month: 'short'})}{p.previous !== null && ` · ${t('sc.pos_before', {position: shown(p.previous)})}`}</small>
    </li>)}</ul>}
    <form onSubmit={save}>
      <input aria-label={t('sc.pos_word')} placeholder={words[0] ?? t('sc.pos_word')} value={word} maxLength={64} required onChange={e => {setWord(e.target.value); setError('');}}/>
      <input aria-label={t('sc.pos_place')} placeholder={t('sc.pos_place')} inputMode="numeric" value={place} onChange={e => {setPlace(e.target.value); setError('');}}/>
      <button className="button small-button" disabled={busy || !word.trim()}>{busy ? <LoaderCircle size={14} className="spin"/> : <Plus size={14}/>}{t('sc.pos_save')}</button>
    </form>
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>;
}
