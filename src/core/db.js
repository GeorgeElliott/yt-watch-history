/**
 * IndexedDB wrapper for WatchHistory.
 *
 * Loaded by: background.js (service worker), popup.html, history.html, options.html.
 * NOT loaded by content.js — content scripts can't access extension IDB, so they
 * message the background worker instead, which proxies IDB calls for them.
 *
 * Videos store schema:
 *   videoId {string}   — YouTube video ID (primary key)
 *   title, channel, channelUrl {string}
 *   time, duration {number}    — playback position and total length
 *   watched {boolean}          - completed or manually marked watched
 *   watchCount {number}        — how many times the video has been fully
 *                                watched (incremented on each not-watched →
 *                                watched transition)
 *   live {true|undefined}      — set for livestreams only
 *   liveReplay {true|undefined} — set for completed livestream replays
 *   timestamp {number}         - last viewing, or manual creation time
 *   manualOnly {true|undefined} - created manually and not yet played
 *   manualCompletion, manualCompletedAt - distinguish an initial manual credit
 *   legacyWatchSeconds, legacyWatchCount, legacyTimeOffset {number|undefined}
 *                               - preserved pre-reset or pre-Ghost estimate
 *   ghostBaselineToken, manualUpdatedAt - prevent duplicate snapshots and stale writes
 *
 * Watch events store schema:
 *   id {number}                 — auto-increment primary key
 *   videoId {string}            — references a videos.videoId record
 *   watchedAt {number}          — when the watch was completed
 *   manual {true|undefined}    - watchedAt is an action date, not a viewing
 *   watchDurationSeconds {number|undefined} — optional duration
 *
 * Watch sessions store schema:
 *   id {number}           — auto-increment primary key
 *   videoId {string}      — references a videos.videoId record
 *   watchedAt {number}    — when the active interval ended
 *   seconds {number}      — seconds watched in the active interval
 *   streamType {string}   — normal, live, or liveReplay
 */
'use strict';

// Database config
const DB_NAME       = 'ytwh';
const DB_VERSION    = 3;
const STORE_VIDEOS  = 'videos';
const STORE_EVENTS  = 'watchEvents';
const STORE_SESSIONS = 'watchSessions';
const IDX_TIMESTAMP = 'idx_timestamp'; // secondary index on timestamp for sorting
const IDX_EVENT_VIDEO_ID = 'idx_video_id';
const IDX_EVENT_WATCHED_AT = 'idx_watched_at';
const IDX_SESSION_VIDEO_ID = 'idx_session_video_id';
const IDX_SESSION_WATCHED_AT = 'idx_session_watched_at';

function db_getVersion() {
  return DB_VERSION;
}

function db_getStoredVersion() {
  if (typeof indexedDB.databases !== 'function') return Promise.resolve(null);

  return indexedDB.databases().then((databases) => {
    const database = databases.find((entry) => entry.name === DB_NAME);
    return database ? database.version : 0;
  });
}

function db_getBackupData() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);

    request.onsuccess = (event) => {
      const db = event.target.result;
      const storeNames = [STORE_VIDEOS];
      if (db.objectStoreNames.contains(STORE_EVENTS)) storeNames.push(STORE_EVENTS);
      if (db.objectStoreNames.contains(STORE_SESSIONS)) storeNames.push(STORE_SESSIONS);

      const tx = db.transaction(storeNames, 'readonly');
      const videosRequest = tx.objectStore(STORE_VIDEOS).getAll();
      const eventsRequest = storeNames.includes(STORE_EVENTS)
        ? tx.objectStore(STORE_EVENTS).getAll()
        : null;
      const sessionsRequest = storeNames.includes(STORE_SESSIONS)
        ? tx.objectStore(STORE_SESSIONS).getAll()
        : null;

      tx.oncomplete = () => {
        db.close();
        resolve({
          videos: videosRequest.result || [],
          watchEvents: eventsRequest ? eventsRequest.result || [] : [],
          watchSessions: sessionsRequest ? sessionsRequest.result || [] : []
        });
      };
      tx.onerror = (error) => {
        db.close();
        reject(error.target.error);
      };
    };

    request.onerror = (event) => reject(event.target.error);
    request.onblocked = () => reject(new Error('[YTWH] Backup read blocked by another tab'));
  });
}

