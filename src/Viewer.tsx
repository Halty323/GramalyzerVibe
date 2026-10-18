import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AlignLeft, ArrowLeft, AtSign, BadgeCheck, CalendarClock, Clock3, ExternalLink, Eye, FileText, Film, Forward, Image, Images, Info, Link2, ListChecks, LoaderCircle, MessageCircle, Mic, Music, Plus, RefreshCw, Search, Smile, Sparkles, Telescope, TriangleAlert, Video, X, type LucideIcon } from 'lucide-react';
import type { Channel, ChannelFeed, FeedPost, Post, TrackedDetail, TrackedStats, TrackedSummary, TrackingError } from '../shared/types';
import { api, errorMessage, trackingError, usernameFrom } from './api';
import { burst, burstFrom, ChannelAvatar, RichText, Sparkline } from './fun';
import { isKey, useI18n, type StringKey } from './i18n';

/** What the viewer has open: one of the workspace's own channels, or any public channel by username. */
export type Selection = {kind: 'mine'; id: string} | {kind: 'public'; username: string};
const keyOf = (s: Selection) => s.kind === 'mine' ? `mine:${s.id}` : `public:${s.username.toLowerCase()}`;
type Loaded = {feed: ChannelFeed} | {detail: TrackedDetail};

const KIND_ICONS: Record<string, LucideIcon> = {TEXT: AlignLeft, PHOTO: Image, ALBUM: Images, VIDEO: Video, ANIMATION: Film, VIDEO_NOTE: Video, AUDIO: Music, VOICE: Mic, DOCUMENT: FileText, POLL: ListChecks, STICKER: Smile, OTHER: Sparkles};
const kindKey = (kind: string): StringKey => isKey(`kind.${kind}`) ? `kind.${kind}` as StringKey : 'kind.OTHER';
const time = (iso: string) => Date.parse(iso);

/** Everything the chat and its info panel draw, whichever kind of channel is open. */
type Chat = {
  key: string; title: string; username: string | null; photoUrl: string | null; verified: boolean; description: string;
  subscribers: number | null; change7: number | null; change30: number | null; series: number[];
  posts: FeedPost[]; scheduled: FeedPost[]; stats: TrackedStats; counters: TrackedDetail['counters'] | null; top: FeedPost[];
  source: ChannelFeed['source'] | 'demo'; tracked: boolean; mine: Channel | null; fetchedAt: string | null; error: TrackingError | null; url: string | null;
};

