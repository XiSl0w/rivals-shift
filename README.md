# Rival Shift

Rival Shift is a Windows-first Electron account switcher focused on **Marvel Rivals**. It discovers remembered Steam accounts and links each one to a Rivals Data player profile.

## What it does

- Reads remembered accounts from Steam's `config/loginusers.vdf`.
- Saves a Marvel Rivals UID, exact in-game name, and private note for each Steam account.
- Loads public profiles exclusively from Rivals Data. Settings can use either direct SDK API requests or the included browser extension.
- Includes a Players tab for manual name/UID search and a persistent favorites watchlist with rank, score, level, presence, and last-seen status.
- Shows Rivals Data hero performance, hero proficiency, and match history alongside the profile overview.
- Checks live lobbies through either the SDK API or Rivals Data's Live Game tab, including teams, ratings, projected changes, records, and heroes.
- Runs in the system tray with account quick-switch actions and a customizable global shortcut that opens Live Game and checks the active player.
- Saves rank snapshots and presents rank gains/losses plus daily and weekly performance summaries.
- Can export and import password-protected `.rsbackup` files encrypted with AES-256-GCM.
- Can monitor linked profiles in the background and show a desktop notification when a new match is detected.
- Orders accounts by competitive rank by default, with rank-tier filtering and alternate sorting by favorites, win rate, level, recent use, or name.
- Provides a one-click Quick Launch action on every account card; it launches the current account or switches and launches another account immediately.
- Includes a cross-account hero intelligence dashboard.
- Supports favorite accounts, persistent custom groups, group filters, and a global privacy mode that obscures names, UIDs, and avatars.
- Shows a built-in changelog alongside automatic update status.
- Force-closes Marvel Rivals before switching Steam's remembered account, relaunching Steam, and optionally starting Marvel Rivals (Steam app `2767030`).
- Can skip the game launcher for launches started through Rival Shift.
- Can notify when Marvel Rivals is launched directly while launch-only features are enabled, and can start with Windows either as a visible window or in the system tray.
- Supports optional background auto-update checks through an electron-builder HTTPS release feed.
- Stores profile links in Electron's permanent user-data folder. It never asks for or stores Steam passwords.
- Offers optional Discord Rich Presence, tracks live-game status while the Live Game tab is active, and reconnects in the background when Discord is opened later.
- Opens Steam's login form from the app so another remembered account can be added quickly.
- Shows Steam profile avatars with a local initials fallback when an avatar cannot be loaded.
- Includes an expandable navigation sidebar.

## Installation and sharing

Run `release/Rival Shift Setup 0.9.42.exe`. The borderless custom bootstrapper contains the desktop application and its browser-extension files; recipients do not need the source tree or `node_modules`.

For public distribution, share the setup executable together with the project license and third-party notices, publish a SHA-256 checksum, and use a trusted Windows code-signing certificate so SmartScreen can identify the publisher. Keep the source-code offer/repository available as required by GPL-3.0.

## Development

Requirements: Windows, Node.js 22+, and pnpm.

```powershell
pnpm install
pnpm dev
```

Public releases contain binaries and updater metadata only. The application source remains local. To publish a version, create a tag against the repository's README-only `main` commit and upload the four generated files from `release/`:

```powershell
git tag v0.9.42 origin/main
git push origin v0.9.42
```

The packaged app uses Electron's public GitHub Releases provider for `XiSl0w/rivals-shift`. Each release must include `latest.yml`, the raw `Rival-Shift-Payload` installer, its `.blockmap`, and the custom first-install setup executable.

Before publishing a later version, update the version in `package.json`, `extension/manifest.json`, `electron/rivals-bridge.ts`, and the visible version labels in `src/App.tsx`, then tag that exact version. For signed releases, add `WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` as GitHub Actions repository secrets.

Build and verify:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm dist
```

The Rivals Data SDK used by the desktop process is vendored under `vendor/rivalsdata-player-sdk`, so builds do not depend on a developer-specific absolute path. `pnpm test:live` performs a real API smoke test with UID `680173547` through Electron's Chromium networking stack.

## Steam switching safety

Before each switch, Rival Shift force-closes Marvel Rivals and its launcher, closes Steam, saves `loginusers.vdf_last`, updates the selected row's `MostRecent`, `AutoLogin`, and `RememberPassword` values, then writes `HKCU\Software\Valve\Steam\AutoLoginUser` and `RememberPassword`. If the file or registry update fails, the VDF backup is restored.

## Rivals Data connection modes

Choose the connection in Settings:

- **SDK API** is the default. It sends Rivals Data JSON requests directly through Electron, including `POST /live` for live lobbies, and does not require the browser extension or a local proxy.
- **Browser extension** opens Rivals Data player pages in a background browser tab as an alternate browser-backed profile and Live Game connection.

### Browser extension

The Manifest V3 extension supports these Chromium-based browsers:

| Browser | Extensions page |
| --- | --- |
| Google Chrome | `chrome://extensions` |
| Microsoft Edge | `edge://extensions` |
| Opera | `opera://extensions` |
| Brave | `brave://extensions` |
| Vivaldi | `vivaldi://extensions` |

Open the extensions page for your browser, enable Developer mode, choose **Load unpacked**, and select the folder shown in Rival Shift's Settings tab. The extension has access only to Rivals Data player pages.

The Steam-library refresh button loads every linked profile from Rivals Data using the selected connection mode. In extension mode, a profile's **Refresh stats** action opens its Rivals Data page, uses its update control, and imports the resulting data. Rank and hero images are copied into the saved snapshot so they continue to render after the browser tab closes.

## Discord Rich Presence

Rich Presence is enabled by default and can be turned on or off in Settings. It uses the built-in Rival Shift application ID, and Discord's desktop app must be running. When the selected account has cached player data, Discord shows `Viewing <account name>`, the current rank, and the public rank artwork as the small badge over the Rival Shift logo. For privacy, Rival Shift never falls back to a Steam username or sends an identity before player data is available.

## License and attribution

This project is licensed under GPL-3.0-only because its Steam switching flow is adapted from [TCNOco/TcNo-Acc-Switcher](https://github.com/TCNOco/TcNo-Acc-Switcher), also GPL-3.0. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

Steam, Marvel Rivals, Marvel, NetEase, Rivals Data, and their marks belong to their respective owners. This project is not affiliated with or endorsed by Valve, Marvel, NetEase, or Rivals Data.
