# WatchHistory for YouTube™

**Reclaim your privacy without losing your progress.**

WatchHistory for YouTube™ is a lightweight, privacy-focused browser extension that tracks your watch history and video progress locally. Even if you have disabled YouTube's official "Watch History" or are not signed in, this extension provides the seamless "Continue Watching" experience you deserve.

---

## Why Choose WatchHistory?

* **Privacy-First:** Your data never leaves your device. No cloud syncing, no tracking, and no external servers. 
* **Enable Features with History Disabled:** Get "Resume" and "Watch History" functionality even if you have YouTube's official history tracking turned off or are logged out.
* **Limitless Archive:** Move beyond arbitrary limits. Store as much history as your device allows, thanks to our high-performance **IndexedDB** engine.
* **Offline Reliability:** Perfect for users who value data sovereignty and want a reliable way to track progress without Google’s cloud dependency.

---

## Key Features

* 📺 **Unlimited History Tracking** – Automatically saves your watch history using high-performance local indexing.
* 🚀 **Continue Watching** – A dedicated shelf on your YouTube Subscriptions page to jump back into your most recent videos.
* ▶️ **Automatic Resume** – Revisit a video and pick up exactly where you left off.
* 🎯 **Smart Progress Tracking** – Videos are automatically tagged as "watched" once you reach your watch threshold (default 95%, fully **customizable** in Options).
* 🔖 **Smart Badges** – "Resume" or "Watched" tags appear directly on YouTube thumbnails (toggleable).
* 🖱️ **Mark as Watched from Any Feed** – Hover a thumbnail on Home, Subscriptions, or Search and use the built-in menu to mark it watched (or reset progress) without opening the video.
* 🔁 **Rewatch Tracking** – Keeps a count of how many times you've fully watched each video, so your stats reflect genuine rewatches.
* 📊 **Stats Dashboard** – A dedicated Stats page with total watch time, videos watched, current/longest watch streaks, your top 5 most-watched videos and channels, favorite channel, and your longest/shortest watched videos.
* 📋 **Video Management** – Easily mark videos as watched/reset, copy links, or remove them from your history.
* 👻 **Ghost Mode** – Pause all tracking for the current session with a single click.
* 🔍 **Advanced Search** – Find videos instantly by title or channel, with a toggleable "hide watched" filter.
* 💾 **Local-First Architecture** – All data is stored locally via **IndexedDB**. Your history is yours alone.
* 📥 **Import/Export** – Seamlessly back up and restore your watch history as a JSON file.
* 🛡️ **Backup Reminders** – Proactive, non-intrusive reminders ensure you keep a safe, offline copy of your archive.
* 🚫 **Hide Shorts** – Clean up your YouTube experience by removing Shorts from home, subscriptions, and search feeds.
* 🎨 **System Theming** – Dashboards and popups automatically adapt to your system’s light or dark mode.

---

## 🔒 Privacy Guarantee
**Your data stays on your device.** We use native browser storage technologies—**IndexedDB** for your video history and **`chrome.storage`** for your settings—to ensure maximum performance and privacy. We do not use analytics, tracking pixels, or external cloud services.

---

## Technical Architecture
* **Storage Engine:** We leverage **IndexedDB** for the primary video history archive, ensuring high-speed search performance and the removal of legacy storage caps.
* **Configuration:** User settings and preferences are managed via **`chrome.storage.local`** for fast, optimized access during page loads.

## Installation

### From Chrome Web Store

Install instantly from the Chrome Web Store:

