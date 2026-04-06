# YT Watch History

A lightweight browser extension that tracks your YouTube watch history locally and resumes videos where you left off.

**Perfect for:** Users who have YouTube watch history disabled, want privacy, or prefer local-only tracking.

## Features

- 📺 **Track Videos** — Automatically saves the last 50–500 YouTube videos you watch (configurable)
- ▶️ **Resume Automatically** — Jump back to where you left off when you revisit a video
- � **Resume Badges** — See "Resume" tags on thumbnails across YouTube for videos in your history (toggleable)
- �💾 **Local Storage** — All data stays on your device—nothing sent to external servers
- 🔍 **Search & Sort** — Find videos by title, sorted by newest, oldest, or alphabetical
- 📥 **Import/Export** — Back up and restore your watch history as JSON
- 🎨 **Dark/Light Mode** — Automatically adapts to your system theme
- ⚙️ **Customizable** — Set your preferred history limit (50–500 videos)

## Installation

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

## Usage

### Popup (Click the extension icon)
- See your 5 most recent videos
- Quick stats (total videos, current limit)
- Links to full History and Options pages

### History Page
- View all tracked videos in a grid
- **Search** by title
- **Sort** by newest, oldest, or alphabetical
- Click a thumbnail to resume watching
- Delete individual videos

### Options Page
- 📊 Set history limit (50–500 videos)
- 📤 **Export** your history as JSON
- 📥 **Import** previously exported history
- 🗑️ Clear all data

## How It Works

1. **Content Script** (`content.js`) runs on all YouTube watch pages
2. Every 10 seconds, it saves your current video ID, timestamp, and title to local storage (only while the tab is active and the video is playing)
3. When you revisit a video, it automatically jumps to your saved position (if within first 5 seconds)
4. Livestreams are saved in your history and automatically resume at the live edge
5. History is trimmed when it exceeds your configured limit

## File Structure

```
src/
  content.js          # YouTube page injection (auto-save & resume)
  popup.html/js       # Extension icon popup (recent videos)
  history.html/js     # Full history page (search, sort, grid view)
  options.html/js     # Settings page (limit, export, import)
  theme.css           # Shared dark/light theme & components
  manifest.json       # Extension metadata
  icons/              # Icon PNGs (16, 32, 48, 128px)
LICENSE             # MIT License
```

## Development

### Dependencies
None — vanilla JavaScript with no external libraries beyond Chrome APIs.

### Building
No build step required. The `src/` folder is ready to load directly into Chrome/Edge.

### Modifying
- **UI Changes** → Edit `.html` and `theme.css`
- **Behavior** → Edit corresponding `.js` files

## Permissions

- `storage` — Save/load watch history from local storage
- `https://www.youtube.com/*` — Access YouTube pages for tracking and resume badges

## Security

- **No innerHTML** \u2014 All dynamic content is rendered via safe DOM construction (`textContent`, `createElement`) to prevent XSS
- **Import validation** \u2014 Imported JSON is validated (video ID format, string lengths, numeric bounds) before storage
- **Minimal permissions** \u2014 Only `storage` permission is requested; no background scripts or remote code
- **Link hardening** \u2014 All external links use `rel="noopener noreferrer"` to prevent tabnabbing

## Privacy

✅ **Your data is yours**
- No tracking, analytics, or external requests
- All data stored locally in browser storage (tied to your browser profile/login)
- Each browser user/profile has separate, isolated history
- Separate storage on each device — not synced across browsers
- No server communication (except YouTube's own APIs)
- Can be completely deleted anytime

## License

MIT License — see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Feel free to:
- Report bugs via GitHub Issues
- Submit PRs for improvements

**A note on AI-generated PRs:** I don't mind the use of AI tools during development, but please review and understand any code you submit. Bulk Copilot/AI-generated PRs with no human review will be closed. Know what your code does before opening a PR.
- Suggest features

## Links

- [GitHub Repository](https://github.com/GeorgeElliott/yt-watch-history)
- [MIT License](LICENSE)

