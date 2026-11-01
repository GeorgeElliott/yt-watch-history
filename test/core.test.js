'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_SETTINGS,
  formatDuration,
  getLegacyWatchSeconds,
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

test('manual marking credits an initial completion and preserves position and viewing date', () => {
  const { video, creditedWatch } = toggleWatchedState(
    { videoId: 'video', watched: false, time: 12, duration: 100, timestamp: 1000 },
    95,
    null,
    1234
  );

  assert.equal(video.watched, true);
  assert.equal(video.watchCount, 1);
  assert.equal(video.time, 12);
  assert.equal(video.timestamp, 1000);
  assert.equal(video.manualCompletedAt, 1234);
  assert.equal(creditedWatch, true);
  assert.equal(getLegacyWatchSeconds(video), 12);
});

test('toggling resets progress without credit when below threshold', () => {
  const marked = toggleWatchedState(
    { videoId: 'video', watched: false, time: 94, duration: 100, watchCount: 2, timestamp: 987 },
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
  assert.equal(reset.video.timestamp, 987);
});

test('toggle creates a record from supplied feed metadata', () => {
  const { video, creditedWatch } = toggleWatchedState(null, 95, {
    videoId: 'new-video',
    title: 'Example',
    channel: 'Creator'
  }, 1234);

  assert.equal(video.videoId, 'new-video');
  assert.equal(video.title, 'Example');
  assert.equal(video.timestamp, 1234);
  assert.equal(video.watched, true);
  assert.equal(video.watchCount, 1);
  assert.equal(video.manualCompletion, true);
  assert.equal(creditedWatch, true);
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

test('manual mark and reset cycles never add repeat completions or estimated watch time', () => {
  const initial = { videoId: 'cycle', watched: false, watchCount: 0, time: 20, duration: 100, timestamp: 1000 };
  const marked = toggleWatchedState(initial, 95, null, 2000);
  const reset = toggleWatchedState(marked.video, 95, null, 3000);
  const again = toggleWatchedState(reset.video, 95, null, 4000);
  assert.equal(marked.creditedWatch, true);
  assert.equal(again.creditedWatch, false);
  assert.equal(again.video.watchCount, 1);
  assert.equal(again.video.timestamp, 1000);
  assert.equal(getLegacyWatchSeconds({ ...again.video, watchCount: 2, time: 50 }), 50);
});

test('a manual credit after a legacy reset does not inflate fallback time', () => {
  const existing = { watched: false, watchCount: 0, time: 0, duration: 100,
    legacyWatchSeconds: 30, legacyWatchCount: 0, timestamp: 1000 };
  const marked = toggleWatchedState(existing, 95, null, 2000);
  assert.equal(getLegacyWatchSeconds(marked.video), 30);
  assert.equal(getLegacyWatchSeconds({ ...marked.video, watchCount: 2, time: 40 }), 70);
});


test('first manual completion is independent of the playback threshold', () => {
  for (const threshold of [1, 95, 100]) {
    const result = toggleWatchedState({ watched: false, watchCount: 0, time: 0, duration: 100, timestamp: 10 }, threshold, null, 20);
    assert.equal(result.video.watchCount, 1);
    assert.equal(result.creditedWatch, true);
    assert.equal(getLegacyWatchSeconds(result.video), 0);
  }
});
