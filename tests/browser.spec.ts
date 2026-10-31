import { test, expect } from '@playwright/test';

test('a draft survives refresh, can be scheduled, and can be removed', async ({page}) => {
  await page.goto('/'); await expect(page.getByRole('heading', {name: 'Your channels, in focus.'})).toBeVisible();
  await page.getByRole('button', {name: 'New post', exact: true}).click();
  await page.getByLabel('Post title').fill('Browser test: community update');
  await page.getByLabel('Message', {exact: true}).fill('A saved message from the browser workflow.');
  await page.getByRole('button', {name: 'Save draft', exact: true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await page.locator('nav').getByRole('button', {name: /Schedule/}).click();
  await page.getByRole('button', {name: /Drafts/}).click();
  await page.getByRole('button', {name: 'Browser test: community update', exact: true}).click();
  await page.getByLabel('Save as').selectOption('scheduled');
  await page.getByRole('button', {name: 'Schedule post', exact: true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', {name: /Scheduled/}).click();
  await expect(page.getByRole('button', {name: 'Browser test: community update', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Remove Browser test: community update'}).click();
  await page.getByRole('button', {name: 'Yes', exact: true}).click();
  await expect(page.getByRole('button', {name: 'Browser test: community update', exact: true})).not.toBeVisible();
});
test('channel configuration persists and can be restored', async ({page}) => {
  await page.goto('/');
  await page.locator('nav').getByRole('button', {name: 'Bot settings'}).click();
  const signature = page.getByLabel('Post signature');
  const old = await signature.inputValue(); await signature.fill('Browser verified signature');
  await page.getByRole('switch', {name: 'Pause posting queue'}).click();
  await page.getByRole('button', {name: 'Save changes'}).click();
  await expect(page.getByRole('status')).toContainText('Channel settings saved');
  await page.reload(); await page.locator('nav').getByRole('button', {name: 'Bot settings'}).click();
  await expect(page.getByLabel('Post signature')).toHaveValue('Browser verified signature');
  await signature.fill(old); await page.getByRole('switch', {name: 'Pause posting queue'}).click();
  await page.getByRole('button', {name: 'Save changes'}).click();
  await expect(page.getByRole('button', {name: 'Save changes'})).toBeDisabled();
});
test('channel filtering, search, export, and keyboard dialog controls work', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.getByLabel('Filter channel').selectOption('tech');
  await expect(page.locator('.stat-value').first()).toHaveText('18,460');
  await page.getByRole('textbox', {name: 'Search posts'}).fill('does-not-exist');
  await expect(page.getByRole('heading', {name: 'A little room for your next idea.'})).toBeVisible();
  await page.getByRole('textbox', {name: 'Search posts'}).fill('');
  const download = page.waitForEvent('download'); await page.getByRole('button', {name: 'Export report'}).click();
  expect((await download).suggestedFilename()).toBe('gramalyzer-post-report.csv');
  await page.getByRole('button', {name: 'New post', exact: true}).click(); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible(); expect(errors).toEqual([]);
});
test('mobile navigation and pages fit the viewport', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844}); await page.goto('/');
  await expect(page.getByRole('heading', {name: 'Your channels, in focus.'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', {name: 'Open navigation'}).click();
  await page.locator('nav').getByRole('button', {name: 'Channels'}).click();
  await expect(page.getByRole('heading', {name: 'One home for every channel.'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('the viewer reads own and public channels like a Telegram chat', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width: 1440, height: 900}); await page.goto('/');
  await page.locator('nav').getByRole('button', {name: 'Channel viewer'}).click();
  await expect(page.getByText('Pick a channel, or type any public @username to peek inside.')).toBeVisible();
  await page.locator('.tg-chat', {hasText: 'Design Dispatch'}).click();
  await expect(page.locator('.tg-head')).toContainText('Design Dispatch');
  await expect(page.locator('.tg-bubble:not(.skeleton)').first()).toBeVisible();
  await page.locator('.tg-chat', {hasText: 'Pixel Pulse'}).click();
  await expect(page.locator('.tg-head')).toContainText('48,210 subscribers');
  const info = page.getByRole('complementary', {name: 'Channel info'});
  await expect(info).toContainText('t.me/pixelpulse_demo'); await expect(info).toContainText('Average views');
  await page.getByRole('button', {name: 'Search in this channel'}).click();
  await page.getByRole('textbox', {name: 'Search in this channel'}).fill('speedrunner');
  await expect(page.locator('.tg-find')).toContainText(/\d+ match/);
  await page.getByRole('textbox', {name: 'Search or type @username'}).fill('t.me/durov');
  await expect(page.getByRole('button', {name: /Look up @durov/})).toBeVisible();
  expect(errors).toEqual([]);
});
test('public channels can be removed from and added back to the watchlist', async ({page}) => {
  await page.goto('/'); await page.locator('nav').getByRole('button', {name: 'Watchlist'}).click();
  const row = page.getByRole('row', {name: /Wander Notes/});
  await expect(row).toBeVisible();
  await row.getByRole('button', {name: 'Stop tracking Wander Notes'}).click();
  await row.getByRole('button', {name: 'Yes', exact: true}).click();
  await expect(row).not.toBeVisible();
  const input = page.getByRole('textbox', {name: 'Channel username or link'});
  await input.fill('t.me/+privateInvite'); await page.getByRole('button', {name: 'Track', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('private invite link');
  await input.fill('https://t.me/wandernotes_demo'); await page.getByRole('button', {name: 'Track', exact: true}).click();
  await expect(page.getByRole('status')).toContainText('Now tracking Wander Notes.');
  await expect(row).toBeVisible(); await expect(input).toHaveValue('');
});
test('the theme and language choices apply at once and survive a reload', async ({page}) => {
  await page.goto('/'); const html = page.locator('html');
  await page.getByRole('button', {name: 'Switch to the dark theme'}).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', {name: 'Language'}).click();
  await page.getByRole('menuitemradio', {name: /Русский/}).click();
  await expect(page.getByRole('heading', {name: 'Ваши каналы в фокусе.'})).toBeVisible();
  await expect(html).toHaveAttribute('lang', 'ru');
  await page.reload();
  await expect(page.getByRole('heading', {name: 'Ваши каналы в фокусе.'})).toBeVisible();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', {name: 'Язык'}).click(); await page.getByRole('menuitemradio', {name: /العربية/}).click();
  await expect(html).toHaveAttribute('dir', 'rtl');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', {name: 'اللغة'}).click(); await page.getByRole('menuitemradio', {name: /English/}).click();
  await page.getByRole('button', {name: 'Switch to the light theme'}).click();
  await expect(html).toHaveAttribute('data-theme', 'light'); await expect(html).toHaveAttribute('dir', 'ltr');
});
test('own channels show their Telegram photo, and initials when they have none', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  let first = '', name = '';
  // demo channels were never seen by a bot, so pretend they were and serve a photo for the first one only
  await page.route('**/api/workspace', async route => {
    const response = await route.fetch(); const workspace = await response.json();
    workspace.channels = workspace.channels.map((c: {id: string; name: string}, i: number) => ({...c, telegramChatId: -1001000 - i}));
    ({id: first, name} = workspace.channels[0]); await route.fulfill({response, json: workspace});
  });
  await page.route('**/api/channels/*/photo', route => route.request().url().includes(`/channels/${first}/photo`) ? route.fulfill({contentType: 'image/png', body: pixel}) : route.fulfill({status: 404}));
  await page.setViewportSize({width: 1440, height: 900}); await page.goto('/');
  const sidebar = page.locator('.sidebar-channels').first().locator('.channel-avatar');
  await expect(sidebar.first().locator('img')).toHaveJSProperty('naturalWidth', 1);
  await expect(sidebar.nth(1).locator('img')).toHaveCount(0); await expect(sidebar.nth(1)).not.toBeEmpty();
  await page.locator('nav').getByRole('button', {name: 'Channel viewer'}).click();
  const row = page.locator('.tg-chat', {hasText: name});
  await expect(row.locator('.tg-avatar img')).toHaveJSProperty('naturalWidth', 1); await row.click();
  await expect(page.locator('.tg-head .tg-avatar img')).toHaveJSProperty('naturalWidth', 1);
  expect(errors).toEqual([]);
});
test('the AI copilot drafts a post for the channel, and asks for a provider until one is set', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button', {name: 'New post', exact: true}).click();
  await expect(page.getByRole('dialog').getByRole('button', {name: 'Connect AI'})).toBeVisible();
  // a stand-in provider: the answer comes back as server-sent events, split mid-word
  let prompt = '';
  const sse = ['Осінь ', 'у міс', 'ті 🍂', '\n\nНовий допис.'].map(content => `data: ${JSON.stringify({choices: [{delta: {content}}]})}\n\n`).join('') + 'data: [DONE]\n\n';
  await page.route('https://ai.example.test/v1/chat/completions', async route => {
    prompt = route.request().postData() ?? '';
    await route.fulfill({contentType: 'text/event-stream', headers: {'Access-Control-Allow-Origin': '*'}, body: sse});
  });
  await page.evaluate(() => localStorage.setItem('gramalyzer.ai', JSON.stringify({provider: 'custom', baseUrl: 'https://ai.example.test/v1', apiKey: 'test-key', model: 'test-model', voice: 'Warm and brief', contentLang: ''})));
  await page.reload();
  await page.getByRole('button', {name: 'New post', exact: true}).click();
  const dialog = page.getByRole('dialog');
  const channel = await dialog.getByLabel('Channel').locator('option:checked').textContent();
  await dialog.getByLabel('Brief', {exact: true}).fill('autumn in the city');
  await dialog.getByRole('button', {name: 'Draft with AI'}).click();
  await expect(dialog.locator('.ai-text')).toHaveText('Осінь у місті 🍂\n\nНовий допис.');
  await dialog.getByRole('button', {name: 'Replace text'}).click();
  await expect(dialog.getByLabel('Message', {exact: true})).toHaveValue('Осінь у місті 🍂\n\nНовий допис.');
  const sent = JSON.parse(prompt) as {model: string; stream: boolean; messages: {role: string; content: string}[]};
  expect(sent.model).toBe('test-model'); expect(sent.stream).toBe(true);
  expect(sent.messages[0].content).toContain(`Channel: ${channel}`);
  expect(sent.messages[0].content).toContain('Brand voice to follow: Warm and brief');
  expect(sent.messages[1].content).toContain('Brief: autumn in the city');
  await page.evaluate(() => localStorage.removeItem('gramalyzer.ai'));
});
test('for a channel of pictures, the AI looks at them first and drafts a caption with the picture to attach', async ({page}) => {
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const post = (id: number, kind: string, text: string, reactions: number) => ({id: `p${id}`, messageId: id, postedAt: new Date(Date.now() - id * 3600_000).toISOString(), kind, text, views: 1000, reactions, reactionList: [], comments: null, mediaUrl: kind === 'TEXT' ? null : `https://cdn.example.test/${id}.jpg`, url: null, forwardedFrom: null, edited: false, status: 'published'});
  const posts = [post(1, 'PHOTO', '', 900), post(2, 'PHOTO', 'коли п’ятниця', 700), post(3, 'PHOTO', '', 300), post(4, 'ALBUM', 'мем дня', 200), post(5, 'VIDEO', '', 100), post(6, 'TEXT', 'Канал мемів про котів', 50)];
  await page.route(/\/api\/channels\/[^/]+\/feed/, route => route.fulfill({json: {channelId: 'x', source: 'preview', posts, scheduled: [], stats: null}}));
  await page.route('https://cdn.example.test/**', route => route.fulfill({contentType: 'image/png', headers: {'Access-Control-Allow-Origin': '*'}, body: pixel}));
  const asked: {model: string; messages: {role: string; content: unknown}[]}[] = [];
  const sse = (text: string) => `data: ${JSON.stringify({choices: [{delta: {content: text}}]})}\n\ndata: [DONE]\n\n`;
  await page.route('https://ai.example.test/v1/chat/completions', async route => {
    const body = JSON.parse(route.request().postData() ?? '{}'); asked.push(body);
    const sees = JSON.stringify(body.messages).includes('image_url');
    await route.fulfill({contentType: 'text/event-stream', headers: {'Access-Control-Allow-Origin': '*'}, body: sse(sees ? '- cats in cardboard boxes\n- Ukrainian captions on the images' : 'П’ятниця, котики!\n🖼 кіт у коробці')});
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gramalyzer.ai', JSON.stringify({provider: 'custom', baseUrl: 'https://ai.example.test/v1', apiKey: 'k', model: 'text-model', visionModel: 'vision-model', voice: '', contentLang: ''})));
  await page.reload();
  await page.getByRole('button', {name: 'New post', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.ai-knows summary')).toHaveText('Read 6 posts · 5 with pictures · pictures described');
  await dialog.locator('.ai-knows summary').click();
  await expect(dialog.locator('.ai-knows-body')).toContainText('cats in cardboard boxes');
  await dialog.getByLabel('Brief', {exact: true}).fill('friday');
  await dialog.getByRole('button', {name: 'Draft with AI'}).click();
  await dialog.getByRole('button', {name: 'Replace text'}).click();
  await expect(dialog.getByLabel('Message', {exact: true})).toHaveValue('П’ятниця, котики!');
  await expect(dialog.getByLabel('Post title')).toHaveValue('🖼 кіт у коробці');
  const [look, draft] = asked;
  expect(look.model).toBe('vision-model');
  const parts = look.messages[0].content as {type: string; image_url?: {url: string}}[];
  expect(parts.filter(p => p.type === 'image_url').map(p => p.image_url!.url.slice(0, 23))).toEqual(Array(4).fill('data:image/jpeg;base64,'));
  expect(draft.model).toBe('text-model');
  expect(draft.messages[0].content).toContain('- cats in cardboard boxes');
  expect(draft.messages[0].content).toContain('[1] photo, 900 reactions\n(no caption)');
  expect(asked).toHaveLength(2);
});
test('albums show every picture in Telegram’s layout, and pictures open full size', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const cdn = (name: string) => `https://cdn.example.test/${name}.png`;
  const post = (id: number, kind: string, text: string, media: unknown[]) => ({id: `p${id}`, messageId: id, postedAt: new Date(Date.now() - (10 - id) * 3600_000).toISOString(), kind, text, views: 11, reactions: 0, reactionList: [], comments: null, mediaUrl: media.length ? (media[0] as {url: string}).url : null, media, url: `https://t.me/dispatch/${id}`, forwardedFrom: null, edited: false, status: 'published'});
  const posts = [
    post(1, 'ALBUM', 'Я так більше не можу', [
      {url: cdn('cat'), video: false, x: 0, y: 0, w: 1, h: 0.6667},
      {url: cdn('sponge'), video: false, x: 0, y: 0.6711, w: 0.4967, h: 0.4437},
      {url: cdn('kitten'), video: true, x: 0.5011, y: 0.6711, w: 0.4989, h: 0.4437}]),
    post(4, 'PHOTO', 'Just one', [{url: cdn('one'), video: false, x: 0, y: 0, w: 1, h: 0.75}]),
    post(5, 'ALBUM', '', [{url: cdn('a'), video: false, x: null, y: null, w: null, h: null}, {url: cdn('b'), video: false, x: null, y: null, w: null, h: null}]),
  ];
  await page.route(/\/api\/channels\/[^/]+\/feed/, route => route.fulfill({json: {channelId: 'x', source: 'preview', posts, scheduled: [], stats: null}}));
  await page.route('https://cdn.example.test/**', route => route.fulfill({contentType: 'image/png', body: pixel}));
  await page.setViewportSize({width: 1440, height: 900}); await page.goto('/');
  await page.locator('nav').getByRole('button', {name: 'Channel viewer'}).click();
  await page.locator('.tg-chat', {hasText: 'Design Dispatch'}).click();

  const album = page.locator('.tg-msg', {hasText: 'Я так більше не можу'}).locator('.tg-pics');
  await expect(album).toHaveClass(/placed/);
  const tiles = album.locator('.tg-pic');
  await expect(tiles).toHaveCount(3);
  await page.waitForTimeout(800); // messages slide in
  const [box, top, left, right] = (await Promise.all([album, tiles.nth(0), tiles.nth(1), tiles.nth(2)].map(l => l.boundingBox()))).map(b => b!);
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(2);
  near(top.width, box.width);                                       // the first across the top
  near(left.y, right.y);                                            // the other two side by side below it
  expect(left.y).toBeGreaterThan(top.y + top.height - 1);
  expect(right.x).toBeGreaterThan(left.x + left.width - 1);
  expect(box.height / box.width).toBeCloseTo(1.115, 1);             // the album keeps Telegram's shape
  // no caption: the time sits on the pictures, as in Telegram
  await expect(page.locator('.tg-bubble.bare .tg-meta')).toHaveCSS('position', 'absolute');
  await expect(tiles.nth(2).locator('.tg-play')).toBeVisible();     // a video
  await expect(page.locator('.tg-msg', {hasText: 'Just one'}).locator('.tg-pic')).toHaveCount(1);
  await expect(page.locator('.tg-pics.n-2 .tg-pic')).toHaveCount(2); // no layout from Telegram: two side by side

  await tiles.nth(1).click();
  const viewer = page.getByRole('dialog', {name: 'Photos and videos'});
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('.lightbox-count')).toHaveText('2 of 3');
  await expect(viewer.locator('.lightbox-stage img')).toHaveAttribute('src', cdn('sponge'));
  await expect(viewer.locator('.lightbox-caption')).toHaveText('Я так більше не можу');
  await page.keyboard.press('ArrowRight');
  await expect(viewer.locator('.lightbox-count')).toHaveText('3 of 3');
  await expect(viewer.getByRole('link', {name: 'Play in Telegram'})).toHaveAttribute('href', 'https://t.me/dispatch/1');
  await page.keyboard.press('ArrowRight');
  await expect(viewer.locator('.lightbox-count')).toHaveText('1 of 3');
  await viewer.getByRole('button', {name: 'Previous'}).click();
  await expect(viewer.locator('.lightbox-stage img')).toHaveAttribute('src', cdn('kitten'));
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(tiles.nth(1)).toBeFocused();                         // back where the reader was

  await page.locator('.tg-msg', {hasText: 'Just one'}).locator('.tg-pic').click();
  await expect(viewer.locator('.lightbox-stage img')).toHaveAttribute('src', cdn('one'));
  await expect(viewer.getByRole('button', {name: 'Next'})).toHaveCount(0);
  await viewer.locator('.lightbox-stage').click({position: {x: 5, y: 5}}); // beside the picture
  await expect(viewer).toBeHidden();

  // on a phone: swipe through the album
  await page.setViewportSize({width: 390, height: 844});
  await page.getByRole('button', {name: 'Close channel info'}).click();
  await tiles.nth(0).click();
  await expect(viewer.locator('.lightbox-count')).toHaveText('1 of 3');
  const stage = (await viewer.locator('.lightbox-stage').boundingBox())!;
  await page.mouse.move(stage.x + stage.width * 0.8, stage.y + stage.height / 2); await page.mouse.down();
  await page.mouse.move(stage.x + stage.width * 0.2, stage.y + stage.height / 2); await page.mouse.up();
  await expect(viewer.locator('.lightbox-count')).toHaveText('2 of 3');
  await expect(viewer).toBeVisible();
  expect(errors).toEqual([]);
});
test('insights show who joined and left after which post, and promo links can be made and revoked', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width: 1440, height: 900}); await page.goto('/');
  await page.getByLabel('Filter channel').selectOption('makers');
  await page.locator('nav').getByRole('button', {name: 'Insights'}).click();
  const growth = page.getByRole('region', {name: 'Who joins and who leaves'});
  await expect(growth.getByText('Posts that brought people')).toBeVisible();
  await expect(growth.locator('.growth-day').first()).toBeVisible();
  await growth.getByRole('button', {name: 'Show table'}).click();
  await expect(growth.getByRole('columnheader', {name: 'Day'})).toBeVisible();
  await growth.getByRole('button', {name: '7d'}).click();
  await expect(growth.getByRole('button', {name: '7d'})).toHaveAttribute('aria-pressed', 'true');

  const promos = page.getByRole('region', {name: 'Know which promo brought subscribers'});
  await expect(promos.getByText('Shoutout in a partner channel')).toBeVisible();
  const name = `Browser test ${Date.now() % 100000}`; // the demo database outlives a run, so each run makes its own link
  await promos.getByLabel('Promo name').fill(name);
  await promos.getByLabel('What you paid (optional)').fill('12');
  await promos.getByRole('button', {name: 'Make a link'}).click();
  const row = promos.getByRole('row', {name: new RegExp(name)});
  await expect(row).toContainText('t.me/+demo');
  page.once('dialog', dialog => dialog.accept());
  await row.getByRole('button', {name: `Revoke the link for ${name}`}).click();
  await expect(row).toContainText('revoked');
  expect(errors).toEqual([]);
});
test('insights show how fast posts get views and flag the one that lags', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width: 1440, height: 900}); await page.goto('/');
  await page.getByLabel('Filter channel').selectOption('makers');
  await page.locator('nav').getByRole('button', {name: 'Insights'}).click();
  const speed = page.getByRole('region', {name: 'How fast your posts get views'});
  await expect(speed.getByText('Usually after 1 hour')).toBeVisible();
  await expect(speed.locator('.speed-row').first()).toBeVisible();
  // the newest sample post past its first hour lags (a newer one may still be under an hour old)
  await expect(speed.locator('.speed-status', {hasText: 'Behind'})).toHaveCount(1);
  await page.setViewportSize({width: 390, height: 844});
  await expect(speed.locator('.speed-row').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('insights compare the channel with the watchlist and check how findable it is in search', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width: 1440, height: 900}); await page.goto('/');
  await page.getByLabel('Filter channel').selectOption('makers');
  await page.locator('nav').getByRole('button', {name: 'Insights'}).click();
  const gaps = page.getByRole('region', {name: 'Where competitors win'});
  await expect(gaps.getByText('Compared with')).toBeVisible();
  await expect(gaps.locator('.gap-rival')).toHaveCount(3);
  await expect(gaps.getByText('Where they win')).toBeVisible();
  await expect(gaps.locator('.gap-row').first()).toBeVisible();
  await gaps.getByRole('button', {name: 'Explain with AI'}).click();
  await expect(page.getByRole('dialog', {name: 'Competitor gaps, explained'})).toBeVisible();
  await page.getByRole('button', {name: 'Close dialog'}).click();

  const search = page.getByRole('region', {name: 'How easy you are to find'});
  await expect(search.getByRole('img', {name: /Search score \d+ of 100/})).toBeVisible();
  await expect(search.locator('.sc-checks li').first()).toBeVisible();
  await expect(search.getByRole('heading', {name: /Can people find it\?/})).toBeVisible();
  await expect(search.getByRole('heading', {name: /Will they join\?/})).toBeVisible();
  await expect(search.getByText('What no wording changes')).toBeVisible();
  await expect(search.getByText(/ranks channels by genuine subscribers/)).toBeVisible();
  await search.getByLabel('Word you searched').fill('maker');
  await search.getByLabel('Position (empty: not found)').fill('7');
  await search.getByRole('button', {name: 'Note it'}).click();
  await expect(search.locator('.sc-positions li').filter({hasText: 'maker'})).toContainText('#7');
  await search.getByRole('button', {name: 'Rewrite with AI'}).click();
  await expect(page.getByRole('dialog', {name: 'A better name and description'})).toBeVisible();
  await page.getByRole('button', {name: 'Close dialog'}).click();

  await page.setViewportSize({width: 390, height: 844});
  await expect(search.locator('.sc-score')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('a queued post can carry pictures, link buttons, and be sent silently and pinned', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width: 1440, height: 900}); await page.goto('/');
  await page.getByRole('button', {name: 'New post', exact: true}).click();
  await page.getByLabel('Post title').fill('Browser test: picture post');
  await page.getByLabel('Message', {exact: true}).fill('A post with a picture and a button.');
  // a 1×1 PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.getByLabel('Add pictures or video').setInputFiles([{name: 'one.png', mimeType: 'image/png', buffer: png}, {name: 'two.png', mimeType: 'image/png', buffer: png}]);
  await expect(page.locator('.media-thumb img')).toHaveCount(2);
  await expect(page.getByText('Album · 2')).toBeVisible();
  await page.getByRole('button', {name: 'Add a button'}).click();
  await page.getByLabel('Button label').fill('Read more');
  await page.getByLabel('Link', {exact: true}).fill('https://example.com');
  await page.getByRole('button', {name: 'Save draft', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('buttons under an album');
  await page.getByRole('button', {name: 'Remove two.png'}).click();
  await page.getByLabel('Send without sound').check();
  await page.getByLabel('Pin after sending').check();
  await page.getByRole('button', {name: 'Save draft', exact: true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();

  const saved = (await (await page.request.get('/api/workspace')).json()).posts.find((p: {title: string}) => p.title === 'Browser test: picture post');
  expect(saved.media).toHaveLength(1);
  expect(saved.buttons).toEqual([{text: 'Read more', url: 'https://example.com'}]);
  expect(saved.silent && saved.pin).toBe(true);
  await page.request.delete(`/api/posts/${saved.id}`);
  expect(errors).toEqual([]);
});
test('cross-promo finds partner channels, and swaps can be accepted and asked for with tracked links', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width: 1440, height: 900}); await page.goto('/');
  await page.getByLabel('Filter channel').selectOption('makers');
  await page.locator('nav').getByRole('button', {name: 'Insights'}).click();
  const cp = page.getByRole('region', {name: 'Swap posts with channels like yours'});
  await expect(cp.getByText('Partners that fit')).toBeVisible();

  const running = cp.locator('.cp-card', {hasText: 'Code & Coffee'});
  await expect(running.getByText('Running')).toBeVisible();
  await expect(running.getByText(/Their post brought you \d+/)).toBeVisible();

  // the sample request from AI Weekly is there on a fresh demo; answering it is for good, so a rerun finds it answered
  const asking = cp.locator('.cp-card', {hasText: 'Wants to swap'});
  if (await asking.count()) {
    const who = (await asking.first().locator('strong').first().textContent())!;
    await asking.first().getByRole('button', {name: 'Accept'}).click();
    await expect(cp.locator('.cp-card', {hasText: who}).getByText('Running')).toBeVisible();
  }

  // sample partners say yes straight away; ending the swap puts them back among the matches for the next run
  const match = cp.locator('.cp-block').last().locator('.cp-card').first();
  const partner = (await match.locator('strong').first().textContent())!;
  await match.getByRole('button', {name: 'Ask to swap'}).click();
  const swap = cp.locator('.cp-block').first().locator('.cp-card', {hasText: partner}).filter({hasText: 'Running'});
  await expect(swap.getByText('Their link, for you to post')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await swap.getByRole('button', {name: 'End swap'}).click();
  await expect(cp.locator('.cp-block').first().locator('.cp-card', {hasText: partner}).getByText('Over').first()).toBeVisible();

  await cp.getByRole('button', {name: 'Edit'}).click();
  const pitch = `Maker projects every morning, ${Date.now()}.`;
  await cp.getByLabel('About your channel').fill(pitch);
  await cp.getByRole('button', {name: 'Save'}).click();
  await expect(cp.getByText(pitch)).toBeVisible();
  expect(errors).toEqual([]);
});
test('a draft is scored against what worked, fixed with AI, put on the best time, and drafts and old hits fill the queue', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let prompt = '';
  await page.route('https://ai.example.test/v1/chat/completions', async route => {
    prompt = route.request().postData() ?? '';
    await route.fulfill({contentType: 'text/event-stream', headers: {'Access-Control-Allow-Origin': '*'}, body: `data: ${JSON.stringify({choices: [{delta: {content: 'A sharper tip of the day'}}]})}\n\ndata: [DONE]\n\n`});
  });
  await page.setViewportSize({width: 1440, height: 900}); await page.goto('/');
  await page.evaluate(() => localStorage.setItem('gramalyzer.ai', JSON.stringify({provider: 'custom', baseUrl: 'https://ai.example.test/v1', apiKey: 'test-key', model: 'test-model', voice: '', contentLang: ''})));
  await page.reload();
  await page.getByLabel('Filter channel').selectOption('design');
  await page.getByRole('button', {name: 'New post', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Message', {exact: true}).fill('Quick tip of the day #typography');
  const score = dialog.getByRole('region', {name: 'Draft score'});
  // the sample design channel's score predicted its newest posts, so it shows a number
  await expect(score.locator('.ds-score strong')).toHaveText(/^\d+$/);
  await expect(score.locator('.ds-proof')).toContainText(/Checked on your \d+ newest posts/);
  await expect(score.locator('li.weak').filter({hasText: 'Format'})).toContainText('Try Video');
  // hashtags are context, never advice
  await expect(score.locator('li.context').filter({hasText: 'Topics'})).toContainText('#typography');
  await expect(score.getByRole('button', {name: 'Fix with AI'})).toHaveCount(0);
  await score.getByRole('button', {name: /^Use best time/}).click();
  await expect(score.getByText('On the best free time')).toBeVisible();

  // the sample tech channel's score didn't beat chance on its newest posts: factors, no number
  await dialog.getByLabel('Channel').selectOption('tech');
  await expect(score.getByText('Not proven yet')).toBeVisible();
  await expect(score.locator('.ds-score')).toHaveCount(0);
  await expect(score.locator('li').filter({hasText: 'Format'})).toBeVisible();

  // a draft whose length clearly works worse gets an AI fix for it
  await page.route('**/draft-score', route => route.fulfill({json: {connected: true, slots: [], score: {status: 'ready', score: 38, expected: 0.85, potential: 1.2, low: 0.7, high: 1, postsRead: 80,
    check: {status: 'proven', rho: 0.4, tested: 20}, factors: [{dimension: 'LENGTH', key: 'LONG', lift: 0.8, low: 0.7, high: 0.92, bestKey: 'SHORT', bestLift: 1.25, weak: true, counted: true}]}}}));
  await dialog.getByLabel('Channel').selectOption('design');
  await dialog.getByLabel('Message', {exact: true}).fill('Quick tip of the day, with a long story around it');
  await expect(score.locator('li.weak').filter({hasText: 'Length'})).toContainText('Try');
  await score.getByRole('button', {name: 'Fix with AI'}).click();
  await expect(score.locator('.ai-text')).toHaveText('A sharper tip of the day');
  expect(prompt).toContain('up to 120 characters');
  expect(prompt).not.toContain('Add the hashtag');
  await score.getByRole('button', {name: 'Replace text'}).click();
  await expect(dialog.getByLabel('Message', {exact: true})).toHaveValue('A sharper tip of the day');
  await page.unroute('**/draft-score');
  if (process.env.SHOTS) await page.screenshot({path: `${process.env.SHOTS}/draft-score.png`});
  await dialog.getByLabel('Save as').selectOption('draft');
  await dialog.getByLabel('Post title').fill(`Score test ${Date.now() % 100000}`);
  await dialog.getByRole('button', {name: 'Save draft'}).click();
  await page.evaluate(() => localStorage.removeItem('gramalyzer.ai'));

  await page.locator('nav').getByRole('button', {name: 'Schedule'}).click();
  const fill = page.getByRole('region', {name: 'Fill the best times'});
  await fill.getByRole('button', {name: /^Plan \d+ drafts?$/}).click();
  await expect(fill.locator('.fill-list li').first()).toBeVisible();
  const evergreen = page.getByRole('region', {name: 'Repost your best old posts'});
  await expect(evergreen.locator('.evergreen-list li').first()).toBeVisible();
  if (process.env.SHOTS) {await page.waitForTimeout(1500); await page.screenshot({path: `${process.env.SHOTS}/schedule.png`, fullPage: true});}
  await fill.getByRole('button', {name: /^Schedule \d+ posts?$/}).click();
  await expect(page.locator('.toast')).toContainText(/scheduled/);
  const first = evergreen.locator('.evergreen-list li').filter({has: page.getByRole('button', {name: 'Repost'})}).first();
  const preview = await first.locator('strong').textContent();
  await first.getByRole('button', {name: 'Repost'}).click();
  await expect(page.locator('.toast')).toContainText('Repost queued for');
  // the sample channel has posts that start alike, so look for the one now queued
  await expect(evergreen.locator('li').filter({hasText: preview!.slice(0, 30)}).filter({hasText: 'Queued for'})).toHaveCount(1);
  await page.setViewportSize({width: 390, height: 844});
  await expect(evergreen.locator('.evergreen-list li').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // the demo database outlives a run: take back what this run queued so the free times and old hits are there next time
  const queued = (await (await page.request.get('/api/workspace')).json()).posts.filter((p: {title: string; repostOf?: number[]}) => p.repostOf?.length || p.title.startsWith('Score test'));
  for (const p of queued) await page.request.delete(`/api/posts/${p.id}`);
  expect(errors).toEqual([]);
});
