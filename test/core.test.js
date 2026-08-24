'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_SETTINGS,
  formatDuration,
  getVideoProgress,
  getVideoThumbnailUrl,
  getVideoUrl,
  getWatchCount,
  toggleWatchedState
} = require('../src/core/core.js');

test('default settings preserve every extension preference', () => {
  assert.equal(DEFAULT_SETTINGS.watchedThreshold, 95);
  assert.equal(DEFAULT_SETTINGS.firstTimeSetupComplete, false);
  assert.equal(DEFAULT_SETTINGS.ghostModeActive, false);
});

test('watch count treats legacy watched records as one completion', () => {
  assert.equal(getWatchCount({ watched: true }), 1);
  assert.equal(getWatchCount({ watched: false }), 0);
  assert.equal(getWatchCount({ watched: true, watchCount: 4 }), 4);
});

test('video URL resumes only unfinished standard videos', () => {
  assert.equal(
    getVideoUrl({ videoId: 'abc 123', time: 42, watched: false }),
    'https://www.youtube.com/watch?v=abc%20123&t=42s'
  );
  assert.equal(
    getVideoUrl({ videoId: 'abc', time: 42, watched: true }),
    'https://www.youtube.com/watch?v=abc'
  );
  assert.equal(formatDuration(3725), '1h 2m');
  assert.equal(getVideoProgress({ time: 25, duration: 100 }), 0.25);
  assert.equal(
    getVideoThumbnailUrl('abc 123'),
    'https://i.ytimg.com/vi/abc%20123/mqdefault.jpg'
  );
  assert.equal(
    getVideoUrl({ videoId: 'live', time: 42, watched: false, live: true }),
    'https://www.youtube.com/watch?v=live'
  );
  assert.equal(getVideoProgress({ time: 20, duration: 0 }), 0);
});

test('toggling a qualifying legacy record credits a completion', () => {
  const { video, creditedWatch } = toggleWatchedState(
    { videoId: 'video', watched: false, time: 95, duration: 100 },
    95,
    null,
    1234
  );

  assert.equal(video.watched, true);
  assert.equal(video.watchCount, 1);
  assert.equal(video.timestamp, 1234);
  assert.equal(creditedWatch, true);
});

test('toggling resets progress without credit when below threshold', () => {
  const marked = toggleWatchedState(
    { videoId: 'video', watched: false, time: 94, duration: 100, watchCount: 2 },
    95,
    null,
    1234
  );
  const reset = toggleWatchedState(marked.video, 95, null, 1235);

  assert.equal(marked.creditedWatch, false);
  assert.equal(marked.video.watchCount, 2);
  assert.equal(reset.video.watched, false);
  assert.equal(reset.video.time, 0);
  assert.equal(reset.video.watchCount, 2);
});

test('toggle creates a record from supplied feed metadata', () => {
  const { video, creditedWatch } = toggleWatchedState(null, 95, {
    videoId: 'new-video',
    title: 'Example',
    channel: 'Creator'
  }, 1234);

  assert.equal(video.videoId, 'new-video');
  assert.equal(video.title, 'Example');
  assert.equal(video.watched, true);
  assert.equal(video.watchCount, 0);
  assert.equal(creditedWatch, false);
});

test('toggling a previously watched legacy record resets without changing its count', () => {
  const { video, creditedWatch } = toggleWatchedState(
    { videoId: 'legacy', watched: true, time: 100, duration: 100 },
    95,
    null,
    1234
  );

  assert.equal(video.watched, false);
  assert.equal(video.time, 0);
  assert.equal(video.watchCount, 1);
  assert.equal(creditedWatch, false);
});