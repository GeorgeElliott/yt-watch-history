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
 *   watched {boolean}          — true if ≥ 95% viewed
 *   watchCount {number}        — how many times the video has been fully
 *                                watched (incremented on each not-watched →
 *                                watched transition)
 *   live {true|undefined}      — set for livestreams only
 *   timestamp {number}         — when last saved
 */

'use strict';

// Database config
const DB_NAME       = 'ytwh';
const DB_VERSION    = 1;
const STORE_VIDEOS  = 'videos';
const IDX_TIMESTAMP = 'idx_timestamp'; // secondary index on timestamp for sorting

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

      resolve(_dbConnection);
    };

    // Error and block handling
    request.onerror   = (event) => reject(event.target.error);
    request.onblocked = ()      => reject(new Error('[YTWH] IndexedDB open blocked by another tab'));
  });
}

// Write operations

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
    const tx = db.transaction(STORE_VIDEOS, 'readwrite');
    tx.objectStore(STORE_VIDEOS).delete(videoId);
    tx.oncomplete = ()  => resolve();
    tx.onerror    = (e) => reject(e.target.error);
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
    const tx = db.transaction(STORE_VIDEOS, 'readwrite');
    tx.objectStore(STORE_VIDEOS).clear();
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
function db_bulkImport(videos) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_VIDEOS, 'readwrite');
    const store = tx.objectStore(STORE_VIDEOS);

    // Wipe the store before writing to ensure a clean restore.
    store.clear();

    // Queue every record in the same transaction for atomicity.
    videos.forEach((v) => store.put(v));

    tx.oncomplete = ()  => resolve(videos.length);
    tx.onerror    = (e) => reject(e.target.error);
  }));
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
