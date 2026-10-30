import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Bot, CalendarPlus, Check, Copy, ExternalLink, Eye, EyeOff, Image, LoaderCircle, MessageSquarePlus, PenLine, RefreshCw, Settings2, Sparkles, Square, WandSparkles, X } from 'lucide-react';
import type { Channel, ChannelInsights, FeedPost, GapReport, Post, SearchCheck, TrackedStats, TrackedSummary } from '../shared/types';
import { AiError, complete, listModels, parsePlan, streamChat, type ChatMessage, type PlannedPost } from './ai/client';
import { channelContext, grounding } from './ai/context';
import { channelLook, type Look } from './ai/look';
import * as prompts from './ai/prompts';
import { PROVIDERS, provider } from './ai/providers';
import { aiReady, saveAiSettings, useAiSettings, type AiSettings } from './ai/settings';
import { LANGS, useI18n, type I18n } from './i18n';
import { openExternal } from './platform';

/** A failed AI request in the reader's language, with what the provider said after it. */
export function aiErrorText(e: unknown, t: I18n['t']): string {
  if (e instanceof AiError) return [t(`ai.err.${e.kind}`), e.detail].filter(Boolean).join(' ');
  return (e instanceof Error && e.message) || t('app.error');
}

/** One streamed AI answer at a time: start it, watch it arrive, stop it. Starting again cancels the previous one. */
export function useAiRun() {
  const settings = useAiSettings();
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const {t} = useI18n();
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function run(messages: () => Promise<ChatMessage[]>, temperature = 0.8): Promise<string | null> {
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    setOutput(''); setError(''); setRunning(true);
    try {
      const text = await streamChat(settings, await messages(), temperature, piece => {if (!controller.signal.aborted) setOutput(o => o + piece);}, controller.signal);
      return text;
    } catch (e) {
      if (!controller.signal.aborted) setError(aiErrorText(e, t));
      return null;
    } finally {
      if (abort.current === controller) {setRunning(false); abort.current = null;}
    }
  }
  function stop() {abort.current?.abort(); abort.current = null; setRunning(false);}
  function reset() {stop(); setOutput(''); setError('');}
  return {output, running, error, run, stop, reset, ready: aiReady(settings), settings};
}

/** Shown in place of an AI tool until a provider is connected. */
export function AiSetup({onSetup, compact = false}: {onSetup: () => void; compact?: boolean}) {
  const {t} = useI18n();
  return <div className={`ai-setup ${compact ? 'compact' : ''}`}><span className="ai-mark"><Sparkles size={18}/></span><div><strong>{t('ai.setup_title')}</strong><p>{t('ai.setup_text')}</p></div><button type="button" className="button lavender" onClick={onSetup}>{t('ai.setup_cta')}</button></div>;
}

/** An answer as it streams in, with its actions underneath. */
export function AiOutput({text, running, error, onStop, children}: {text: string; running: boolean; error: string; onStop: () => void; children?: ReactNode}) {
  const {t} = useI18n();
  const [copied, setCopied] = useState(false);
  if (!text && !running && !error) return null;
  return <div className="ai-output" aria-live="polite" aria-busy={running}>
    {(text || running) && <div className="ai-text" dir="auto">{text}{running && <span className="ai-caret"/>}</div>}
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="ai-actions">
      {running ? <button type="button" className="button small-button" onClick={onStop}><Square size={13}/>{t('ai.stop')}</button>
        : text && <button type="button" className="button small-button" onClick={() => {void navigator.clipboard?.writeText(text).then(() => {setCopied(true); setTimeout(() => setCopied(false), 1500);});}}>{copied ? <Check size={14}/> : <Copy size={14}/>}{copied ? t('ai.copied') : t('ai.copy')}</button>}
      {!running && text && children}
    </div>
  </div>;
}

/** What the AI knows about a channel: how many of its posts it reads, and whether it has looked at the pictures. */
function useKnowledge(channel: Channel | undefined) {
  const settings = useAiSettings();
  const [known, setKnown] = useState<{posts: number; pictures: number; look: Look | null} | null>(null);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    if (!channel || !aiReady(settings)) {setKnown(null); return;}
    let live = true;
    void grounding(channel.id).then(({feed}) => {
      const own = prompts.ownPosts(feed);
      const counts = {posts: own.length, pictures: own.filter(prompts.isPicture).length};
      if (!live) return;
      setKnown({...counts, look: null});
      return channelLook(channel, feed, settings, again > 0).then(look => {if (live) setKnown({...counts, look});});
    });
    return () => {live = false;};
  }, [channel?.id, settings.baseUrl, settings.apiKey, settings.visionModel, again]); // eslint-disable-line react-hooks/exhaustive-deps
  return {known, again: () => setAgain(n => n + 1)};
}

