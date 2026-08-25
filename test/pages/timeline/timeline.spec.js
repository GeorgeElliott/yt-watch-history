'use strict';

const fs = require('node:fs/promises');
const { test, expect } = require('@playwright/test');
const { backupPath, importBackup, launchExtension } = require('../../helpers/extension.js');

test('imports a backup and populates the timeline page', async () => {
  try {
    await fs.access(backupPath);
  } catch {
    test.skip(true, `Backup fixture not found: ${backupPath}`);
  }

  const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
  const extension = await launchExtension();

  try {
    await importBackup(extension, backup.history.length);

    const timelinePage = await extension.context.newPage();
    await timelinePage.goto(`chrome-extension://${extension.extensionId}/timeline.html`);

    await expect(timelinePage.locator('#timeline-loading'))
      .toHaveText(/Scroll for more|You have reached the beginning of your history\./);
    await expect(timelinePage.locator('.timeline-entry').first()).toBeVisible();
    await expect(timelinePage.locator('.timeline-day').first()).toBeVisible();
    await expect(timelinePage.locator('#timeline-year-picker')).toBeEnabled();
    await expect(timelinePage.locator('#timeline-month-picker')).toBeEnabled();
    await expect(timelinePage.locator('#timeline-go-button')).toBeEnabled();
    expect(await timelinePage.locator('.timeline-entry').count()).toBeGreaterThan(0);

    const backToTop = timelinePage.locator('#timeline-back-to-top');
    await expect(backToTop).toBeHidden();
    await timelinePage.evaluate(() => window.scrollTo(0, window.innerHeight + 1));
    await expect(backToTop).toBeVisible();
    await backToTop.click();
    await expect.poll(() => timelinePage.evaluate(() => window.scrollY)).toBeLessThan(2);
  } finally {
    await extension.close();
  }
});

test('timeline shows activity gaps and archived month choices', async () => {
  const extension = await launchExtension();

  try {
    const timelinePage = await extension.context.newPage();
    await timelinePage.goto(`chrome-extension://${extension.extensionId}/timeline.html`);
    await timelinePage.evaluate(async () => {
      await db_saveVideo({ videoId: 'timeline-old', title: 'Older timeline video', time: 0, duration: 0,
        watched: false, watchCount: 0, timestamp: new Date(2024, 0, 15, 12).getTime() });
      await db_saveVideo({ videoId: 'timeline-new', title: 'Newer timeline video', time: 0, duration: 0,
        watched: false, watchCount: 0, timestamp: new Date(2024, 0, 20, 12).getTime() });
    });
    await timelinePage.reload();

    await expect(timelinePage.locator('.timeline-day')).toHaveCount(2);
    await expect(timelinePage.locator('.timeline-gap')).toHaveCount(1);
    await expect(timelinePage.locator('#timeline-year-picker option')).toHaveText(['2024']);
    await expect(timelinePage.locator('#timeline-month-picker option')).toHaveText(['January']);
    await expect(timelinePage.locator('#timeline-go-button')).toBeEnabled();
  } finally {
    await extension.close();
  }
});