import { useSyncExternalStore } from 'react';
import { provider } from './providers';

/**
 * The AI setup, kept on this device only (the app's private storage, or this browser's): which provider, the key,
 * the model, and how the channel should sound. contentLang is a language code, or '' for the channel's own language.
 */
export type AiSettings = {provider: string; baseUrl: string; apiKey: string; model: string; voice: string; contentLang: string};

const STORAGE = 'gramalyzer.ai';
const DEFAULTS: AiSettings = {provider: 'groq', baseUrl: provider('groq').baseUrl, apiKey: '', model: provider('groq').model, voice: '', contentLang: ''};

function read(): AiSettings {
  try {return {...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE) ?? '{}')};} catch {return DEFAULTS;}
}
let current = typeof localStorage === 'undefined' ? DEFAULTS : read();
const listeners = new Set<() => void>();

export function aiSettings(): AiSettings {return current;}
export function saveAiSettings(next: AiSettings) {
  current = next;
  try {localStorage.setItem(STORAGE, JSON.stringify(next));} catch {/* kept for this visit */}
  listeners.forEach(l => l());
}
export function useAiSettings(): AiSettings {
  return useSyncExternalStore(l => {listeners.add(l); return () => listeners.delete(l);}, () => current);
}

/** Enough to send a request: an address, a model, and a key where the provider needs one. */
export const aiReady = (s: AiSettings) => !!s.baseUrl.trim() && !!s.model.trim() && (!!s.apiKey.trim() || !provider(s.provider).needsKey);
