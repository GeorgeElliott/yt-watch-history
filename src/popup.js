/**
 * Popup showing recent videos and archive stats.
 * Uses db_getVideos(limit, offset) for efficient pagination.
 */

'use strict';

// Pagination state
let currentIndex = 0;
const ITEMS_PER_PAGE = 5;

// DOM refs
const listContainer   = document.getElementById('history-list');
const showMoreBtn     = document.getElementById('show-more-btn');
const statCount       = document.getElementById('stat-count');
const ghostModeToggle = document.getElementById('ghostModeToggle');

// Ghost mode

const setGhostModeBadge = (enabled) => {
  if (enabled) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
    return;
  }
  chrome.action.setBadgeText({ text: '' });
};

const syncGhostModeToggle = () => {
  if (!ghostModeToggle) return;
  chrome.storage.local.get({ ghostModeActive: false }, (data) => {
    ghostModeToggle.checked = Boolean(data.ghostModeActive);
  });
};

// Render batch of videos to the list
const renderBatch = (videos) => {
  videos.forEach((video) => {
    // Build the URL (resume point for watched, live edge for streams)
    const url = video.live
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`
      : `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}&t=${video.time}s`;
    const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(video.videoId)}/mqdefault.jpg`;
    const timeMeta = video.live
      ? '\u{1F534} Livestream'
      : video.watched
        ? '\u2713 Watched'
        : `${Math.floor(video.time / 60)}m ${video.time % 60}s`;

    const div = document.createElement('div');
    div.className = 'video-list-item popup-video-card';

    // Thumbnail
    const thumbLink      = document.createElement('a');
    thumbLink.href        = url;
    thumbLink.target      = '_blank';
    thumbLink.rel         = 'noopener noreferrer';
    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'popup-thumb-wrap';
    const img  = document.createElement('img');
    img.src    = thumbUrl;
    img.alt    = '';
    thumbContainer.appendChild(img);
    thumbLink.appendChild(thumbContainer);

    //  Info 
    const info       = document.createElement('div');
    info.className   = 'item-info';
    const titleLink  = document.createElement('a');
    titleLink.href   = url;
    titleLink.target = '_blank';
    titleLink.rel    = 'noopener noreferrer';
    titleLink.className = 'item-title';
    titleLink.textContent = video.title;
    info.appendChild(titleLink);
    if (video.channel) {
      const channelLink       = document.createElement('a');
      channelLink.href        = video.channelUrl || '#';
      channelLink.target      = '_blank';
      channelLink.rel         = 'noopener noreferrer';
      channelLink.className   = 'item-channel';
      channelLink.textContent = video.channel;
      info.appendChild(channelLink);
    }
    const meta       = document.createElement('span');
    meta.className   = 'item-meta';
    meta.textContent = `${timeMeta} \u2022 ${new Date(video.timestamp).toLocaleDateString()}`;
    info.appendChild(meta);

    //  Context Menu 
    const menuWrap = document.createElement('div');
    menuWrap.className = 'video-menu-wrap';
    const menuBtn  = document.createElement('button');
    menuBtn.className = 'video-menu-btn';
    menuBtn.title     = 'More actions';
    menuBtn.textContent = '\u22EE';
    const menu = document.createElement('div');
    menu.className = 'video-menu';
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.video-menu.open').forEach((m) => m.classList.remove('open'));
      menu.classList.toggle('open');
    };

    // Mark as watched / Reset progress
    const watchedItem = document.createElement('button');
    watchedItem.className   = 'video-menu-item';
    watchedItem.textContent = video.watched ? '\u21A9 Reset progress' : '\u2713 Mark as watched';
    watchedItem.onclick = () => {
      db_getVideoById(video.videoId).then((entry) => {
        if (!entry) return;
        entry.watched = !entry.watched;
        if (!entry.watched) entry.time = 0;
        db_saveVideo(entry).then(init);
      }).catch(console.error);
    };

    // Copy link
    const copyItem = document.createElement('button');
    copyItem.className   = 'video-menu-item';
    copyItem.textContent = '\uD83D\uDD17 Copy link';
    copyItem.onclick = () => {
      navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${video.videoId}`);
      menu.classList.remove('open');
    };

    // Remove from history
    const removeItem = document.createElement('button');
    removeItem.className   = 'video-menu-item danger';
    removeItem.textContent = '\uD83D\uDDD1 Remove from history';
    removeItem.onclick = () => {
      db_deleteVideo(video.videoId).then(init).catch(console.error);
    };

    menu.appendChild(watchedItem);
    menu.appendChild(copyItem);
    menu.appendChild(removeItem);
    menuWrap.appendChild(menuBtn);
    menuWrap.appendChild(menu);

    div.appendChild(thumbLink);
    div.appendChild(info);
    div.appendChild(menuWrap);
    listContainer.appendChild(div);
  });
};

//  Load More 

/**
 * loadMore()
 * Fetches the next page of videos from IDB and appends them.
 * Called by the scroll listener and the show-more button.
 */
const loadMore = () => {
  db_getVideos(ITEMS_PER_PAGE, currentIndex).then((batch) => {
    if (batch.length === 0) {
      showMoreBtn.classList.add('hidden');
      return;
    }
    renderBatch(batch);
    currentIndex += batch.length;
    // Hide the button by default; scroll listener will reveal it
    // when the user reaches the bottom of the list.
    showMoreBtn.classList.add('hidden');
  }).catch(console.error);
};

showMoreBtn.onclick = () => {
  loadMore();
  showMoreBtn.classList.add('hidden');
};

//  Scroll-to-load 

const setupScrollListener = () => {
  listContainer.addEventListener('scroll', () => {
    const distanceFromBottom =
      listContainer.scrollHeight - (listContainer.scrollTop + listContainer.clientHeight);

    if (distanceFromBottom < 100) {
      showMoreBtn.classList.remove('hidden');
    } else {
      showMoreBtn.classList.add('hidden');
    }
  }, { passive: true });
};

//  Initialise 

/**
 * init()
 * Counts all archived videos and renders the first page.
 * Also called after any mutation (mark-watched, remove) to refresh
 * the list from scratch.
 */
const init = () => {
  listContainer.replaceChildren();
  currentIndex = 0;

  // Get the total count first so the stat bar is always accurate,
  // regardless of how many items we actually render below.
  db_countVideos().then((count) => {
    if (statCount) statCount.textContent = count.toLocaleString();

    if (count === 0) {
      //  Empty state 
      const empty = document.createElement('div');
      empty.className   = 'empty-state';
      empty.style.padding = '30px 10px';
      const icon = document.createElement('div');
      icon.className    = 'empty-icon';
      icon.textContent  = '\uD83D\uDCFA';
      const text = document.createElement('div');
      text.className    = 'empty-text';
      text.textContent  = 'No videos yet';
      const sub  = document.createElement('div');
      sub.className     = 'empty-sub';
      sub.textContent   = 'Watch YouTube videos to start tracking';
      empty.appendChild(icon);
      empty.appendChild(text);
      empty.appendChild(sub);
      listContainer.replaceChildren(empty);
      showMoreBtn.classList.add('hidden');
      return;
    }

    //  First page 
    db_getVideos(ITEMS_PER_PAGE, 0).then((batch) => {
      currentIndex = batch.length;
      renderBatch(batch);
      showMoreBtn.classList.add('hidden');
      setupScrollListener();
    }).catch(console.error);

  }).catch(console.error);
};

//  Navigation 

document.getElementById('open-history').onclick = (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
};

document.getElementById('open-options').onclick = (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
};

// Close all menus on outside click.
document.addEventListener('click', () => {
  document.querySelectorAll('.video-menu.open').forEach((m) => m.classList.remove('open'));
});

//  Ghost Mode Sync 

document.addEventListener('DOMContentLoaded', () => {
  syncGhostModeToggle();
  init();
});

if (ghostModeToggle) {
  ghostModeToggle.addEventListener('change', () => {
    const enabled = ghostModeToggle.checked;
    chrome.storage.local.set({ ghostModeActive: enabled }, () => {
      setGhostModeBadge(enabled);
    });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  // Keep the ghost mode toggle in sync if changed from another page.
  if (changes.ghostModeActive && ghostModeToggle) {
    ghostModeToggle.checked = Boolean(changes.ghostModeActive.newValue);
  }

  // Keep the stat count in sync when the hourly alarm updates it.
  if (changes.videoCount && statCount) {
    statCount.textContent = Number(changes.videoCount.newValue).toLocaleString();
  }
});

//  Theme Sync 

const applyStoredTheme = () => {
  chrome.storage.local.get({ youtubeTheme: '' }, (data) => {
    if (data.youtubeTheme) document.documentElement.dataset.theme = data.youtubeTheme;
  });
};
applyStoredTheme();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.youtubeTheme) {
    document.documentElement.dataset.theme = changes.youtubeTheme.newValue;
  }
});