/** A line under an AI tool saying what it read of the channel; opens to what it saw in the pictures. */
function Knowledge({channel, onSetup}: {channel: Channel | undefined; onSetup: () => void}) {
  const {t, tn} = useI18n();
  const settings = useAiSettings();
  const {known, again} = useKnowledge(channel);
  if (!channel || !known) return null;
  const look = known.look;
  // Pictures the AI can't see: the posts came from the bot, which keeps captions but not pictures.
  const hidden = look?.state === 'none' && known.pictures > 0;
  const state = !look ? (known.pictures ? t('ai.look_pending') : '') : look.state === 'ready' ? t('ai.look_ready') : look.state === 'failed' ? t('ai.look_failed_short') : look.state === 'off' ? t('ai.look_off') : hidden ? t('ai.look_hidden') : '';
  return <details className="ai-knows">
    <summary><Eye size={14}/><span>{known.posts ? tn('ai.knows_posts', known.posts) : t('ai.knows_none')}{known.pictures > 0 && ` · ${tn('ai.knows_pictures', known.pictures)}`}{state && ` · ${state}`}</span>{!look && known.pictures > 0 && <LoaderCircle size={13} className="spin"/>}</summary>
    <div className="ai-knows-body">
      {!known.posts && <p>{t('ai.knows_none_text')}</p>}
      {look?.state === 'ready' && <><strong><Image size={14}/>{t('ai.look_title')}</strong><p dir="auto">{look.text}</p></>}
      {look?.state === 'failed' && <p className="error-text">{t('ai.look_failed', {model: settings.visionModel})} {aiErrorText(new AiError(look.error!.kind, look.error!.detail), t)}</p>}
      {look?.state === 'off' && <p>{t('ai.look_off_text')}</p>}
      {hidden && <p>{t('ai.look_hidden_text')}</p>}
      {(look?.state === 'ready' || look?.state === 'failed' || look?.state === 'off') && <div className="ai-actions">
        {look.state !== 'off' && <button type="button" className="button small-button" onClick={again}><RefreshCw size={13}/>{t('ai.look_again')}</button>}
        {look.state !== 'ready' && <button type="button" className="button small-button" onClick={onSetup}><Settings2 size={13}/>{t('ai.open_settings')}</button>}
      </div>}
    </div>
  </details>;
}

const QUICK: {kind: prompts.Rewrite; key: 'ai.improve' | 'ai.hook' | 'ai.shorten' | 'ai.expand' | 'ai.grammar' | 'ai.hashtags' | 'ai.headlines'}[] = [
  {kind: 'improve', key: 'ai.improve'}, {kind: 'hook', key: 'ai.hook'}, {kind: 'shorten', key: 'ai.shorten'}, {kind: 'expand', key: 'ai.expand'},
  {kind: 'grammar', key: 'ai.grammar'}, {kind: 'hashtags', key: 'ai.hashtags'}, {kind: 'headlines', key: 'ai.headlines'},
];

