'use strict';

const fs = require('node:fs/promises');
const { test, expect } = require('@playwright/test');
const { backupPath, importBackup, launchExtension } = require('../../helpers/extension.js');

const subscriptionsPage = '<!doctype html><html><body><main id="primary"><ytd-section-list-renderer><div id="contents"><div id="existing-feed">Subscriptions feed</div></div></ytd-section-list-renderer></main></body></html>';

const mockSubscriptionsPage = async (context) => {
  await context.route('https://www.youtube.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: subscriptionsPage
  }));
};

test('subscriptions page shows the Continue Watching shelf from imported history', async () => {
  try {
    await fs.access(backupPath);
  } catch {
    test.skip(true, `Backup fixture not found: ${backupPath}`);
  }

  const extension = await launchExtension();

  try {
    await importBackup(extension);

    const optionsPage = await extension.context.newPage();
    await optionsPage.goto(`chrome-extension://${extension.extensionId}/options.html`);
    const shelfToggle = optionsPage.locator('#pickup-shelf-toggle');
    if (!(await shelfToggle.isChecked())) {
      await optionsPage.locator('label.toggle', { has: shelfToggle }).click();
    }
    await expect(shelfToggle).toBeChecked();

    await mockSubscriptionsPage(extension.context);
    const youtubePage = await extension.context.newPage();
    await youtubePage.goto('https://www.youtube.com/feed/subscriptions');

    const shelf = youtubePage.locator('#ytwh-pickup-shelf');
    await expect(shelf).toBeVisible({ timeout: 10000 });
    await expect(shelf.locator('xpath=..')).toHaveJSProperty('tagName', 'DIV');
    await expect(shelf.locator('xpath=../..')).toHaveJSProperty('tagName', 'YTD-SECTION-LIST-RENDERER');
    await expect(shelf.locator('.whyt-shelf-title')).toHaveText('Continue Watching');
    await expect(shelf.locator('.ytwh-video-card')).not.toHaveCount(0);
    await expect(shelf.locator('.ytwh-video-card .ytwh-shelf-card-link').first()).toHaveAttribute(
      'href',
      /https:\/\/www\.youtube\.com\/watch\?v=/
    );
    await expect(shelf.locator('button', { hasText: 'View All History' })).toBeVisible();
  } finally {
    await extension.close();
  }
});

