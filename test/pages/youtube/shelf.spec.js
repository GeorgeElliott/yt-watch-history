'use strict';

const fs = require('node:fs/promises');
const { test, expect } = require('@playwright/test');
const { backupPath, importBackup, launchExtension } = require('../../helpers/extension.js');

const subscriptionsPage = '<!doctype html><html><body><main id="primary"><ytd-section-list-renderer><div id="contents"><div id="existing-feed">Subscriptions feed</div></div></ytd-section-list-renderer></main></body></html>';

const mockSubscriptionsPage = async (context) => {
  await context.route('https://www.youtube.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: subscriptionsPage
  }));
};

test('subscriptions page shows the Continue Watching shelf from imported history', async () => {
  try {
    await fs.access(backupPath);
  } catch {
    test.skip(true, `Backup fixture not found: ${backupPath}`);
  }

  const extension = await launchExtension();

  try {
    await importBackup(extension);

    const optionsPage = await extension.context.newPage();
    await optionsPage.goto(`chrome-extension://${extension.extensionId}/options.html`);
    const shelfToggle = optionsPage.locator('#pickup-shelf-toggle');
    if (!(await shelfToggle.isChecked())) {
      await optionsPage.locator('label.toggle', { has: shelfToggle }).click();
    }
    await expect(shelfToggle).toBeChecked();

    await mockSubscriptionsPage(extension.context);
    const youtubePage = await extension.context.newPage();
    await youtubePage.goto('https://www.youtube.com/feed/subscriptions');

    const shelf = youtubePage.locator('#ytwh-pickup-shelf');
    await expect(shelf).toBeVisible({ timeout: 10000 });
    await expect(shelf.locator('xpath=..')).toHaveJSProperty('tagName', 'DIV');
    await expect(shelf.locator('xpath=../..')).toHaveJSProperty('tagName', 'YTD-SECTION-LIST-RENDERER');
    await expect(shelf.locator('.whyt-shelf-title')).toHaveText('Continue Watching');
    await expect(shelf.locator('.ytwh-video-card')).not.toHaveCount(0);
    await expect(shelf.locator('.ytwh-video-card').first()).toHaveAttribute(
      'href',
      /https:\/\/www\.youtube\.com\/watch\?v=/
    );
    await expect(shelf.locator('button', { hasText: 'View All History' })).toBeVisible();
  } finally {
    await extension.close();
  }
});
