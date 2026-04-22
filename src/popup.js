let allHistory = [];
let currentIndex = 0;
const ITEMS_PER_PAGE = 5;

const listContainer = document.getElementById('history-list');
const showMoreBtn = document.getElementById('show-more-btn');
const statCount = document.getElementById('stat-count');
const statLimit = document.getElementById('stat-limit');
const ghostModeToggle = document.getElementById('ghostModeToggle');

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

const renderNextBatch = () => {
  const nextBatch = allHistory.slice(currentIndex, currentIndex + ITEMS_PER_PAGE);

  nextBatch.forEach(video => {
    const url = video.live
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`
      : `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}&t=${video.time}s`;
    const thumbUrl = `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/mqdefault.jpg`;
    const timeMeta = video.live
      ? '\u{1F534} Livestream'
      : video.watched
        ? '\u2713 Watched'
        : `${Math.floor(video.time / 60)}m ${video.time % 60}s`;

    const div = document.createElement('div');
    div.className = 'video-list-item';

    const thumbLink = document.createElement('a');
    thumbLink.href = url;
    thumbLink.target = '_blank';
    thumbLink.rel = 'noopener noreferrer';
    const thumbContainer = document.createElement('div');
    thumbContainer.className = 'thumb-container';
    const img = document.createElement('img');
    img.src = thumbUrl;
    img.alt = '';
    thumbContainer.appendChild(img);
    thumbLink.appendChild(thumbContainer);

    const info = document.createElement('div');
    info.className = 'item-info';
    const titleLink = document.createElement('a');
    titleLink.href = url;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.className = 'item-title';
    titleLink.textContent = video.title;
    info.appendChild(titleLink);
    if (video.channel) {
      const channelLink = document.createElement('a');
      channelLink.href = video.channelUrl || '#';
      channelLink.target = '_blank';
      channelLink.rel = 'noopener noreferrer';
      channelLink.className = 'item-channel';
      channelLink.textContent = video.channel;
      info.appendChild(channelLink);
    }
    const meta = document.createElement('span');
    meta.className = 'item-meta';
    meta.textContent = `${timeMeta} \u2022 ${new Date(video.timestamp).toLocaleDateString()}`;
    info.appendChild(meta);

    const menuWrap = document.createElement('div');
    menuWrap.className = 'video-menu-wrap';
    const menuBtn = document.createElement('button');
    menuBtn.className = 'video-menu-btn';
    menuBtn.title = 'More actions';
    menuBtn.textContent = '\u22EE';
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      document.querySelectorAll('.video-menu.open').forEach(m => m.classList.remove('open'));
      menu.classList.toggle('open');
    };
    const menu = document.createElement('div');
    menu.className = 'video-menu';

    const watchedItem = document.createElement('button');
    watchedItem.className = 'video-menu-item';
    watchedItem.textContent = video.watched ? '\u21A9 Reset progress' : '\u2713 Mark as watched';
    watchedItem.onclick = () => {
      chrome.storage.local.get({ history: [] }, (data) => {
        const entry = data.history.find(v => v.id === video.id);
        if (entry) {
          entry.watched = !entry.watched;
          if (!entry.watched) entry.time = 0;
        }
        chrome.storage.local.set({ history: data.history }, init);
      });
    };

    const copyItem = document.createElement('button');
    copyItem.className = 'video-menu-item';
    copyItem.textContent = '\uD83D\uDD17 Copy link';
    copyItem.onclick = () => {
      navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${video.id}`);
      menu.classList.remove('open');
    };

    const removeItem = document.createElement('button');
    removeItem.className = 'video-menu-item danger';
    removeItem.textContent = '\uD83D\uDDD1 Remove from history';
    removeItem.onclick = () => {
      chrome.storage.local.get({ history: [] }, (data) => {
        const filtered = data.history.filter(v => v.id !== video.id);
        chrome.storage.local.set({ history: filtered }, init);
      });
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

  currentIndex += ITEMS_PER_PAGE;
  showMoreBtn.classList.toggle('hidden', currentIndex >= allHistory.length);
};

const init = () => {
  chrome.storage.local.get({ history: [], limit: 100 }, (data) => {
    allHistory = data.history;
    statCount.textContent = data.history.length;
    statLimit.textContent = data.limit;
    listContainer.replaceChildren();
    currentIndex = 0;

    if (allHistory.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.style.padding = '30px 10px';
      const icon = document.createElement('div');
      icon.className = 'empty-icon';
      icon.textContent = '\uD83D\uDCFA';
      const text = document.createElement('div');
      text.className = 'empty-text';
      text.textContent = 'No videos yet';
      const sub = document.createElement('div');
      sub.className = 'empty-sub';
      sub.textContent = 'Watch YouTube videos to start tracking';
      empty.appendChild(icon);
      empty.appendChild(text);
      empty.appendChild(sub);
      listContainer.replaceChildren(empty);
      showMoreBtn.classList.add('hidden');
    } else {
      renderNextBatch();
    }
  });
};

showMoreBtn.onclick = renderNextBatch;

// Navigation links open as chrome extension pages
document.getElementById('open-history').onclick = (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
};

document.getElementById('open-options').onclick = (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
};

// Close menus on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.video-menu.open').forEach(m => m.classList.remove('open'));
});

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
  if (area !== 'local' || !changes.ghostModeActive || !ghostModeToggle) return;
  ghostModeToggle.checked = Boolean(changes.ghostModeActive.newValue);
});