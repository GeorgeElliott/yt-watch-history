'use strict';

const { test, expect } = require('@playwright/test');
const { launchExtension } = require('../../helpers/extension.js');

const extensionPages = [
  { name: 'history.html', marker: '#version-number' },
  { name: 'timeline.html', marker: '#version-number' },
  { name: 'stats.html', marker: '#version-number' },
  { name: 'options.html', marker: '#version-number' },
  { name: 'how-it-works.html', marker: '#version-number' },
  { name: 'popup.html', marker: '.popup-header' }
];

test('unpacked extension starts and every page loads', async () => {
  const extension = await launchExtension();

  try {
    const manifest = await extension.serviceWorker.evaluate(() => chrome.runtime.getManifest());

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('WatchHistory for YouTube™');

    for (const { name, marker } of extensionPages) {
      const page = await extension.context.newPage();
      await page.goto(`chrome-extension://${extension.extensionId}/${name}`);
      await expect(page.locator(marker)).toBeVisible();
      if (marker === '#version-number') {
        await expect(page.locator(marker)).toHaveText(manifest.version);
      }
      await page.close();
    }
  } finally {
    await extension.close();
  }
});