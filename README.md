# WatchHistory for YouTube™

A lightweight browser extension that tracks your YouTube watch history locally and resumes videos where you left off.

**Perfect for:**

- Privacy-conscious users who disabled watch history but still want to resume videos
- Users who aren't signed in to YouTube but still want history and resume functionality
- Anyone frustrated by YouTube losing progress on long streams, podcasts, or tutorials
- Users who want a fast, local search across their 50-1,000 most recent videos without YouTube's clutter

## Features

- 📺 **Track Videos** - Automatically saves the last 50-1000 YouTube videos you watch (configurable)
- ▶️ **Resume Automatically** - Jump back to where you left off when you revisit a video
- 🎯 **Auto-mark as Watched** - Videos are automatically tagged as "watched" when you reach 95% progress
- 🔖 **Smart Badges** - See "Resume" or "Watched" tags on thumbnails across YouTube (toggleable)
- 📋 **Video Actions Menu** - Long-press menu on each video offering: Mark as watched/Reset progress, Copy link, Remove from history
- 🔄 **Smart Progress Tracking** - Saves progress when closing tabs, navigating away, or closing the browser
- 🔍 **Advanced Search** - Find videos by title or channel name, with toggleable "hide watched" filter
- 💾 **Local Storage** - All data stays on your device - nothing sent to external servers
- 📥 **Import/Export** - Back up and restore your watch history as JSON
- 🚫 **Hide Shorts** - Remove Shorts from all YouTube feeds including home, subscriptions and search
- ⚙️ **Customizable Defaults** - Set default "hide watched" behavior in search, history limit (50-1000 videos)
- 🎨 **Dark/Light Mode** - Automatically adapts to your system theme

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
- See your 5 most recent videos
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

### Options Page
- 📊 Set history limit (50-1000 videos)
- 🔖 Toggle **resume badges** on YouTube thumbnails
- 👁️ Toggle **watched badges** on thumbnails
- 🔀 **Redirect YouTube history** to your local history page
- 🏠 **Redirect Home & Shorts** to your subscriptions feed
- 🚫 **Hide Shorts** from all YouTube feeds
- 👀 **Hide watched in search** - Set default "hide watched" state for the history page search (users can override per session)
- 📤 **Export** your history as JSON
- 📥 **Import** previously exported history
- 🗑️ Clear all data

## How It Works

1. **Content Script** (`content.js`) runs on all YouTube watch pages
2. Every 10 seconds, it saves your current video ID, timestamp, title, and channel to local storage (only while the tab is active and the video is playing)
3. **Smart Progress Tracking** - Saves progress immediately when you:
   - Close the tab or browser window
   - Navigate away from the video
   - Use the back button
4. **Auto-watched Detection** - Videos are automatically marked as "watched" when you reach 95% progress; resets to unwatched if you restart from the beginning
5. When you revisit a video, it automatically jumps to your saved position (if within first 5 seconds)
6. **Resume & Watched Badges** appear on video thumbnails across:
   - Home feed recommendations
   - Subscription feeds
   - Channel pages
   - Search results
7. Livestreams are saved in your history and automatically resume at the live edge
8. History is trimmed when it exceeds your configured limit

**Note:** This is a rolling limit. To keep your browser fast, we only remember your most recent 1,000 videos. Older entries are deleted automatically.

## File Structure

```
src/
  manifest.json       # Extension manifest (permissions, scripts, icons)
  background.js       # Service worker for internal redirect handling
  content.js          # YouTube page injection (auto-save, resume, badges, redirects)
  popup.html          # Extension popup UI (recent videos, stats, nav)
  popup.js            # Popup logic (loads history, renders list, nav links)
  history.html        # Full history page UI (search bar, video grid, stats)
  history.js          # History logic (search, sort, pagination, delete)
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

