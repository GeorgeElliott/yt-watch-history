'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './test/pages',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  workers: 1,
  reporter: 'list'
});