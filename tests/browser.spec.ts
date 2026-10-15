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