test('shelf filters, paginates, and applies actions without losing expanded capacity', async () => {
  test.setTimeout(60000);
  const extension = await launchExtension();
  try {
    const options = await extension.context.newPage();
    await options.goto(`chrome-extension://${extension.extensionId}/options.html`);
    await options.evaluate(async () => {
      for (let i = 0; i < 35; i++) {
        await db_saveVideo({ videoId: `demo-${String(i).padStart(2, '0')}`, title: `Demo ${i}`,
          channel: 'Demo channel', time: 96, duration: 100, watched: false, watchCount: 2,
          timestamp: 1700000000000 + i, liveReplay: i === 34 });
      }
      for (const video of [
        { videoId: 'completed', watched: true, time: 20 },
        { videoId: 'zero', watched: false, time: 0 },
        { videoId: 'live', watched: false, time: 20, live: true }
      ]) await db_saveVideo({ title: video.videoId, duration: 100, timestamp: 1800000000000, ...video });
      await db_recordWatchEvent({ videoId: 'demo-34', watchedAt: 1600000000000 });
      await db_recordWatchSession({ videoId: 'demo-34', watchedAt: 1600000000000, seconds: 40, streamType: 'liveReplay' });
    });
    await mockSubscriptionsPage(extension.context);
    const page = await extension.context.newPage();
    await page.goto('https://www.youtube.com/feed/subscriptions');
    const shelf = page.locator('#ytwh-pickup-shelf');
    const cards = shelf.locator('.ytwh-video-card');
    const more = shelf.getByRole('button', { name: 'Load more' });
    await expect(more).toHaveAttribute('title', 'Load more videos');
    await expect(cards).toHaveCount(15);
    await expect(cards.first()).toHaveAttribute('data-video-id', 'demo-34');
    await expect(cards.first().locator('.ytwh-shelf-card-link')).toHaveAttribute('href', /t=96s/);
    await expect(shelf.locator('[data-video-id="completed"], [data-video-id="zero"], [data-video-id="live"]')).toHaveCount(0);
    await expect(shelf.getByRole('button', { name: 'View All History' })).toBeVisible();
    const row = shelf.locator('#ytwh-shelf-videos');
    const rowBox = await row.boundingBox();
    await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + 40);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => row.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await page.mouse.wheel(0, -300);
    await expect.poll(() => row.evaluate(element => element.scrollLeft)).toBe(0);
    const wheelHandling = await row.evaluate(element => {
      const sendWheel = (options) => {
        const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...options });
        element.dispatchEvent(event);
        return event.defaultPrevented;
      };
      const atStart = sendWheel({ deltaY: -120 });
      element.scrollLeft = element.scrollWidth;
      const atEnd = sendWheel({ deltaY: 120 });
      element.scrollLeft = 0;
      return {
        atStart,
        atEnd,
        zoom: sendWheel({ deltaY: 120, ctrlKey: true }),
        horizontal: sendWheel({ deltaX: 120, deltaY: 0 }),
        moving: sendWheel({ deltaY: 120 })
      };
    });
    expect(wheelHandling).toEqual({ atStart: true, atEnd: true, zoom: false, horizontal: false, moving: true });
    await more.click();
    await expect(cards).toHaveCount(30);
    await expect(shelf.locator('[aria-live="polite"]')).toHaveText('15 videos added');

    const menuButton = (id) => shelf.locator(`[data-video-id="${id}"] .ytwh-shelf-menu-btn`);
    await menuButton('demo-34').click();
    await expect(menuButton('demo-34')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menuButton('demo-34')).toBeFocused();
    await expect(menuButton('demo-34')).toHaveAttribute('aria-expanded', 'false');
    await extension.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://www.youtube.com' });
    await menuButton('demo-34').click();
    await page.locator('.ytwh-shelf-menu').getByRole('button', { name: 'Copy link' }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('https://www.youtube.com/watch?v=demo-34');
    await menuButton('demo-34').click();
    await page.locator('.whyt-shelf-title').click();
    await expect(page.locator('.ytwh-shelf-menu')).toHaveCount(0);
    await menuButton('demo-34').click();
    const scrollBeforeAction = await shelf.locator('#ytwh-shelf-videos').evaluate(row => row.scrollLeft);
    await page.locator('.ytwh-shelf-menu').getByRole('button', { name: 'Mark as watched' }).click();
    await expect(shelf.locator('[data-video-id="demo-34"]')).toHaveCount(0);
    await expect(cards).toHaveCount(30);
    expect(await shelf.locator('#ytwh-shelf-videos').evaluate(row => row.scrollLeft)).toBe(scrollBeforeAction);
    const marked = await options.evaluate(() => db_getVideoById('demo-34'));
    expect(marked).toMatchObject({ watched: true, time: 96, timestamp: 1700000000034, watchCount: 2 });
    expect((await options.evaluate(() => db_getAllWatchEvents())).filter(e => e.videoId === 'demo-34')).toHaveLength(1);
    expect((await options.evaluate(() => db_getAllWatchSessions())).filter(e => e.videoId === 'demo-34')).toHaveLength(1);

    await menuButton('demo-33').click();
    await page.locator('.ytwh-shelf-menu').getByRole('button', { name: 'Reset progress' }).click();
    await expect(shelf.locator('[data-video-id="demo-33"]')).toHaveCount(0);
    await expect(cards).toHaveCount(30);
    expect(await options.evaluate(() => db_getVideoById('demo-33'))).toMatchObject({ watched: false, time: 0, timestamp: 1700000000033, watchCount: 2 });
    await menuButton('demo-32').click();
    await page.locator('.ytwh-shelf-menu').getByRole('button', { name: 'Remove from history' }).click();
    await expect(shelf.locator('[data-video-id="demo-32"]')).toHaveCount(0);
    await expect(cards).toHaveCount(30);
    expect(await options.evaluate(() => db_getVideoById('demo-32'))).toBeNull();
    await more.click();
    await expect(cards).toHaveCount(32);
    await expect(more).toBeHidden();
    await expect(cards.nth(30).locator('.ytwh-shelf-card-link')).toBeFocused();
    const ids = await cards.evaluateAll(elements => elements.map(element => element.dataset.videoId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(page.url()).toBe('https://www.youtube.com/feed/subscriptions');
  } finally {
    await extension.close();
  }
});

