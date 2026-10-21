import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Channel, FeedPost } from '../shared/types.js';
import { AiError, parsePlan, readEvents } from '../src/ai/client.js';
import { clip, describe, hashtags, plan, rewrite, splitTitle, type Context } from '../src/ai/prompts.js';
import { normalizeServer } from '../src/platform.js';

const event = (content: string) => `data: ${JSON.stringify({choices: [{delta: {content}}]})}\n`;

test('server-sent events: text, the unfinished line and the end of the stream', () => {
  const first = readEvents(`${event('Hel')}${event('lo')}data: {"choi`);
  assert.deepEqual([first.text, first.done], ['Hello', false]);
  assert.equal(first.rest, 'data: {"choi');
  const second = readEvents(`${first.rest}ces":[{"delta":{"content":"!"}}]}\n\n: keep-alive\ndata: [DONE]\n${event('ignored')}`);
  assert.deepEqual([second.text, second.done, second.rest], ['!', true, '']);
});

test('server-sent events: an error in the stream ends it with the provider’s message', () => {
  const r = readEvents(`${event('Hi')}data: {"error":{"message":"quota exceeded"}}\n`);
  assert.deepEqual([r.text, r.done, r.error], ['Hi', true, 'quota exceeded']);
});

test('planner answers: JSON inside a fence or after a preface; posts without text dropped', () => {
  const answer = 'Here is your plan:\n```json\n[{"title":"Monday","category":"Tips","body":"Five tips"},{"title":"Empty","body":"  "}]\n```';
  assert.deepEqual(parsePlan(answer), [{title: 'Monday', category: 'Tips', body: 'Five tips'}]);
  assert.throws(() => parsePlan('Sorry, I cannot help.'), (e: unknown) => e instanceof AiError && e.kind === 'plan');
  assert.throws(() => parsePlan('[{"title":"x","body":""}]'), (e: unknown) => e instanceof AiError && e.kind === 'plan');
});

test('server addresses: scheme added, trailing slash and /api dropped', () => {
  assert.equal(normalizeServer(' gramalyzer.example.com/api/ '), 'https://gramalyzer.example.com');
  assert.equal(normalizeServer('192.168.1.20:8080'), 'http://192.168.1.20:8080');
  assert.equal(normalizeServer('localhost:8080/'), 'http://localhost:8080');
  assert.equal(normalizeServer('http://my.vps:8080'), 'http://my.vps:8080');
});

test('text helpers: clip at a word, hashtags, titles from answers', () => {
  assert.equal(clip('one two three four', 12), 'one two…');
  assert.equal(clip('short', 12), 'short');
  assert.deepEqual(hashtags('New #Recipe, #вкусно! and #1st #c#'), ['#recipe', '#вкусно', '#c']);
  assert.deepEqual(splitTitle('\n**Fresh pasta at home**\nStep one…'), {title: 'Fresh pasta at home', body: '**Fresh pasta at home**\nStep one…'});
});

const channel: Channel = {id: 'c1', name: 'Pasta Lab', handle: '@pastalab', initials: 'PL', color: 'purple', subscribers: 1200, growth: 0, views: 0, engagement: 0, description: 'Italian home cooking', paused: false, timezone: 'Europe/Kyiv', notifications: false, autoDelete: false, signature: ''};
const post = (id: string, text: string, reactions: number): FeedPost => ({id, messageId: null, postedAt: '2026-10-01T10:00:00Z', kind: 'TEXT', text, views: 100, reactions, reactionList: [], comments: 0, mediaUrl: null, url: null, forwardedFrom: null, edited: false, status: 'published'});
const context = (over: Partial<Context> = {}): Context => ({channel, insights: null, posts: [], feed: [], voice: '', language: 'Ukrainian', languageFromPosts: true, ...over});

test('prompts carry the channel: its posts as examples, without repeating a recurring opening', () => {
  const feed = [post('1', 'Weekly digest\nCarbonara and more', 50), post('2', 'Weekly digest\nLasagna and more', 40), post('3', 'How to roll gnocchi by hand, step by step', 10)];
  const text = describe(context({feed}));
  assert.match(text, /Channel: Pasta Lab @pastalab/);
  assert.match(text, /About: Italian home cooking/);
  assert.match(text, /Carbonara/);
  assert.doesNotMatch(text, /Lasagna/);
  assert.match(text, /gnocchi/);
});

test('prompts name the language: the posts’ own when none was chosen, else the chosen one', () => {
  const fromPosts = plan(context({feed: [post('1', 'Готуємо пасту вдома, крок за кроком', 5)]}), 3, '')[0].content;
  assert.match(fromPosts, /language the channel's posts are written in/);
  const chosen = plan(context({languageFromPosts: false, language: 'Spanish'}), 3, '')[0].content;
  assert.match(chosen, /Write in Spanish/);
  const empty = plan(context(), 3, '')[0].content;
  assert.match(empty, /Write in Ukrainian/);
});

test('rewrites send the post, drafts send the brief', () => {
  const [, draft] = rewrite(context(), 'draft', {title: '', body: 'ignored', brief: 'autumn soups', tone: 'friendly', target: 'English'});
  assert.match(draft.content, /Brief: autumn soups/);
  assert.doesNotMatch(draft.content, /ignored/);
  const [, shorten] = rewrite(context(), 'shorten', {title: 'Soup', body: 'A long post', brief: '', tone: 'friendly', target: 'English'});
  assert.match(shorten.content, /Title: Soup\n\nPost:\nA long post/);
});
