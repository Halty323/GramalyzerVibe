import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePhoto } from './api';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts up to value (from 0 on first show, then from the previous value). */
export function CountUp({value, format}: {value: number; format: (n: number) => string}) {
  const [shown, setShown] = useState(() => calm() ? value : 0);
  const from = useRef(shown);
  useEffect(() => {
    if (calm()) {setShown(value); from.current = value; return;}
    const start = performance.now(), begin = from.current, whole = Number.isInteger(value);
    let frame = requestAnimationFrame(function step(now) {
      const p = Math.min(1, (now - start) / 750), eased = 1 - (1 - p) ** 3;
      const next = begin + (value - begin) * eased;
      setShown(whole ? Math.round(next) : next);
      from.current = next;
      if (p < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{format(shown)}</>;
}

/** A little burst of emoji flying out of (x, y). Purely decorative. */
export function burst(x: number, y: number, emoji: string[], count = 14) {
  if (calm()) return;
  const layer = document.createElement('div');
  layer.className = 'burst-layer'; layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.textContent = emoji[i % emoji.length];
    piece.style.left = `${x}px`; piece.style.top = `${y}px`;
    layer.appendChild(piece);
    const angle = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.3, distance = 60 + Math.random() * 90;
    const dx = Math.cos(angle) * distance, dy = Math.sin(angle) * distance;
    piece.animate([
      {transform: 'translate(-50%,-50%) scale(.4)', opacity: 1},
      {transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.15) rotate(${(Math.random() - .5) * 60}deg)`, opacity: 1, offset: .6},
      {transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 70}px)) scale(.9)`, opacity: 0},
    ], {duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards'});
  }
  setTimeout(() => layer.remove(), 1500);
}
export const burstFrom = (el: Element | null, emoji: string[], count?: number) => {
  if (!el) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, emoji, count);
};

/** A small line chart that draws itself in. */
export function Sparkline({values, width = 96, height = 30, className = ''}: {values: number[]; width?: number; height?: number; className?: string}) {
  if (values.length < 2) return <svg className={`spark ${className}`} width={width} height={height} aria-hidden="true"><line x1="2" x2={width - 2} y1={height / 2} y2={height / 2} className="spark-flat"/></svg>;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const x = (i: number) => 2 + i / (values.length - 1) * (width - 4), y = (v: number) => height - 3 - (v - min) / span * (height - 6);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const trend = values[values.length - 1] >= values[0] ? 'up' : 'down';
  return <svg className={`spark ${trend} ${className}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <path className="spark-area" d={`${line} L${x(values.length - 1)},${height} L${x(0)},${height} Z`}/>
    <path className="spark-line" d={line} pathLength={1}/>
    <circle className="spark-dot" cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.5"/>
  </svg>;
}

// Telegram's avatar colors, as gradients
const AVATARS = [['#ff885e', '#ff516a'], ['#ffcd6a', '#ffa85c'], ['#a695e7', '#7c5ce8'], ['#a0de7e', '#54cb68'], ['#53edd6', '#28c9b7'], ['#72d5fd', '#2a9ef1'], ['#e0a2f3', '#d669ed']];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
export const initials = (title: string) => title.split(/\s+/).filter(Boolean).slice(0, 2).map(w => Array.from(w)[0]).join('').toUpperCase() || '?';
export const avatarColors = (seed: string) => AVATARS[Math.abs(hash(seed)) % AVATARS.length];

/** A round, Telegram-style channel picture: the photo when there is one, otherwise initials on a gradient. */
export function ChannelAvatar({title, seed, photoUrl: url, size = 44}: {title: string; seed: string; photoUrl?: string | null; size?: number}) {
  const [broken, setBroken] = useState(false);
  const photoUrl = usePhoto(url);
  const [from, to] = avatarColors(seed);
  return <span className="tg-avatar" style={{width: size, height: size, fontSize: size * .38, background: `linear-gradient(160deg, ${from}, ${to})`}} aria-hidden="true">
    {photoUrl && !broken ? <img src={photoUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)}/> : initials(title)}
  </span>;
}

const TOKENS = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])|(#[\p{L}\p{N}_]{2,40})|(@[A-Za-z][\w]{3,31})/gu;
/** Post text with clickable links, hashtags and mentions, like Telegram shows it. */
export function RichText({text, onTag}: {text: string; onTag?: (tag: string) => void}) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKENS)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const [token, url, tag, mention] = m;
    if (url) parts.push(<a key={m.index} href={url} target="_blank" rel="noreferrer noopener">{url}</a>);
    else if (tag) parts.push(onTag ? <button key={m.index} type="button" className="tg-tag" onClick={() => onTag(tag)}>{tag}</button> : tag);
    else if (mention) parts.push(<a key={m.index} href={`https://t.me/${mention.slice(1)}`} target="_blank" rel="noreferrer noopener">{mention}</a>);
    else parts.push(token);
    last = m.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
