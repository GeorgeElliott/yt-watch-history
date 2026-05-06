# Privacy Policy for WatchHistory for YouTube™

**Last Updated:** May 4, 2026

WatchHistory for YouTube™ (the "Extension") is committed to protecting your privacy. This Privacy Policy explains how we handle user data. **Our core principle is simple: Your data stays on your device.**

## 1. Information Collection and Use

To provide the core features of the Extension (local watch history and auto-resume), we "handle" the following types of data:

- **Web History** — We collect the Title and Video ID of the YouTube videos you watch.
- **User Activity** — We collect playback timestamps (the exact second you stop watching) to enable the auto-resume feature.

## 2. Data Storage and Security

- **Local-First Architecture** — We use a hybrid approach to ensure maximum performance and data security.
    - **Settings & Preferences**: Stored locally using the chrome.storage.local API for fast, persistent access.  
    - **Watch History**: Stored locally using the browser's native IndexedDB API, which allows for high-capacity, high-performance data archival.
- **No Transmission** — Your watch history, video titles, and timestamps are never transmitted to an external server, cloud service, or any third party.
- **Encryption** — Data at rest is handled by the browser's secure internal storage mechanisms.
- **Local Backups** — You may choose to export your data to a local file for safekeeping. You are responsible for the security and storage of these exported files. We are not responsible for any data loss resulting from the mismanagement of your local device, browser cache clearing, or failure to perform regular backups.

## 3. Information Sharing and Disclosure

We do not sell, trade, or share your data with any third parties.

- **No Tracking** — We do not use analytics, tracking pixels, or cookies.
- **No Ads** — We do not use your data for advertising or marketing purposes.

## 4. User Control

You have complete control over your data:

- **Deletion** — You can clear individual videos or your entire history at any time via the Extension's Options page.
- **Export** — You can export your data to a JSON file for your own records.
- **Uninstall** — Removing the Extension will automatically delete all stored history from your browser.

## 5. Limited Use Disclosure

WatchHistory for YouTube™ complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/user_data_faq/), including the Limited Use requirements:

- **Allowed Use** — We only use video metadata and timestamps to provide the "Auto-Resume" and "History Search" features.
- **Allowed Transfer** — We do not transfer user data to others unless required by law or for security purposes.
- **Prohibited Advertising** — We never use your data for personalized, re-targeted, or interest-based advertisements.
- **Prohibited Human Interaction** — No humans (including the developer) have access to or can read your local history data.

## 6. Changes to This Policy

We may update this policy occasionally. Any changes will be reflected by the "Last Updated" date at the top of this page.

## 7. Contact

If you have any questions about this Privacy Policy, please open an issue on our [GitHub Repository](https://github.com/GeorgeElliott/yt-watch-history/issues).