[WatchHistory for YouTube™ on Chrome Web Store](https://chromewebstore.google.com/detail/watchhistory-for-youtube/bjfbnpccgejpbeofaepnjommafgdknap?authuser=0&hl=en)

_Works on Chrome, Microsoft Edge, and Brave browsers._

#### Microsoft Edge Add-ons

Install from Microsoft Edge Add-ons:

[WatchHistory for YouTube™ on Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/watchhistory-for-youtube%E2%84%A2/dddoogddjkbiknfieibadpibibmmkpnj)

_Works on Microsoft Edge ._ 

#### Firefox Add-ons

Install from Mozilla Firefox Add-ons:

[WatchHistory for YouTube™ on Mozilla Firefox Add-ons](https://addons.mozilla.org/en-GB/firefox/addon/watchhistory-for-youtube/)

_Works on Firefox browser._

---

### From Release Package

1. Go to [GitHub Releases](https://github.com/GeorgeElliott/yt-watch-history/releases)
2. Download the appropriate ZIP for your browser:
   - `yt-watch-history-chrome-v*.zip` — For Chrome, Edge, or Brave
   - `yt-watch-history-firefox-v*.zip` — For Firefox
3. Extract the ZIP file
4. Load in Chrome/Edge/Brave:
   - Go to `chrome://extensions` (or `edge://extensions`)
   - Enable **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the extracted folder
5. Load in Firefox:
   - Go to `about:debugging#/runtime/this-firefox`
   - Click **Load Temporary Add-on**
   - Select the `manifest.json` from the extracted folder

### From Source (Development)

1. Clone the repository:
   ```bash
   git clone https://github.com/GeorgeElliott/yt-watch-history.git
   cd yt-watch-history
   ```

2. Load in Chrome/Edge:
   - Go to `chrome://extensions` (or `edge://extensions`)
   - Enable **Developer mode** (top right)
   - Click **Load unpacked**
   - Select the `src/` folder

### Building Locally

To build the extension package locally for testing:

#### **Windows (PowerShell)**
```powershell
.\build.ps1                           # Interactive mode
.\build.ps1 -Browser chrome -Version 1.2.3    # With parameters
```

#### **macOS/Linux/Git Bash**
```bash
./build.sh                            # Interactive mode
./build.sh chrome 1.2.3               # With parameters
```

**Outputs** (in `dist/` folder):
- `yt-watch-history-chrome-v1.2.3.zip` — For Chrome/Edge
- `yt-watch-history-firefox-v1.2.3.zip` — For Firefox

Load the package locally for testing via `chrome://extensions` (Chrome/Edge) or `about:debugging` (Firefox).


## Usage

### Popup (Click the extension icon)
- See your most recent videos
- Quick stats (total videos, current limit)
- Links to full History, Options, and YouTube

### History Page
- View all tracked videos in a grid
- **Search** by video title or channel name
- **Toggle "Hide watched"** to filter out watched videos (default behavior configurable in options)
- **Sort** by newest, oldest, or alphabetical
- **Video actions menu** (three dots) on each video:
  - Mark as watched / Reset progress
  - Copy video link
  - Remove from history
- Click a thumbnail to resume watching
- Batch delete via **Clear All** button

### Stats Page
- Overview cards: videos archived, videos watched, total watch time, and total watches (including rewatches)
- Insights: unique channels, average completion rate, livestreams watched, current/longest watch streak, most active day, favorite channel, and videos watched this week
- **Top 5 Most Watched** videos and **Top 5 Channels**
- **Longest** and **Shortest** video watched (only counts videos genuinely watched through, so a video you merely toggled "watched" without watching doesn't skew the results)

### On YouTube (Subscriptions, Home & Search)
- **Resume/Watched badges** on thumbnails
- **Hover menu** (⋮) on every thumbnail to mark a video as watched or reset its progress directly from the feed — no need to open the video first

### Options Page
- 📊 Set history limit (50-1000 videos)
- 🔖 Toggle **resume badges** on YouTube thumbnails
- 👁️ Toggle **watched badges** on thumbnails
- 🎚️ **Watched threshold** – customize the % of a video that must be watched before it's marked "Watched" (default 95%)
- 🔀 **Redirect YouTube history** to your local history page
- 🏠 **Redirect Home & Shorts** to your subscriptions feed
- 🚫 **Hide Shorts** from all YouTube feeds
- 👀 **Hide watched in search** - Set default "hide watched" state for the history page search (users can override per session)
- 📤 **Export** your history as JSON
- 📥 **Import** previously exported history
- 🗑️ Clear all data

## How It Works

1. **Content Script** (`content.js`) runs on all YouTube watch pages
2. Every 10 seconds, it saves your current video ID, timestamp, title, and channel to local storage (only while the tab is active and the video is playing); very short videos (under 20s) are saved more frequently, and playback completion is captured immediately
3. **Smart Progress Tracking** - Saves progress immediately when you:
   - Close the tab or browser window
   - Navigate away from the video
   - Use the back button
4. **Auto-watched Detection** - Videos are automatically marked as "watched" once you reach your configured watch threshold (default 95%, adjustable in Options); resets to unwatched if you restart from the beginning
5. When you revisit a video, it automatically jumps to your saved position (if within first 5 seconds)
6. **Resume & Watched Badges** appear on video thumbnails across:
   - Home feed recommendations
   - Subscription feeds
   - Channel pages
   - Search results
7. **Mark as Watched from Feeds** - Every thumbnail also gets a hover menu so you can mark a video watched (or reset it) without opening it
8. Livestreams are saved in your history and automatically resume at the live edge
9. History is trimmed when it exceeds your configured limit

**Note:** This is a rolling limit. To keep your browser fast, we only remember your most recent 1,000 videos. Older entries are deleted automatically.

## File Structure

```
src/
  manifest.json       # Extension manifest (permissions, scripts, icons)
  background.js       # Service worker for IndexedDB proxying, redirects, and alarms
  content.js          # YouTube page injection (auto-save, resume, badges, feed menu, redirects)
  db.js               # Shared IndexedDB wrapper (used by background.js, popup, history, options, stats)
  popup.html          # Extension popup UI (recent videos, stats, nav)
  popup.js            # Popup logic (loads history, renders list, nav links)
  history.html        # Full history page UI (search bar, video grid, stats)
  history.js          # History logic (search, sort, pagination, delete)
  stats.html          # Stats dashboard UI (overview cards, top videos/channels, streaks)
  stats.js            # Stats logic (aggregates data from IndexedDB)
  options.html        # Settings page UI (toggles, import/export, clear)
  options.js          # Settings logic (limit, badges, redirects, import validation)
  theme.css           # Shared dark/light theme, components, toggle switches
  icons/              # Extension icons (16, 32, 48, 128px PNGs)
LICENSE             # MIT License
```

## Development

### Dependencies
None - vanilla JavaScript with no external libraries beyond Chrome APIs.

### Building
No build step required. The `src/` folder is ready to load directly into Chrome/Edge.

### Modifying
- **UI Changes** → Edit `.html` and `theme.css`
- **Behavior** → Edit corresponding `.js` files

### Feature Branches
When developing new features:

```bash
# Create a feature branch from main
git checkout -b feature/your-feature-name

# Make your changes, test thoroughly
# Commit with clear messages
git add .
git commit -m "Add your clear commit message"

# Push your branch
git push origin feature/your-feature-name

# Open a Pull Request on GitHub
```

Keep feature branches focused on a single feature. This makes code review easier and keeps the history clean.

## Permissions

- `storage` - Save/load watch history from local storage
- `https://www.youtube.com/*` - Access YouTube pages for tracking and resume badges

## Security

- **No innerHTML** - All dynamic content is rendered via safe DOM construction (`textContent`, `createElement`) to prevent XSS
- **Import validation** - Imported JSON is validated (video ID format, string lengths, numeric bounds) before storage
- **Minimal permissions** - Only `storage` permission is requested; background service worker handles internal redirects only
- **Link hardening** - All external links use `rel="noopener noreferrer"` to prevent tabnabbing

## Privacy

✅ **Your data is yours**
- No tracking, analytics, or external requests
- All data stored locally in browser storage (tied to your browser profile/login)
- Each browser user/profile has separate, isolated history
- Separate storage on each device - not synced across browsers
- No server communication (except YouTube's own APIs)
- Can be completely deleted anytime

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Feel free to:
- Report bugs via GitHub Issues
- Submit PRs for improvements

**A note on AI-generated PRs:** I don't mind the use of AI tools during development, but please review and understand any code you submit. Bulk Copilot/AI-generated PRs with no human review will be closed. Know what your code does before opening a PR.
- Suggest features

## Links

- [GitHub Repository](https://github.com/GeorgeElliott/yt-watch-history)
- [MIT License](LICENSE)