export function Viewer({channels, posts, tracked, demo, selected, onSelect, onTrack, onUntrack, onEditPost, onNewPost, onToast}: {
  channels: Channel[]; posts: Post[]; tracked: TrackedSummary[] | null; demo: boolean;
  selected: Selection | null; onSelect: (s: Selection | null) => void;
  onTrack: (username: string) => Promise<TrackedDetail | null>; onUntrack: (username: string) => Promise<boolean>;
  onEditPost: (id: string) => void; onNewPost: (channelId: string) => void; onToast: (text: string) => void;
}) {
  const i18n = useI18n();
  const {t, tn, compact} = i18n;
  const cache = useRef(new Map<string, Loaded>());
  const [loaded, setLoaded] = useState<(Loaded & {key: string}) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState<'all' | 'mine' | 'watching'>('all');
  const [mode, setMode] = useState<'posts' | 'scheduled'>('posts');
  const [query, setQuery] = useState('');
  const [finding, setFinding] = useState(false);
  const [info, setInfo] = useState(() => innerWidth >= 1280);
  const [flash, setFlash] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const selKey = selected ? keyOf(selected) : null;

  useEffect(() => {
    if (!selected) {setLoaded(null); return;}
    const key = keyOf(selected);
    let live = true;
    setError(null); setMode('posts'); setQuery(''); setFinding(false); setFlash(null);
    const cached = cache.current.get(key);
    setLoaded(cached ? {key, ...cached} : null);
    setBusy(true);
    const load: Promise<Loaded> = selected.kind === 'mine' ? api.feed(selected.id).then(feed => ({feed})) : api.lookup(selected.username).then(detail => ({detail}));
    load.then(d => {if (live) {cache.current.set(key, d); setLoaded({key, ...d});}})
      .catch(e => {if (live) setError(e);})
      .finally(() => {if (live) setBusy(false);});
    return () => {live = false;};
  }, [selKey, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const watching = (username: string) => tracked?.some(s => s.username.toLowerCase() === username.toLowerCase()) ?? false;
  const chat = useMemo<Chat | null>(() => {
    if (!selected || !loaded || loaded.key !== selKey) return null;
    if ('feed' in loaded) {
      const c = channels.find(c => selected.kind === 'mine' && c.id === selected.id);
      if (!c) return null;
      const feed = loaded.feed;
      const subscribers = feed.stats?.subscribers ?? c.subscribers;
      const username = c.handle ? c.handle.replace(/^@/, '') : null;
      return {key: loaded.key, title: c.name, username, photoUrl: null, verified: false, description: c.description, subscribers,
        change7: feed.stats?.change7 ?? null, change30: feed.stats?.change30 ?? null, series: series(feed.stats),
        posts: feed.posts, scheduled: feed.scheduled, stats: feed.stats ?? localStats(feed.posts, subscribers), counters: null, top: topOf(feed.posts),
        source: demo ? 'demo' : feed.source, tracked: false, mine: c, fetchedAt: null, error: null, url: username && !demo ? `https://t.me/${username}` : null};
    }
    const {channel: s, stats, posts, top, counters} = loaded.detail;
    return {key: loaded.key, title: s.title, username: s.username, photoUrl: s.photoUrl, verified: s.verified, description: s.description ?? '', subscribers: s.subscribers,
      change7: stats.change7, change30: stats.change30, series: series(stats), posts, scheduled: [], stats, counters, top,
      source: s.demo ? 'demo' : 'preview', tracked: tracked ? watching(s.username) : s.tracked, mine: null, fetchedAt: s.fetchedAt, error: s.error, url: s.url};
  }, [selected, selKey, loaded, channels, tracked, demo]); // eslint-disable-line react-hooks/exhaustive-deps

  // the chat list: own channels, then watched ones, newest activity first
  const rows = useMemo(() => {
    const mine = channels.map(c => {
      const last = posts.filter(p => p.channelId === c.id && p.status === 'published').sort((a, b) => time(b.scheduledAt) - time(a.scheduledAt))[0];
      return {sel: {kind: 'mine', id: c.id} as Selection, title: c.name, username: c.handle ? c.handle.replace(/^@/, '') : null, photoUrl: null, verified: false,
        preview: last ? last.title || last.body : c.description, at: last?.scheduledAt ?? null, subscribers: c.subscribers, mine: true, change7: null as number | null};
    });
    const handles = new Set(mine.map(m => m.username?.toLowerCase()));
    const watched = (tracked ?? []).filter(s => !handles.has(s.username.toLowerCase())).map(s => {
      const hit = cache.current.get(`public:${s.username.toLowerCase()}`);
      const latest = hit && 'detail' in hit ? hit.detail.posts[0] : undefined;
      return {sel: {kind: 'public', username: s.username} as Selection, title: s.title, username: s.username, photoUrl: s.photoUrl, verified: s.verified,
        preview: latest ? latest.text.split('\n')[0] || t(kindKey(latest.kind)) : s.description ?? '', at: s.lastPost, subscribers: s.subscribers, mine: false, change7: s.change7};
    });
    return [...mine, ...watched].sort((a, b) => (b.at ? time(b.at) : 0) - (a.at ? time(a.at) : 0));
  }, [channels, posts, tracked, loaded, t]);
  const q = search.trim().replace(/^@/, '').toLowerCase();
  const visible = rows.filter(r => (folder === 'all' || (folder === 'mine') === r.mine) && (!q || r.title.toLowerCase().includes(q) || r.username?.toLowerCase().includes(q)));
  const asked = usernameFrom(search);
  const lookup = asked && !rows.some(r => r.username?.toLowerCase() === asked.toLowerCase()) ? asked : null;
  const counts = {all: rows.length, mine: rows.filter(r => r.mine).length, watching: rows.filter(r => !r.mine).length};
  function open(sel: Selection) {onSelect(sel); setSearch('');}

  const list = chat ? (mode === 'posts' ? chat.posts : chat.scheduled) : [];
  const needle = query.trim().toLowerCase();
  const shown = list.filter(p => !needle || p.text.toLowerCase().includes(needle)).sort((a, b) => time(a.postedAt) - time(b.postedAt));
  useLayoutEffect(() => {const el = scroller.current; if (el) el.scrollTop = el.scrollHeight;}, [chat?.key, mode, needle, loaded]);
  useEffect(() => {
    if (!flash) return;
    document.getElementById(`msg-${flash}`)?.scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    const timer = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(timer);
  }, [flash]);
  function jump(id: string) {setMode('posts'); setQuery(''); setFinding(false); setFlash(id); if (innerWidth < 1280) setInfo(false);}
  function tag(text: string) {setMode('posts'); setFinding(true); setQuery(text);}

  async function refresh() {
    if (!chat?.username || chat.mine) return;
    setBusy(true);
    try {
      const detail = await api.refresh(chat.username);
      cache.current.set(chat.key, {detail}); setLoaded({key: chat.key, detail});
      onToast(t('view.refreshed', {name: detail.channel.title}));
    } catch (e) {onToast(errorMessage(e, t));} finally {setBusy(false);}
  }
  async function track(el: HTMLElement) {
    if (!chat?.username) return;
    setActing(true);
    const detail = await onTrack(chat.username);
    setActing(false);
    if (detail) {cache.current.set(chat.key, {detail}); setLoaded({key: chat.key, detail}); burstFrom(el, ['🎉', '📈', '✨', '🔭', '💜']);}
  }
  async function untrack() {
    if (!chat?.username) return;
    setActing(true); await onUntrack(chat.username); setActing(false);
  }

  return <div className={`tg ${selected ? 'has-chat' : ''} ${info && chat ? 'has-info' : ''}`}>
    <aside className="tg-list">
      <div className="tg-search"><Search size={16}/><input aria-label={t('view.search')} placeholder={t('view.search')} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => {if (e.key === 'Enter') {if (lookup) open({kind: 'public', username: lookup}); else if (visible[0]) open(visible[0].sel);} if (e.key === 'Escape') setSearch('');}}/>{search && <button className="tg-icon" aria-label={t('view.close_search')} onClick={() => setSearch('')}><X size={15}/></button>}</div>
      <div className="tg-folders" role="tablist">{(['all', 'mine', 'watching'] as const).map(f => <button key={f} role="tab" aria-selected={folder === f} className={folder === f ? 'on' : ''} onClick={() => setFolder(f)}>{t(f === 'all' ? 'view.tab_all' : f === 'mine' ? 'view.tab_mine' : 'view.tab_watching')}<span>{counts[f]}</span></button>)}</div>
      <div className="tg-rows-scroll">
        {lookup && <button className="tg-chat lookup" onClick={() => open({kind: 'public', username: lookup})}><span className="tg-avatar lookup-icon"><Telescope size={20}/></span><span className="tg-chat-body"><strong>{t('view.lookup', {username: lookup})}</strong><small>{t('view.lookup_hint')}</small></span></button>}
        {visible.map((r, i) => {const key = keyOf(r.sel); return <button key={key} style={{'--i': Math.min(i, 10)} as CSSProperties} className={`tg-chat ${selKey === key ? 'on' : ''}`} onClick={() => open(r.sel)}>
          <ChannelAvatar title={r.title} seed={r.username ?? r.title} photoUrl={r.photoUrl} size={46}/>
          <span className="tg-chat-body"><span className="tg-chat-top"><strong dir="auto">{r.title}</strong>{r.verified && <BadgeCheck size={14} className="tg-verified"/>}{!r.mine && <Eye size={12} className="tg-watch-mark" aria-label={t('view.watching')}/>}<time>{r.at ? shortWhen(r.at, i18n) : ''}</time></span>
            <span className="tg-chat-bottom"><small dir="auto">{r.preview}</small>{r.subscribers !== null && <span className="tg-count" title={tn('view.subscribers', r.subscribers)}>{compact(r.subscribers)}</span>}</span></span>
        </button>;})}
        {!visible.length && !lookup && <p className="tg-list-empty">{q ? t('view.no_results', {query: search.trim()}) : t('view.empty_list')}</p>}
      </div>
    </aside>

    <section className="tg-chat-pane">
      {!selected ? <div className="tg-wall"><div className="tg-pick"><span className="tg-pick-icon"><Telescope size={26}/></span><p>{t('view.pick')}</p></div></div> : <>
        <header className="tg-head">
          <button className="tg-icon tg-back" aria-label={t('view.back')} onClick={() => onSelect(null)}><ArrowLeft size={19}/></button>
          {chat ? <button className="tg-head-who" onClick={() => setInfo(v => !v)}><ChannelAvatar title={chat.title} seed={chat.username ?? chat.title} photoUrl={chat.photoUrl} size={40}/><span><strong>{chat.title}{chat.verified && <BadgeCheck size={15} className="tg-verified"/>}</strong><small>{busy ? <Typing text={t('view.reading')}/> : chat.subscribers !== null ? tn('view.subscribers', chat.subscribers) : t('view.channel')}</small></span></button>
            : <div className="tg-head-who"><span className="tg-avatar skeleton" style={{width: 40, height: 40}}/><span><strong dir="auto">{selected.kind === 'public' ? <bdi>@{selected.username}</bdi> : channels.find(c => selected.kind === 'mine' && c.id === selected.id)?.name}</strong><small>{busy ? <Typing text={t('view.reading')}/> : ' '}</small></span></div>}
          {chat && <div className="tg-head-tools">
            <button className={`tg-icon ${finding ? 'on' : ''}`} aria-label={t('view.search_in')} aria-pressed={finding} onClick={() => {setFinding(v => !v); setQuery('');}}><Search size={18}/></button>
            {chat.mine && <button className={`tg-icon ${mode === 'scheduled' ? 'on' : ''}`} aria-label={t('view.scheduled')} aria-pressed={mode === 'scheduled'} onClick={() => setMode(m => m === 'posts' ? 'scheduled' : 'posts')}><CalendarClock size={18}/>{chat.scheduled.length > 0 && <span className="tg-badge">{chat.scheduled.length}</span>}</button>}
            {!chat.mine && <button className="tg-icon" aria-label={t('view.refresh')} disabled={busy} onClick={refresh}><RefreshCw size={18} className={busy ? 'spin' : ''}/></button>}
            <button className={`tg-icon ${info ? 'on' : ''}`} aria-label={t('view.info')} aria-pressed={info} onClick={() => setInfo(v => !v)}><Info size={18}/></button>
          </div>}
        </header>
        {finding && chat && <div className="tg-find"><Search size={15}/><input autoFocus aria-label={t('view.search_in')} placeholder={t('view.search_in')} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => {if (e.key === 'Escape') {setFinding(false); setQuery('');}}}/>{needle && <small>{tn('view.matches', shown.length)}</small>}<button className="tg-icon" aria-label={t('view.close_search')} onClick={() => {setFinding(false); setQuery('');}}><X size={15}/></button></div>}
        {mode === 'scheduled' && chat && <div className="tg-banner"><CalendarClock size={15}/><span>{t('view.scheduled_banner')}</span><button className="text-button" onClick={() => setMode('posts')}>{t('view.back_to_posts')}</button></div>}
        <div className="tg-wall" ref={scroller}>
          {!chat && busy && <Skeleton/>}
          {!chat && !busy && error !== null && <div className="tg-pick error"><span className="tg-pick-icon"><TriangleAlert size={24}/></span><p>{errorMessage(error, t)}</p>{trackingError(error) === 'unreachable' || !trackingError(error) ? <button className="button" onClick={() => setAttempt(a => a + 1)}>{t('app.retry')}</button> : null}</div>}
          {chat && <div className="tg-msgs" key={`${chat.key}:${mode}`}>
            {shown.map((p, i) => {
              const day = new Date(p.postedAt).toDateString(), prev = shown[i - 1];
              return <div key={p.id} className="tg-group">
                {(!prev || new Date(prev.postedAt).toDateString() !== day) && <div className="tg-day"><span>{mode === 'scheduled' ? t('view.scheduled_for', {date: i18n.date(p.postedAt, {weekday: 'short', day: 'numeric', month: 'long'})}) : dayLabel(p.postedAt, i18n)}</span></div>}
                <Bubble post={p} order={Math.min(shown.length - 1 - i, 12)} flash={flash === p.id} onTag={tag} onEdit={p.status === 'scheduled' ? () => onEditPost(p.id) : undefined}/>
              </div>;
            })}
            {!shown.length && <div className="tg-pick"><p>{needle ? t('view.no_matches', {query: query.trim()}) : mode === 'scheduled' ? t('view.no_scheduled') : chat.mine ? t('view.no_posts_own') : t('view.no_posts')}</p></div>}
          </div>}
        </div>
        {chat && <footer className="tg-bottom">
          {chat.mine ? <button className="tg-bottom-btn" onClick={() => onNewPost(chat.mine!.id)}><Plus size={17}/>{t('view.new_post')}</button>
            : chat.tracked ? <div className="tg-bottom-split"><span><Eye size={15}/>{t('view.watching')}</span><button className="tg-bottom-btn quiet" disabled={acting} onClick={untrack}>{t('view.untrack')}</button></div>
            : <button className="tg-bottom-btn primary" disabled={acting} onClick={e => track(e.currentTarget)}>{acting ? <LoaderCircle size={17} className="spin"/> : <Plus size={17}/>}{t('view.track')}</button>}
        </footer>}
      </>}
    </section>

    {chat && info && <ChatInfo chat={chat} acting={acting} onClose={() => setInfo(false)} onJump={jump} onTag={tag} onTrack={track} onUntrack={untrack}/>}
  </div>;
}

