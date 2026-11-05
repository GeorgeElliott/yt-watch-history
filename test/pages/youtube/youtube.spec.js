'use strict';

const { test, expect } = require('@playwright/test');
const { launchExtension, seedVideo } = require('../../helpers/extension.js');

const youtubeFeed = '<!doctype html><html><body><ytd-video-renderer><a id="thumbnail" href="/watch?v=feed-video"><ytd-thumbnail></ytd-thumbnail></a></ytd-video-renderer><ytd-rich-item-renderer id="short-item"><a id="thumbnail" href="/shorts/short-video"><ytd-thumbnail-view-model></ytd-thumbnail-view-model></a></ytd-rich-item-renderer></body></html>';

const mockYouTube = async (context) => {
  await context.route('https://www.youtube.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: youtubeFeed
  }));
};

test('YouTube feed adds resume badge and hides Shorts when configured', async () => {
  const extension = await launchExtension();

  try {
    const optionsPage = await extension.context.newPage();
    await optionsPage.goto(`chrome-extension://${extension.extensionId}/options.html`);
    const hideShortsToggle = optionsPage.locator('#hide-shorts-toggle');
    if (!(await hideShortsToggle.isChecked())) {
      await optionsPage.locator('label.toggle', { has: hideShortsToggle }).click();
    }
    await expect(hideShortsToggle).toBeChecked();

    const youtubePage = await extension.context.newPage();
    await seedVideo(optionsPage, {
      videoId: 'feed-video', title: 'Feed video', time: 20, duration: 100, watched: false
    });
    await mockYouTube(extension.context);
    await youtubePage.goto('https://www.youtube.com/feed/subscriptions');

    await expect(youtubePage.locator('#short-item')).toHaveCSS('display', 'none');
    await expect(youtubePage.locator('.ytwh-resume-badge')).toHaveText(/Resume/);
    await expect(youtubePage.locator('.ytwh-watch-menu-btn')).toBeVisible();
  } finally {
    await extension.close();
  }
});
// A silent, synthetic WAV keeps this test independent of YouTube and user data.
test('ghost mode blocks automatic recording and resumes after disabling', async () => {
  test.setTimeout(60000);
  const extension = await launchExtension();
  try {
    const options = await extension.context.newPage();
    await options.goto(`chrome-extension://${extension.extensionId}/options.html`);
    await seedVideo(options, { videoId: 'existing-demo', title: 'Existing demo', timestamp: 1700000000000 });
    await seedVideo(options, { videoId: 'ghost-demo', title: 'Ghost demo', time: 1, duration: 3, timestamp: 1600000000000 });
    await options.evaluate(() => chrome.storage.local.set({ ghostModeActive: true }));
    const before = await options.evaluate(() => db_getBackupData());
    const samples = 8000 * 3;
    const wav = Buffer.alloc(44 + samples);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + samples, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28);
    wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36);
    wav.writeUInt32LE(samples, 40); wav.fill(128, 44);
    const body = `<html><head><title>Demo - YouTube</title></head><body><video muted src="data:audio/wav;base64,${wav.toString('base64')}"></video></body></html>`;
    await extension.context.route('https://www.youtube.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body }));
    const page = await extension.context.newPage();
    await page.goto('https://www.youtube.com/watch?v=ghost-demo');
    await page.waitForTimeout(2000);
    await page.locator('video').evaluate(async video => { await video.play(); });
    await page.waitForTimeout(2200);
    await page.locator('video').evaluate(video => { video.pause(); video.dispatchEvent(new Event('ended')); });
    await page.waitForTimeout(500);
    expect(await options.evaluate(() => db_getBackupData())).toEqual(before);
    await options.evaluate(() => chrome.storage.local.set({ ghostModeActive: false }));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
    await page.waitForTimeout(300);
    expect(await options.evaluate(() => db_getBackupData())).toEqual(before);
    await page.locator('video').evaluate(async video => { video.currentTime = 0; await video.play(); });
    await page.waitForTimeout(1400);
    await page.locator('video').evaluate(video => { video.currentTime = 2.99; video.dispatchEvent(new Event('ended')); });
    await expect.poll(() => options.evaluate(() => db_getVideoById('ghost-demo'))).toMatchObject({ watched: true });
    const after = await options.evaluate(() => db_getBackupData());
    expect(after.watchEvents.filter(event => event.videoId === 'ghost-demo')).toHaveLength(1);
    expect(after.watchSessions.filter(session => session.videoId === 'ghost-demo')
      .reduce((sum, session) => sum + session.seconds, 0)).toBeLessThanOrEqual(2);
    expect(after.videos.find(video => video.videoId === 'existing-demo'))
      .toEqual(before.videos.find(video => video.videoId === 'existing-demo'));
  } finally {
    await extension.close();
  }
});

test('thumbnail action creates an unseen video without recording a viewing', async () => {
  const extension = await launchExtension();
  try {
    const options = await extension.context.newPage();
    await options.goto(`chrome-extension://${extension.extensionId}/options.html`);
    await mockYouTube(extension.context);
    const page = await extension.context.newPage();
    await page.goto('https://www.youtube.com/feed/subscriptions');
    const renderer = page.locator('ytd-video-renderer');
    await renderer.locator('.ytwh-watch-menu-btn').click();
    const start = Date.now();
    await renderer.locator('.ytwh-watch-menu-item').click();
    await expect.poll(() => options.evaluate(() => db_getVideoById('feed-video'))).toMatchObject({ watched: true, watchCount: 1, time: 0, manualCompletion: true });
    const video = await options.evaluate(() => db_getVideoById('feed-video'));
    expect(video.manualOnly).toBe(true);
    expect(video.timestamp).toBeGreaterThanOrEqual(start);
    expect(video.timestamp).toBeLessThanOrEqual(Date.now());
    expect(await options.evaluate(() => db_getAllWatchEvents())).toMatchObject([{ videoId: 'feed-video', manual: true, watchedAt: video.manualCompletedAt }]);
    expect(await options.evaluate(() => db_getAllWatchSessions())).toHaveLength(0);
    const timeline = await extension.context.newPage();
    await timeline.goto(`chrome-extension://${extension.extensionId}/timeline.html`);
    await expect(timeline.locator('.empty-state')).toBeVisible();
  } finally {
    await extension.close();
  }
});
