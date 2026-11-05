'use strict';

const fs = require('node:fs/promises');
const { test, expect } = require('@playwright/test');
const { backupPath, importBackup, launchExtension } = require('../../helpers/extension.js');
const { seedVideo } = require('../../helpers/extension.js');

test('history page persists and retrieves a video through IndexedDB', async () => {
  const extension = await launchExtension();

  try {
    const page = await extension.context.newPage();
    await page.goto(`chrome-extension://${extension.extensionId}/history.html`);

    const savedVideo = await page.evaluate(async () => {
      const video = {
        videoId: 'playwright-test-video',
        title: 'Playwright test video',
        channel: 'Test channel',
        channelUrl: 'https://www.youtube.com/@test',
        time: 60,
        duration: 120,
        watched: false,
        watchCount: 0,
        timestamp: Date.now()
      };
      await db_saveVideo(video);
      const saved = await db_getVideoById(video.videoId);
      await db_deleteVideo(video.videoId);
      return saved;
    });

    expect(savedVideo).toMatchObject({
      videoId: 'playwright-test-video',
      title: 'Playwright test video',
      time: 60,
      duration: 120
    });
  } finally {
    await extension.close();
  }
});

test('history shows more than one page of videos with Load More', async () => {
  const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  const extension = await launchExtension();

  try {
    await importBackup(extension, backup.history.length);

    const historyPage = await extension.context.newPage();
    await historyPage.goto(`chrome-extension://${extension.extensionId}/history.html`);

    await expect(historyPage.locator('.video-card')).toHaveCount(24);
    await expect(historyPage.locator('#load-more-btn')).toBeVisible();

    await historyPage.locator('#load-more-btn').click();

    await expect(historyPage.locator('.video-card')).toHaveCount(backup.history.length);
    await expect(historyPage.locator('#load-more-btn')).toBeHidden();
  } finally {
    await extension.close();
  }
});

test('history supports search, sorting, hiding watched, and clearing all', async () => {
  const extension = await launchExtension();

  try {
    const historyPage = await extension.context.newPage();
    await historyPage.goto(`chrome-extension://${extension.extensionId}/history.html`);
    await seedVideo(historyPage, {
      videoId: 'history-unwatched', title: 'Zebra video', timestamp: Date.now() - 3000, watched: false
    });
    await seedVideo(historyPage, {
      videoId: 'history-watched', title: 'Alpha video', timestamp: Date.now() - 2000,
      watched: true, time: 120, duration: 120
    });
    await seedVideo(historyPage, {
      videoId: 'history-middle', title: 'Middle video', timestamp: Date.now() - 1000, watched: false
    });
    await historyPage.reload();

    await expect(historyPage.locator('#stat-total')).toHaveText('3');
    await historyPage.locator('#search-input').fill('Middle');
    await expect(historyPage.locator('.video-card')).toHaveCount(1);
    await expect(historyPage.locator('.card-title')).toHaveText('Middle video');

    await historyPage.locator('#search-input').fill('history-middle');
    await expect(historyPage.locator('.video-card')).toHaveCount(1);
    await expect(historyPage.locator('.card-title')).toHaveText('Middle video');

    await historyPage.locator('#search-input').fill('https://www.youtube.com/watch?v=history-middle');
    await expect(historyPage.locator('.video-card')).toHaveCount(1);
    await expect(historyPage.locator('.card-title')).toHaveText('Middle video');

    await historyPage.locator('#search-input').fill('');
    await historyPage.locator('#sort-select').selectOption('title');
    await expect(historyPage.locator('.card-title').allTextContents())
      .resolves.toEqual(['Alpha video', 'Middle video', 'Zebra video']);

    await historyPage.locator('#hide-watched-toggle').check();
    await expect(historyPage.locator('.video-card')).toHaveCount(2);
    await expect(historyPage.locator('.card-title').allTextContents())
      .resolves.toEqual(['Middle video', 'Zebra video']);

    await historyPage.once('dialog', (dialog) => dialog.accept());
    await historyPage.locator('#clear-all').click();
    await expect(historyPage.locator('#stat-total')).toHaveText('0');
    await expect(historyPage.locator('.empty-state')).toBeVisible();
  } finally {
    await extension.close();
  }
});

test('expanded list stays expanded after card actions', async () => {
  const extension = await launchExtension();
  try {
    const page = await extension.context.newPage();
    await page.goto(`chrome-extension://${extension.extensionId}/history.html`);
    for (let i = 0; i < 55; i++) {
      await seedVideo(page, { videoId: `batch-${i}`, title: `Batch ${i}`, timestamp: 1700000000000 + i });
    }
    await page.reload();
    await expect(page.locator('.video-card')).toHaveCount(24);

    await page.locator('#load-more-btn').click();
    await expect(page.locator('.video-card')).toHaveCount(48);
    const first = page.locator('.video-card').first();
    await first.locator('.card-menu-btn').click();
    await first.getByRole('button', { name: /Mark as watched/ }).click();
    await expect(page.locator('.video-card')).toHaveCount(48);
    await expect(page.locator('.video-card').first().locator('.card-menu-item').first()).toHaveText(/Reset progress/);
    await page.locator('.video-card').first().locator('.card-menu-btn').click();
    await page.locator('.video-card').first().getByRole('button', { name: /Reset progress/ }).click();
    await expect(page.locator('.video-card').first().locator('.card-menu-item').first()).toHaveText(/Mark as watched/);
    await expect(page.locator('.video-card')).toHaveCount(48);
    await page.locator('.video-card').first().locator('.card-menu-btn').click();
    await page.locator('.video-card').first().getByRole('button', { name: /Remove from history/ }).click();
    await expect(page.locator('.video-card')).toHaveCount(48);
    await expect(page.locator('.card-title').getByText('Batch 54', { exact: true })).toHaveCount(0);
    await page.locator('#search-input').fill('Batch');
    await expect(page.locator('.video-card')).toHaveCount(24);
    await page.locator('#sort-select').selectOption('title');
    await page.locator('#hide-watched-toggle').check();
    await expect(page.locator('.video-card')).toHaveCount(24);
    await page.locator('#load-more-btn').click();
    await expect(page.locator('.video-card')).toHaveCount(48);
    const filteredTitle = await page.locator('.card-title').first().textContent();
    await page.locator('.video-card').first().locator('.card-menu-btn').click();
    await page.locator('.video-card').first().getByRole('button', { name: /Mark as watched/ }).click();
    await expect(page.locator('.card-title').getByText(filteredTitle, { exact: true })).toHaveCount(0);
    await expect(page.locator('.video-card')).toHaveCount(48);
    await expect(page.locator('#search-input')).toHaveValue('Batch');
    await expect(page.locator('#sort-select')).toHaveValue('title');
    await expect(page.locator('#hide-watched-toggle')).toBeChecked();
  } finally {
    await extension.close();
  }
});
