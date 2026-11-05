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
test('manual actions across History and popup retain viewing date and statistics', async () => {
  const extension = await launchExtension();
  try {
    const history = await extension.context.newPage();
    await history.goto(`chrome-extension://${extension.extensionId}/history.html`);
    await seedVideo(history, { videoId: 'manual-demo', title: 'Manual demo', time: 96, duration: 100,
      timestamp: 1600000000000, watchCount: 3 });
    await history.evaluate(async () => {
      await db_recordWatchEvent({ videoId: 'manual-demo', watchedAt: 1500000000000 });
      await db_recordWatchSession({ videoId: 'manual-demo', watchedAt: 1500000000000, seconds: 70, streamType: 'normal' });
    });
    await history.reload();
    const card = history.locator('.video-card').first();
    await card.locator('.card-menu-btn').click();
    await card.getByRole('button', { name: /Mark as watched/ }).click();
    await expect(history.locator('.card-menu-item').first()).toHaveText(/Reset progress/);
    expect(await history.evaluate(() => db_getVideoById('manual-demo'))).toMatchObject({
      watched: true, time: 96, timestamp: 1600000000000, watchCount: 3
    });
    const popup = await extension.context.newPage();
    await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);
    const popupCard = popup.locator('.popup-video-card').first();
    await popupCard.locator('.video-menu-btn').click();
    await popupCard.getByRole('button', { name: /Reset progress/ }).click();
    await expect(popup.locator('.video-menu-item').first()).toHaveText(/Mark as watched/);
    expect(await history.evaluate(() => db_getVideoById('manual-demo'))).toMatchObject({
      watched: false, time: 0, timestamp: 1600000000000, watchCount: 3
    });
    expect(await history.evaluate(() => db_getAllWatchEvents())).toHaveLength(1);
    expect(await history.evaluate(() => db_getAllWatchSessions())).toHaveLength(1);
    await seedVideo(history, { videoId: 'legacy-demo', title: 'Legacy', time: 30, duration: 100,
      timestamp: 1500000000000, watchCount: 2 });
    const before = await history.evaluate(async () => getLegacyWatchSeconds(await db_getVideoById('legacy-demo')));
    await history.evaluate(() => db_toggleWatched('legacy-demo', 95, null, 'reset'));
    const after = await history.evaluate(async () => getLegacyWatchSeconds(await db_getVideoById('legacy-demo')));
    expect(before).toBe(130);
    expect(after).toBe(before);
    expect(await history.evaluate(() => db_getAllWatchSessions())).toHaveLength(1);
    const stats = await extension.context.newPage();
    await stats.goto(`chrome-extension://${extension.extensionId}/stats.html`);
    expect(await stats.evaluate(async () => computeSessionWatchSeconds(await db_getAllVideos(), await db_getAllWatchSessions()))).toBe(200);
    await history.evaluate(() => db_recordWatchSession({ videoId: 'legacy-demo', watchedAt: 1700000000000, seconds: 10, streamType: 'normal' }));
    expect(await stats.evaluate(async () => computeSessionWatchSeconds(await db_getAllVideos(), await db_getAllWatchSessions()))).toBe(210);
  } finally {
    await extension.close();
  }
});


