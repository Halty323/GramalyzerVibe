import { useRef, useState } from 'react';
import { BellOff, Clapperboard, ImagePlus, Link2, LoaderCircle, Pin, Plus, X } from 'lucide-react';
import type { LinkButton, MediaRef } from '../shared/types';
import { api, errorMessage, usePhoto } from './api';
import { useI18n } from './i18n';

export const MAX_MEDIA = 10;
export const MAX_BUTTONS = 8;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm';
/** Telegram's own limits for what a bot uploads. */
const tooBig = (f: File) => f.size > (f.type.startsWith('image/') && f.type !== 'image/gif' ? 10 : 50) * 1024 * 1024;

/** What Telegram can't send, as a text key; null when the post is fine. */
export function mediaProblem(media: MediaRef[], buttons: LinkButton[]): 'edit.media_album_buttons' | 'edit.media_album_gif' | 'edit.button_incomplete' | null {
  if (media.length > 1 && buttons.length) return 'edit.media_album_buttons';
  if (media.length > 1 && media.some(m => m.kind === 'animation')) return 'edit.media_album_gif';
  if (buttons.some(b => !b.text.trim() || !/^(https?:\/\/|tg:\/\/)\S+$/i.test(b.url.trim()))) return 'edit.button_incomplete';
  return null;
}

function Thumb({file, onRemove, readonly}: {file: MediaRef; onRemove: () => void; readonly: boolean}) {
  const {t} = useI18n();
  const src = usePhoto(file.kind === 'video' ? null : `/api/media/${encodeURIComponent(file.id)}`);
  return <li className="media-thumb" title={file.name}>
    {file.kind === 'video' ? <span className="media-video"><Clapperboard size={20}/><small>{file.name}</small></span> : src ? <img src={src} alt={file.name}/> : <LoaderCircle className="spin" size={16}/>}
    {file.kind === 'animation' && <span className="media-badge">GIF</span>}
    {!readonly && <button type="button" className="media-remove" onClick={onRemove} aria-label={t('edit.media_remove', {name: file.name})}><X size={13}/></button>}
  </li>;
}

/** Pictures, videos and link buttons of a post, and whether it's sent silently or pinned. */
export function PostExtras({media, buttons, silent, pin, readonly, onMedia, onButtons, onSilent, onPin}: {
  media: MediaRef[]; buttons: LinkButton[]; silent: boolean; pin: boolean; readonly: boolean;
  onMedia: (m: MediaRef[]) => void; onButtons: (b: LinkButton[]) => void; onSilent: (v: boolean) => void; onPin: (v: boolean) => void;
}) {
  const {t} = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const latest = useRef(media); latest.current = media;

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    const chosen = [...files].slice(0, MAX_MEDIA - media.length);
    if (chosen.length < files.length) setError(t('edit.media_max', {n: MAX_MEDIA}));
    const big = chosen.find(tooBig);
    if (big) {setError(t('edit.media_too_big', {name: big.name})); return;}
    setUploading(n => n + chosen.length);
    for (const file of chosen) {
      try {const ref = await api.upload(file); onMedia([...latest.current, ref]);}
      catch (e) {setError(errorMessage(e, t));}
      finally {setUploading(n => n - 1);}
    }
    if (input.current) input.current.value = '';
  }
  const problem = mediaProblem(media, buttons);

  if (readonly && !media.length && !buttons.length) return null;
  return <div className="post-extras">
    <div className="extras-head"><strong>{t('edit.media')}</strong>{!readonly && <small>{media.length > 1 ? t('edit.media_album', {n: media.length}) : t('edit.media_hint')}</small>}</div>
    {(media.length > 0 || uploading > 0) && <ul className="media-grid">
      {media.map((m, i) => <Thumb key={m.id} file={m} readonly={readonly} onRemove={() => onMedia(media.filter((_, j) => j !== i))}/>)}
      {Array.from({length: uploading}, (_, i) => <li key={`u${i}`} className="media-thumb uploading"><LoaderCircle className="spin" size={16}/></li>)}
    </ul>}
    {!readonly && media.length + uploading < MAX_MEDIA && <>
      <input ref={input} type="file" accept={ACCEPT} multiple hidden onChange={e => void add(e.target.files)} aria-label={t('edit.media_add')}/>
      <button type="button" className="button extras-add" onClick={() => input.current?.click()}><ImagePlus size={15}/>{t('edit.media_add')}</button>
    </>}

    <div className="extras-head"><strong>{t('edit.buttons')}</strong>{!readonly && <small>{t('edit.buttons_hint')}</small>}</div>
    {buttons.map((b, i) => <div className="button-row" key={i}>
      <input aria-label={t('edit.button_text')} placeholder={t('edit.button_text')} maxLength={40} value={b.text} readOnly={readonly} onChange={e => onButtons(buttons.map((x, j) => j === i ? {...x, text: e.target.value} : x))}/>
      <input aria-label={t('edit.button_url')} placeholder="https://" maxLength={500} value={b.url} readOnly={readonly} inputMode="url" onChange={e => onButtons(buttons.map((x, j) => j === i ? {...x, url: e.target.value} : x))}/>
      {!readonly && <button type="button" className="icon-button" onClick={() => onButtons(buttons.filter((_, j) => j !== i))} aria-label={t('edit.button_remove', {name: b.text || String(i + 1)})}><X size={15}/></button>}
    </div>)}
    {!readonly && buttons.length < MAX_BUTTONS && <button type="button" className="button extras-add" onClick={() => onButtons([...buttons, {text: '', url: ''}])}><Link2 size={15}/><Plus size={12}/>{t('edit.button_add')}</button>}

    <div className="extras-toggles">
      <label className="extras-toggle"><input type="checkbox" checked={silent} disabled={readonly} onChange={e => onSilent(e.target.checked)}/><BellOff size={14}/>{t('edit.silent')}</label>
      <label className="extras-toggle"><input type="checkbox" checked={pin} disabled={readonly} onChange={e => onPin(e.target.checked)}/><Pin size={14}/>{t('edit.pin')}</label>
    </div>
    {(error || (problem && !readonly)) && <p className="error-text" role="alert">{error || t(problem!)}</p>}
  </div>;
}
