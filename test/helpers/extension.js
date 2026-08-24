'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');

const extensionPath = path.resolve(__dirname, '../../src');
const backupPath = process.env.YT_HISTORY_BACKUP
  || path.resolve(__dirname, '../fixtures/watch-history-sample.json');

const launchExtension = async () => {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-watch-history-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
  const serviceWorker = context.serviceWorkers()[0]
    || await context.waitForEvent('serviceworker');
  await new Promise((resolve) => setTimeout(resolve, 500));

  return {
    context,
    extensionId: new URL(serviceWorker.url()).host,
    serviceWorker,
    close: async () => {
      await context.close();
      await fs.rm(userDataDir, { recursive: true, force: true });
    }
  };
};

const importBackup = async (extension, expectedVideoCount = null) => {
  const optionsPage = await extension.context.newPage();
  await optionsPage.goto(`chrome-extension://${extension.extensionId}/options.html`);
  const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  const count = expectedVideoCount || backup.history.length;

  await optionsPage.locator('#import-file').setInputFiles(backupPath);
  await expect(optionsPage.locator('#import-status'))
    .toHaveText(`Import complete: ${count.toLocaleString()} videos restored.`, {
      timeout: 30000
    });
  return { optionsPage, count };
};

const seedVideo = async (page, video = {}) => {
  const seededVideo = {
    videoId: 'context-menu-test-video',
    title: 'Context menu test video',
    channel: 'Context menu test channel',
    channelUrl: 'https://www.youtube.com/@context-menu-test',
    time: 12,
    duration: 120,
    watched: false,
    watchCount: 0,
    timestamp: Date.now(),
    ...video
  };
  await page.evaluate(async (record) => db_saveVideo(record), seededVideo);
};

module.exports = { backupPath, importBackup, launchExtension, seedVideo };