test('backup import preserves manual-only records without inventing viewing activity', async () => {
  const extension = await launchExtension();
  try {
    const page = await extension.context.newPage();
    await page.goto(`chrome-extension://${extension.extensionId}/options.html`);
    const backup = { history: [{ videoId: 'manual_demo', title: 'Manual demo', time: 0, duration: 0,
      watched: true, watchCount: 0, manualOnly: true, timestamp: 1700000000000 },
      { videoId: 'legacy_demo', title: 'Legacy demo', time: 0, duration: 100, watched: false,
        watchCount: 2, legacyWatchSeconds: 130, legacyWatchCount: 2, timestamp: 1600000000000 }],
      watchEvents: [], watchSessions: [] };
    await page.locator('#import-file').setInputFiles({ name: 'demo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await expect(page.locator('#import-status')).toHaveText('Import complete: 2 videos restored.');
    expect(await page.evaluate(() => db_getVideoById('manual_demo'))).toMatchObject({ manualOnly: true, watchCount: 0 });
    expect(await page.evaluate(async () => getLegacyWatchSeconds(await db_getVideoById('legacy_demo')))).toBe(130);
    expect(await page.evaluate(() => db_getAllWatchEvents())).toHaveLength(0);
    expect(await page.evaluate(() => db_getAllWatchSessions())).toHaveLength(0);
  } finally {
    await extension.close();
  }
});

test('manual initial completion is counted once across views without adding watch time', async () => {
  const extension = await launchExtension();
  try {
    const history = await extension.context.newPage();
    await history.goto(`chrome-extension://${extension.extensionId}/history.html`);
    await seedVideo(history, { videoId: 'manualcase1', title: 'Manual completion', time: 20,
      duration: 100, watchCount: 0, timestamp: 1600000000000 });
    await history.reload();
    await history.locator('.card-menu-btn').first().click();
    await history.getByRole('button', { name: /Mark as watched/ }).click();
    await expect(history.locator('.card-menu-item').first()).toHaveText(/Reset progress/);
    const marked = await history.evaluate(() => db_getVideoById('manualcase1'));
    expect(marked).toMatchObject({ watched: true, time: 20, timestamp: 1600000000000,
      watchCount: 1, manualCompletion: true });
    const events = await history.evaluate(() => db_getAllWatchEvents());
    expect(events).toMatchObject([{ videoId: 'manualcase1', manual: true, watchedAt: marked.manualCompletedAt }]);
    expect(await history.evaluate(() => db_getAllWatchSessions())).toHaveLength(0);
    const stats = await extension.context.newPage();
    await stats.goto(`chrome-extension://${extension.extensionId}/stats.html`);
    await expect(stats.locator('#stat-watched')).toHaveText('1');
    await expect(stats.locator('#stat-rewatches')).toHaveText('1');
    expect(await stats.evaluate(async () => computeSessionWatchSeconds(await db_getAllVideos(), await db_getAllWatchSessions()))).toBe(20);
    const popup = await extension.context.newPage();
    await popup.goto(`chrome-extension://${extension.extensionId}/popup.html`);
    await popup.locator('.video-menu-btn').first().click();
    await popup.getByRole('button', { name: /Reset progress/ }).click();
    await expect(popup.locator('.video-menu-item').first()).toHaveText(/Mark as watched/);
    await stats.reload();
    await expect(stats.locator('#stat-watched')).toHaveText('1');
    await expect(stats.locator('#stat-rewatches')).toHaveText('1');
    await popup.locator('.video-menu-btn').first().click();
    await popup.getByRole('button', { name: /Mark as watched/ }).click();
    await expect(popup.locator('.video-menu-item').first()).toHaveText(/Reset progress/);
    const finalVideo = await history.evaluate(() => db_getVideoById('manualcase1'));
    expect(finalVideo).toMatchObject({ watched: true, time: 0, watchCount: 1, timestamp: 1600000000000 });
    expect(await history.evaluate(() => db_getAllWatchEvents())).toHaveLength(1);
    expect(await history.evaluate(() => db_getAllWatchSessions())).toHaveLength(0);
    expect(await stats.evaluate(async () => computeSessionWatchSeconds(await db_getAllVideos(), await db_getAllWatchSessions()))).toBe(20);
    const backup = await history.evaluate(() => db_getBackupData());
    const options = await extension.context.newPage();
    await options.goto(`chrome-extension://${extension.extensionId}/options.html`);
    await options.locator('#import-file').setInputFiles({ name: 'demo.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ history: backup.videos, watchEvents: backup.watchEvents, watchSessions: backup.watchSessions })) });
    await expect(options.locator('#import-status')).toHaveText('Import complete: 1 videos restored.');
    expect(await options.evaluate(() => db_getVideoById('manualcase1'))).toMatchObject({ manualCompletion: true, watchCount: 1 });
    expect(await options.evaluate(() => db_getAllWatchEvents())).toMatchObject([{ videoId: 'manualcase1', manual: true, watchedAt: marked.manualCompletedAt }]);
    expect(await stats.evaluate(async () => computeSessionWatchSeconds(await db_getAllVideos(), await db_getAllWatchSessions()))).toBe(20);
    await options.evaluate(async () => {
      const database = await openDB();
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('watchEvents', 'readwrite');
        transaction.objectStore('watchEvents').clear();
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });
    });
    await options.locator('#import-file').setInputFiles({ name: 'older-demo.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ history: backup.videos, watchSessions: [] })) });
    await expect(options.locator('#import-status')).toHaveText('Import complete: 1 videos restored.');
    await expect.poll(() => options.evaluate(() => db_getAllWatchEvents())).toMatchObject([
      { videoId: 'manualcase1', manual: true, watchedAt: marked.manualCompletedAt }
    ]);
    expect(await options.evaluate(() => db_getAllWatchSessions())).toHaveLength(0);
  } finally {
    await extension.close();
  }
});

test('playback completions are atomic with overlapping saves and manual actions', async () => {
  const extension = await launchExtension();
  try {
    const page = await extension.context.newPage();
    await page.goto(`chrome-extension://${extension.extensionId}/options.html`);
    const outcome = await page.evaluate(async () => {
      const sample = (videoId, overrides = {}) => ({ videoId, title: 'Demo', channel: '', channelUrl: '',
        currentTime: 96, duration: 100, progress: 0.96, streamState: 'normal', watchedThreshold: 95,
        sampleAt: Date.now(), liveWatchDelta: 0, rewatch: false, suppressCompletion: false, ...overrides });
      const record = (videoId) => ({ videoId, title: 'Demo', time: 80, duration: 100, watched: false,
        watchCount: 0, timestamp: 1000 });
      await db_saveVideo(record('atomic-demo'));
      await Promise.all([db_recordPlayback(sample('atomic-demo')), db_recordPlayback(sample('atomic-demo'))]);
      const first = await db_getVideoById('atomic-demo');
      const firstEvents = (await db_getAllWatchEvents()).filter(event => event.videoId === 'atomic-demo');
      await db_saveVideo(record('manual-demo'));
      const staleSample = sample('manual-demo', { sampleAt: 1000, currentTime: 5, progress: 0.05 });
      await db_toggleWatched('manual-demo');
      await db_recordPlayback(staleSample);
      const manual = await db_getVideoById('manual-demo');
      const manualEvents = (await db_getAllWatchEvents()).filter(event => event.videoId === 'manual-demo');
      await db_saveVideo({ ...record('rewatch-demo'), watched: true, watchCount: 1,
        manualCompletion: true, manualCompletedAt: 500 });
      await db_recordPlayback(sample('rewatch-demo', { rewatch: true }));
      const rewatch = await db_getVideoById('rewatch-demo');
      await db_saveVideo({ ...record('manual-only'), watched: true, time: 0, watchCount: 1,
        manualOnly: true, manualCompletion: true, manualCompletedAt: 500 });
      await db_recordPlayback(sample('manual-only', { currentTime: 20, progress: 0.2, rewatch: true }));
      const manualOnly = await db_getVideoById('manual-only');
      await db_saveVideo(record('ghost-end'));
      await db_recordPlayback(sample('ghost-end', { suppressCompletion: true }));
      const ghostEnd = await db_getVideoById('ghost-end');
      const ghostEndEvents = (await db_getAllWatchEvents()).filter(event => event.videoId === 'ghost-end');
      const rewatchEvents = (await db_getAllWatchEvents()).filter(event => event.videoId === 'rewatch-demo');
      return { first, firstEvents, manual, manualEvents, rewatch, rewatchEvents, manualOnly, ghostEnd, ghostEndEvents };
    });
    expect(outcome.first).toMatchObject({ watched: true, watchCount: 1 });
    expect(outcome.firstEvents).toHaveLength(1);
    expect(outcome.manual).toMatchObject({ watched: true, watchCount: 1, time: 80, timestamp: 1000 });
    expect(outcome.manualEvents).toHaveLength(1);
    expect(outcome.manualEvents[0].manual).toBe(true);
    expect(outcome.rewatch).toMatchObject({ watched: true, watchCount: 2, manualCompletion: true, manualCompletedAt: 500 });
    expect(outcome.rewatchEvents).toHaveLength(1);
    expect(outcome.manualOnly).toMatchObject({ watched: false, time: 20, watchCount: 1, manualCompletion: true });
    expect(outcome.manualOnly.manualOnly).toBeUndefined();
    expect(outcome.ghostEnd).toMatchObject({ watched: false, watchCount: 0 });
    expect(outcome.ghostEndEvents).toHaveLength(0);
  } finally {
    await extension.close();
  }
});

test('deleting a video removes its sessions and completion events before it is re-added', async () => {
  const extension = await launchExtension();
  try {
    const page = await extension.context.newPage();
    await page.goto(`chrome-extension://${extension.extensionId}/options.html`);
    const result = await page.evaluate(async () => {
      const id = 'delete-demo';
      await db_toggleWatched(id, 95, { title: 'Demo' });
      await db_recordWatchSession({ videoId: id, watchedAt: 1000, seconds: 5, streamType: 'normal' });
      await db_recordWatchEvent({ videoId: 'other-demo', watchedAt: 1000 });
      await db_deleteVideo(id);
      const deleted = { sessions: await db_getAllWatchSessions(), events: await db_getAllWatchEvents() };
      // Simulate an orphaned completion left by a prior extension version.
      await db_recordWatchEvent({ videoId: id, watchedAt: 500 });
      await db_toggleWatched(id, 95, { title: 'Demo' });
      await db_recordWatchEvent({ videoId: 'playback-demo', watchedAt: 500 });
      await db_recordPlayback({ videoId: 'playback-demo', title: 'Demo', channel: '', channelUrl: '',
        currentTime: 96, duration: 100, progress: 0.96, streamState: 'normal', watchedThreshold: 95,
        sampleAt: Date.now(), liveWatchDelta: 0, rewatch: false, suppressCompletion: false });
      return { deleted, video: await db_getVideoById(id), playback: await db_getVideoById('playback-demo'), events: await db_getAllWatchEvents() };
    });
    expect(result.deleted.sessions).toHaveLength(0);
    expect(result.deleted.events.map(event => event.videoId)).toEqual(['other-demo']);
    expect(result.video.watchCount).toBe(1);
    expect(result.events.filter(event => event.videoId === 'delete-demo')).toHaveLength(1);
    expect(result.playback.watchCount).toBe(1);
    expect(result.events.filter(event => event.videoId === 'playback-demo')).toHaveLength(1);
  } finally {
    await extension.close();
  }
});

test('post-ghost samples and sessions preserve only pre-ghost fallback and new watch time', async () => {
  const extension = await launchExtension();
  try {
    const page = await extension.context.newPage();
    await page.goto(`chrome-extension://${extension.extensionId}/options.html`);
    const result = await page.evaluate(async () => {
      const sample = (videoId) => ({ videoId, title: 'Demo', channel: '', channelUrl: '', currentTime: 55,
        duration: 100, progress: 0.55, streamState: 'normal', watchedThreshold: 95, sampleAt: Date.now(),
        liveWatchDelta: 0, rewatch: false, suppressCompletion: false, ghostExit: { token: videoId, time: 50 } });
      for (const videoId of ['sample-demo', 'sessiondemo']) {
        await db_saveVideo({ videoId, title: 'Demo', time: 10, duration: 100, watched: false, watchCount: 0, timestamp: 1000 });
      }
      await db_recordPlayback(sample('sample-demo'));
      const sampleVideo = await db_getVideoById('sample-demo');
      await db_recordWatchSession({ videoId: 'sessiondemo', watchedAt: Date.now(), seconds: 5, streamType: 'normal' },
        { token: 'sessiondemo', time: 50 });
      await db_recordPlayback(sample('sessiondemo'));
      const sessionVideo = await db_getVideoById('sessiondemo');
      await db_saveVideo({ videoId: 'live-demo01', title: 'Live demo', time: 10, duration: 0,
        watched: false, watchCount: 0, live: true, timestamp: 1000 });
      await db_recordWatchSession({ videoId: 'live-demo01', watchedAt: Date.now(), seconds: 5, streamType: 'live' },
        { token: 'live-exit', time: 900 });
      await db_recordPlayback({ ...sample('live-demo01'), streamState: 'live', liveWatchDelta: 5,
        ghostExit: { token: 'live-exit', time: 900 } });
      const liveVideo = await db_getVideoById('live-demo01');
      await db_toggleWatched('sample-demo', 95, null, 'reset');
      const resetVideo = await db_getVideoById('sample-demo');
      return { sampleVideo, sessionVideo, liveVideo, resetVideo, sessions: await db_getAllWatchSessions(),
        beforeResetEstimate: getLegacyWatchSeconds(sampleVideo), afterResetEstimate: getLegacyWatchSeconds(resetVideo) };
    });
    expect(result.beforeResetEstimate).toBe(15);
    expect(result.afterResetEstimate).toBe(15);
    expect(result.sampleVideo).toMatchObject({ time: 55, legacyWatchSeconds: 10, legacyTimeOffset: 50 });
    expect(result.sessionVideo).toMatchObject({ time: 55, legacyWatchSeconds: 10, legacyTimeOffset: 50 });
    expect(result.liveVideo).toMatchObject({ time: 15, legacyWatchSeconds: 10, legacyTimeOffset: 10 });
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions.map(session => session.seconds)).toEqual([5, 5]);
    const backup = await page.evaluate(() => db_getBackupData());
    await page.locator('#import-file').setInputFiles({ name: 'ghost-demo.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ history: backup.videos, watchEvents: backup.watchEvents, watchSessions: backup.watchSessions })) });
    await expect(page.locator('#import-status')).toHaveText('Import complete: 3 videos restored.');
    expect(await page.evaluate(() => db_getVideoById('sessiondemo'))).toMatchObject({ legacyWatchSeconds: 10, legacyTimeOffset: 50 });
    expect(await page.evaluate(() => db_getAllWatchSessions())).toHaveLength(2);
  } finally {
    await extension.close();
  }
});