/** The AI copilot in the post editor: draft from a brief, or rework the text that's there. */
export function Copilot({channel, posts, title, body, onBody, onTitle, onSetup}: {channel: Channel | undefined; posts: Post[]; title: string; body: string; onBody: (text: string) => void; onTitle: (text: string) => void; onSetup: () => void}) {
  const {t, lang} = useI18n();
  const ai = useAiRun();
  const [brief, setBrief] = useState('');
  const [tone, setTone] = useState<string>(prompts.TONES[0]);
  const [target, setTarget] = useState(lang === 'en' ? 'ru' : 'en');
  const [last, setLast] = useState<prompts.Rewrite | null>(null);
  const [hint, setHint] = useState('');
  if (!ai.ready) return <section className="copilot"><h3><WandSparkles size={15}/>{t('ai.copilot')}</h3><AiSetup compact onSetup={onSetup}/></section>;
  function go(kind: prompts.Rewrite) {
    if (kind === 'draft' && !brief.trim()) {setHint(t('ai.need_brief')); return;}
    if (kind !== 'draft' && !body.trim()) {setHint(t('ai.need_text')); return;}
    setHint(''); setLast(kind);
    void ai.run(async () => prompts.rewrite(await channelContext(channel, posts, ai.settings, lang), kind, {title, body, brief, tone, target: prompts.languageName(target)}), kind === 'grammar' ? 0.2 : 0.8);
  }
  const result = ai.output.trim();
  const appendable = last === 'hashtags' || last === 'draft' || last === 'expand';
  const picture = last === 'draft' ? prompts.splitPicture(result) : {text: result, picture: ''};
  return <section className="copilot">
    <h3><WandSparkles size={15}/>{t('ai.copilot')}</h3>
    <Knowledge channel={channel} onSetup={onSetup}/>
    <div className="copilot-brief"><input aria-label={t('ai.brief')} placeholder={t('ai.brief_placeholder')} value={brief} onChange={e => setBrief(e.target.value)} onKeyDown={e => {if (e.key === 'Enter') {e.preventDefault(); go('draft');}}}/><button type="button" className="button primary" disabled={ai.running} onClick={() => go('draft')}><Sparkles size={15}/>{t('ai.draft')}</button></div>
    <div className="copilot-chips">
      {QUICK.map(q => <button type="button" key={q.kind} className="chip" disabled={ai.running} onClick={() => go(q.kind)}>{t(q.key)}</button>)}
      <span className="chip-group"><select aria-label={t('ai.tone')} value={tone} onChange={e => setTone(e.target.value)}>{prompts.TONES.map(x => <option key={x} value={x}>{t(`ai.tone.${x}`)}</option>)}</select><button type="button" className="chip" disabled={ai.running} onClick={() => go('tone')}>{t('ai.tone')}</button></span>
      <span className="chip-group"><select aria-label={t('ai.translate_to')} value={target} onChange={e => setTarget(e.target.value)}>{LANGS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select><button type="button" className="chip" disabled={ai.running} onClick={() => go('translate')}>{t('ai.translate')}</button></span>
    </div>
    {hint && <p className="form-hint" role="alert">{hint}</p>}
    <AiOutput text={ai.output} running={ai.running} error={ai.error} onStop={ai.stop}>
      {last === 'headlines'
        ? <button type="button" className="button small-button primary" onClick={() => {onTitle((result.split('\n').map(l => l.replace(/^\s*\d+[.)]\s*/, '').replace(/^["«“]|["»”]$/g, '').trim()).find(Boolean) ?? '').slice(0, 180)); ai.reset();}}><PenLine size={14}/>{t('ai.use_title')}</button>
        : <>{last !== 'hashtags' && <button type="button" className="button small-button primary" onClick={() => {onBody(picture.text.slice(0, 4096)); if (picture.picture && !title.trim()) onTitle(`${prompts.PICTURE_MARK} ${picture.picture}`.slice(0, 180)); ai.reset();}}><Check size={14}/>{t('ai.replace')}</button>}
          {appendable && body.trim() && <button type="button" className="button small-button" onClick={() => {onBody(`${body.trimEnd()}\n\n${picture.text}`.slice(0, 4096)); ai.reset();}}>{t('ai.add_below')}</button>}
          {last === 'hashtags' && <button type="button" className="button small-button primary" onClick={() => {onBody(`${body.trimEnd()}\n\n${result}`.slice(0, 4096)); ai.reset();}}><Check size={14}/>{t('ai.add_below')}</button>}</>}
      <button type="button" className="button small-button" onClick={ai.reset}><X size={14}/>{t('ai.discard')}</button>
    </AiOutput>
  </section>;
}

/** Times for planned posts: the channel's best upcoming slots, then evenings of the following days. */
function slotsFor(insights: ChannelInsights | null, count: number): string[] {
  const now = Date.now();
  const best = (insights?.suggestions ?? []).map(s => s.at).filter(at => Date.parse(at) > now + 30 * 60_000);
  const out = [...best];
  for (let day = 1; out.length < count; day++) {
    const d = new Date(); d.setDate(d.getDate() + day); d.setHours(18, 0, 0, 0);
    if (!out.some(at => Math.abs(Date.parse(at) - d.getTime()) < 12 * 3600_000)) out.push(d.toISOString());
  }
  return out.slice(0, count).sort();
}