// Cache the open connection to avoid repeated open requests
let _dbConnection = null;

// Open the database. Returns cached connection on subsequent calls.
function openDB() {
  // Return the cached connection if we already have one open.
  if (_dbConnection) {
    return Promise.resolve(_dbConnection);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Schema setup
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create the 'videos' object store only if it doesn't
      // exist yet (guards against re-running on version bumps).
      if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
        const store = db.createObjectStore(STORE_VIDEOS, {
          keyPath: 'videoId' // The YouTube video ID is the primary key
        });

        // Secondary index on 'timestamp' — lets us efficiently
        // retrieve videos in chronological order without loading
        // and sorting the entire store in JavaScript.
        store.createIndex(IDX_TIMESTAMP, 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        const store = db.createObjectStore(STORE_EVENTS, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex(IDX_EVENT_VIDEO_ID, 'videoId', { unique: false });
        store.createIndex(IDX_EVENT_WATCHED_AT, 'watchedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex(IDX_SESSION_VIDEO_ID, 'videoId', { unique: false });
        store.createIndex(IDX_SESSION_WATCHED_AT, 'watchedAt', { unique: false });
      }

      const transaction = event.target.transaction;
      const videos = transaction.objectStore(STORE_VIDEOS).getAll();
      if (event.oldVersion < 3) {
        videos.onsuccess = () => {
          if (event.oldVersion < 2) {
            const eventStore = transaction.objectStore(STORE_EVENTS);
            eventStore.clear();

            (videos.result || []).forEach((video) => {
              const watchedAt = typeof video.timestamp === 'number'
                ? video.timestamp
                : Date.now();
              transaction.objectStore(STORE_VIDEOS).put({
                ...video,
                watchCount: 1
              });
              eventStore.add({
                videoId: video.videoId,
                watchedAt
              });
            });
          }

          if (event.oldVersion >= 3) return;
          const sessionStore = transaction.objectStore(STORE_SESSIONS);
          (videos.result || []).forEach((video) => {
            if (video.manualOnly || Number.isFinite(video.legacyWatchSeconds)) return;
            const seconds = Math.floor(getLegacyWatchSeconds(video));
            if (seconds <= 0) return;
            sessionStore.add({
              videoId: video.videoId,
              watchedAt: typeof video.timestamp === 'number' ? video.timestamp : Date.now(),
              seconds,
              streamType: video.live ? 'live' : video.liveReplay ? 'liveReplay' : 'normal'
            });
          });
        };
      }
    };

    // Handle successful open
    request.onsuccess = (event) => {
      _dbConnection = event.target.result;

      // If the underlying connection is force-closed (e.g. the
      // database is deleted by another tab), clear the cache so
      // the next openDB() call re-opens it cleanly.
      _dbConnection.onclose = () => {
        _dbConnection = null;
      };

      // Close cleanly when another extension page replaces or deletes the DB.
      _dbConnection.onversionchange = () => {
        _dbConnection.close();
        _dbConnection = null;
      };

      resolve(_dbConnection);
    };

    // Error and block handling
    request.onerror   = (event) => reject(event.target.error);
    request.onblocked = ()      => reject(new Error('[YTWH] IndexedDB open blocked by another tab'));
  });
}

// Write operations

const db_addRecord = (storeName, record) => openDB().then((db) => new Promise((resolve, reject) => {
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).add(record);
  tx.oncomplete = () => resolve();
  tx.onerror = (event) => reject(event.target.error);
}));

/**
 * db_saveVideo(video)
 * Inserts or updates (upserts) a single video record using IDB's
 * put() method. The record MUST include a 'videoId' string field
 * (matches the object store's keyPath).
 *
 * @param  {Object}        video — Full video record to persist.
 * @returns {Promise<void>}
 */