test('shelf stays hidden when there are no resumable videos on Home', async () => {
  const extension = await launchExtension();
  try {
    const options = await extension.context.newPage();
    await options.goto(`chrome-extension://${extension.extensionId}/options.html`);
    await options.evaluate(async () => {
      await chrome.storage.local.set({ subsRedirect: false });
      await db_saveVideo({ videoId: 'done', title: 'Done', watched: true, time: 100, duration: 100, timestamp: 100 });
      await db_saveVideo({ videoId: 'live', title: 'Live', watched: false, live: true, time: 50, duration: 0, timestamp: 101 });
    });
    await mockSubscriptionsPage(extension.context);
    const page = await extension.context.newPage();
    await page.goto('https://www.youtube.com/');
    await page.waitForTimeout(2200);
    await expect(page.locator('#ytwh-pickup-shelf')).toHaveCount(0);
    await options.evaluate(() => db_saveVideo({ videoId: 'one', title: 'One', watched: false, time: 10, duration: 100, timestamp: 102 }));
    await page.reload();
    await expect(page.locator('#ytwh-pickup-shelf .ytwh-video-card')).toHaveCount(1);
    await page.locator('.ytwh-shelf-menu-btn').click();
    await page.locator('.ytwh-shelf-menu').getByRole('button', { name: 'Mark as watched' }).click();
    await expect(page.locator('#ytwh-pickup-shelf')).toHaveCount(0);
    expect(await options.evaluate(() => db_getVideoById('one'))).toMatchObject({ watched: true, watchCount: 1, time: 10, timestamp: 102 });
    expect(await options.evaluate(() => db_getAllWatchEvents())).toMatchObject([{ videoId: 'one', manual: true }]);
    expect(await options.evaluate(() => db_getAllWatchSessions())).toHaveLength(0);
  } finally {
    await extension.close();
  }
});

// These fixtures intentionally contain no YouTube account/session state.
for (const path of ['/', '/feed/subscriptions']) {
  for (const redirect of [false, true]) {
    test(`local shelf on signed-out browse layout: ${path}, redirect=${redirect}`, async () => {
      const extension = await launchExtension();
      try {
        const options = await extension.context.newPage();
        await options.goto(`chrome-extension://${extension.extensionId}/options.html`);
        await options.evaluate(async (subsRedirect) => {
          await chrome.storage.local.set({ subsRedirect, pickupShelf: true });
          await db_saveVideo({ videoId: 'local-only', title: 'Local video', watched: false,
            time: 12, duration: 120, timestamp: 100 });
        }, redirect);
        await extension.context.route('https://www.youtube.com/**', route => route.fulfill({
          contentType: 'text/html',
          body: `<ytd-page-manager><ytd-browse hidden><ytd-rich-grid-renderer><div id="contents"></div></ytd-rich-grid-renderer></ytd-browse></ytd-page-manager>
            <script>setTimeout(() => document.querySelector('ytd-page-manager').insertAdjacentHTML('beforeend',
              '<ytd-browse id="active"><ytd-background-promo-renderer>Sign in to see subscriptions</ytd-background-promo-renderer></ytd-browse>'), 1200);</script>`
        }));
        const page = await extension.context.newPage();
        await page.goto(`https://www.youtube.com${path}`).catch(() => {});
        if (redirect) await expect(page).toHaveURL('https://www.youtube.com/feed/subscriptions');
        const shelf = page.locator('#ytwh-pickup-shelf');
        await expect(shelf).toBeVisible();
        await expect(page.locator('#active > #ytwh-pickup-shelf .ytwh-video-card')).toHaveCount(1);
        await expect(page.locator('ytd-browse[hidden] #ytwh-pickup-shelf')).toHaveCount(0);
        await page.reload();
        await expect(shelf).toBeVisible();
        // A delayed feed replaces the empty-state mount without changing the URL.
        await page.evaluate(() => {
          document.querySelector('#active').innerHTML = '<ytd-section-list-renderer><div id="contents">Feed</div></ytd-section-list-renderer>';
        });
        await expect(page.locator('#active ytd-section-list-renderer #contents > #ytwh-pickup-shelf')).toBeVisible();
        await expect(shelf).toHaveCount(1);
        // Navigate away and back via SPA, initially retaining the hidden old page.
        await page.evaluate(() => {
          history.pushState({}, '', '/watch?v=local-only');
          document.querySelector('#active').hidden = true;
          document.dispatchEvent(new Event('yt-navigate-finish'));
        });
        await expect(shelf).toHaveCount(0);
        await page.evaluate(() => {
          history.pushState({}, '', '/feed/subscriptions');
          document.body.insertAdjacentHTML('beforeend', '<ytd-browse id="destination" page-subtype="subscriptions"></ytd-browse>');
        });
        await expect(page.locator('#destination > #ytwh-pickup-shelf')).toBeVisible();
        await expect(shelf).toHaveCount(1);
        await options.evaluate(() => chrome.storage.local.set({ pickupShelf: false }));
        await expect(shelf).toHaveCount(0);
        await page.evaluate(() => document.body.appendChild(document.createElement('div')));
        await page.waitForTimeout(1000);
        await expect(shelf).toHaveCount(0);
        await options.evaluate(() => chrome.storage.local.set({ pickupShelf: true }));
        await expect(shelf).toBeVisible();
        // Authentication pages are never shelf destinations.
        await page.evaluate(() => {
          history.pushState({}, '', '/signin');
          document.body.appendChild(document.createElement('div'));
        });
        await expect(shelf).toHaveCount(0);
      } finally {
        await extension.close();
      }
    });
  }
}