function Typing({text}: {text: string}) {return <span className="tg-typing">{text}<i/><i/><i/></span>;}
function Skeleton() {return <div className="tg-msgs" aria-hidden="true">{[180, 120, 220, 90, 160].map((h, i) => <div key={i} className="tg-msg"><div className="tg-bubble skeleton" style={{height: h, width: `${60 + (i * 13) % 30}%`}}/></div>)}</div>;}

function Bubble({post, order, flash, onTag, onEdit}: {post: FeedPost; order: number; flash: boolean; onTag: (tag: string) => void; onEdit?: () => void}) {
  const i18n = useI18n();
  const {t, tn, compact} = i18n;
  const [expanded, setExpanded] = useState(false);
  const long = post.text.length > 700;
  const text = long && !expanded ? post.text.slice(0, 560).trimEnd() + '…' : post.text;
  const Icon = KIND_ICONS[post.kind] ?? Sparkles;
  const media = post.mediaUrl || !['TEXT', 'OTHER'].includes(post.kind);
  const reactions = post.reactionList.length ? post.reactionList : post.reactions ? [{emoji: '❤️', count: post.reactions}] : [];
  return <div id={`msg-${post.id}`} className={`tg-msg ${flash ? 'flash' : ''} ${post.status}`} style={{'--i': order} as CSSProperties}
    onDoubleClick={e => {if ((e.target as HTMLElement).closest('a,button')) return; burst(e.clientX, e.clientY, [reactions[0]?.emoji ?? '❤️'], 9);}}>
    <div className={`tg-bubble ${onEdit ? 'editable' : ''}`} onClick={onEdit} role={onEdit ? 'button' : undefined} tabIndex={onEdit ? 0 : undefined} onKeyDown={onEdit ? e => {if (e.key === 'Enter') onEdit();} : undefined}>
      {post.forwardedFrom && <div className="tg-fwd"><Forward size={13}/>{t('view.forwarded', {name: post.forwardedFrom})}</div>}
      {media && (post.mediaUrl
        ? <div className="tg-media"><img src={post.mediaUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={e => {(e.currentTarget.parentElement as HTMLElement).classList.add('broken');}}/>{post.kind !== 'PHOTO' && <span className="tg-media-tag"><Icon size={13}/>{t(kindKey(post.kind))}</span>}</div>
        : <div className={`tg-media placeholder k-${post.kind}`} style={{'--h': (post.messageId ?? 0) * 47 % 360} as CSSProperties}><Icon size={28}/><span>{t(kindKey(post.kind))}</span></div>)}
      {text && <div className="tg-text" dir="auto"><RichText text={text} onTag={onTag}/>{long && <button className="tg-more" onClick={e => {e.stopPropagation(); setExpanded(v => !v);}}>{expanded ? t('view.show_less') : t('view.show_more')}</button>}</div>}
      {reactions.length > 0 && <div className="tg-reactions">{reactions.slice(0, 7).map(r => <button key={r.emoji} className="tg-reaction" onClick={e => {e.stopPropagation(); e.currentTarget.classList.remove('pop'); void e.currentTarget.offsetWidth; e.currentTarget.classList.add('pop'); burstFrom(e.currentTarget, [r.emoji], 6);}}><span className="emoji">{r.emoji}</span>{compact(r.count)}</button>)}</div>}
      <div className="tg-meta">{post.edited && <span>{t('view.edited')}</span>}{post.views !== null && <span className="tg-views" title={tn('view.views', post.views)}><Eye size={13}/>{compact(post.views)}</span>}{post.status === 'scheduled' && <Clock3 size={12}/>}<time dateTime={post.postedAt} title={i18n.date(post.postedAt, {dateStyle: 'full', timeStyle: 'short'})}>{i18n.date(post.postedAt, {hour: '2-digit', minute: '2-digit'})}</time></div>
      {post.comments !== null && <div className="tg-comments"><MessageCircle size={15}/><span>{post.comments ? tn('view.comments', post.comments) : t('view.no_comments')}</span></div>}
    </div>
    {post.url && <a className="tg-side" href={post.url} target="_blank" rel="noreferrer" aria-label={t('view.open_post')} title={t('view.open_post')}><ExternalLink size={15}/></a>}
  </div>;
}

function ChatInfo({chat, acting, onClose, onJump, onTag, onTrack, onUntrack}: {chat: Chat; acting: boolean; onClose: () => void; onJump: (id: string) => void; onTag: (tag: string) => void; onTrack: (el: HTMLElement) => void; onUntrack: () => void}) {
  const i18n = useI18n();
  const {t, tn, num, compact, signed} = i18n;
  const s = chat.stats;
  const hasPosts = chat.posts.length > 0;
  const peakHour = s.hours.indexOf(Math.max(...s.hours));
  const maxHour = Math.max(1, ...s.hours), maxDay = Math.max(1, ...s.days);
  const kindTotal = s.kinds.reduce((n, k) => n + k.posts, 0) || 1;
  const counters: [keyof NonNullable<Chat['counters']>, LucideIcon, 'view.photos' | 'view.videos' | 'view.files' | 'view.links'][] = [['photos', Image, 'view.photos'], ['videos', Video, 'view.videos'], ['files', FileText, 'view.files'], ['links', Link2, 'view.links']];
  const tiles: [string, ReactNode, string?][] = [
    [t('view.avg_views'), s.avgViews !== null ? compact(s.avgViews) : '—'],
    [t('view.er'), s.er !== null ? `${num(s.er, 1)}%` : '—', t('view.er_hint')],
    [t('view.per_day'), s.postsPerDay !== null ? num(s.postsPerDay, 1) : '—'],
    [t('view.avg_reactions'), s.avgReactions !== null ? num(s.avgReactions, 1) : '—'],
    [t('view.reaction_rate'), s.reactionRate !== null ? num(s.reactionRate, 2) : '—'],
  ];
  return <aside className="tg-info" aria-label={t('view.info')}>
    <div className="tg-info-head"><strong>{t('view.info')}</strong><button className="tg-icon" aria-label={t('view.close_info')} onClick={onClose}><X size={18}/></button></div>
    <div className="tg-info-scroll">
      <div className="tg-profile">
        <ChannelAvatar title={chat.title} seed={chat.username ?? chat.title} photoUrl={chat.photoUrl} size={92}/>
        <h3>{chat.title}{chat.verified && <BadgeCheck size={18} className="tg-verified" aria-label={t('view.verified')}/>}</h3>
        <p>{chat.subscribers !== null ? tn('view.subscribers', chat.subscribers) : t('view.channel')}</p>
        {chat.change7 !== null && <span className={`tg-change ${chat.change7 >= 0 ? 'up' : 'down'}`}>{t('view.in_7_days', {change: signed(chat.change7)})}</span>}
        {chat.source === 'demo' && <span className="subtle-badge">{t('view.sample')}</span>}
      </div>
      <div className="tg-info-rows">
        {chat.username && <a className="tg-info-row" href={chat.url ?? undefined} target="_blank" rel="noreferrer" aria-disabled={!chat.url}><AtSign size={18}/><span><strong dir="ltr">t.me/{chat.username}</strong><small>{t('view.link')}</small></span></a>}
        {chat.description && <div className="tg-info-row"><Info size={18}/><span><span className="tg-desc" dir="auto"><RichText text={chat.description} onTag={onTag}/></span><small>{t('view.description')}</small></span></div>}
        <div className="tg-info-row muted"><Sparkles size={18}/><span><span>{t(`view.source.${chat.source}`)}</span>{chat.fetchedAt && <small>{t('view.updated', {ago: i18n.ago(chat.fetchedAt)})}</small>}</span></div>
        {chat.error && <div className="tg-info-row warn"><TriangleAlert size={18}/><span>{t('view.stale', {reason: t(`err.${chat.error}`)})}</span></div>}
      </div>

      {hasPosts && <section className="tg-section"><h4>{t('view.stats')}<small>{tn('view.based_on', s.sample || Math.min(chat.posts.length, 30))}</small></h4>
        <div className="tg-tiles">{tiles.map(([label, value, hint]) => <div key={label} className="tg-tile" title={hint}><strong>{value}</strong><small>{label}</small></div>)}</div></section>}

      {chat.series.length >= 2 && <section className="tg-section"><h4>{t('view.growth')}{chat.change30 !== null && <small className={chat.change30 >= 0 ? 'up' : 'down'}>{t('view.in_30_days', {change: signed(chat.change30)})}</small>}</h4>
        <Sparkline values={chat.series} width={268} height={70} className="tg-growth"/></section>}

      {hasPosts && <section className="tg-section"><h4>{t('view.hours')}</h4>
        <div className="tg-hours">{s.hours.map((n, h) => <span key={h} className={h === peakHour ? 'peak' : ''} style={{'--v': n / maxHour} as CSSProperties} title={`${i18n.hour(h)} · ${tn('ins.posts', n)}`}/>)}</div>
        <div className="tg-axis"><span>{i18n.hour(0)}</span><span>{i18n.hour(6)}</span><span>{i18n.hour(12)}</span><span>{i18n.hour(18)}</span><span>{i18n.hour(23)}</span></div>
        <p className="tg-note">{t('view.hours_peak', {hour: i18n.hour(peakHour)})}</p>
        <h4 className="tg-sub">{t('view.days')}</h4>
        <div className="tg-days">{s.days.map((n, d) => <div key={d}><span>{i18n.weekday(d, 'short')}</span><span className="tg-bar"><span style={{width: `${n / maxDay * 100}%`}}/></span><b>{n}</b></div>)}</div></section>}

      {s.kinds.length > 0 && <section className="tg-section"><h4>{t('view.mix')}</h4>
        {s.kinds.map(k => {const Icon = KIND_ICONS[k.kind] ?? Sparkles; return <div key={k.kind} className="tg-kind"><Icon size={15}/><span>{t(kindKey(k.kind))}</span><span className="tg-bar"><span style={{width: `${k.posts / kindTotal * 100}%`}}/></span><b>{num(Math.round(k.posts / kindTotal * 100))}%</b>{k.avgViews !== null && <small><Eye size={11}/>{compact(k.avgViews)}</small>}</div>;})}</section>}

      {s.hashtags.length > 0 && <section className="tg-section"><h4>{t('view.hashtags')}</h4><div className="tg-chips">{s.hashtags.map(h => <button key={h.tag} onClick={() => onTag(`#${h.tag}`)}>#{h.tag}<span>{h.posts}</span></button>)}</div></section>}

      {chat.counters && Object.keys(chat.counters).length > 0 && <section className="tg-section"><h4>{t('view.media')}</h4>
        {counters.filter(([k]) => chat.counters![k] !== undefined).map(([k, Icon, key]) => <div key={k} className="tg-info-row compact"><Icon size={18}/><span>{tn(key, chat.counters![k]!)}</span></div>)}</section>}

      {chat.top.length > 0 && <section className="tg-section"><h4>{t('view.top')}</h4>
        {chat.top.map((p, i) => <button key={p.id} className="tg-top" onClick={() => onJump(p.id)} title={t('view.jump')}><span className="tg-rank">{i + 1}</span><span><strong dir="auto">{p.text.split('\n')[0] || t(kindKey(p.kind))}</strong><small>{p.views !== null && <><Eye size={11}/>{compact(p.views)} · </>}{i18n.date(p.postedAt, {day: 'numeric', month: 'short'})}</small></span></button>)}</section>}

      <div className="tg-info-actions">
        {chat.url && <a className="button" href={chat.url} target="_blank" rel="noreferrer"><ExternalLink size={15}/>{t('view.open_post')}</a>}
        {!chat.mine && (chat.tracked ? <button className="button" disabled={acting} onClick={onUntrack}>{t('view.untrack')}</button> : <button className="button primary" disabled={acting} onClick={e => onTrack(e.currentTarget)}><Plus size={15}/>{t('view.track')}</button>)}
      </div>
    </div>
  </aside>;
}

function series(stats: TrackedStats | null) {return (stats?.series ?? []).map(p => p.subscribers).filter((n): n is number => n !== null);}
function topOf(posts: FeedPost[]) {
  const byViews = posts.some(p => p.views !== null);
  return [...posts].sort((a, b) => byViews ? (b.views ?? 0) - (a.views ?? 0) : b.reactions - a.reactions).slice(0, 5);
}

function dayLabel(iso: string, i18n: ReturnType<typeof useI18n>) {
  const d = new Date(iso), today = new Date(), yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return i18n.t('view.today');
  if (d.toDateString() === yesterday.toDateString()) return i18n.t('view.yesterday');
  return i18n.date(d, {day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric'});
}
/** Like Telegram's chat list: the time today, the weekday this week, the date before that. */
function shortWhen(iso: string, i18n: ReturnType<typeof useI18n>) {
  const d = new Date(iso), age = Date.now() - d.getTime();
  if (d.toDateString() === new Date().toDateString()) return i18n.date(d, {hour: '2-digit', minute: '2-digit'});
  if (age < 6 * 864e5) return i18n.date(d, {weekday: 'short'});
  return i18n.date(d, {day: 'numeric', month: 'short'});
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const SETTLED = 12 * 3600e3;
/** The same numbers the backend works out for public channels (TrackedStats), from the posts we have, in local time. */
export function localStats(posts: FeedPost[], subscribers: number | null, now = Date.now()): TrackedStats {
  const newest = [...posts].sort((a, b) => time(b.postedAt) - time(a.postedAt));
  const recent = newest.slice(0, 30);
  const withViews = recent.filter(p => p.views !== null);
  const settled = withViews.filter(p => time(p.postedAt) <= now - SETTLED);
  const counted = settled.length ? settled : withViews;
  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const avgViewsRaw = mean(counted.map(p => p.views!));
  const avgViews = avgViewsRaw === null ? null : Math.round(avgViewsRaw);
  const views = counted.reduce((n, p) => n + p.views!, 0), reactions = counted.reduce((n, p) => n + p.reactions, 0);
  let postsPerDay: number | null = null;
  if (newest.length) {
    const from = now - 30 * 864e5, month = newest.filter(p => time(p.postedAt) > from);
    const oldest = time(newest[newest.length - 1].postedAt);
    postsPerDay = month.length ? round2(month.length / Math.max(1, Math.min(30, (now - Math.max(oldest, from)) / 864e5))) : 0;
  }
  const byKind = new Map<string, FeedPost[]>();
  for (const p of recent) byKind.set(p.kind, [...byKind.get(p.kind) ?? [], p]);
  const viewsOf = (ps: FeedPost[]) => {const v = mean(ps.filter(p => p.views !== null).map(p => p.views!)); return v === null ? null : Math.round(v);};
  const byTag = new Map<string, FeedPost[]>();
  for (const p of newest) for (const tag of new Set([...p.text.matchAll(/#([\p{L}\p{N}_]{2,40})/gu)].map(m => m[1].toLowerCase()))) byTag.set(tag, [...byTag.get(tag) ?? [], p]);
  const hours = Array(24).fill(0), days = Array(7).fill(0);
  for (const p of newest) {const d = new Date(p.postedAt); hours[d.getHours()]++; days[(d.getDay() + 6) % 7]++;}
  return {
    subscribers, change7: null, change30: null, series: [], avgViews,
    er: avgViews === null || !subscribers ? null : round2(avgViews * 100 / subscribers),
    avgReactions: recent.length ? round2(mean(recent.map(p => p.reactions))!) : null,
    reactionRate: views ? round2(reactions * 100 / views) : null,
    postsPerDay, lastPost: newest[0]?.postedAt ?? null,
    kinds: [...byKind].map(([kind, ps]) => ({kind, posts: ps.length, avgViews: viewsOf(ps)})).sort((a, b) => b.posts - a.posts),
    hashtags: [...byTag].filter(([, ps]) => ps.length >= 2).map(([tag, ps]) => ({tag, posts: ps.length, avgViews: viewsOf(ps)})).sort((a, b) => b.posts - a.posts || a.tag.localeCompare(b.tag)).slice(0, 8),
    hours, days, sample: counted.length || recent.length,
  };
}