function db_saveVideo(video) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_VIDEOS, 'readwrite');
    const store = tx.objectStore(STORE_VIDEOS);
    store.put(video); // put() = insert-or-replace
    tx.oncomplete = ()  => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  }));
}

function db_recordWatchEvent(event) {
  return db_addRecord(STORE_EVENTS, event);
}

function db_recordWatchSession(session, ghostExit = null) {
  if (!ghostExit) return db_addRecord(STORE_SESSIONS, session);
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_VIDEOS, STORE_SESSIONS], 'readwrite');
    const videos = tx.objectStore(STORE_VIDEOS);
    const sessions = tx.objectStore(STORE_SESSIONS);
    const request = videos.get(session.videoId);
    request.onsuccess = () => {
      const video = request.result;
      if (!video || video.ghostBaselineToken === ghostExit.token) {
        sessions.add(session);
        return;
      }
      const count = sessions.index(IDX_SESSION_VIDEO_ID).count(IDBKeyRange.only(session.videoId));
      count.onsuccess = () => {
        if (count.result === 0) {
          videos.put({
            ...video,
            legacyWatchSeconds: getLegacyWatchSeconds(video),
            legacyWatchCount: getWatchCount(video),
            legacyTimeOffset: session.streamType === 'live' ? Math.max(0, video.time || 0) : ghostExit.time,
            ghostBaselineToken: ghostExit.token
          });
        }
        sessions.add(session);
      };
    };
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
    tx.onabort = (event) => reject(event.target.error || new Error('Watch session update aborted'));
  }));
}

// Remove all records belonging to a video before completing a transaction.
function db_deleteVideoRecords(store, indexName, videoId, done) {
  const request = store.index(indexName).openCursor(IDBKeyRange.only(videoId));
  request.onsuccess = (event) => {
    const cursor = event.target.result;
    if (!cursor) { if (done) done(); return; }
    cursor.delete();
    cursor.continue();
  };
}

/**
 * db_deleteVideo(videoId)
 * Permanently removes a single video record identified by its
 * videoId. If the record does not exist, the operation succeeds
 * silently (IDB delete is idempotent).
 *
 * @param  {string}        videoId
 * @returns {Promise<void>}
 */
function db_deleteVideo(videoId) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_VIDEOS, STORE_SESSIONS, STORE_EVENTS], 'readwrite');
    tx.objectStore(STORE_VIDEOS).delete(videoId);
    db_deleteVideoRecords(tx.objectStore(STORE_SESSIONS), IDX_SESSION_VIDEO_ID, videoId);
    db_deleteVideoRecords(tx.objectStore(STORE_EVENTS), IDX_EVENT_VIDEO_ID, videoId);
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
    tx.onabort = (event) => reject(event.target.error || new Error('Video deletion aborted'));
  }));
}

/**
 * db_clearAllVideos()
 * Removes every record from the 'videos' store in one operation.
 * Called by the "Clear All" button in the options page and at the
 * start of a bulk import to ensure a clean slate.
 *
 * @returns {Promise<void>}
 */
function db_clearAllVideos() {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_VIDEOS, STORE_EVENTS, STORE_SESSIONS], 'readwrite');
    tx.objectStore(STORE_VIDEOS).clear();
    tx.objectStore(STORE_EVENTS).clear();
    tx.objectStore(STORE_SESSIONS).clear();
    tx.oncomplete = ()  => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  }));
}

/**
 * db_bulkImport(videos)
 * Replaces the entire 'videos' store in a single atomic
 * transaction — the optimal pattern for restoring a backup.
 *
 * Steps: clear existing data > write all new records > commit.
 * If any individual put() fails the whole transaction is rolled
 * back, leaving the store in its previous state.
 *
 * @param  {Object[]}      videos — Array of validated video records.
 * @returns {Promise<number>}       Resolves with the count imported.
 */
