import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Check, Flame, LoaderCircle, Pencil, Target, Trash2, X } from 'lucide-react';
import type { Channel, ChannelGoal, GoalProgress, GoalSuggestion, PostingStreak } from '../shared/types';
import { api, ApiError, errorMessage } from './api';
import { isKey, useI18n, type I18n } from './i18n';

const PER_WEEK = [1, 2, 3, 5, 7, 10, 14];

/** The backend's goal errors ("goal.err_low") have their own texts here ("goals.err_low"). */
function goalError(e: unknown, t: I18n['t']): string {
  const key = e instanceof ApiError && e.code?.startsWith('goal.') ? `goals.${e.code.slice(5)}` : '';
  return isKey(key) ? t(key) : errorMessage(e, t);
}

/** A calendar day ("2026-12-31") in the reader's language. */
const day = (d: string, i18n: I18n) => i18n.date(`${d}T12:00:00Z`, {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
const signed = (x: number, i18n: I18n) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${i18n.num(Math.abs(x), 1)}`;

/** The channel's subscriber goal with its pace, and the weekly posting streak. */
export function GoalSection({channel}: {channel: Channel}) {
  const i18n = useI18n();
  const {t} = i18n;
  const [data, setData] = useState<ChannelGoal | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    setError(null);
    api.goal(channel.id).then(d => {if (live) setData(d);}).catch(e => {if (live) setError(e);});
    return () => {live = false;};
  }, [channel.id]);

  if (error) return <div className="error-banner" role="alert">{errorMessage(error, t)}</div>;
  if (!data) return <section className="panel ins-empty"><LoaderCircle className="spin"/><p>{t('goals.loading')}</p></section>;
  if (!data.connected || !data.status) return null;
  const s = data.status;
  return <section className="panel goal-panel" aria-labelledby="goal-title">
    <div className="panel-heading"><div><div className="mini-eyebrow"><Target size={13}/>{t('goals.eyebrow')}</div><h2 id="goal-title">{t('goals.title')}</h2><p>{t('goals.text')}</p></div></div>
    <div className="goal-body">
      <GoalCard channel={channel} subscribers={s.subscribers} goal={s.goal} suggestions={s.suggestions} onChange={setData}/>
      <StreakCard channel={channel} streak={s.streak} onChange={setData}/>
    </div>
  </section>;
}

function GoalCard({channel, subscribers, goal, suggestions, onChange}: {channel: Channel; subscribers: number | null; goal: GoalProgress | null; suggestions: GoalSuggestion[]; onChange: (d: ChannelGoal) => void}) {
  const i18n = useI18n();
  const {t} = i18n;
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(call: () => Promise<ChannelGoal>) {
    setBusy(true); setError('');
    try {onChange(await call()); setEditing(false);} catch (e) {setError(goalError(e, t));} finally {setBusy(false);}
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void run(() => api.setGoal(channel.id, Number(target), deadline));
  }
  function edit() {
    const d = new Date(); d.setMonth(d.getMonth() + 2, 0);
    setTarget(String(goal?.target ?? suggestions[0]?.target ?? '')); setDeadline(goal?.deadline ?? suggestions[0]?.deadline ?? d.toISOString().slice(0, 10)); setEditing(true);
  }

  const form = <form className="goal-form" onSubmit={submit}>
    <label>{t('goals.target')}<input type="number" min={(subscribers ?? 0) + 1} required value={target} onChange={e => setTarget(e.target.value)}/></label>
    <label>{t('goals.deadline')}<input type="date" required value={deadline} onChange={e => setDeadline(e.target.value)}/></label>
    <div className="goal-actions"><button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>}{t('goals.save')}</button><button type="button" className="button" onClick={() => {setEditing(false); setError('');}}><X size={15}/>{t('app.cancel')}</button></div>
  </form>;

  if (!goal) return <div className="goal-card">
    <h3><Target size={15}/>{t('goals.goal')}</h3>
    {subscribers == null ? <p className="ds-note">{t('goals.no_count')}</p> : <>
      <p className="ds-note">{t('goals.none', {n: i18n.num(subscribers)})}</p>
      {editing ? form : <div className="goal-actions">
        {suggestions.map(x => <button key={x.deadline} className="button" disabled={busy} onClick={() => void run(() => api.setGoal(channel.id, x.target, x.deadline))}>{t('goals.preset', {gain: `+${i18n.num(x.gain)}`, date: day(x.deadline, i18n)})}</button>)}
        <button className="button lavender" onClick={edit}><Pencil size={14}/>{t('goals.own')}</button>
      </div>}
    </>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>;

  const r = 44, c = 2 * Math.PI * r;
  const verdict = goal.state === 'REACHED' ? t('goals.reached') : goal.state === 'MISSED' ? t('goals.missed', {n: i18n.num(goal.needed)})
    : goal.state === 'NO_DATA' ? t('goals.no_pace', {n: i18n.num(goal.needed)})
    : goal.state === 'ON_TRACK' ? t('goals.on_track', {date: goal.eta ? day(goal.eta, i18n) : '—'}) : t('goals.behind', {n: i18n.num(goal.projected ?? 0)});
  return <div className={`goal-card ${goal.state.toLowerCase()}`}>
    <h3><Target size={15}/>{t('goals.goal')}<span className={`goal-state ${goal.state.toLowerCase()}`}>{t(`goals.state.${goal.state}`)}</span></h3>
    <div className="goal-main">
      <svg className="goal-ring" viewBox="0 0 100 100" role="img" aria-label={t('goals.percent', {n: goal.percent})}><circle cx="50" cy="50" r={r} className="track"/><circle cx="50" cy="50" r={r} className="fill" strokeDasharray={c} strokeDashoffset={c * (1 - goal.percent / 100)}/><text x="50" y="55" textAnchor="middle">{goal.percent}%</text></svg>
      <div className="goal-numbers">
        <strong>{t('goals.target_line', {n: i18n.num(goal.target), date: day(goal.deadline, i18n)})}</strong>
        <span>{t('goals.now', {n: goal.current == null ? '—' : i18n.num(goal.current), gained: signed(goal.gained, i18n)})}</span>
        <p>{verdict}</p>
        {goal.perDay != null && (goal.state === 'ON_TRACK' || goal.state === 'BEHIND') && <small>{t('goals.pace', {pace: signed(goal.perDay, i18n), need: signed(goal.needPerDay, i18n)})}</small>}
      </div>
    </div>
    {editing ? form : <div className="goal-actions"><button className="button small-button" onClick={edit}><Pencil size={14}/>{t('goals.change')}</button><button className="button small-button" disabled={busy} onClick={() => void run(() => api.clearGoal(channel.id))}><Trash2 size={14}/>{t('goals.remove')}</button></div>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>;
}

function StreakCard({channel, streak, onChange}: {channel: Channel; streak: PostingStreak; onChange: (d: ChannelGoal) => void}) {
  const i18n = useI18n();
  const {t, tn} = i18n;
  const [error, setError] = useState('');
  const top = Math.max(streak.target, ...streak.recent, 1);
  const done = streak.thisWeek >= streak.target;
  const atRisk = streak.weeks > 0 && !done;
  return <div className={`goal-card streak-card ${atRisk ? 'at-risk' : ''}`}>
    <h3><Flame size={15}/>{t('goals.streak')}</h3>
    <div className="streak-main">
      <span className="streak-count"><Flame size={22}/><strong>{streak.weeks}</strong></span>
      <div className="goal-numbers">
        <strong>{streak.weeks ? tn('goals.weeks', streak.weeks) : t('goals.no_streak')}</strong>
        <span>{t('goals.rule', {n: streak.target})}{streak.best > 0 && ` · ${t('goals.best', {weeks: tn('goals.weeks', streak.best)})}`}</span>
        <p>{done ? t('goals.week_done', {n: i18n.num(streak.thisWeek)}) : t(atRisk ? 'goals.week_risk' : 'goals.week_left', {n: streak.thisWeek, target: streak.target, missing: streak.target - streak.thisWeek, days: tn('goals.days', streak.daysLeft)})}</p>
      </div>
    </div>
    <div className="streak-weeks" role="img" aria-label={t('goals.weeks_aria')}>{streak.recent.map((n, i) => {
      const now = i === streak.recent.length - 1;
      return <span key={i} className={`${n >= streak.target ? 'met' : ''} ${now ? 'now' : ''}`} style={{'--h': `${Math.max(6, n / top * 100)}%`} as CSSProperties} title={now ? t('goals.this_week', {n}) : tn('goals.weeks_ago', streak.recent.length - 1 - i, {posts: n})}><i/><small>{n}</small></span>;
    })}<em title={t('goals.rule', {n: streak.target})} style={{'--t': streak.target / top} as CSSProperties}/></div>
    <label className="streak-target">{t('goals.per_week')}<select value={streak.target} onChange={async e => {setError(''); try {onChange(await api.setStreak(channel.id, Number(e.target.value)));} catch (err) {setError(goalError(err, t));}}}>{[...new Set([...PER_WEEK, streak.target])].sort((a, b) => a - b).map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    {error && <p className="error-text" role="alert">{error}</p>}
  </div>;
}
