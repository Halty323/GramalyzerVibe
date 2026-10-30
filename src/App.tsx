import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, Bot, CalendarDays, ChartNoAxesCombined, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Eye, FileText, Languages, Layers, LayoutDashboard, LoaderCircle, LogOut, Menu, MessageCircle, MessagesSquare, Moon, MoreHorizontal, Plus, Radio, Repeat2, Search, Send, Server, Settings2, Sparkles, Sun, Telescope, Trash2, Users, WandSparkles, X, Zap } from 'lucide-react';
import type { Channel, FeedPost, Post, TrackedDetail, TrackedStats, TrackedSummary, Workspace } from '../shared/types';
import { AiReport, AiSettingsPanel, Assistant, Copilot, Planner, reports } from './Ai';
import type { ChatMessage } from './ai/client';
import { aiSettings } from './ai/settings';
import { splitTitle } from './ai/prompts';
import { api, ApiError, channelPhoto, errorMessage, refreshOnClose, request, usePhoto } from './api';
import { ChannelAvatar, CountUp } from './fun';
import { LANGS, useI18n, type StringKey } from './i18n';
import { ChannelBestTime, InsightsPage, RhythmText } from './Insights';
import { connection, isApp, normalizeServer, saveConnection } from './platform';
import { useTheme } from './theme';
import { mediaProblem, PostExtras } from './PostMedia';
import { Viewer, type Selection } from './Viewer';
import { Watchlist } from './Watchlist';
import { DraftScoreBox, EvergreenPanel, FillSlots } from './Slots';

type Page = 'overview' | 'content' | 'schedule' | 'assistant' | 'insights' | 'viewer' | 'watchlist' | 'channels' | 'settings';
const pages = [{id: 'overview', icon: LayoutDashboard}, {id: 'content', icon: FileText}, {id: 'schedule', icon: CalendarDays}, {id: 'assistant', icon: Bot}, {id: 'insights', icon: ChartNoAxesCombined}, {id: 'viewer', icon: MessagesSquare}, {id: 'watchlist', icon: Telescope}, {id: 'channels', icon: Layers}, {id: 'settings', icon: Settings2}] as const;
const fetchInsights = api.insights;
const ZONES = ['Europe/Berlin', 'Europe/London', 'Europe/Moscow', 'Europe/Kyiv', 'Europe/Istanbul', 'Asia/Tehran', 'Asia/Dubai', 'Asia/Tashkent', 'Asia/Kolkata', 'Asia/Ho_Chi_Minh', 'Asia/Jakarta', 'Asia/Singapore', 'America/Sao_Paulo', 'America/New_York', 'America/Los_Angeles', 'UTC'];
function Avatar({channel, small = false}: {channel: Channel; small?: boolean}) {
  const photo = usePhoto(channelPhoto(channel)); const [broken, setBroken] = useState<string | null>(null);
  return <span className={`channel-avatar ${channel.color} ${small ? 'small' : ''}`}>{channel.initials}{photo && broken !== photo && <img src={photo} alt="" onError={() => setBroken(photo)}/>}</span>;
}
function Pill({status}: {status: Post['status']}) {const {t} = useI18n(); return <span className={`pill ${status}`}><span/>{t(`status.${status}`)}</span>;}