function db_bulkImport(videos, watchEvents = [], watchSessions = null, onProgress = null) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx         = db.transaction([STORE_VIDEOS, STORE_EVENTS, STORE_SESSIONS], 'readwrite');
    const store      = tx.objectStore(STORE_VIDEOS);
    const eventStore = tx.objectStore(STORE_EVENTS);
    const sessionStore = tx.objectStore(STORE_SESSIONS);

    // Wipe the store before writing to ensure a clean restore.
    store.clear();
    eventStore.clear();
    sessionStore.clear();

    // Queue every record in the same transaction for atomicity.
    videos.forEach((v, index) => {
      store.put(v);
      if (typeof onProgress === 'function') {
        onProgress({
          phase: 'videos',
          completed: index + 1,
          total: videos.length,
          record: v
        });
      }
    });
    watchEvents.forEach((watchEvent, index) => {
      eventStore.add(watchEvent);
      if (typeof onProgress === 'function') {
        onProgress({
          phase: 'events',
          completed: index + 1,
          total: watchEvents.length,
          record: watchEvent
        });
      }
    });
    const sessions = Array.isArray(watchSessions) ? watchSessions : videos.flatMap((video) => {
      if (video.manualOnly || Number.isFinite(video.legacyWatchSeconds)) return [];
      const seconds = Math.floor(getLegacyWatchSeconds(video));
      return seconds > 0 ? [{
        videoId: video.videoId,
        watchedAt: typeof video.timestamp === 'number' ? video.timestamp : Date.now(),
        seconds,
        streamType: video.live ? 'live' : video.liveReplay ? 'liveReplay' : 'normal'
      }] : [];
    });
    sessions.forEach((session, index) => {
      sessionStore.add(session);
      if (typeof onProgress === 'function') {
        onProgress({
          phase: 'sessions',
          completed: index + 1,
          total: sessions.length,
          record: session
        });
      }
    });

    tx.oncomplete = ()  => resolve(videos.length);
    tx.onerror    = (e) => reject(e.target.error);
    tx.onabort    = (e) => reject(e.target.error || new Error('Import transaction aborted'));
  }));
}

/**
 * db_replaceDatabase(videos, watchEvents)
 * Deletes and recreates the database at the current DB_VERSION, then imports
 * the supplied records into the newly created stores.
 *
 * @returns {Promise<number>} Resolves with the count imported.
 */
function db_replaceDatabase(videos, watchEvents = [], watchSessions = null, onProgress = null) {
  // db_bulkImport clears every application store in one atomic transaction,
  // so it replaces the database contents without waiting for other extension
  // contexts to close connections for deleteDatabase().
  return db_bulkImport(videos, watchEvents, watchSessions, onProgress);
}

// Read operations

/**
 * db_getVideoById(videoId)
 * Looks up a single video record by its primary key. Used by the
 * resume-video feature and the "mark as watched" action.
 *
 * @param  {string}              videoId
 * @returns {Promise<Object|null>}  The record, or null if missing.
 */
function db_getVideoById(videoId) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_VIDEOS, 'readonly');
    const req = tx.objectStore(STORE_VIDEOS).get(videoId);
    req.onsuccess = ()  => resolve(req.result || null);
    req.onerror   = (e) => reject(e.target.error);
  }));
}

/**
 * db_getVideos(limit, offset)
 * Returns a paginated slice of video records ordered by timestamp
 * descending (newest first). Uses an IDB cursor on the timestamp
 * index so only the requested records are loaded into memory —
 * critical for performance as the archive grows into the thousands.
 *
 * @param  {number}     limit  — Maximum number of records to return.
 * @param  {number}     offset — Number of records to skip (0-based).
 * @returns {Promise<Object[]>}
 */
