import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export type Theme = 'light' | 'dark';
const STORAGE = 'gramalyzer.theme';
const dark = () => matchMedia('(prefers-color-scheme: dark)');
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function saved(): Theme | null {
  try {const value = localStorage.getItem(STORAGE); return value === 'light' || value === 'dark' ? value : null;} catch {return null;}
}
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f0d13' : '#7653e8');
}

/** Light or dark: the visitor's choice once they make one, the system's until then. index.html applies it before the first paint. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => saved() ?? (dark().matches ? 'dark' : 'light'));
  useEffect(() => apply(theme), [theme]);
  useEffect(() => {
    const query = dark();
    const follow = () => {if (!saved()) setTheme(query.matches ? 'dark' : 'light');};
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, []);

  /** Switches theme with a circle that grows from (x, y), where the browser can animate it. */
  function toggle(x = innerWidth / 2, y = 0) {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    try {localStorage.setItem(STORAGE, next);} catch {/* still switch for this visit */}
    const doc = document as Document & {startViewTransition?: (update: () => void) => {ready: Promise<void>}};
    if (!doc.startViewTransition || reducedMotion()) {setTheme(next); return;}
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    doc.startViewTransition(() => {flushSync(() => setTheme(next)); apply(next);}).ready.then(() => {
      document.documentElement.animate({clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]}, {duration: 600, easing: 'cubic-bezier(.4,0,.2,1)', pseudoElement: '::view-transition-new(root)'});
    }).catch(() => {/* the switch itself already happened */});
  }
  return {theme, toggle};
}
