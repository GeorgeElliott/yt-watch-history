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