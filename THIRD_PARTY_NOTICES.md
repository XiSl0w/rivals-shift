# Third-party notices

## TcNo Account Switcher

The Steam account discovery and switching flow in this project is adapted from:

- Project: TcNo Account Switcher
- Copyright: TCNOco and contributors
- Source: https://github.com/TCNOco/TcNo-Acc-Switcher
- License: GNU General Public License v3.0

Relevant upstream behavior includes reading and updating `loginusers.vdf`, selecting the active account with `MostRecent`/`AutoLogin`/`RememberPassword`, updating the Valve Steam registry keys on Windows, closing Steam processes, and restarting Steam. Rival Shift's implementation is a TypeScript/Electron adaptation with atomic file writes, rollback, and a Marvel Rivals-specific launch path.

The full GPL v3 license is available at https://www.gnu.org/licenses/gpl-3.0.txt and in the upstream repository.

## RivalsData

Rivals Data is an independent community service. Rival Shift can read public player data through the bundled `rivalsdata-player-sdk` or through its optional browser extension. The SDK is a local client wrapper for Rivals Data's public JSON endpoints and is included under `vendor/rivalsdata-player-sdk`. Rival Shift does not claim an official relationship with or endorsement by Rivals Data.

## @xhayper/discord-rpc

Discord Rich Presence uses `@xhayper/discord-rpc`, an ISC-licensed type-safe fork of Discord.js RPC.

- Source: https://github.com/xhayper/discord-rpc
- License: ISC
