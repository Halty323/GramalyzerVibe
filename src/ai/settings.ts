import { useSyncExternalStore } from 'react';
import { provider } from './providers';

/**
 * The AI setup, kept on this device only (the app's private storage, or this browser's): which provider, the key,
 * the model, and how the channel should sound. contentLang is a language code, or '' for the channel's own language.
 * visionModel looks at the channel's pictures; '' skips that.
 */
export type AiSettings = {provider: string; baseUrl: string; apiKey: string; model: string; visionModel: string; voice: string; contentLang: string};

const STORAGE = 'gramalyzer.ai';
const DEFAULTS: AiSettings = {provider: 'groq', baseUrl: provider('groq').baseUrl, apiKey: '', model: provider('groq').model, visionModel: provider('groq').vision, voice: '', contentLang: ''};

function read(): AiSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) ?? '{}') as Partial<AiSettings>;
    // Saved before there was a model for pictures: take the one the saved provider offers.
    return {...DEFAULTS, visionModel: provider(saved.provider ?? DEFAULTS.provider).vision, ...saved};
  } catch {return DEFAULTS;}
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
