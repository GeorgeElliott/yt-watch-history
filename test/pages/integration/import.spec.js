'use strict';

const fs = require('node:fs/promises');
const { test, expect } = require('@playwright/test');
const { backupPath, importBackup, launchExtension, seedVideo } = require('../../helpers/extension.js');

test('imports a backup and populates the history page', async () => {
  try {
    await fs.access(backupPath);
  } catch {
    test.skip(true, `Backup fixture not found: ${backupPath}`);
  }

  const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  const expectedVideoCount = backup.history.length;
  const extension = await launchExtension();

  try {
    await importBackup(extension, expectedVideoCount);

    const historyPage = await extension.context.newPage();
    await historyPage.goto(`chrome-extension://${extension.extensionId}/history.html`);
    await expect(historyPage.locator('#stat-total'))
      .toHaveText(expectedVideoCount.toLocaleString());
    await expect(historyPage.locator('.video-card').first()).toBeVisible();
  } finally {
    await extension.close();
  }
});

test('exports imported history with matching videos, events, and sessions', async () => {
  try {
    await fs.access(backupPath);
  } catch {
    test.skip(true, `Backup fixture not found: ${backupPath}`);
  }

  const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  const extension = await launchExtension();

  const sortRecords = (records, key) => [...records].sort((a, b) =>
    String(a[key]).localeCompare(String(b[key])) || JSON.stringify(a).localeCompare(JSON.stringify(b))
  );
  const comparableVideos = (videos) => sortRecords(videos.map((video) => ({
    videoId: video.videoId,
    title: video.title,
    channel: video.channel || '',
    channelUrl: video.channelUrl || '',
    time: Math.floor(video.time),
    duration: Number.isFinite(video.duration) ? Math.floor(video.duration) : 0,
    watched: video.watched === true,
    watchCount: typeof video.watchCount === 'number' ? video.watchCount : (video.watched ? 1 : 0),
    ...(video.live === true ? { live: true } : {}),
    ...(video.liveReplay === true ? { liveReplay: true } : {}),
    timestamp: Math.floor(video.timestamp)
  })), 'videoId');
  const comparableEvents = (events) => sortRecords(events.map(({ videoId, watchedAt, watchDurationSeconds }) => ({
    videoId,
    watchedAt,
    ...(Number.isFinite(watchDurationSeconds) ? { watchDurationSeconds } : {})
  })), 'videoId');
  const comparableSessions = (sessions) => sortRecords(sessions.map(({ videoId, watchedAt, seconds, streamType }) => ({
    videoId,
    watchedAt,
    seconds,
    streamType
  })), 'videoId');

  try {
    const { optionsPage } = await importBackup(extension, backup.history.length);
    const downloadPromise = optionsPage.waitForEvent('download');
    await optionsPage.locator('#export-btn').click();
    const download = await downloadPromise;
    const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));

    expect(exported.exportDate).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(exported.exportDate))).toBe(false);
    expect(exported.dbVersion).toBe(3);
    expect(exported.count).toBe(backup.history.length);
    await expect(optionsPage.locator('#import-status'))
      .toHaveText(`Export complete: ${backup.history.length.toLocaleString()} videos saved.`);

    expect(comparableVideos(exported.history)).toEqual(comparableVideos(backup.history));
    expect(comparableEvents(exported.watchEvents)).toEqual(comparableEvents(backup.watchEvents || []));
    expect(comparableSessions(exported.watchSessions)).toEqual(comparableSessions(backup.watchSessions || []));
  } finally {
    await extension.close();
  }
});

test('history card context menu updates, copies, and removes a video', async () => {
  const extension = await launchExtension();

  try {
    const historyPage = await extension.context.newPage();
    await historyPage.goto(`chrome-extension://${extension.extensionId}/history.html`);
    await seedVideo(historyPage);
    await historyPage.reload();

    const card = historyPage.locator('.video-card').first();
    const menu = card.locator('.card-menu');
    await card.locator('.card-menu-btn').click();
    await expect(menu).toBeVisible();
    await expect(menu.locator('.card-menu-item')).toHaveText([
      /Mark as watched/,
      /Copy link/,
      /Remove from history/
    ]);

    await menu.getByRole('button', { name: /Mark as watched/ }).click();
    await expect(card.locator('.card-menu-btn')).toBeVisible();
    await expect(historyPage.locator('.video-card').first().locator('.card-menu-item').first())
      .toHaveText(/Reset progress/);

    await historyPage.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const updatedCard = historyPage.locator('.video-card').first();
    await updatedCard.locator('.card-menu-btn').click();
    await updatedCard.getByRole('button', { name: /Copy link/ }).click();
    await expect.poll(() => historyPage.evaluate(() => navigator.clipboard.readText()))
      .toBe('https://www.youtube.com/watch?v=context-menu-test-video');

    await updatedCard.locator('.card-menu-btn').click();
    await updatedCard.getByRole('button', { name: /Remove from history/ }).click();
    await expect(historyPage.locator('#stat-total')).toHaveText('0');
    await expect(historyPage.locator('.empty-state')).toBeVisible();
  } finally {
    await extension.close();
  }
});