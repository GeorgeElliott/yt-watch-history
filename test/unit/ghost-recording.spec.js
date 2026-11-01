'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/core/content.js', 'utf8');
const tracking = source.slice(source.indexOf('let rewatchingVideoId'), source.indexOf('const isWatchPage'));
const recording = source.slice(source.indexOf('const _doSaveProgressInternal'), source.indexOf('//  Adaptive Save Interval'));

function harness(streamType = 'normal') {
  let now = 1000;
  const video = { currentTime: 0, duration: 100, paused: false };
  const messages = [];
  const callbacks = [];
  const context = vm.createContext({
    Date: { now: () => now }, URLSearchParams, Math, Number,
    window: { location: { search: '?v=demo' } },
    document: { hidden: false, title: 'Demo', querySelector: () => video },
    chrome: {
      storage: { local: { get: (_, callback) => callbacks.push(() => callback({ ghostModeActive: false, watchedThreshold: 95 })) } },
      runtime: { sendMessage: (message, callback) => { messages.push(message); if (callback) callbacks.push(() => callback({})); } }
    },
    isWatchPage: () => true, getVideoStreamState: () => streamType,
    getChannelName: () => '', getChannelUrl: () => '', invalidateHistoryCache: () => {}
  });
  vm.runInContext(`${tracking}\nconst WATCH_SESSION_SECONDS = 60;\n${recording}`, context);
  return { context, video, messages, callbacks, advance(seconds) { now += seconds * 1000; video.currentTime += seconds; }, run(code) { return vm.runInContext(code, context); } };
}

test('ghost boundaries discard buffered time and restart tracking for normal, live, and replay', () => {
  for (const type of ['normal', 'live', 'liveReplay']) {
    const h = harness(type);
    h.run('ghostModeActive = false; saveProgress()');
    h.advance(10);
    h.run('saveProgress(); ghostModeActive = true; recordingGeneration++; resetRecordingTracking()');
    h.advance(20);
    h.run('saveProgress(); flushActiveWatchTime(document.querySelector("video"), "demo", getVideoStreamState())');
    assert.equal(h.messages.filter(m => m.type === 'idb-record-watch-session').length, 0);
    h.run('ghostModeActive = false; recordingGeneration++; resetRecordingTracking(); saveProgress()');
    h.advance(5);
    h.run('flushActiveWatchTime(document.querySelector("video"), "demo", getVideoStreamState())');
    const sessions = h.messages.filter(m => m.type === 'idb-record-watch-session');
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].watchSession.seconds, 5);
    assert.equal(sessions[0].watchSession.streamType, type);
  }
});



test('pending settings callbacks cannot save across a ghost transition', () => {
  const h = harness();
  h.run('ghostModeActive = false; saveProgressImmediate()');
  h.run('ghostModeActive = true; recordingGeneration++; resetRecordingTracking(); ghostModeActive = false; recordingGeneration++');
  h.callbacks.shift()();
  assert.equal(h.messages.filter(m => m.type === 'idb-record-playback').length, 0);
});

test('a ghost exit does not save until playback advances outside ghost mode', () => {
  const h = harness();
  h.video.currentTime = 50;
  h.run('ghostModeActive = false; ghostExitBaseline = { videoId: "demo", progress: 0.5, time: 50, token: "exit", observedPlayback: false }; saveProgressImmediate()');
  h.callbacks.shift()();
  assert.equal(h.messages.filter(m => m.type === 'idb-record-playback').length, 0);
  h.run('recordActiveWatchTime(document.querySelector("video"), "demo", "normal")');
  h.advance(5);
  h.run('recordActiveWatchTime(document.querySelector("video"), "demo", "normal"); saveProgressImmediate()');
  h.callbacks.shift()();
  const sample = h.messages.find(m => m.type === 'idb-record-playback').sample;
  assert.equal(sample.currentTime, 55);
  assert.equal(sample.ghostExit.time, 50);
});

test('completion reached during ghost mode remains suppressed after playback resumes', () => {
  const h = harness();
  h.video.currentTime = 99;
  h.run('ghostModeActive = false; ghostExitBaseline = { videoId: "demo", progress: 0.99, time: 98, token: "exit", observedPlayback: true }; saveProgressImmediate()');
  h.callbacks.shift()();
  assert.equal(h.messages.find(m => m.type === 'idb-record-playback').sample.suppressCompletion, true);
});

test('playback sends a completion sample and claims a rewatch only once', () => {
  const h = harness();
  h.video.currentTime = 96;
  h.run('ghostModeActive = false; rewatchingVideoId = "demo"; _doSaveProgressInternal(95); _doSaveProgressInternal(95)');
  const samples = h.messages.filter(m => m.type === 'idb-record-playback').map(m => m.sample);
  assert.equal(samples.length, 2);
  assert.equal(samples[0].progress, 0.96);
  assert.equal(samples[0].rewatch, true);
  assert.equal(samples[1].rewatch, false);
});

test('live playback after Ghost Mode starts from the exit time', () => {
  const h = harness('live');
  h.run('ghostModeActive = false; ghostExitBaseline = { videoId: "demo", progress: 0, time: 50, token: "exit", observedPlayback: false }; recordActiveWatchTime(document.querySelector("video"), "demo", "live")');
  h.advance(5);
  h.run('flushActiveWatchTime(document.querySelector("video"), "demo", "live"); saveProgressImmediate()');
  h.callbacks.shift()();
  const sessions = h.messages.filter(message => message.type === 'idb-record-watch-session');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].watchSession.seconds, 5);
  assert.equal(h.messages.find(message => message.type === 'idb-record-playback').sample.streamState, 'live');
});


test('a delayed settings callback keeps the original playback sample time', () => {
  const h = harness();
  h.run('ghostModeActive = false; saveProgressImmediate()');
  h.advance(5);
  h.callbacks.shift()();
  const sample = h.messages.find(message => message.type === 'idb-record-playback').sample;
  assert.equal(sample.sampleAt, 1000);
});