function db_getVideos(limit, offset) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx      = db.transaction(STORE_VIDEOS, 'readonly');
    const index   = tx.objectStore(STORE_VIDEOS).index(IDX_TIMESTAMP);
    const results = [];
    let skipped   = 0;

    // 'prev' direction iterates from the highest timestamp downward,
    // giving "newest first" order without sorting in JavaScript.
    const request = index.openCursor(null, 'prev');

    request.onsuccess = (event) => {
      const cursor = event.target.result;

      // Stop if we hit the end of the store or the page is full.
      if (!cursor || results.length >= limit) {
        resolve(results);
        return;
      }

      // Skip records that precede our offset window.
      if (skipped < offset) {
        skipped++;
        cursor.continue();
        return;
      }

      results.push(cursor.value);
      cursor.continue();
    };

    request.onerror = (e) => reject(e.target.error);
  }));
}

/**
 * db_countVideosSince(timestamp)
 * Counts video records saved after the supplied timestamp.
 *
 * @param  {number} timestamp
 * @returns {Promise<number>}
 */
function db_countVideosSince(timestamp) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VIDEOS, 'readonly');
    const index = tx.objectStore(STORE_VIDEOS).index(IDX_TIMESTAMP);
    const range = IDBKeyRange.lowerBound(timestamp, true);
    const request = index.count(range);

    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  }));
}

/**
 * db_getAllVideos()
 * Returns every video record ordered by timestamp descending
 * (newest first). Used by the history search page (which performs
 * client-side filtering/sorting across the full data set) and by
 * the Export function.
 *
 * For very large archives this may load many records into memory.
 * This is acceptable for the history page (user-facing, infrequent)
 * and export (intentional full-data operation).
 *
 * @returns {Promise<Object[]>}
 */
function db_getAllVideos() {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VIDEOS, 'readonly');

    // getAll on the timestamp index returns records in ascending
    // (oldest-first) order. Reversing gives us newest-first.
    const req = tx.objectStore(STORE_VIDEOS).index(IDX_TIMESTAMP).getAll();

    req.onsuccess = ()  => resolve((req.result || []).reverse());
    req.onerror   = (e) => reject(e.target.error);
  }));
}

const db_getAllRecords = (storeName) => openDB().then((db) => new Promise((resolve, reject) => {
  const tx = db.transaction(storeName, 'readonly');
  const req = tx.objectStore(storeName).getAll();
  req.onsuccess = () => resolve(req.result || []);
  req.onerror = (event) => reject(event.target.error);
}));

function db_getAllWatchEvents() {
  return db_getAllRecords(STORE_EVENTS);
}

function db_getAllWatchSessions() {
  return db_getAllRecords(STORE_SESSIONS);
}

/** Update manual watched state and atomically record its initial completion. */
function db_toggleWatched(videoId, watchedThreshold = 95, fallbackVideo = null, action = 'toggle') {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_VIDEOS, STORE_SESSIONS, STORE_EVENTS], 'readwrite');
    const videos = tx.objectStore(STORE_VIDEOS);
    const getRequest = videos.get(videoId);
    let result;

    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      const actionAt = Date.now();
      result = toggleWatchedState(existing, watchedThreshold,
        { ...fallbackVideo, videoId }, actionAt, action);
      result.video.manualUpdatedAt = actionAt;
      const saveManual = () => {
        if (result.creditedWatch) {
          tx.objectStore(STORE_EVENTS).add({ videoId, watchedAt: result.video.manualCompletedAt, manual: true });
        }
        videos.put(result.video);
      };
      if (existing && !result.video.watched) {
        const count = tx.objectStore(STORE_SESSIONS).index(IDX_SESSION_VIDEO_ID).count(IDBKeyRange.only(videoId));
        count.onsuccess = () => {
          if (count.result === 0) {
            result.video.legacyWatchSeconds = getLegacyWatchSeconds(existing);
            result.video.legacyWatchCount = getWatchCount(existing);
            delete result.video.legacyTimeOffset;
            delete result.video.ghostBaselineToken;
          }
          saveManual();
        };
      } else if (!existing) {
        db_deleteVideoRecords(tx.objectStore(STORE_EVENTS), IDX_EVENT_VIDEO_ID, videoId, saveManual);
      } else {
        saveManual();
      }
    };
    getRequest.onerror = (event) => reject(event.target.error);
    tx.oncomplete = () => resolve(result);
    tx.onerror = (event) => reject(event.target.error);
    tx.onabort = (event) => reject(event.target.error || new Error('Watched-state update aborted'));
  }));
}