/** The AI planner: complete posts for the channel's next best slots, reviewed before they become drafts. */
export function Planner({channels, defaultChannel, posts, onSave, onSetup, onClose}: {channels: Channel[]; defaultChannel: string; posts: Post[]; onSave: (drafts: Omit<Post, 'id' | 'views' | 'reactions' | 'shares'>[]) => Promise<void>; onSetup: () => void; onClose: () => void}) {
  const {t, tn, lang, date} = useI18n();
  const settings = useAiSettings();
  const [channelId, setChannelId] = useState(defaultChannel);
  const [count, setCount] = useState(5);
  const [focus, setFocus] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ideas, setIdeas] = useState<(PlannedPost & {at: string; keep: boolean})[]>([]);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const channel = channels.find(c => c.id === channelId) ?? channels[0];
  async function generate() {
    if (!channel) return;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setBusy(true); setError(''); setIdeas([]);
    try {
      const ctx = await channelContext(channel, posts, settings, lang);
      const plan = parsePlan(await complete(settings, prompts.plan(ctx, count, focus), 0.9, controller.signal));
      const times = slotsFor((await grounding(channel.id)).insights, plan.length);
      setIdeas(plan.map((p, i) => ({...p, at: times[i], keep: true})));
    } catch (e) {if (!controller.signal.aborted) setError(aiErrorText(e, t));}
    finally {if (abort.current === controller) setBusy(false);}
  }
  const kept = ideas.filter(i => i.keep);
  return <section className="panel ai-planner">
    <div className="panel-heading"><div><div className="mini-eyebrow"><Sparkles size={13}/>{t('ai.plan_open')}</div><h2>{t('ai.plan_title')}</h2><p>{t('ai.plan_text')}</p></div><button className="icon-button" aria-label={t('ai.close')} onClick={onClose}><X size={18}/></button></div>
    {!aiReady(settings) ? <div className="ai-body"><AiSetup onSetup={onSetup}/></div> : <div className="ai-body">
      <Knowledge channel={channel} onSetup={onSetup}/>
      <div className="ai-form">
        <label>{t('ai.plan_channel')}<select value={channel?.id} onChange={e => setChannelId(e.target.value)}>{channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>{t('ai.plan_count')}<select value={count} onChange={e => setCount(Number(e.target.value))}>{[3, 5, 7, 10].map(n => <option key={n} value={n}>{tn('ai.plan_posts', n)}</option>)}</select></label>
        <label className="wide">{t('ai.plan_focus')}<input placeholder={t('ai.plan_focus_placeholder')} value={focus} onChange={e => setFocus(e.target.value)}/></label>
        <button className="button primary" disabled={busy || !channel} onClick={generate}>{busy ? <LoaderCircle size={15} className="spin"/> : <WandSparkles size={15}/>}{busy ? t('ai.plan_thinking') : ideas.length ? t('ai.again') : t('ai.plan_generate')}</button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {ideas.length > 0 && <>
        <ul className="ai-ideas">{ideas.map((idea, i) => <li key={i} className={idea.keep ? '' : 'off'}>
          <label className="ai-idea-head"><input type="checkbox" checked={idea.keep} onChange={e => setIdeas(list => list.map((x, j) => j === i ? {...x, keep: e.target.checked} : x))}/><strong dir="auto">{idea.title || prompts.splitTitle(idea.body).title}</strong><small>{date(idea.at, {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}{idea.category && ` · ${idea.category}`}</small></label>
          {idea.picture && <p className="ai-picture" dir="auto"><Image size={13}/><span><strong>{t('ai.picture_idea')}:</strong> {idea.picture}</span></p>}
          {idea.body.trim() && <p dir="auto">{idea.body}</p>}
        </li>)}</ul>
        <div className="ai-planner-save"><span>{t('ai.plan_note')}</span><button className="button primary" disabled={saving || !kept.length} onClick={async () => {
          setSaving(true); setError('');
          // A picture post's title says what picture to attach; a post with no caption keeps that as its text until edited.
          const mark = (i: PlannedPost) => `${prompts.PICTURE_MARK} ${i.picture.trim()}`;
          try {await onSave(kept.map(i => ({channelId: channel!.id, title: (i.picture.trim() ? mark(i) : i.title || prompts.splitTitle(i.body).title).slice(0, 180), body: (i.body.trim() || mark(i)).slice(0, 4096), status: 'draft', scheduledAt: i.at, category: i.category.slice(0, 40) || 'AI'}))); setIdeas([]);}
          catch (e) {setError(aiErrorText(e, t));} finally {setSaving(false);}
        }}>{saving ? <LoaderCircle size={15} className="spin"/> : <CalendarPlus size={15}/>}{tn('ai.plan_save', kept.length)}</button></div>
      </>}
    </div>}
  </section>;
}

/** An AI answer about a page (insights review, a channel breakdown, the watchlist compared), opened from a button. */
export function AiReport({title, messages, onSetup, onDraft}: {title: string; messages: () => Promise<ChatMessage[]>; onSetup: () => void; onDraft?: (text: string) => void}) {
  const {t} = useI18n();
  const ai = useAiRun();
  // Starts on open; closing the dialog unmounts this, which cancels the request.
  useEffect(() => {if (ai.ready) void ai.run(messages, 0.6);}, [ai.ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="ai-report">
    <span className="modal-symbol"><Sparkles size={24}/></span><h2 id="modal-title">{title}</h2>
    <div className="ai-body">{!ai.ready ? <AiSetup onSetup={onSetup}/> : <AiOutput text={ai.output} running={ai.running} error={ai.error} onStop={ai.stop}>
      <button className="button small-button" onClick={() => void ai.run(messages, 0.6)}><RefreshCw size={14}/>{t('ai.again')}</button>
      {onDraft && <button className="button small-button" onClick={() => onDraft(ai.output)}><PenLine size={14}/>{t('ai.to_editor')}</button>}
    </AiOutput>}
    {ai.ready && ai.error && !ai.output && <button className="button small-button" onClick={() => void ai.run(messages, 0.6)}><RefreshCw size={14}/>{t('ai.again')}</button>}</div>
  </div>;
}

/** Prompts for the reports, so pages don't need to know about contexts. */
export const reports = {
  review: (channel: Channel, posts: Post[], s: AiSettings, lang: string) => async () => prompts.review(await channelContext(channel, posts, s, lang)),
  teardown: (mine: Channel | undefined, posts: Post[], s: AiSettings, lang: string, title: string, feed: FeedPost[], stats: TrackedStats | null) => async () => prompts.teardown(await channelContext(mine, posts, s, lang), title, feed, stats),
  compare: (mine: Channel | undefined, posts: Post[], s: AiSettings, lang: string, tracked: TrackedSummary[]) => async () => prompts.compare(await channelContext(mine, posts, s, lang), tracked),
  gaps: (mine: Channel, posts: Post[], s: AiSettings, lang: string, report: GapReport) => async () => prompts.gaps(await channelContext(mine, posts, s, lang), report),
  searchFix: (mine: Channel, posts: Post[], s: AiSettings, lang: string, check: SearchCheck) => async () => prompts.searchFix(await channelContext(mine, posts, s, lang), check),
};

const SUGGESTIONS = ['ai.chat_s_ideas', 'ai.chat_s_today', 'ai.chat_s_week', 'ai.chat_s_best', 'ai.chat_s_series', 'ai.chat_s_competitors'] as const;

/** A chat that knows the channel's analytics, queue and watchlist. Any answer can become a post. */
export function Assistant({channel, posts, tracked, onSetup, onDraft}: {channel: Channel | undefined; posts: Post[]; tracked: TrackedSummary[]; onSetup: () => void; onDraft: (text: string) => void}) {
  const {t, lang} = useI18n();
  const ai = useAiRun();
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {end.current?.scrollIntoView({block: 'end', behavior: 'smooth'});}, [history.length, ai.output.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  async function send(text: string) {
    const q = text.trim(); if (!q || ai.running) return;
    const next: ChatMessage[] = [...history, {role: 'user', content: q}];
    setHistory(next); setInput('');
    const answer = await ai.run(async () => prompts.assistant(await channelContext(channel, posts, ai.settings, lang), tracked, next), 0.8);
    if (answer) {setHistory(h => [...h, {role: 'assistant', content: answer}]); ai.reset();}
  }
  if (!ai.ready) return <section className="panel assistant"><div className="ai-body"><AiSetup onSetup={onSetup}/></div></section>;
  return <section className="panel assistant">
    <div className="assistant-bar"><span><Bot size={16}/>{channel ? <><strong>{channel.name}</strong> · {t('ai.chat_context')}</> : t('ai.chat_no_channel')}</span>{history.length > 0 && <button className="text-button" onClick={() => {ai.reset(); setHistory([]);}}><MessageSquarePlus size={15}/>{t('ai.chat_clear')}</button>}</div>
    {channel && <div className="assistant-knows"><Knowledge channel={channel} onSetup={onSetup}/></div>}
    <div className="assistant-log">
      {!history.length && !ai.running && <div className="assistant-hello"><span className="ai-mark big"><Sparkles size={22}/></span><h3>{t('ai.chat_hello')}</h3><p>{t('ai.chat_hello_text')}</p><div className="assistant-suggestions">{SUGGESTIONS.map(k => <button key={k} className="chip" onClick={() => void send(t(k))}>{t(k)}</button>)}</div></div>}
      {history.map((m, i) => <div key={i} className={`bubble ${m.role}`}><div className="bubble-text" dir="auto">{m.content}</div>{m.role === 'assistant' && <div className="ai-actions"><CopyButton text={m.content}/><button className="button small-button" onClick={() => onDraft(m.content)}><PenLine size={14}/>{t('ai.to_editor')}</button></div>}</div>)}
      {(ai.running || ai.error) && <div className="bubble assistant">{ai.output ? <div className="bubble-text" dir="auto">{ai.output}<span className="ai-caret"/></div> : ai.running && <div className="bubble-text typing"><span/><span/><span/></div>}{ai.error && <p className="error-text" role="alert">{ai.error}</p>}{ai.running && <div className="ai-actions"><button className="button small-button" onClick={ai.stop}><Square size={13}/>{t('ai.stop')}</button></div>}</div>}
      <div ref={end}/>
    </div>
    <form className="assistant-input" onSubmit={e => {e.preventDefault(); void send(input);}}>
      <textarea aria-label={t('ai.chat_placeholder')} placeholder={t('ai.chat_placeholder')} rows={1} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => {if (e.key === 'Enter' && !e.shiftKey) {e.preventDefault(); void send(input);}}}/>
      <button className="button primary" aria-label={t('ai.chat_send')} disabled={!input.trim() || ai.running}><ArrowUp size={17}/></button>
    </form>
  </section>;
}

export function CopyButton({text}: {text: string}) {
  const {t} = useI18n();
  const [copied, setCopied] = useState(false);
  return <button className="button small-button" onClick={() => {void navigator.clipboard?.writeText(text).then(() => {setCopied(true); setTimeout(() => setCopied(false), 1500);});}}>{copied ? <Check size={14}/> : <Copy size={14}/>}{copied ? t('ai.copied') : t('ai.copy')}</button>;
}

/** Settings → AI writing: the provider, key and model, and how the channel should sound. */
export function AiSettingsPanel({onSaved}: {onSaved: (message: string) => void}) {
  const {t, tn} = useI18n();
  const saved = useAiSettings();
  const [form, setForm] = useState<AiSettings>(saved);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{busy?: 'models' | 'test'; ok?: string; error?: string}>({});
  useEffect(() => setForm(saved), [saved]);
  const p = provider(form.provider);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  function pick(id: string) {const next = provider(id); setForm(f => ({...f, provider: id, baseUrl: next.baseUrl || f.baseUrl, model: next.model || f.model, visionModel: next.vision})); setModels([]); setStatus({});}
  async function loadModels() {
    setStatus({busy: 'models'});
    try {const list = await listModels(form); setModels(list); setStatus({});} catch (e) {setStatus({error: aiErrorText(e, t)});}
  }
  async function test() {
    setStatus({busy: 'test'});
    try {
      const answer = await complete(form, [{role: 'system', content: 'This is a connectivity check. Answer in at most five words.'}, {role: 'user', content: 'Say hello to Gramalyzer.'}], 0.2);
      setStatus({ok: t('ai.set_test_ok', {answer: answer.trim().slice(0, 120)})});
    } catch (e) {setStatus({error: aiErrorText(e, t)});}
  }
  return <form className="panel ai-settings" onSubmit={e => {e.preventDefault(); saveAiSettings({...form, baseUrl: form.baseUrl.trim(), apiKey: form.apiKey.trim(), model: form.model.trim(), visionModel: form.visionModel.trim()}); onSaved(t('ai.set_saved'));}}>
    <div className="panel-heading"><div><div className="mini-eyebrow"><Sparkles size={13}/>AI</div><h2>{t('ai.set_title')}</h2><p>{t('ai.set_text')}</p></div></div>
    <div className="settings-section ai-grid">
      <label>{t('ai.set_provider')}<select value={form.provider} onChange={e => pick(e.target.value)}>{PROVIDERS.map(x => <option key={x.id} value={x.id}>{x.id === 'custom' ? t('ai.set_custom') : x.name}</option>)}</select></label>
      <label>{t('ai.set_base_url')}<input dir="ltr" inputMode="url" placeholder="https://api.example.com/v1" value={form.baseUrl} onChange={e => setForm({...form, baseUrl: e.target.value})}/></label>
      <label className="wide">{t('ai.set_key')}<span className="ai-key"><input dir="ltr" type={showKey ? 'text' : 'password'} autoComplete="off" placeholder={p.needsKey ? '' : t('ai.set_key_optional')} value={form.apiKey} onChange={e => setForm({...form, apiKey: e.target.value})}/><button type="button" className="icon-button" aria-label={showKey ? t('ai.set_hide_key') : t('ai.set_show_key')} onClick={() => setShowKey(v => !v)}>{showKey ? <EyeOff size={16}/> : <Eye size={16}/>}</button>{p.keyUrl && <button type="button" className="button small-button" onClick={() => openExternal(p.keyUrl)}><ExternalLink size={14}/>{t('ai.set_get_key')}</button>}</span><small>{t('ai.set_key_hint')}</small></label>
      <label className="wide">{t('ai.set_model')}<span className="ai-key"><input dir="ltr" list="ai-models" value={form.model} onChange={e => setForm({...form, model: e.target.value})}/><datalist id="ai-models">{models.map(m => <option key={m} value={m}/>)}</datalist><button type="button" className="button small-button" disabled={!!status.busy || !form.baseUrl.trim()} onClick={loadModels}>{status.busy === 'models' ? <LoaderCircle size={14} className="spin"/> : <RefreshCw size={14}/>}{t('ai.set_load_models')}</button></span>{models.length > 0 && <small>{tn('ai.set_models', models.length)}</small>}</label>
      <label className="wide">{t('ai.set_vision')}<input dir="ltr" list="ai-models" placeholder={t('ai.set_vision_none')} value={form.visionModel} onChange={e => setForm({...form, visionModel: e.target.value})}/><small>{t('ai.set_vision_hint')}</small></label>
      <label className="wide">{t('ai.set_voice')}<textarea rows={3} placeholder={t('ai.set_voice_placeholder')} value={form.voice} onChange={e => setForm({...form, voice: e.target.value})}/><small>{t('ai.set_voice_hint')}</small></label>
      <label>{t('ai.set_lang')}<select value={form.contentLang} onChange={e => setForm({...form, contentLang: e.target.value})}><option value="">{t('ai.set_same_as_posts')}</option>{LANGS.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label>
    </div>
    {status.ok && <p className="ai-ok" role="status"><Check size={14}/>{status.ok}</p>}
    {status.error && <p className="error-text ai-status" role="alert">{status.error}</p>}
    <div className="settings-save"><span>{dirty ? t('set.dirty') : t('set.clean')}</span><span className="ai-save-buttons"><button type="button" className="button" disabled={!!status.busy || !aiReady(form)} onClick={test}>{status.busy === 'test' ? <LoaderCircle size={15} className="spin"/> : <Sparkles size={15}/>}{t('ai.set_test')}</button><button className="button primary" disabled={!dirty}><Check size={16}/>{t('ai.set_save')}</button></span></div>
    <div className="settings-section ai-free"><h3>{t('ai.set_free_title')}</h3><p>{t('ai.set_free_text')}</p><ul>{PROVIDERS.filter(x => x.keyUrl).map(x => <li key={x.id}><span><strong>{x.name}</strong><small dir="ltr">{x.model}</small></span><span><button type="button" className="button small-button" onClick={() => pick(x.id)} disabled={form.provider === x.id}>{t('ai.set_use')}</button><button type="button" className="icon-button" aria-label={`${t('ai.set_get_key')}: ${x.name}`} onClick={() => openExternal(x.keyUrl)}><ExternalLink size={15}/></button></span></li>)}</ul></div>
  </form>;
}
