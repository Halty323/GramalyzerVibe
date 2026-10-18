import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, BadgeCheck, Eye, Flame, LoaderCircle, Plus, RefreshCw, Rocket, Telescope, Trash2, TriangleAlert, Zap, type LucideIcon } from 'lucide-react';
import type { TrackedSummary } from '../shared/types';
import { errorMessage } from './api';
import { burstFrom, ChannelAvatar, Sparkline } from './fun';
import { useI18n, type StringKey } from './i18n';

type Column = 'title' | 'subscribers' | 'change7' | 'avgViews' | 'er' | 'postsPerDay' | 'lastPost';
const COLUMNS: [Column, StringKey][] = [['title', 'watch.col.channel'], ['subscribers', 'watch.col.subscribers'], ['change7', 'watch.col.change'], ['avgViews', 'watch.col.views'], ['er', 'watch.col.er'], ['postsPerDay', 'watch.col.per_day'], ['lastPost', 'watch.col.last']];
const value = (s: TrackedSummary, col: Column) => col === 'title' ? s.title.toLowerCase() : col === 'lastPost' ? (s.lastPost ? Date.parse(s.lastPost) : null) : s[col];

/** Public channels the workspace keeps an eye on: add by username, compare, open in the viewer. */
export function Watchlist({tracked, focus, onTrack, onUntrack, onRefresh, onOpen}: {
  tracked: TrackedSummary[] | null; focus: boolean;
  onTrack: (username: string) => Promise<unknown>; onUntrack: (username: string) => Promise<boolean>;
  onRefresh: (username: string) => Promise<void>; onOpen: (username: string) => void;
}) {
  const {t, tn, num, compact, signed, ago} = useI18n();
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<{col: Column; desc: boolean}>({col: 'subscribers', desc: true});
  const [removing, setRemoving] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const rows = useMemo(() => [...tracked ?? []].sort((a, b) => {
    const x = value(a, sort.col), y = value(b, sort.col);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1; // unknowns last, whichever way
    return (x < y ? -1 : x > y ? 1 : 0) * (sort.desc ? -1 : 1);
  }), [tracked, sort]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setAdding(true); setError('');
    try {await onTrack(input.trim()); setInput(''); burstFrom(button.current, ['🎉', '🔭', '📈', '✨', '💜']);}
    catch (err) {setError(errorMessage(err, t));}
    finally {setAdding(false);}
  }
  const best = (pick: (s: TrackedSummary) => number | null) => rows.filter(s => (pick(s) ?? 0) > 0).sort((a, b) => pick(b)! - pick(a)!)[0];
  const highlights: [LucideIcon, StringKey, TrackedSummary | undefined, (s: TrackedSummary) => string][] = rows.length < 2 ? [] : [
    [Rocket, 'watch.fastest', best(s => s.change7), s => t('view.in_7_days', {change: signed(s.change7!)})],
    [Flame, 'watch.engaging', best(s => s.er), s => `${t('watch.col.er')} ${num(s.er!, 1)}%`],
    [Zap, 'watch.busiest', best(s => s.postsPerDay), s => tn('watch.per_day', Math.round(s.postsPerDay! * 10) / 10)],
  ];

  return <>
    <section className="panel watch-add">
      <form onSubmit={add}>
        <label><span>{t('watch.add_label')}</span><span className="watch-input"><Telescope size={17}/><input autoFocus={focus} placeholder={t('watch.add_placeholder')} value={input} onChange={e => {setInput(e.target.value); setError('');}} aria-invalid={!!error} aria-describedby={error ? 'watch-error' : undefined}/></span></label>
        <button ref={button} className="button primary" disabled={adding || !input.trim()}>{adding ? <LoaderCircle size={16} className="spin"/> : <Plus size={16}/>}{t('watch.add')}</button>
      </form>
      {error && <p className="error-text" id="watch-error" role="alert">{error}</p>}
    </section>
    {highlights.some(([, , s]) => s) && <div className="watch-highlights">{highlights.map(([Icon, label, s, line]) => s && <button key={label} className="watch-highlight" onClick={() => onOpen(s.username)}><span className="watch-highlight-icon"><Icon size={17}/></span><span><small>{t(label)}</small><strong>{s.title}</strong><em>{line(s)}</em></span></button>)}</div>}
    <section className="panel watch-panel">
      <div className="panel-heading"><div><h2>{t('watch.title')} <span className="subtle-badge">{tn('watch.count', rows.length)}</span></h2><p>{t('watch.text')}</p></div></div>
      {tracked === null ? <div className="ins-empty"><LoaderCircle className="spin"/></div> : !rows.length ? <div className="empty-state"><Telescope size={28}/><h3>{t('watch.empty_title')}</h3><p>{t('watch.empty_text')}</p></div> :
      <div className="table-scroll"><table className="watch-table"><thead><tr>
        {COLUMNS.map(([col, label]) => <th key={col} aria-sort={sort.col === col ? (sort.desc ? 'descending' : 'ascending') : undefined}><button onClick={() => setSort(s => ({col, desc: s.col === col ? !s.desc : col !== 'title'}))}>{t(label)}{sort.col === col && (sort.desc ? <ArrowDown size={11}/> : <ArrowUp size={11}/>)}</button></th>)}
        <th>{t('watch.col.trend')}</th><th aria-label={t('table.actions')}/>
      </tr></thead><tbody>{rows.map((s, i) => <tr key={s.username} style={{'--i': Math.min(i, 12)} as CSSProperties}>
        <td><button className="watch-who" onClick={() => onOpen(s.username)} aria-label={t('watch.open', {name: s.title})}><ChannelAvatar title={s.title} seed={s.username} photoUrl={s.photoUrl} size={36}/><span><strong>{s.title}{s.verified && <BadgeCheck size={13} className="tg-verified"/>}</strong><small><bdi>@{s.username}</bdi>{s.demo && <span className="subtle-badge">{t('app.sample')}</span>}{s.error && <TriangleAlert size={12} className="watch-warn" aria-label={t(`err.${s.error}`)}><title>{t(`err.${s.error}`)}</title></TriangleAlert>}</small></span></button></td>
        <td className="num">{s.subscribers !== null ? num(s.subscribers) : '—'}</td>
        <td className={`num ${s.change7 === null ? '' : s.change7 >= 0 ? 'up' : 'down'}`}>{s.change7 !== null ? signed(s.change7) : '—'}</td>
        <td className="num">{s.avgViews !== null ? compact(s.avgViews) : '—'}</td>
        <td className="num">{s.er !== null ? `${num(s.er, 1)}%` : '—'}</td>
        <td className="num">{s.postsPerDay !== null ? num(s.postsPerDay, 1) : '—'}</td>
        <td>{s.lastPost ? ago(s.lastPost) : t('watch.never')}</td>
        <td><Sparkline values={s.series}/></td>
        <td><span className="watch-actions">{removing === s.username ? <span className="delete-confirm"><span>{t('watch.remove_q')}</span><button onClick={async () => {if (await onUntrack(s.username)) setRemoving(null);}}>{t('app.yes')}</button><button onClick={() => setRemoving(null)}>{t('app.cancel')}</button></span> : <>
          <button className="icon-button" aria-label={t('watch.open', {name: s.title})} title={t('watch.open', {name: s.title})} onClick={() => onOpen(s.username)}><Eye size={16}/></button>
          <button className="icon-button" aria-label={t('watch.refresh', {name: s.title})} title={t('watch.refresh', {name: s.title})} disabled={refreshing === s.username} onClick={async () => {setRefreshing(s.username); try {await onRefresh(s.username);} finally {setRefreshing(null);}}}><RefreshCw size={16} className={refreshing === s.username ? 'spin' : ''}/></button>
          <button className="icon-button" aria-label={t('watch.remove', {name: s.title})} title={t('watch.remove', {name: s.title})} onClick={() => setRemoving(s.username)}><Trash2 size={16}/></button></>}</span></td>
      </tr>)}</tbody></table></div>}
      <p className="watch-footnote">{t('watch.footnote')}</p>
    </section>
  </>;
}