/** Merge one playback sample and its completion atomically with manual actions. */
function db_recordPlayback(sample) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_VIDEOS, STORE_EVENTS, STORE_SESSIONS], 'readwrite');
    const videos = tx.objectStore(STORE_VIDEOS);
    const events = tx.objectStore(STORE_EVENTS);
    const request = videos.get(sample.videoId);
    let result = null;
    request.onsuccess = () => {
      const existing = request.result;
      if (existing?.manualUpdatedAt >= sample.sampleAt) return;
      const applySample = () => {
        const isLive = sample.streamState === 'live';
        const wasWatched = existing?.watched === true;
        const isRewatch = wasWatched && sample.rewatch;
        let watched = wasWatched;
        if (!isLive && sample.progress >= sample.watchedThreshold / 100 && !sample.suppressCompletion) watched = true;
        else if (isRewatch || (wasWatched && sample.progress < 0.1)) watched = false;
        const completed = watched && (!wasWatched || isRewatch);
        const record = {
          ...existing,
          videoId: sample.videoId,
          title: sample.title,
          channel: sample.channel || existing?.channel || '',
          channelUrl: sample.channelUrl || existing?.channelUrl || '',
          time: isLive ? (existing?.live ? Math.max(0, existing.time || 0) : 0) + sample.liveWatchDelta : sample.currentTime,
          duration: isLive ? 0 : sample.duration,
          watched,
          watchCount: getWatchCount(existing || {}) + (completed ? 1 : 0),
          live: isLive ? true : undefined,
          liveReplay: sample.streamState === 'liveReplay' || (!isLive && (existing?.live || existing?.liveReplay)) ? true : undefined,
          timestamp: sample.sampleAt
        };
        delete record.manualOnly;
        const save = () => {
          videos.put(record);
          if (completed) events.add({ videoId: sample.videoId, watchedAt: sample.sampleAt });
          result = { video: record, completed };
        };
        if (sample.ghostExit && existing?.ghostBaselineToken !== sample.ghostExit.token) {
          const count = tx.objectStore(STORE_SESSIONS).index(IDX_SESSION_VIDEO_ID).count(IDBKeyRange.only(sample.videoId));
          count.onsuccess = () => {
            record.ghostBaselineToken = sample.ghostExit.token;
            if (count.result === 0) {
              record.legacyWatchSeconds = existing ? getLegacyWatchSeconds(existing) : 0;
              record.legacyWatchCount = getWatchCount(existing || {});
              record.legacyTimeOffset = isLive ? Math.max(0, existing?.time || 0) : sample.ghostExit.time;
            }
            save();
          };
        } else save();
      };
      // Orphaned events from older versions must not attach to a newly added record.
      if (!existing) db_deleteVideoRecords(events, IDX_EVENT_VIDEO_ID, sample.videoId, applySample);
      else applySample();
    };
    request.onerror = (event) => reject(event.target.error);
    tx.oncomplete = () => resolve(result);
    tx.onerror = (event) => reject(event.target.error);
    tx.onabort = (event) => reject(event.target.error || new Error('Playback update aborted'));
  }));
}

/**
 * db_countVideos()
 * Returns the total number of records in the 'videos' store.
 * Called hourly by the background alarm to keep the
 * chrome.storage.local 'videoCount' key in sync, so the popup
 * and other UIs can display the count without opening IDB themselves.
 *
 * @returns {Promise<number>}
 */
function db_countVideos() {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_VIDEOS, 'readonly');
    const req = tx.objectStore(STORE_VIDEOS).count();
    req.onsuccess = ()  => resolve(req.result);
    req.onerror   = (e) => reject(e.target.error);
  }));
}
