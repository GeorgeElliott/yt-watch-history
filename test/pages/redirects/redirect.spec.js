'use strict';

const { test, expect } = require('@playwright/test');
const { launchExtension } = require('../../helpers/extension.js');

const youtubePage = '<!doctype html><html><body><main>YouTube test page</main></body></html>';

const mockYouTube = async (context) => {
  await context.route('https://www.youtube.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: youtubePage
  }));
};

const enableOption = async (extension, selector) => {
  const optionsPage = await extension.context.newPage();
  await optionsPage.goto(`chrome-extension://${extension.extensionId}/options.html`);
  const checkbox = optionsPage.locator(selector);
  await optionsPage.locator('label.toggle', { has: checkbox }).click();
  await expect(checkbox).toBeChecked();
};

const expectRedirect = (page, expectedUrl) =>
  expect.poll(() => page.url(), { timeout: 3000 }).toBe(expectedUrl);

test('history redirect setting sends YouTube history to extension history', async () => {
  const extension = await launchExtension();

  try {
    await enableOption(extension, '#redirect-toggle');
    await mockYouTube(extension.context);

    const youtubePage = await extension.context.newPage();
    await youtubePage.goto('https://www.youtube.com/feed/history').catch(() => {});
    await expectRedirect(
      youtubePage,
      `chrome-extension://${extension.extensionId}/history.html`
    );
  } finally {
    await extension.close();
  }
});

test('subscriptions redirect setting sends YouTube home to subscriptions', async () => {
  const extension = await launchExtension();

  try {
    await enableOption(extension, '#subs-redirect-toggle');
    await mockYouTube(extension.context);

    const youtubePage = await extension.context.newPage();
    await youtubePage.goto('https://www.youtube.com/').catch(() => {});
    await expectRedirect(youtubePage, 'https://www.youtube.com/feed/subscriptions');
  } finally {
    await extension.close();
  }
});

test('subscriptions redirect setting sends YouTube Shorts to subscriptions', async () => {
  const extension = await launchExtension();

  try {
    await enableOption(extension, '#subs-redirect-toggle');
    await mockYouTube(extension.context);

    const youtubePage = await extension.context.newPage();
    await youtubePage.goto('https://www.youtube.com/shorts/').catch(() => {});
    await expectRedirect(youtubePage, 'https://www.youtube.com/feed/subscriptions');
  } finally {
    await extension.close();
  }
});