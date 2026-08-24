'use strict';

const { test, expect } = require('@playwright/test');
const { launchExtension } = require('../../helpers/extension.js');

const setToggle = async (page, selector, enabled) => {
  const toggle = page.locator(selector);
  if ((await toggle.isChecked()) !== enabled) {
    await page.locator('label.toggle', { has: toggle }).click();
  }
  await expect(toggle).toBeChecked({ checked: enabled });
};

test('options persist display, playback, redirect, and backup settings', async () => {
  const extension = await launchExtension();

  try {
    const optionsPage = await extension.context.newPage();
    await optionsPage.goto(`chrome-extension://${extension.extensionId}/options.html`);
    await setToggle(optionsPage, '#badge-toggle', false);
    await setToggle(optionsPage, '#redirect-toggle', true);
    await setToggle(optionsPage, '#subs-redirect-toggle', true);
    await setToggle(optionsPage, '#hide-shorts-toggle', true);
    await setToggle(optionsPage, '#hide-watched-default-toggle', true);
    await setToggle(optionsPage, '#pickup-shelf-toggle', false);
    await setToggle(optionsPage, '#background-playback-toggle', true);
    await setToggle(optionsPage, '#ghostModeOptions', true);
    await optionsPage.locator('#watched-threshold-input').fill('82');
    await optionsPage.locator('#watched-threshold-input').press('Tab');
    await optionsPage.locator('#backup-reminder-select').selectOption('monthly');
    await optionsPage.reload();

    await expect(optionsPage.locator('#badge-toggle')).not.toBeChecked();
    await expect(optionsPage.locator('#redirect-toggle')).toBeChecked();
    await expect(optionsPage.locator('#subs-redirect-toggle')).toBeChecked();
    await expect(optionsPage.locator('#hide-shorts-toggle')).toBeChecked();
    await expect(optionsPage.locator('#hide-watched-default-toggle')).toBeChecked();
    await expect(optionsPage.locator('#pickup-shelf-toggle')).not.toBeChecked();
    await expect(optionsPage.locator('#background-playback-toggle')).toBeChecked();
    await expect(optionsPage.locator('#ghostModeOptions')).toBeChecked();
    await expect(optionsPage.locator('#watched-threshold-input')).toHaveValue('82');
    await expect(optionsPage.locator('#backup-reminder-select')).toHaveValue('monthly');
  } finally {
    await extension.close();
  }
});