export default function App() {
  const i18n = useI18n();
  const {t, tn, num} = i18n;
  const {theme, toggle} = useTheme();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [tracked, setTracked] = useState<TrackedSummary[] | null>(null);
  const [page, setPage] = useState<Page>('overview');
  const [channelId, setChannelId] = useState('all');
  const [viewing, setViewing] = useState<Selection | null>(null);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState(28);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'post' | 'help' | 'ai' | null>(null);
  const [report, setReport] = useState<{title: string; messages: () => Promise<ChatMessage[]>; draft?: boolean} | null>(null);
  const [prefill, setPrefill] = useState<{title: string; body: string} | null>(null);
  const [planning, setPlanning] = useState(false);
  const [editing, setEditing] = useState<Post | null>(null);
  const [suggestedAt, setSuggestedAt] = useState<string | undefined>(undefined);
  const [notifications, setNotifications] = useState(false);
  const [languages, setLanguages] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(() => isApp && !connection());
  const [token, setToken] = useState(() => connection()?.token ?? '');
  const [server, setServer] = useState(() => connection()?.server ?? '');
  const [focusAdd, setFocusAdd] = useState(false);
  const [flying, setFlying] = useState(false);
  const languageMenu = useRef<HTMLDivElement>(null);
  async function load() {
    if (isApp && !connection()) {setNeedsLogin(true); return;}
    try {setWorkspace(await request<Workspace>('/workspace')); setNeedsLogin(false); setError('');}
    catch (e) {
      if (e instanceof ApiError && e.status === 401) {setNeedsLogin(true); if (isApp) setError(t('conn.rejected'));}
      else setError(isApp && !(e instanceof ApiError) ? t('conn.unreachable', {server: connection()?.server ?? ''}) : errorMessage(e, t));
    }
  }
  const loadTracked = useCallback(async () => {try {setTracked(await api.tracked());} catch {setTracked(t => t ?? []);}}, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {if (!document.hidden) void load();}, 15000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {if (workspace) void loadTracked();}, [workspace !== null, loadTracked]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opening the website brings every channel up to date (closing it does too); once the server is done, show the new numbers.
  useEffect(() => {
    if (!workspace) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const wait = async (running: boolean) => {
      if (stopped) return;
      if (!running) {void load(); void loadTracked(); return;}
      timer = setTimeout(async () => {try {wait((await api.refreshStatus()).running);} catch {/* the next 15 s reload catches up */}}, 4000);
    };
    void api.refreshAll(isApp ? 'app-open' : 'site-open').then(s => {if (s.running) void wait(true);}).catch(() => {});
    window.addEventListener('pagehide', refreshOnClose);
    return () => {stopped = true; clearTimeout(timer); window.removeEventListener('pagehide', refreshOnClose);};
  }, [workspace !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer);}, [toast]);
  useEffect(() => {
    if (!languages) return;
    const close = (e: MouseEvent | KeyboardEvent) => {if (e instanceof KeyboardEvent ? e.key === 'Escape' : !languageMenu.current?.contains(e.target as Node)) setLanguages(false);};
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => {document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close);};
  }, [languages]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([readonly]), select:not([disabled]), textarea:not([readonly]), a[href]') ?? []);
    focusable()[0]?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null);
      if (e.key === 'Tab') {const items = focusable(); const first = items[0]; const last = items[items.length - 1]; if (e.shiftKey && document.activeElement === first) {e.preventDefault(); last?.focus();} else if (!e.shiftKey && document.activeElement === last) {e.preventDefault(); first?.focus();}}
    };
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', listener);
    return () => {document.removeEventListener('keydown', listener); document.body.style.overflow = overflow; previous?.focus();};
  }, [modal]);
  function navigate(next: Page) {setPage(next); setMobileNav(false); setSearch(''); setFocusAdd(false);}
  function view(sel: Selection) {setViewing(sel); navigate('viewer');}
  function openPost(post?: Post, at?: string, draft?: {title: string; body: string}) {if (!channels.length) {setModal('help'); return;} setEditing(post ?? null); setSuggestedAt(post ? undefined : at); setPrefill(post ? null : draft ?? null); setModal('post');}
  /** An AI answer as a new post: its first line as the title. */
  function draftFromAi(text: string) {openPost(undefined, undefined, splitTitle(text));}
  /** Settings → AI writing, from any AI tool that isn't set up yet. */
  function openAiSettings() {setModal(null); setPlanning(false); navigate('settings'); setTimeout(() => document.getElementById('ai-settings')?.scrollIntoView({block: 'start', behavior: 'smooth'}), 60);}
  function openReport(title: string, messages: () => Promise<ChatMessage[]>, draft = false) {setReport({title, messages, draft}); setModal('ai');}
  const channels = workspace?.channels ?? [];
  const selectedChannels = channels.filter(c => channelId === 'all' || c.id === channelId);
  const posts = (workspace?.posts ?? []).filter(p => (channelId === 'all' || p.channelId === channelId) && `${p.title} ${p.body} ${channels.find(c => c.id === p.channelId)?.name}`.toLowerCase().includes(search.toLowerCase()));
  const published = posts.filter(p => p.status === 'published' && new Date(p.scheduledAt).getTime() >= Date.now() - period * 86400000).sort((a, b) => b.views - a.views);
  const queued = posts.filter(p => p.status === 'scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const currentChannel = channels.find(c => c.id === channelId) ?? channels[0];
  const subscribers = selectedChannels.reduce((n, c) => n + c.subscribers, 0);
  const growth = selectedChannels.length ? selectedChannels.reduce((n, c) => n + c.growth, 0) / selectedChannels.length : 0;
  const views = published.reduce((n, p) => n + p.views, 0);
  const reactions = published.reduce((n, p) => n + p.reactions, 0);
  const engagement = views ? reactions / views * 100 : 0;
  const rhythmChannel = channelId !== 'all' ? currentChannel : channels.length === 1 ? channels[0] : undefined;
  async function updateChannel(id: string, data: Partial<Channel>) {
    const channel = await request<Channel>(`/channels/${id}`, {method: 'PATCH', body: JSON.stringify(data)});
    setWorkspace(w => w && {...w, channels: w.channels.map(c => c.id === id ? channel : c)});
  }
  function exportReport() {
    const rows = [[t('csv.title'), t('csv.channel'), t('csv.status'), t('csv.date'), t('csv.views'), t('csv.reactions'), t('csv.shares')], ...posts.map(p => [p.title, channels.find(c => c.id === p.channelId)?.name ?? '', t(`status.${p.status}`), p.scheduledAt, workspace?.demo ? String(p.views) : t('csv.unavailable'), workspace?.demo || p.status === 'published' ? String(p.reactions) : '', workspace?.demo ? String(p.shares) : t('csv.unavailable')])];
    const csv = rows.map(row => row.map(v => `"${v.replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], {type: 'text/csv'})); const a = document.createElement('a'); a.href = url; a.download = 'gramalyzer-post-report.csv'; a.click(); URL.revokeObjectURL(url); setToast(t('csv.done'));
  }
  /** Tracks a public channel; throws when the backend refuses, so the form that asked can say why. */
  async function track(username: string): Promise<TrackedDetail> {
    const detail = await api.track(username);
    setToast(t('view.tracked', {name: detail.channel.title}));
    void loadTracked();
    return detail;
  }
  async function untrack(username: string) {
    try {
      await api.untrack(username);
      const name = tracked?.find(s => s.username.toLowerCase() === username.toLowerCase())?.title ?? `@${username}`;
      setTracked(list => list?.filter(s => s.username.toLowerCase() !== username.toLowerCase()) ?? null);
      setToast(t('view.untracked', {name}));
      return true;
    } catch (e) {setError(errorMessage(e, t)); return false;}
  }
  async function refreshTracked(username: string) {
    try {const detail = await api.refresh(username); setToast(t('view.refreshed', {name: detail.channel.title})); await loadTracked();}
    catch (e) {setError(errorMessage(e, t));}
  }
  function fly() {setFlying(true); setTimeout(() => setFlying(false), 1200);}
  const titles: Record<Page, [StringKey, StringKey]> = {
    overview: ['head.overview.title', 'head.overview.text'], content: ['head.content.title', 'head.content.text'], schedule: ['head.schedule.title', 'head.schedule.text'],
    assistant: ['head.assistant.title', 'head.assistant.text'], insights: ['head.insights.title', 'head.insights.text'], viewer: ['nav.viewer', 'nav.viewer'], watchlist: ['head.watchlist.title', 'head.watchlist.text'],
    channels: ['head.channels.title', 'head.channels.text'], settings: ['head.settings.title', 'head.settings.text'],
  };
  const watching = useMemo(() => [...tracked ?? []].sort((a, b) => (b.subscribers ?? 0) - (a.subscribers ?? 0)).slice(0, 4), [tracked]);
  const toolbar = <div className="top-toggles">
    <button className="icon-button theme-button" aria-label={t(theme === 'dark' ? 'top.theme_light' : 'top.theme_dark')} title={t(theme === 'dark' ? 'top.theme_light' : 'top.theme_dark')} onClick={e => {const r = e.currentTarget.getBoundingClientRect(); toggle(r.left + r.width / 2, r.top + r.height / 2);}}>{theme === 'dark' ? <Sun size={19}/> : <Moon size={19}/>}</button>
    <div className="language-wrap" ref={languageMenu}><button className="icon-button language-button" aria-label={t('top.language')} title={t('top.language')} aria-haspopup="menu" aria-expanded={languages} onClick={() => setLanguages(v => !v)}><Languages size={19}/><span>{i18n.lang.toUpperCase()}</span></button>
      {languages && <div className="language-menu" role="menu" aria-label={t('top.language')}>{LANGS.map(l => <button key={l.code} role="menuitemradio" aria-checked={i18n.lang === l.code} lang={l.code} onClick={async () => {await i18n.setLang(l.code); setLanguages(false);}}><span>{l.name}</span><small>{l.code.toUpperCase()}</small>{i18n.lang === l.code && <Check size={15}/>}</button>)}</div>}
    </div>
  </div>;

  if (needsLogin) return <div className="loading-page"><div className="login-tools">{toolbar}</div><div className="login-card"><span className="brand-icon"><Send size={22}/></span><h1>{t('login.title')}</h1><p>{isApp ? t('login.app_text') : t('login.text')}</p><form onSubmit={async e => {
    e.preventDefault(); setError('');
    if (isApp) {saveConnection({server: normalizeServer(server), token: token.trim()}); setServer(normalizeServer(server)); await load(); return;}
    try {await request('/login', {method: 'POST', body: JSON.stringify({token})}); await load();} catch(e) {setError(errorMessage(e, t));}
  }}>{isApp && <label>{t('conn.server')}<input type="text" inputMode="url" dir="ltr" autoCapitalize="off" autoCorrect="off" spellCheck={false} placeholder="https://gramalyzer.example.com" value={server} onChange={e => setServer(e.target.value)} required/><small>{t('conn.server_hint')}</small></label>}<label>{t('login.token')}<input type="password" value={token} onChange={e => setToken(e.target.value)} required={!isApp}/>{isApp && <small>{t('conn.token_hint')}</small>}</label><button className="button primary">{isApp ? t('conn.connect') : t('login.submit')} <ArrowRight size={16}/></button></form>{error && <p className="error-text" role="alert">{error}</p>}</div></div>;
  if (!workspace) return <div className="loading-page">{error ? <><p role="alert">{error}</p><button className="button" onClick={load}>{t('app.retry')}</button>{isApp && <button className="button" onClick={() => {setError(''); setNeedsLogin(true);}}><Server size={16}/>{t('conn.change')}</button>}</> : <><LoaderCircle className="spin"/><p>{t('app.loading')}</p></>}</div>;
  const plain = page === 'viewer';
  return <div className="app-shell">
    {mobileNav && <div className="nav-backdrop" onClick={() => setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <a className="brand" href="#" onClick={e => {e.preventDefault(); fly(); navigate('overview');}}><span className={`brand-icon ${flying ? 'fly' : ''}`}><Send size={20} strokeWidth={2.2}/></span><span>gramalyzer<span className="brand-dot">.</span></span></a>
      <div className="workspace-label">{t('side.your_workspace')}</div>
      <div className="workspace-box"><span className="workspace-avatar">S<span/></span><div><strong>{workspace.demo ? t('side.studio') : t('side.workspace')}</strong><small>{tn(workspace.demo ? 'side.sample_channels' : 'side.connected_channels', channels.length)}</small></div></div>
      <div className="nav-label">{t('side.workspace_label')}</div>
      <nav>{pages.map(({id, icon: Icon}) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => navigate(id)}><Icon size={19}/><span>{t(`nav.${id}`)}</span>{id === 'schedule' && <span className="nav-count">{workspace.posts.filter(p => p.status === 'scheduled').length}</span>}{id === 'watchlist' && tracked && tracked.length > 0 && <span className="nav-count">{tracked.length}</span>}{page === id && <span className="active-indicator"/>}</button>)}</nav>
      <div className="sidebar-channel-heading"><span>{t('side.your_channels')}</span><span>{channels.length}</span></div>
      <div className="sidebar-channels">{channels.map(c => <button className={channelId === c.id && page !== 'viewer' ? 'selected' : ''} key={c.id} onClick={() => {setChannelId(c.id); navigate('overview');}}><Avatar channel={c} small/><span>{c.name}</span><span className={`tiny-dot ${c.paused ? 'paused' : ''}`}/></button>)}</div>
      <div className="sidebar-channel-heading"><span>{t('side.watching')}</span><span>{tracked?.length ?? 0}</span></div>
      <div className="sidebar-channels watching">{watching.map(s => <button key={s.username} className={page === 'viewer' && viewing?.kind === 'public' && viewing.username.toLowerCase() === s.username.toLowerCase() ? 'selected' : ''} onClick={() => view({kind: 'public', username: s.username})}><ChannelAvatar title={s.title} seed={s.username} photoUrl={s.photoUrl} size={25}/><span>{s.title}</span>{s.change7 !== null && <small className={s.change7 >= 0 ? 'up' : 'down'}>{i18n.signed(s.change7)}</small>}</button>)}
        <button className="sidebar-add" onClick={() => {navigate('watchlist'); setFocusAdd(true);}}><span><Plus size={14}/></span>{t('side.track')}</button></div>
      <div className="sidebar-bottom"><div className="insight-card"><div className="insight-icon"><Sparkles size={18}/></div><strong>{t('side.promo_title')}</strong><p>{t('side.promo_text')}</p><button onClick={() => {navigate('schedule'); setChannelId('all');}}>{t('side.promo_cta')} <ArrowRight size={15}/></button></div><button className="help-link" onClick={() => setModal('help')}><CircleHelp size={18}/>{t('side.help')}<ArrowUpRight size={15}/></button><div className="sidebar-footer"><span className="avatar user">{workspace.demo ? 'AK' : 'AD'}</span><div><strong>{workspace.demo ? 'Alex Kim' : t('side.admin')}</strong><small>{workspace.demo ? t('side.role_demo') : t('side.role')}</small></div><span className="online-dot"/></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumbs"><button className="mobile-menu icon-button" aria-label={t('top.open_nav')} onClick={() => setMobileNav(true)}><Menu size={20}/></button><span>{t('top.workspace')}</span><ChevronRight size={14}/><strong>{t(`nav.${page}`)}</strong></div><div className="topbar-tools"><label className="global-search"><Search size={16}/><input aria-label={t('top.search')} placeholder={t('top.search_placeholder')} value={search} onChange={e => {setSearch(e.target.value); if (page !== 'overview' && page !== 'content') setPage('content');}}/></label><span className="demo-label"><span/>{workspace.demo ? t('top.demo') : t('top.bot')}</span>{toolbar}<div className="notification-wrap"><button className="icon-button notification-button" aria-label={t('top.notifications')} aria-expanded={notifications} onClick={() => setNotifications(v => !v)}><Bell size={19}/><span/></button>{notifications && <div className="notification-popover"><strong>{t('top.caught_up')}</strong><p>{tn('top.queue', queued.length)} {workspace.demo ? t('top.demo_note') : workspace.botEnabled ? t('top.delivery_on') : t('top.delivery_off')}</p><button onClick={() => {setNotifications(false); navigate('schedule');}}>{t('top.view_queue')} <ArrowRight size={14}/></button></div>}</div><span className="avatar user">{workspace.demo ? 'AK' : 'AD'}</span></div></header>
      <div className={`page-body ${plain ? 'viewer-body' : ''}`} key={page}>
      {!plain && <div className="page-heading"><div><div className="eyebrow">{t(page === 'overview' ? 'head.overview.eyebrow' : page === 'watchlist' ? 'head.watchlist.eyebrow' : 'head.eyebrow')}</div><h1>{t(titles[page][0])}</h1><p>{t(titles[page][1])}</p></div>{page === 'watchlist' ? !!tracked?.length && <div className="heading-actions"><button className="button lavender" onClick={() => openReport(t('ai.compare'), reports.compare(currentChannel, workspace.posts, aiSettings(), i18n.lang, tracked))}><Sparkles size={16}/>{t('ai.compare')}</button></div>
        : <div className="heading-actions">{page === 'insights' && currentChannel && <button className="button lavender" onClick={() => openReport(t('ai.review'), reports.review(currentChannel, workspace.posts, aiSettings(), i18n.lang), true)}><Sparkles size={16}/>{t('ai.review')}</button>}{page === 'schedule' && <button className="button lavender" onClick={() => setPlanning(v => !v)} aria-expanded={planning}><WandSparkles size={16}/>{t('ai.plan_open')}</button>}<button className="button" onClick={exportReport}><ArrowDownToLine size={16}/>{t('act.export')}</button><button className="button primary" onClick={() => openPost()}><Plus size={17}/>{t('act.new_post')}</button></div>}</div>}
      {error && <div className="error-banner" role="alert">{error}<button className="icon-button" aria-label={t('app.dismiss_error')} onClick={() => setError('')}><X size={16}/></button></div>}
      {!channels.length && !plain && page !== 'watchlist' && <section className="notice connect-notice"><Radio size={20}/><div><strong>{t('connect.title')}</strong><p>{t('connect.text')}</p></div></section>}
      {!plain && page !== 'watchlist' && <div className="filterbar"><div className="channel-filter"><Layers size={16}/><select aria-label={t('filter.channel')} value={channelId} onChange={e => setChannelId(e.target.value)}><option value="all">{t('filter.all')}</option>{channels.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select><ChevronDown size={14}/></div><span className="filter-divider"/><span className="filter-description">{channelId === 'all' ? tn('filter.summary', channels.length) : <bdi>{currentChannel?.handle}</bdi>}</span><label className="date-filter"><CalendarDays size={15}/><select aria-label={t('filter.period')} value={period} onChange={e => setPeriod(Number(e.target.value))}>{[28, 7, 90].map(d => <option key={d} value={d}>{tn('filter.days', d)}</option>)}</select><ChevronDown size={13}/></label></div>}
      {page === 'overview' && <>
        <div className="stats-grid"><Stat label={t('stat.subscribers')} value={<CountUp value={subscribers} format={n => num(n)}/>} icon={Users} color="purple" change={workspace.demo ? `${num(growth, 1)}%` : undefined} note={workspace.demo ? t('stat.sample_growth') : t('stat.observed')}/><Stat label={t('stat.views')} value={workspace.demo ? <CountUp value={views} format={n => num(n)}/> : '—'} icon={Eye} color="blue" note={workspace.demo ? tn('stat.views_note', published.length) : t('stat.views_hidden')}/><Stat label={workspace.demo ? t('stat.engagement') : t('stat.reactions_per_post')} value={workspace.demo ? <CountUp value={engagement} format={n => `${i18n.num(n, 2)}%`}/> : published.length ? i18n.num(reactions / published.length, 1) : '—'} icon={MessageCircle} color="orange" note={workspace.demo ? t('stat.engagement_note') : published.length ? tn('stat.average_over', published.length) : t('stat.after_publishing')}/><Stat label={t('stat.published')} value={<CountUp value={published.length} format={n => num(n)}/>} icon={Send} color="green" note={tn('stat.on_the_way', queued.length)}/></div>
        <div className="overview-middle"><section className="panel audience-panel"><div className="panel-heading"><div><h2>{t('aud.title')} <span className="subtle-badge">{workspace.demo ? t('app.sample') : t('aud.observed')}</span></h2><p>{t('aud.text')}</p></div><span className="chart-legend"><span/>{t('aud.legend')}</span></div><div className="chart-summary"><strong>{num(subscribers)}</strong>{workspace.demo && <><span className="positive"><ArrowUpRight size={14}/>{num(growth, 1)}%</span><small>{t('stat.sample_growth')}</small></>}</div>{workspace.demo ? <AudienceChart subscribers={subscribers} growth={growth} period={period}/> : <LiveAudienceHistory history={workspace.history ?? []} channelId={channelId} expectedChannels={selectedChannels.length} period={period}/>}</section>
        <section className="panel best-time"><div className="panel-heading"><div><div className="mini-eyebrow"><Zap size={13}/>{t('rhythm.eyebrow')}</div><h2>{t('rhythm.title')}</h2></div><span className="sparkle-icon"><Sparkles size={20}/></span></div><div className="time-art"><div className="orbit one"/><div className="orbit two"/><span className="time-dot one"/><span className="time-dot two"/><div className="time-art-center"><CalendarDays size={29}/><span>{t('rhythm.next')}</span></div><span className="mini-floating"><Send size={15}/></span></div><RhythmText channel={rhythmChannel} fetchInsights={fetchInsights} onPlan={at => {if (rhythmChannel) setChannelId(rhythmChannel.id); openPost(undefined, at);}} fallback={<><h3>{t('rhythm.fallback_title')}</h3><p>{t('rhythm.fallback_text')}</p><button className="button lavender full-width" onClick={() => navigate('schedule')}>{t('rhythm.open_schedule')}<ArrowRight size={16}/></button></>}/><button className="insight-footnote" onClick={() => navigate('insights')}>{t('rhythm.see_insights')}</button></section></div>
        <section className="panel top-posts"><div className="panel-heading"><div><h2>{t('top_posts.title')} <span className="subtle-badge">{t('top_posts.badge')}</span></h2><p>{t('top_posts.text')}</p></div><button className="text-button" onClick={() => navigate('content')}>{t('top_posts.all')}<ArrowRight size={15}/></button></div><PostTable demo={workspace.demo} posts={published.slice(0, 4)} channels={channels} onEdit={openPost}/></section>
        <div className="bottom-caption"><span><Radio size={13}/>{workspace.demo ? t('caption.demo') : workspace.botEnabled ? t('caption.live_on') : t('caption.live_off')}</span><span>{t('caption.tagline')} <span className="purple-text">✦</span></span></div>
      </>}
      {page === 'content' && <section className="panel"><div className="panel-heading"><div><h2>{t('content.title')} <span className="subtle-badge">{tn('content.count', posts.length)}</span></h2><p>{t('content.text')}</p></div><button className="text-button" onClick={() => openPost()}><Plus size={15}/>{t('content.create')}</button></div><PostTable demo={workspace.demo} posts={posts} channels={channels} onEdit={openPost}/></section>}
      {page === 'schedule' && planning && channels.length > 0 && <Planner channels={channels} defaultChannel={channelId === 'all' ? channels[0].id : channelId} posts={workspace.posts} onSetup={openAiSettings} onClose={() => setPlanning(false)} onSave={async drafts => {for (const d of drafts) await request('/posts', {method: 'POST', body: JSON.stringify(d)}); await load(); setToast(tn('ai.plan_saved', drafts.length));}}/>}
      {page === 'assistant' && <Assistant channel={currentChannel} posts={workspace.posts} tracked={tracked ?? []} onSetup={openAiSettings} onDraft={draftFromAi}/>}
      {page === 'schedule' && <Schedule demo={workspace.demo} botEnabled={workspace.botEnabled} posts={posts} channels={channels} onEdit={openPost} onNew={() => openPost()} onDelete={async id => {try {await request(`/posts/${id}`, {method: 'DELETE'}); await load(); setToast(t('sched.removed'));} catch(e) {setError(errorMessage(e, t));}}}/>}
      {page === 'schedule' && currentChannel && <div className="plan-grid" key={currentChannel.id}><FillSlots channel={currentChannel} drafts={workspace.posts.filter(p => p.channelId === currentChannel.id && p.status === 'draft').length} onDone={async n => {await load(); setToast(tn('fill.done', n));}}/><EvergreenPanel channel={currentChannel} onQueued={async p => {await load(); setToast(t('ever.queued', {when: i18n.date(p.scheduledAt, {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}));}}/></div>}
      {page === 'viewer' && <Viewer channels={channels} posts={workspace.posts} tracked={tracked} demo={workspace.demo} selected={viewing} onSelect={setViewing}
        onTrack={async username => {try {return await track(username);} catch (e) {setError(errorMessage(e, t)); return null;}}} onUntrack={untrack} onToast={setToast}
        onEditPost={id => {const post = workspace.posts.find(p => p.id === id); if (post) openPost(post);}} onNewPost={id => {setChannelId(id); setEditing(null); setSuggestedAt(undefined); setPrefill(null); setModal('post');}}
        onAi={(title: string, feed: FeedPost[], stats: TrackedStats | null) => openReport(`${t('ai.breakdown')}: ${title}`, reports.teardown(currentChannel, workspace.posts, aiSettings(), i18n.lang, title, feed, stats))}/>}
      {page === 'watchlist' && <Watchlist tracked={tracked} focus={focusAdd} onTrack={track} onUntrack={untrack} onRefresh={refreshTracked} onOpen={username => view({kind: 'public', username})}/>}
      {page === 'channels' && <div className="channel-grid">{selectedChannels.map((c, i) => <section className="panel channel-card" key={c.id} style={{'--i': i} as CSSProperties}><div className="channel-card-top"><Avatar channel={c}/><span className={`pill ${c.paused ? 'draft' : 'published'}`}><span/>{c.paused ? t('chan.paused') : t('chan.active')}</span></div><h2>{c.name}</h2>{c.handle ? <a href={`https://t.me/${c.handle.slice(1)}`} target="_blank" rel="noreferrer"><bdi>{c.handle}</bdi><ArrowUpRight size={13}/></a> : <p>{t('chan.private')}</p>}<p>{c.description}</p><div className="channel-card-stats"><div><strong>{num(c.subscribers)}</strong><small>{t('chan.subscribers')}</small></div>{workspace.demo ? <div><strong>{`${num(c.engagement)}%`}</strong><small>{t('chan.sample_engagement')}</small></div> : <ChannelBestTime channelId={c.id} fetchInsights={fetchInsights}/>}</div><div className="channel-card-actions"><button className="button" onClick={() => {setChannelId(c.id); navigate('settings');}}><Settings2 size={15}/>{t('chan.configure')}</button><button className="icon-button" aria-label={t('chan.view', {name: c.name})} title={t('chan.view', {name: c.name})} onClick={() => view({kind: 'mine', id: c.id})}><MessagesSquare size={16}/></button><button className="text-button" onClick={async () => {try {await updateChannel(c.id, {paused: !c.paused}); setToast(t(c.paused ? 'chan.resumed' : 'chan.paused_toast', {name: c.name}));} catch(e) {setError(errorMessage(e, t));}}}>{c.paused ? t('chan.resume') : t('chan.pause')}</button></div></section>)}</div>}
      {page === 'insights' && currentChannel && <InsightsPage key={currentChannel.id} channel={currentChannel} showingFirst={channelId === 'all' && channels.length > 1} fetchInsights={fetchInsights} onPlan={at => {setChannelId(currentChannel.id); openPost(undefined, at);}}
        onGapsAi={report => openReport(t('gp.ai_title'), reports.gaps(currentChannel, workspace.posts, aiSettings(), i18n.lang, report), true)}
        onSearchAi={check => openReport(t('sc.ai_title'), reports.searchFix(currentChannel, workspace.posts, aiSettings(), i18n.lang, check))}/>}
      {page === 'settings' && currentChannel && <Settings demo={workspace.demo} key={currentChannel.id} channel={currentChannel} onSave={async data => {await updateChannel(currentChannel.id, data); setToast(t('set.saved'));}}/>}
      {page === 'settings' && <div className="settings-extra" id="ai-settings"><AiSettingsPanel onSaved={setToast}/>{isApp && <section className="panel connection-panel"><div className="panel-heading"><div><div className="mini-eyebrow"><Server size={13}/>{t('conn.eyebrow')}</div><h2>{t('conn.title')}</h2><p>{t('conn.connected', {server: connection()?.server ?? ''})}</p></div></div><div className="settings-save"><span>{workspace.demo ? t('conn.demo') : workspace.botEnabled ? t('conn.live') : t('conn.bot_off')}</span><button className="button" onClick={() => {saveConnection(null); setWorkspace(null); setTracked(null); setToken(''); setNeedsLogin(true);}}><LogOut size={16}/>{t('conn.signout')}</button></div></section>}</div>}
      </div>
    </main>
    {toast && <div className="toast" role="status" key={toast}><span><Check size={16}/></span>{toast}<button aria-label={t('app.dismiss_toast')} onClick={() => setToast('')}><X size={15}/></button></div>}
    {modal && <div className="modal-backdrop" onClick={e => {if (e.target === e.currentTarget) setModal(null);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close icon-button" aria-label={t('app.close_dialog')} onClick={() => setModal(null)}><X size={20}/></button>{modal === 'ai' && report ? <AiReport title={report.title} messages={report.messages} onSetup={openAiSettings} onDraft={report.draft ? text => draftFromAi(text) : undefined}/> : modal === 'post' ? <PostEditor demo={workspace.demo} botEnabled={workspace.botEnabled} channels={channels} posts={workspace.posts} draft={prefill} onAiSetup={openAiSettings} defaultChannel={channelId === 'all' ? channels[0]?.id : channelId} post={editing} suggestedAt={suggestedAt} onSave={async data => {await request(editing ? `/posts/${editing.id}` : '/posts', {method: editing ? 'PATCH' : 'POST', body: JSON.stringify(data)}); await load(); setModal(null); setToast(data.status === 'draft' ? t('edit.saved_draft') : t('edit.saved_scheduled'));}}/> : <><span className="modal-symbol"><Sparkles size={24}/></span><h2 id="modal-title">{t('help.title')}</h2><p>{t('help.text')}</p><div className="help-steps">{(['1', '2', '3', '4'] as const).map(n => <p key={n}><strong>{t(`help.step${n}`)}</strong><br/>{t(`help.step${n}_text`)}</p>)}</div><div className="notice"><Radio size={18}/><p>{workspace.demo ? t('help.note_demo') : t('help.note_live')}</p></div><button className="button primary full-width" onClick={() => setModal(null)}>{t('help.start')}<ArrowRight size={16}/></button></>}</section></div>}
  </div>;
}

function Stat({label, value, icon: Icon, color, change, note}: {label: string; value: React.ReactNode; icon: typeof Users; color: string; change?: string; note: string}) {return <section className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${color}`}><Icon size={19}/></span></div><strong className="stat-value">{value}</strong><div className="stat-foot">{change && <span className="positive"><ArrowUpRight size={13}/>{change}</span>}<span>{note}</span></div></section>;}

function AudienceChart({subscribers, growth, period}: {subscribers: number; growth: number; period: number}) {
  const {t, tn, num, compact, date} = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const values = useMemo(() => Array.from({length: 29}, (_, i) => Math.round(subscribers / (1 + growth / 100 * period / 28) + (subscribers - subscribers / (1 + growth / 100 * period / 28)) * (i / 28 + (i === 0 || i === 28 ? 0 : Math.sin(i * 1.8) * .016)))), [subscribers, growth, period]);
  const min = Math.floor((values[0] * .97) / 1000) * 1000; const max = Math.ceil(subscribers * 1.02 / 1000) * 1000;
  const x = (i: number) => 48 + i / 28 * 626; const y = (v: number) => 178 - (v - min) / Math.max(max - min, 1) * 155;
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const label = (i: number) => {const d = new Date(); d.setDate(d.getDate() - period + Math.round(i / 28 * period)); return date(d, {day: 'numeric', month: 'short'});};
  return <div className="audience-chart"><svg viewBox="0 0 702 222" role="img" aria-label={tn('aud.sample_aria', period)}><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" className="chart-fill-top" stopOpacity=".19"/><stop offset="100%" className="chart-fill-top" stopOpacity="0"/></linearGradient></defs>{[0, 1, 2, 3].map(i => <g key={i}><line className="chart-grid" x1="48" x2="674" y1={23 + i * 52} y2={23 + i * 52} strokeDasharray="4 5"/><text className="chart-label" x="0" y={27 + i * 52} fontSize="11">{compact(max - i * (max - min) / 3)}</text></g>)}<path d={`${line} L674,183 L48,183 Z`} fill="url(#chartFill)"/><path className="chart-line" d={line} fill="none" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" pathLength={1}/>{[0, 7, 14, 21, 28].map(i => <text className="chart-label" key={i} x={x(i)} y="213" textAnchor={i === 0 ? 'start' : i === 28 ? 'end' : 'middle'} fontSize="11">{label(i)}</text>)}{hover !== null && <g><line className="chart-cursor" x1={x(hover)} x2={x(hover)} y1="15" y2="184" strokeDasharray="4 4"/><circle className="chart-point" cx={x(hover)} cy={y(values[hover])} r="5" strokeWidth="3"/></g>}{values.map((v, i) => <rect key={i} x={x(i) - 11} y="0" width="22" height="190" fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}><title>{t('aud.sample_point', {date: label(i), count: num(v)})}</title></rect>)}</svg>{hover !== null && <div className="chart-tooltip">{label(hover)} <strong>{num(values[hover])}</strong></div>}</div>;
}

function PostTable({posts, channels, onEdit, demo}: {demo: boolean; posts: Post[]; channels: Channel[]; onEdit: (post: Post) => void}) {
  const {t, num, date} = useI18n();
  if (!posts.length) return <Empty title={t('table.empty_title')} text={t('table.empty_text')}/>;
  return <div className="table-scroll"><table><thead><tr><th>{t('table.post')}</th><th>{t('table.channel')}</th><th>{t('table.views')}</th><th>{demo ? t('table.engagement') : t('table.reactions')}</th><th>{t('table.status')}</th><th aria-label={t('table.actions')}/></tr></thead><tbody>{posts.map((p, i) => {const c = channels.find(c => c.id === p.channelId)!; return <tr key={p.id} style={{'--i': Math.min(i, 12)} as CSSProperties}><td><button className="post-title-button" onClick={() => onEdit(p)}><span className={`post-art art-${i % 4}`}><span className="art-line"/><span className="art-circle"/><span className="art-line second"/></span><span><strong>{p.title}</strong><small>{date(p.scheduledAt, {day: 'numeric', month: 'short'})} · {p.category}</small></span></button></td><td><span className="table-channel"><Avatar channel={c} small/><span>{c.name}</span></span></td><td><span className="table-metric"><Eye size={14}/>{demo ? num(p.views) : '—'}</span></td><td>{demo ? <span className="engagement-cell"><span className="engagement-bar"><span style={{width: `${Math.min(p.views ? p.reactions / p.views * 1000 : 0, 100)}%`}}/></span><strong>{p.views ? `${num(p.reactions / p.views * 100, 1)}%` : '—'}</strong></span> : <span className="table-metric"><MessageCircle size={14}/>{p.status === 'published' ? num(p.reactions) : '—'}</span>}</td><td><Pill status={p.status}/></td><td><button className="icon-button" aria-label={t('table.open', {title: p.title})} onClick={() => onEdit(p)}><MoreHorizontal size={18}/></button></td></tr>;})}</tbody></table></div>;
}

function Empty({title, text}: {title: string; text: string}) {return <div className="empty-state"><FileText size={28}/><h3>{title}</h3><p>{text}</p></div>;}
function LiveAudienceHistory({history, channelId, period, expectedChannels}: {history: Workspace['history']; channelId: string; period: number; expectedChannels: number}) {
  const {t, num, compact, date} = useI18n();
  const rows = history.filter(h => (channelId === 'all' || h.channelId === channelId) && Date.parse(h.date) >= Date.now() - period * 86400000);
  const grouped = new Map<string, {count: number; channels: Set<string>}>();
  for (const row of rows) {const point = grouped.get(row.date) ?? {count: 0, channels: new Set<string>()}; point.count += row.subscribers; point.channels.add(row.channelId); grouped.set(row.date, point);}
  const observedChannels = expectedChannels;
  const points = [...grouped].filter(([, value]) => value.channels.size === observedChannels).sort(([a], [b]) => a.localeCompare(b));
  if (points.length < 2) return <Empty title={t('aud.empty_title')} text={t('aud.empty_text')}/>;
  const minimum = Math.min(...points.map(([, p]) => p.count)); const maximum = Math.max(...points.map(([, p]) => p.count));
  const pad = Math.max((maximum - minimum) * .2, 10); const low = Math.max(0, minimum - pad); const high = maximum + pad;
  const x = (i: number) => 48 + i / (points.length - 1) * 626; const y = (value: number) => 178 - (value - low) / (high - low) * 155;
  const line = points.map(([, point], i) => `${i ? 'L' : 'M'}${x(i)},${y(point.count)}`).join(' ');
  const day = (d: string) => date(`${d}T12:00:00Z`, {day: 'numeric', month: 'short'});
  return <div className="audience-chart"><svg viewBox="0 0 702 222" role="img" aria-label={t('aud.observed_aria')}>{[0, 1, 2, 3].map(i => <g key={i}><line className="chart-grid" x1="48" x2="674" y1={23 + i * 52} y2={23 + i * 52} strokeDasharray="4 5"/><text className="chart-label" x="0" y={27 + i * 52} fontSize="11">{compact(Math.round(high - i * (high - low) / 3))}</text></g>)}<path className="chart-line" d={line} fill="none" strokeWidth="3" strokeLinejoin="round" pathLength={1}/>{points.map(([d, point], i) => <g key={d}><circle className="chart-dot" cx={x(i)} cy={y(point.count)} r="4"><title>{t('aud.observed_point', {date: d, count: num(point.count)})}</title></circle>{(i === 0 || i === points.length - 1) && <text className="chart-label" x={x(i)} y="213" textAnchor={i === 0 ? 'start' : 'end'} fontSize="11">{day(d)}</text>}</g>)}</svg></div>;
}
function Schedule({posts, channels, onEdit, onNew, onDelete, demo, botEnabled}: {demo: boolean; botEnabled: boolean; posts: Post[]; channels: Channel[]; onEdit: (p: Post) => void; onNew: () => void; onDelete: (id: string) => Promise<void>}) {
  const {t, date} = useI18n();
  const [tab, setTab] = useState<'scheduled' | 'draft'>('scheduled');
  const [deleting, setDeleting] = useState<string | null>(null);
  const visible = posts.filter(p => p.status === tab).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  return <section className="panel schedule-panel"><div className="panel-heading"><div><h2>{t('sched.title')}</h2><p>{t('sched.text')}</p></div><button className="text-button" onClick={onNew}><Plus size={15}/>{t('sched.add')}</button></div><div className="tabs"><button className={tab === 'scheduled' ? 'selected' : ''} onClick={() => setTab('scheduled')}>{t('sched.scheduled')} <span>{posts.filter(p => p.status === 'scheduled').length}</span></button><button className={tab === 'draft' ? 'selected' : ''} onClick={() => setTab('draft')}>{t('sched.drafts')} <span>{posts.filter(p => p.status === 'draft').length}</span></button></div><div className="schedule-list">{visible.length ? visible.map((p, i) => {const c = channels.find(c => c.id === p.channelId)!; return <div className="schedule-row" key={p.id} style={{'--i': Math.min(i, 12)} as CSSProperties}><div className="schedule-date"><strong>{date(p.scheduledAt, {day: 'numeric'})}</strong><span>{date(p.scheduledAt, {month: 'short'})}</span></div><div className="schedule-content"><div className="schedule-meta"><Avatar channel={c} small/><span>{c.name}</span><span>·</span><Clock3 size={12}/><span>{date(p.scheduledAt, {hour: '2-digit', minute: '2-digit', timeZone: c.timezone ?? 'Europe/Berlin'})} · {c.timezone}</span>{c.paused && <span className="paused-text">{t('sched.paused')}</span>}</div><button onClick={() => onEdit(p)}>{p.title}</button><p>{p.body.slice(0, 110)}</p>{p.deliveryError && <p className="delivery-error">{t(p.deliveryState === 'uncertain' ? 'sched.review' : 'sched.failed', {error: p.deliveryError})}</p>}</div><Pill status={p.status}/><button className="button small-button" onClick={() => onEdit(p)}>{p.deliveryState === 'sending' || p.deliveryState === 'uncertain' ? t('sched.view') : t('sched.edit')}</button>{deleting === p.id ? <div className="delete-confirm"><span>{t('sched.remove_q')}</span><button onClick={async () => {await onDelete(p.id); setDeleting(null);}}>{t('app.yes')}</button><button onClick={() => setDeleting(null)}>{t('app.cancel')}</button></div> : <button className="icon-button" aria-label={t('sched.remove', {title: p.title})} onClick={() => setDeleting(p.id)}><Trash2 size={16}/></button>}</div>;}) : <Empty title={tab === 'draft' ? t('sched.empty_drafts_title') : t('sched.empty_title')} text={tab === 'draft' ? t('sched.empty_drafts_text') : t('sched.empty_text')}/>}</div><div className="schedule-notice"><Radio size={16}/><span>{demo ? t('sched.note_demo') : botEnabled ? t('sched.note_on') : t('sched.note_off')}</span></div></section>;
}

function Settings({channel, onSave, demo}: {demo: boolean; channel: Channel; onSave: (data: Partial<Channel>) => Promise<void>}) {
  const {t, rich, num} = useI18n();
  const [form, setForm] = useState({paused: channel.paused, timezone: channel.timezone, notifications: channel.notifications, autoDelete: channel.autoDelete, signature: channel.signature});
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const dirty = Object.entries(form).some(([k, v]) => channel[k as keyof Channel] !== v);
  return <form className="settings-layout" onSubmit={async e => {e.preventDefault(); setSaving(true); setError(''); try {await onSave(form);} catch(e) {setError(errorMessage(e, t));} finally {setSaving(false);}}}><section className="panel settings-panel"><div className="panel-heading"><div className="settings-channel"><Avatar channel={channel}/><div><h2>{channel.name}</h2><p>{rich('set.config', {handle: <bdi>{channel.handle}</bdi>})}</p></div></div><span className="subtle-badge">{t('set.shared')}</span></div><div className="settings-section"><h3>{t('set.posting')}</h3><p>{t('set.posting_text')}</p><SettingToggle title={t('set.pause')} description={t('set.pause_text')} value={form.paused} onChange={v => setForm({...form, paused: v})}/><label className="setting-field"><span><strong>{t('set.timezone')}</strong><small>{t('set.timezone_text')}</small></span><select value={form.timezone} onChange={e => setForm({...form, timezone: e.target.value})}>{[...new Set([form.timezone, ...ZONES])].map(z => <option key={z}>{z}</option>)}</select></label><label className="signature-field"><strong>{t('set.signature')}</strong><small>{t('set.signature_text')}</small><textarea maxLength={200} placeholder={t('set.signature_example')} value={form.signature} onChange={e => setForm({...form, signature: e.target.value})}/><span>{t('set.chars', {n: num(form.signature.length), max: num(200)})}</span></label></div><div className="settings-section"><h3>{t('set.housekeeping')} <span className="subtle-badge">{t('set.planned')}</span></h3><p>{t('set.housekeeping_text')}</p><SettingToggle disabled title={t('set.notify')} description={t('set.notify_text')} value={form.notifications} onChange={v => setForm({...form, notifications: v})}/><SettingToggle disabled title={t('set.cleanup')} description={t('set.cleanup_text')} value={form.autoDelete} onChange={v => setForm({...form, autoDelete: v})}/></div><div className="settings-save"><span>{dirty ? t('set.dirty') : t('set.clean')}</span><button className="button primary" disabled={saving || !dirty}>{saving ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>}{t('set.save')}</button></div>{error && <p className="error-text" role="alert">{error}</p>}</section><aside className="settings-aside"><span className="modal-symbol"><Radio size={23}/></span><h3>{t('set.aside_title')}</h3><p>{t('set.aside_text')}</p><div className="notice"><p>{demo ? t('set.aside_demo') : t('set.aside_live')}</p></div></aside></form>;
}
function SettingToggle({title, description, value, onChange, disabled = false}: {title: string; description: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean}) {return <div className="setting-toggle"><div><strong>{title}</strong><small>{description}</small></div><button type="button" disabled={disabled} role="switch" aria-label={title} aria-checked={value} className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)}><span/></button></div>;}

function PostEditor({channels, posts, draft, onAiSetup, defaultChannel, post, suggestedAt, onSave, demo, botEnabled}: {demo: boolean; botEnabled: boolean; channels: Channel[]; posts: Post[]; draft: {title: string; body: string} | null; onAiSetup: () => void; defaultChannel: string; post: Post | null; suggestedAt?: string; onSave: (data: Omit<Post, 'id' | 'views' | 'reactions' | 'shares'>) => Promise<void>}) {
  const {t, num} = useI18n();
  const initial = new Date(post?.scheduledAt ?? suggestedAt ?? Date.now() + 86400000); const local = new Date(initial.getTime() - initial.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [title, setTitle] = useState(post?.title ?? draft?.title.slice(0, 180) ?? ''); const [body, setBody] = useState(post?.body ?? draft?.body.slice(0, 4096) ?? ''); const [channel, setChannel] = useState(post?.channelId ?? defaultChannel); const [date, setDate] = useState(local); const [status, setStatus] = useState<'scheduled' | 'draft'>(post?.status === 'scheduled' ? 'scheduled' : 'draft'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [media, setMedia] = useState(post?.media ?? []); const [buttons, setButtons] = useState(post?.buttons ?? []); const [silent, setSilent] = useState(post?.silent ?? false); const [pin, setPin] = useState(post?.pin ?? false);
  const maxBody = media.length ? 1024 : 4096; const problem = mediaProblem(media, buttons);
  const readonly = post?.status === 'published' || post?.deliveryState === 'sending' || post?.deliveryState === 'uncertain';
  const repost = !!post?.repostOf?.length;
  return <><span className="modal-symbol"><Send size={23}/></span><h2 id="modal-title">{readonly ? t('edit.title_readonly') : post ? t('edit.title_edit') : t('edit.title_new')}</h2><p>{readonly ? (post?.deliveryState === 'uncertain' ? t('edit.text_uncertain') : post?.deliveryState === 'sending' ? t('edit.text_sending') : demo ? t('edit.text_demo') : t('edit.text_published')) : t('edit.text_new')}</p><form className="post-form" onSubmit={async e => {e.preventDefault(); if (problem) return; /* PostExtras already says what's wrong */ if (!body.trim() && !media.length) {setError(t('edit.need_text_or_media')); return;} setBusy(true); setError(''); try {await onSave({title, body, channelId: channel, scheduledAt: new Date(date).toISOString(), status, category: post?.category ?? 'Community', media, buttons: buttons.map(b => ({text: b.text.trim(), url: b.url.trim()})), silent, pin});} catch(e) {setError(errorMessage(e, t));} finally {setBusy(false);}}}><label>{t('edit.channel')}<select value={channel} disabled={readonly} onChange={e => setChannel(e.target.value)}>{channels.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>{t('edit.post_title')}<input placeholder={t('edit.post_title_placeholder')} maxLength={180} value={title} readOnly={readonly} onChange={e => setTitle(e.target.value)} required/></label><label>{t('edit.message')}<textarea aria-label={t('edit.message')} rows={5} placeholder={t('edit.message_placeholder')} maxLength={4096} value={body} readOnly={readonly || repost} onChange={e => setBody(e.target.value)} aria-invalid={body.length > maxBody}/><small className={body.length > maxBody ? 'over' : ''}>{t('set.chars', {n: num(body.length), max: num(maxBody)})}{media.length > 0 && body.length > maxBody ? ` · ${t('edit.caption_limit')}` : ''}</small></label>{repost ? <div className="notice"><Repeat2 size={16}/><p>{t('edit.repost_note')}</p></div> : <PostExtras media={media} buttons={buttons} silent={silent} pin={pin} readonly={readonly} onMedia={setMedia} onButtons={setButtons} onSilent={setSilent} onPin={setPin}/>}{!readonly && !repost && <DraftScoreBox channel={channels.find(c => c.id === channel)} posts={posts} postId={post?.id ?? null} body={body} media={media.map(m => m.kind)} buttons={buttons.length} at={date ? new Date(date).toISOString() : null} onAt={setDate} onBody={setBody} onSetup={onAiSetup}/>}{!readonly && !repost && <Copilot channel={channels.find(c => c.id === channel)} posts={posts} title={title} body={body} onBody={setBody} onTitle={setTitle} onSetup={onAiSetup}/>}{readonly ? <div className="post-detail-stats"><span><Eye size={17}/><strong>{demo ? num(post!.views) : '—'}</strong> {t('edit.views')}</span><span><MessageCircle size={17}/><strong>{demo || post!.status === 'published' ? num(post!.reactions) : '—'}</strong> {t('edit.reactions')}</span><span><Send size={17}/><strong>{demo ? num(post!.shares) : '—'}</strong> {t('edit.shares')}</span></div> : <><div className="form-row"><label>{t('edit.save_as')}<select value={status} onChange={e => setStatus(e.target.value as 'scheduled' | 'draft')}><option value="draft">{t('edit.draft')}</option><option value="scheduled">{t('edit.scheduled')}</option></select></label><label>{status === 'scheduled' ? t('edit.publish_time') : t('edit.planned_time')}<input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} required/></label></div><div className="form-note"><Clock3 size={14}/>{t('edit.timezone', {zone: Intl.DateTimeFormat().resolvedOptions().timeZone})}</div>{status === 'scheduled' && <div className="notice"><Radio size={16}/><p>{demo ? t('edit.note_demo') : botEnabled ? t('edit.note_on') : t('edit.note_off')}</p></div>}{error && <p className="error-text" role="alert">{error}</p>}<button className="button primary full-width" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin"/> : status === 'draft' ? <FileText size={16}/> : <CalendarDays size={16}/>} {status === 'draft' ? t('edit.save_draft') : t('edit.schedule')}</button></>}</form></>;
}
