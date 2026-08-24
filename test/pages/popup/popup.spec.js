'use strict';

const fs = require('node:fs/promises');
const { test, expect } = require('@playwright/test');
const { backupPath, importBackup, launchExtension, seedVideo } = require('../../helpers/extension.js');
const { getVideoUrl } = require('../../../src/core/core.js');

test('imports a backup and populates the popup with correct links', async () => {
  try {
    await fs.access(backupPath);
  } catch {
    test.skip(true, `Backup fixture not found: ${backupPath}`);
  }

  const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  const newestVideo = [...backup.history].sort((a, b) => b.timestamp - a.timestamp)[0];
  const extension = await launchExtension();

  try {
    await importBackup(extension, backup.history.length);

    const popupPage = await extension.context.newPage();
    await popupPage.goto(`chrome-extension://${extension.extensionId}/popup.html`);

    await expect(popupPage.locator('#stat-count'))
      .toHaveText(backup.history.length.toLocaleString());
    await expect(popupPage.locator('.popup-video-card').first()).toBeVisible();
    expect(await popupPage.locator('.popup-video-card').count()).toBeGreaterThan(0);

    const firstCard = popupPage.locator('.popup-video-card').first();
    await expect(firstCard.locator('.item-title')).toHaveAttribute('href', getVideoUrl(newestVideo));
    await expect(firstCard.locator('a').first())
      .toHaveAttribute('href', getVideoUrl(newestVideo));

    if (newestVideo.channel) {
      await expect(firstCard.locator('.item-channel'))
        .toHaveAttribute('href', newestVideo.channelUrl || '#');
    }

    const navigationLinks = {
      '#open-history': 'history.html',
      '#open-timeline': 'timeline.html',
      '#open-stats': 'stats.html',
      '#open-options': 'options.html'
    };
    for (const [selector, href] of Object.entries(navigationLinks)) {
      await expect(popupPage.locator(selector)).toHaveAttribute('href', href);
    }
    await expect(popupPage.locator('.popup-youtube-link'))
      .toHaveAttribute('href', 'https://www.youtube.com');
  } finally {
    await extension.close();
  }
});

test('popup card context menu updates, copies, and removes a video', async () => {
  const extension = await launchExtension();

  try {
    const popupPage = await extension.context.newPage();
    await popupPage.goto(`chrome-extension://${extension.extensionId}/popup.html`);
    await seedVideo(popupPage);
    await popupPage.reload();

    const card = popupPage.locator('.popup-video-card').first();
    const menu = card.locator('.video-menu');
    await card.locator('.video-menu-btn').click();
    await expect(menu).toBeVisible();
    await expect(menu.locator('.video-menu-item')).toHaveText([
      /Mark as watched/,
      /Copy link/,
      /Remove from history/
    ]);

    await menu.getByRole('button', { name: /Mark as watched/ }).click();
    await expect(popupPage.locator('.popup-video-card').first().locator('.video-menu-item').first())
      .toHaveText(/Reset progress/);

    await popupPage.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const updatedCard = popupPage.locator('.popup-video-card').first();
    await updatedCard.locator('.video-menu-btn').click();
    await updatedCard.getByRole('button', { name: /Copy link/ }).click();
    await expect.poll(() => popupPage.evaluate(() => navigator.clipboard.readText()))
      .toBe('https://www.youtube.com/watch?v=context-menu-test-video');

    await updatedCard.locator('.video-menu-btn').click();
    await updatedCard.getByRole('button', { name: /Remove from history/ }).click();
    await expect(popupPage.locator('#stat-count')).toHaveText('0');
    await expect(popupPage.locator('.empty-state')).toBeVisible();
  } finally {
    await extension.close();
  }
});

test('popup reveals and loads more videos when the list reaches the bottom', async () => {
  const extension = await launchExtension();

  try {
    const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
    await importBackup(extension, backup.history.length);

    const popupPage = await extension.context.newPage();
    await popupPage.goto(`chrome-extension://${extension.extensionId}/popup.html`);

    await expect(popupPage.locator('.popup-video-card')).toHaveCount(5);
    const historyList = popupPage.locator('#history-list');
    await historyList.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect(popupPage.locator('#show-more-btn')).toBeVisible();

    await popupPage.locator('#show-more-btn').click();

    await expect(popupPage.locator('.popup-video-card')).toHaveCount(10);
    await expect(popupPage.locator('#show-more-btn')).toBeHidden();
  } finally {
    await extension.close();
  }
});