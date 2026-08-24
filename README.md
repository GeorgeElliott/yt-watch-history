# WatchHistory for YouTube

Keep your place on YouTube without relying on YouTube history. WatchHistory saves progress and history in your browser, so you can resume unfinished videos and find what you watched later.

It works when official YouTube watch history is disabled or you are signed out.

I made it because turning off YouTube's official watch history also removes useful features such as resume and a list of recently watched videos. This extension adds some of that functionality back while keeping the data in your browser.

## Why use it

- Keep a watch history without sending it to another service
- Resume videos from where you stopped
- Manage and back up your own history

## Features

- Resume videos from their saved position
- Track progress, completed videos, and rewatches
- Add Resume and Watched badges to YouTube thumbnails
- Mark videos as watched or reset progress directly from YouTube feeds
- Browse, search, sort, and manage a local video history
- Explore saved videos in a chronological timeline with month/year jumping and activity gaps
- Show watch-time, channel, streak, and video statistics, then copy a shareable stats summary
- Pause tracking for the current session with Ghost Mode
- Import and export history as JSON
- Optionally hide Shorts, redirect YouTube history, and redirect Home to Subscriptions
- Follow the system light or dark theme

## Install

- [Website](https://ytwatchhistory.com/)
- [Chrome Web Store](https://chromewebstore.google.com/detail/watchhistory-for-youtube/bjfbnpccgejpbeofaepnjommafgdknap?authuser=0&hl=en) for Chrome, Edge, and Brave
- [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/watchhistory-for-youtube%E2%84%A2/dddoogddjkbiknfieibadpibibmmkpnj)
- [Firefox Add-ons](https://addons.mozilla.org/en-GB/firefox/addon/watchhistory-for-youtube/)

### Install from source

1. Clone the repository and load the `src/` directory as an unpacked extension in Chrome, Edge, or Brave. See Chrome's official [Load an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) instructions.
2. For Firefox, use the Firefox Add-ons listing for a permanent installation. Standard Firefox only loads unsigned local extensions temporarily; see Mozilla's [signing and distribution overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).
3. To test a local Firefox build, open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose its `manifest.json`. Firefox removes it when the browser restarts.

### YouTube site access

WatchHistory needs access to `https://www.youtube.com` so it can save progress and show features such as resume badges and the Continue Watching shelf.

- In Firefox, open **Manage Extension** from the extension menu (or open `about:addons`) and enable **Access your data for https://www.youtube.com**.
- In Chrome or Edge, open **Manage extension**, then enable YouTube under **Site access**.
- Reload YouTube after changing the permission.

## Usage

### Popup

Click the extension icon to see recent videos and open History, Timeline, Stats, Options, or YouTube.

### History

Search by title or channel, hide watched videos, and sort by date or title. Each video can be opened, marked watched, reset, copied, or removed. There is no fixed history-entry limit; history is stored in IndexedDB and remains until you remove it or clear browser data.

### Timeline

Browse your saved history as a chronological feed grouped by day. Jump to an archived month and year without manually scrolling through the whole timeline. Gaps between active days are shown so breaks in viewing activity are easy to spot.

### Stats

See totals for archived and completed videos, watch time, and rewatches. The page also shows channel, streak, completion, and livestream information, plus the most-watched videos and channels. Copy a ready-to-share summary for a selected period, from today through all time.

### On YouTube

Resume and Watched badges appear on supported feeds. The thumbnail menu can mark a video watched or reset its progress without opening it. An optional Continue Watching shelf appears at the top of Subscriptions.

### Options

- Set the watched threshold (95% by default)
- Turn Resume badges, the Continue Watching shelf, redirects, and Shorts hiding on or off
- Count playback while a YouTube tab is in the background
- Hide watched videos by default in History search
- Enable Ghost Mode to pause tracking for the browser session
- Export or import history as JSON, and set backup reminders

## How it works

1. On YouTube watch pages, the extension saves the video, channel, progress, and active watch time while playback is running.
2. When you return to an unfinished video, it resumes from the saved position.
3. Reaching the watched threshold marks a video as watched. Starting over resets it to unwatched.
4. Progress is also saved when playback stops or you leave the page.

## Privacy

Video history is stored in IndexedDB. Settings are stored in `chrome.storage.local`. The extension has no analytics, tracking pixels, cloud sync, or external service. Use export for backups or transfers.

Because your history is stored locally, it can be lost if your browser data is cleared, your profile is reset, or your device fails. Export your history regularly if it is important to you.

## Technical details

The extension uses vanilla JavaScript and browser extension APIs. IndexedDB stores video history and watch data; `chrome.storage.local` stores settings. A content script runs on YouTube pages to save progress, add badges and menus, and resume videos. The History, Timeline, Stats, and Options pages read the same local data.

## Permissions

- `storage`: saves settings in `chrome.storage.local`
- `alarms`: schedules extension maintenance and backup reminders
- `https://www.youtube.com/*`: runs the extension on YouTube pages to track progress and show local controls

## Development

The extension is plain JavaScript with no compile step. Clone the repository and load the `src/` directory as an unpacked extension in Chrome or Edge.

```bash
git clone https://github.com/GeorgeElliott/yt-watch-history.git
cd yt-watch-history
```

Install the development dependencies before running the automated tests:

```bash
npm ci
npx playwright install chromium
```

Run the unit and extension tests with:

```bash
npm run test:all
```

The GitHub Actions release workflow runs these tests before packaging. When manually dispatching the workflow for debugging, `skip_tests` and `skip_release` are available as optional boolean inputs; both default to `false`.

### Package a release

Run the build script from the repository root. It creates ZIP files in `dist/`.

```powershell
# Windows PowerShell
.\build.ps1
.\build.ps1 -Browser chrome -Version 1.2.3
```

```bash
# macOS, Linux, or Git Bash
./build.sh
./build.sh chrome 1.2.3
```

Supported browser values are `chrome` and `firefox`.

## Contributing

Bug reports and pull requests are welcome. Review generated code before submitting it.

## License

[MIT](LICENSE)