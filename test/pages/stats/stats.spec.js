'use strict';

const fs = require('node:fs/promises');
const { test, expect } = require('@playwright/test');
const { getVideoUrl, getWatchCount } = require('../../../src/core/core.js');
const { backupPath, importBackup, launchExtension } = require('../../helpers/extension.js');

test('imports a backup and populates stats with correct links', async () => {
  try {
    await fs.access(backupPath);
  } catch {
    test.skip(true, `Backup fixture not found: ${backupPath}`);
  }

  const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  const watchedCount = backup.history.filter((video) => video.watched === true).length;
  const totalWatchCount = backup.history.reduce((sum, video) => sum + getWatchCount(video), 0);
  const topVideo = [...backup.history]
    .map((video) => ({ video, count: getWatchCount(video) }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count || b.video.timestamp - a.video.timestamp)[0].video;
  const extension = await launchExtension();

  try {
    await importBackup(extension, backup.history.length);

    const statsPage = await extension.context.newPage();
    await statsPage.goto(`chrome-extension://${extension.extensionId}/stats.html`);

    await expect(statsPage.locator('#stat-total'))
      .toHaveText(backup.history.length.toLocaleString());
    await expect(statsPage.locator('#stat-watched')).toHaveText(watchedCount.toLocaleString());
    await expect(statsPage.locator('#stat-rewatches'))
      .toHaveText(totalWatchCount.toLocaleString());

    await expect(statsPage.locator('#top-videos .stats-video-row').first()).toBeVisible();
    await expect(statsPage.locator('#top-channels .stats-channel-row').first()).toBeVisible();
    await expect(statsPage.locator('#top-channels-rewatches .stats-channel-row').first()).toBeVisible();
    await expect(statsPage.locator('#daily-watch-time .daily-watch-column')).toHaveCount(7);
    const expectedDailyDates = await statsPage.evaluate(() => [0, 6].map((offset) =>
      new Date(Date.now() - offset * 86400000)
        .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })));
    await expect(statsPage.locator('#daily-watch-time .daily-watch-column').first().locator('.daily-watch-date'))
      .toHaveText(expectedDailyDates[0]);
    await expect(statsPage.locator('#daily-watch-time .daily-watch-column').last().locator('.daily-watch-date'))
      .toHaveText(expectedDailyDates[1]);

    await expect(statsPage.locator('#top-videos .stats-video-row').first().locator('.stats-title'))
      .toHaveAttribute('href', getVideoUrl(topVideo));

    const favoriteChannel = backup.history
      .filter((video) => video.channel)
      .reduce((counts, video) => counts.set(video.channel, (counts.get(video.channel) || 0) + 1), new Map());
    expect(favoriteChannel.size).toBeGreaterThan(0);
    await expect(statsPage.locator('#stat-favorite-channel'))
      .toHaveAttribute('href', /^(https:\/\/www\.youtube\.com\/|#)/);

    for (const href of ['history.html', 'timeline.html', 'stats.html', 'options.html', 'how-it-works.html']) {
      await expect(statsPage.locator(`.nav-tabs a[href="${href}"]`)).toHaveCount(1);
    }
    await expect(statsPage.locator('.nav-tabs a[href="https://www.youtube.com"]'))
      .toHaveCount(1);
  } finally {
    await extension.close();
  }
});

test('stats share dialog renders and copies a selected period summary', async () => {
  const extension = await launchExtension();

  try {
    const statsPage = await extension.context.newPage();
    await statsPage.goto(`chrome-extension://${extension.extensionId}/stats.html`);
    await statsPage.evaluate(async () => db_saveVideo({
      videoId: 'stats-share-video', title: 'Stats share video', channel: 'Stats channel',
      watched: true, time: 120, duration: 120, watchCount: 1, timestamp: Date.now()
    }));
    await statsPage.reload();

    await statsPage.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await statsPage.locator('#share-stats-btn').click();
    await expect(statsPage.locator('#share-dialog')).toBeVisible();
    await statsPage.locator('#share-period').selectOption('allTime');
    await expect(statsPage.locator('#share-preview')).toContainText('My all-time YouTube stats:');
    await expect(statsPage.locator('#share-preview')).toContainText('1 video');
    await statsPage.locator('#copy-share-btn').click();
    await expect.poll(() => statsPage.evaluate(() => navigator.clipboard.readText()))
      .toContain('My all-time YouTube stats:');
    await expect(statsPage.locator('#share-dialog')).not.toBeVisible();
  } finally {
    await extension.close();
  }
});