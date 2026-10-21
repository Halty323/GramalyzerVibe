/**
 * OpenAI-compatible providers with a free tier that works here (checked October 2026; free tiers change often).
 * The same list as Gramalyzer Studio on the desktop. Requests go straight from the device to the provider.
 */
export type Provider = {id: string; name: string; baseUrl: string; model: string; keyUrl: string; needsKey: boolean};

export const PROVIDERS: Provider[] = [
  {id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', keyUrl: 'https://console.groq.com/keys', needsKey: true},
  {id: 'gemini', name: 'Google AI Studio (Gemini)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-flash-latest', keyUrl: 'https://aistudio.google.com/apikey', needsKey: true},
  {id: 'openrouter', name: 'OpenRouter (free models)', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys', needsKey: true},
  {id: 'cerebras', name: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', model: 'gpt-oss-120b', keyUrl: 'https://cloud.cerebras.ai/', needsKey: true},
  {id: 'mistral', name: 'Mistral (Experiment plan)', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', keyUrl: 'https://console.mistral.ai/api-keys', needsKey: true},
  {id: 'github', name: 'GitHub Models', baseUrl: 'https://models.github.ai/inference', model: 'openai/gpt-4.1-mini', keyUrl: 'https://github.com/settings/personal-access-tokens', needsKey: true},
  {id: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', keyUrl: 'https://ollama.com/download', needsKey: false},
  {id: 'custom', name: 'Other OpenAI-compatible', baseUrl: '', model: '', keyUrl: '', needsKey: true},
];

export const provider = (id: string) => PROVIDERS.find(p => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1];
