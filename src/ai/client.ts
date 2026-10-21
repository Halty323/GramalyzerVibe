import { httpFetch } from '../platform';
import type { AiSettings } from './settings';

export type ChatMessage = {role: 'system' | 'user' | 'assistant'; content: string};

/**
 * Why a request to the AI provider failed. kind picks the translated explanation; detail is what the provider said,
 * in its own words.
 */
export class AiError extends Error {
  constructor(readonly kind: 'key' | 'rate' | 'network' | 'status' | 'empty' | 'plan', readonly detail = '', readonly status = 0) {super(detail || kind);}
}

const base = (s: AiSettings) => s.baseUrl.trim().replace(/\/+$/, '');
function headers(s: AiSettings): Record<string, string> {
  const h: Record<string, string> = {'Content-Type': 'application/json'};
  if (s.apiKey.trim()) h.Authorization = `Bearer ${s.apiKey.trim()}`;
  // OpenRouter lists apps that send these; harmless elsewhere, so only sent there.
  if (s.provider === 'openrouter') {h['HTTP-Referer'] = 'https://github.com/Halty323/GramalyzerVibe'; h['X-Title'] = 'Gramalyzer';}
  return h;
}

/** What a provider said when it refused: its own error message when it sent one. */
async function failure(res: Response): Promise<AiError> {
  const text = await res.text().catch(() => '');
  let message = text.slice(0, 300);
  try {
    const v = JSON.parse(text);
    const e = Array.isArray(v) ? v[0]?.error : v.error;
    message = typeof e === 'string' ? e : e?.message ?? message;
  } catch {/* not JSON: keep the text */}
  const kind = res.status === 401 || res.status === 403 ? 'key' : res.status === 429 ? 'rate' : 'status';
  return new AiError(kind, message, res.status);
}

async function send(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {res = await httpFetch(url, init);}
  catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new AiError('network', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) throw await failure(res);
  return res;
}

/**
 * Splits buffered server-sent events into the pieces of text they carry. Returns the text, whether the stream said
 * it is done, and the unfinished last line to keep for the next chunk.
 */
export function readEvents(buffer: string): {text: string; done: boolean; rest: string; error?: string} {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  let text = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') return {text, done: true, rest: ''};
    let v: {error?: {message?: string}; choices?: {delta?: {content?: string | null}}[]};
    try {v = JSON.parse(data);} catch {continue;}
    if (v.error?.message) return {text, done: true, rest: '', error: v.error.message};
    text += v.choices?.[0]?.delta?.content ?? '';
  }
  return {text, done: false, rest};
}

/** Streams a chat completion, calling onText with each new piece; resolves with the whole answer. */
export async function streamChat(s: AiSettings, messages: ChatMessage[], temperature: number, onText: (piece: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await send(`${base(s)}/chat/completions`, {method: 'POST', headers: headers(s), signal, body: JSON.stringify({model: s.model.trim(), messages, stream: true, temperature})});
  if (!res.body) throw new AiError('empty');
  const reader = res.body.getReader();
  // The decoder keeps a character that a chunk cut in half (Cyrillic, Arabic, emoji) until the rest arrives.
  const decoder = new TextDecoder();
  let buffer = '', all = '';
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {chunk = await reader.read();}
    catch (e) {
      if ((e as Error)?.name === 'AbortError' || signal?.aborted) throw e;
      throw new AiError('network', e instanceof Error ? e.message : String(e));
    }
    buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, {stream: true});
    const {text, done, rest, error} = readEvents(chunk.done ? `${buffer}\n` : buffer);
    buffer = rest;
    if (text) {all += text; onText(text);}
    if (error) throw new AiError('status', error);
    if (done || chunk.done) {void reader.cancel().catch(() => undefined); break;}
  }
  if (!all.trim()) throw new AiError('empty');
  return all;
}

/** The whole answer at once, for actions that parse it (the planner). */
export const complete = (s: AiSettings, messages: ChatMessage[], temperature: number, signal?: AbortSignal) => streamChat(s, messages, temperature, () => undefined, signal);

/** The model ids the endpoint offers (GET /models), to pick from in settings. */
export async function listModels(s: AiSettings): Promise<string[]> {
  const res = await send(`${base(s)}/models`, {headers: headers(s)});
  const v = await res.json() as {data?: {id?: string}[]} | {id?: string}[];
  const list = Array.isArray(v) ? v : v.data ?? [];
  return [...new Set(list.map(m => m.id?.replace(/^models\//, '')).filter((id): id is string => !!id))].sort();
}

/** One post the planner suggests. */
export type PlannedPost = {title: string; body: string; category: string};
/** The JSON list in a planner answer, even inside a ```json fence or after a preface; posts without text are dropped. */
export function parsePlan(answer: string): PlannedPost[] {
  const start = answer.indexOf('['), end = answer.lastIndexOf(']');
  if (start < 0 || end <= start) throw new AiError('plan');
  let raw: unknown;
  try {raw = JSON.parse(answer.slice(start, end + 1));} catch (e) {throw new AiError('plan', e instanceof Error ? e.message : '');}
  if (!Array.isArray(raw)) throw new AiError('plan');
  const posts = raw.map(p => ({title: String(p?.title ?? ''), body: String(p?.body ?? ''), category: String(p?.category ?? '')})).filter(p => p.body.trim());
  if (!posts.length) throw new AiError('plan');
  return posts;
}
