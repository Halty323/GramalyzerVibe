import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Channel, DraftFactor, FeedPost, SearchCheck, TrackedSummary } from '../shared/types.js';
import { AiError, parsePlan, readEvents } from '../src/ai/client.js';
import { picturesOf } from '../src/ai/look.js';
import { assistant, clip, compare, describe, fixable, fixDraft, hashtags, plan, rewrite, searchFix, splitPicture, splitTitle, type Context } from '../src/ai/prompts.js';
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

test('planner answers: JSON inside a fence or after a preface; empty posts dropped, picture-only ones kept', () => {
  const answer = 'Here is your plan:\n```json\n[{"title":"Monday","category":"Tips","body":"Five tips"},{"title":"Empty","body":"  "},{"title":"Cat","picture":"a cat in a box","body":""}]\n```';
  assert.deepEqual(parsePlan(answer), [{title: 'Monday', category: 'Tips', body: 'Five tips', picture: ''}, {title: 'Cat', category: '', body: '', picture: 'a cat in a box'}]);
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

const picture = (id: string, text: string, reactions: number, kind = 'PHOTO'): FeedPost => ({...post(id, text, reactions), kind, mediaUrl: `https://cdn.example/${id}.jpg`});
const memes = [picture('m1', '', 900), picture('m2', 'когда пятница', 700), picture('m3', '', 300), picture('m4', 'мем дня', 200, 'ALBUM'), post('t1', 'Канал о мемах про котов, без политики', 50), picture('m5', '', 100, 'VIDEO')];

test('picture posts reach the prompt: format, caption or its absence, and the channel’s mix', () => {
  const text = describe(context({feed: memes}));
  assert.match(text, /\[1\] photo, 900 reactions\n\(no caption\)/);
  assert.match(text, /photo, 700 reactions\nкогда пятница/);
  assert.match(text, /Formats of the last 6 posts: photo 50%, album 17%, text 17%, video 17%\./);
  assert.match(text, /Of the picture posts, 60% have no caption; captions are typically about 13 characters\./);
});

test('picture channels: short captions, and the picture to attach, in drafts, plans and chat', () => {
  const ctx = context({feed: memes, look: '- cats in boxes, reaction memes\n- Russian text on the images'});
  const [system, draft] = rewrite(ctx, 'draft', {title: '', body: '', brief: 'monday', tone: 'friendly', target: 'English'});
  assert.match(system.content, /Most of this channel's posts are pictures/);
  assert.match(system.content, /What the channel's pictures show \(from looking at recent ones\):\n- cats in boxes/);
  assert.match(draft.content, /last line starting with "🖼 "/);
  assert.match(plan(ctx, 3, '')[1].content, /"picture": "what the picture should show"/);
  assert.match(assistant(ctx, [], [])[0].content, /say what picture goes with it/);
  // a text channel gets none of that
  const words = context({feed: [post('1', 'A long article about pasta and sauces', 5), post('2', 'Another long read about risotto', 4), post('3', 'Gnocchi by hand, step by step', 3)]});
  assert.doesNotMatch(rewrite(words, 'draft', {title: '', body: '', brief: 'x', tone: 'friendly', target: 'English'})[0].content, /Most of this channel's posts are pictures/);
});

test('picture ideas come out of a draft and become its title', () => {
  assert.deepEqual(splitPicture('Пятница, котики!\n🖼 кот в коробке с пивом'), {text: 'Пятница, котики!', picture: 'кот в коробке с пивом'});
  assert.deepEqual(splitTitle('Пятница, котики!\n🖼: кот в коробке'), {title: '🖼 кот в коробке', body: 'Пятница, котики!'});
  assert.deepEqual(splitPicture('Just text'), {text: 'Just text', picture: ''});
  // models often write the emoji with its variation selector
  assert.deepEqual(splitPicture('Котики\n🖼\uFE0F кот'), {text: 'Котики', picture: 'кот'});
});

test('the pictures the model looks at: the two most engaging, then the newest, never forwards', () => {
  const feed = [...memes, {...picture('f1', '', 5000), forwardedFrom: 'Other channel'}];
  assert.deepEqual(picturesOf(feed).map(p => p.id), ['m1', 'm2', 'm3', 'm4']);
});

test('advice stays within what the data shows: no hashtag fixes, reach named as reach, search facts as facts', () => {
  const ctx = context({feed: [post('1', 'A long article about pasta and sauces', 5)]});
  const f = (dimension: DraftFactor['dimension'], weak: boolean, bestKey: string | null): DraftFactor => ({dimension, key: 'x', lift: 0.8, low: 0.6, high: 1.1, bestKey, bestLift: 1.3, weak, counted: dimension !== 'TOPIC'});
  const factors = [f('LENGTH', true, 'SHORT'), f('TOPIC', true, '#pasta'), f('FORMAT', true, 'VIDEO')];
  assert.deepEqual(fixable(factors).map(x => x.dimension), ['LENGTH']);
  const fix = fixDraft(ctx, 'Draft', factors)[1].content;
  assert.match(fix, /up to 120 characters/);
  assert.doesNotMatch(fix, /hashtag/i);

  const tracked = [{title: 'Rival', username: 'rival', subscribers: 1000, change7: 5, avgViews: 300, err: 30, postsPerDay: 2} as TrackedSummary];
  const c = compare(ctx, tracked)[1].content;
  assert.match(c, /reach \(views ÷ subscribers\) 30\.0%/);
  assert.doesNotMatch(c, /\bER\b/);

  const check = {title: 'Pasta', username: 'pasta', description: '', score: 50, find: 40, join: 10, keywords: [], notes: [], positions: [],
    checks: [{id: 'description_present', group: 'join', status: 'BAD', points: 0, max: 12, words: []}]} as unknown as SearchCheck;
  const [system, user] = searchFix(ctx, check);
  assert.match(system.content, /genuine subscribers/);
  assert.match(system.content, /Whether search reads the description is not known/);
  assert.match(user.content, /convincing: description_present/);
  assert.match(rewrite(ctx, 'hashtags', {title: '', body: 'x', brief: '', tone: '', target: ''})[1].content, /don't bring new readers/);
});
