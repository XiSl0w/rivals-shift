# Rivals Data player SDK

A TypeScript SDK for the player-data calls used by `rivalsdata.com`. It is designed for TypeScript, Electron, React/TSX, Node.js 20+, and modern browser environments.

By default, outbound requests are wrapped in the local proxy API at `http://localhost:8191/v1`. The SDK exposes typed client methods, validates inputs, supports cancellation and timeouts, deduplicates cached requests, and accepts custom proxy settings or a custom transport.

The upstream API is undocumented and may change. Check Rivals Data's terms and obtain permission before production or high-volume use.

## Install and build

```bash
npm install
npm run build
```

For a local application, install the SDK directory after building it:

```bash
npm install /absolute/path/to/rivalsdata-player-sdk
```

## Basic TypeScript usage

```ts
import { RivalsDataClient } from "rivalsdata-player-sdk";

const rivals = new RivalsDataClient();

const players = await rivals.searchPlayers("Veswa");
const profile = await rivals.getPlayer(680173547, { preferCache: true });
const history = await rivals.getPlayerMatches(680173547, { season: 19 });
const everything = await rivals.getAllPlayerData(680173547, { season: 19 });
```

The proxy service must be running before these calls are made. Each SDK request becomes a JSON `POST` to the proxy using `cmd: "request.post"`; the original SDK body is encoded into the proxy's `postData` field.

Every method is generic when your app has a more exact response model:

```ts
interface MyPlayer {
  uid: number;
  name: string;
  rank_game_season?: Record<string, unknown>;
}

const player = await rivals.getPlayer<MyPlayer>(680173547);
```

## Electron architecture

Call the SDK from Electron's main process, then expose narrow IPC methods through a preload script. This avoids putting API behavior in the renderer and works naturally with React.

Main process:

```ts
import { ipcMain } from "electron";
import { RivalsDataClient } from "rivalsdata-player-sdk";

const rivals = new RivalsDataClient();

ipcMain.handle("rivals:search", (_event, name: string) =>
  rivals.searchPlayers(name),
);

ipcMain.handle("rivals:player", (_event, uid: number) =>
  rivals.getAllPlayerData(uid, { season: 19 }),
);
```

Preload:

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("rivals", {
  search: (name: string) => ipcRenderer.invoke("rivals:search", name),
  player: (uid: number) => ipcRenderer.invoke("rivals:player", uid),
});
```

React/TSX:

```tsx
import { useEffect, useState } from "react";

export function Player({ uid }: { uid: number }) {
  const [data, setData] = useState<unknown>();

  useEffect(() => {
    void window.rivals.player(uid).then(setData);
  }, [uid]);

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

Add the corresponding `window.rivals` declaration to your application's global `.d.ts` file.

## Player methods

| SDK method | Upstream request |
| --- | --- |
| `searchPlayers(name)` | `POST /players/search` with `{ name }` |
| `getPlayer(uid)` | `POST /player` with `{ uid, prefer_cache? }` |
| `refreshPlayer(uid)` | Fresh `POST /player` with only `{ uid }` |
| `getPlayerHeroes(uid, options)` | `POST /player/heroes` |
| `getPlayerTeammates(uid, options)` | `POST /player/teammates` |
| `getPlayerCrosshairs(uid)` | `POST /player/crosshairs` |
| `getPlayerMatches(uid, options)` | `POST /player/matches/cached` |
| `getPlayerProficiency(uid)` | `POST /player/proficiency` |
| `getPlayerSkins(uid)` | `POST /player/skins` |
| `getPlayerPunishments(uid)` | `POST /player/punishments` |
| `getPlayerNameHistory(uid)` | `POST /player/name-history` |
| `getMatch(matchId)` | `POST /match` |
| `getLiveMatch(uid, options)` | `POST /live` |
| `getAllPlayerData(uid, options)` | Runs the player calls concurrently |

When a player is in a supported live game, pass the player UID to `getLiveMatch` to retrieve the lobby:

```js
const profile = await rivals.getPlayer(680173547, { preferCache: false });
const lobby = await rivals.getLiveMatch(profile.uid);
```

To reproduce the website's refresh behavior, use `refreshPlayer`. It omits
`prefer_cache` entirely and bypasses the SDK's local response cache:

```js
const freshProfile = await rivals.refreshPlayer(680173547);
```

The live endpoint is intentionally never cached by the SDK. It can temporarily report that a newly started match is still loading, and custom games may not be supported upstream.

Fresh match history uses `POST /player/matches` and is disabled by default. Enable it explicitly:

```ts
const rivals = new RivalsDataClient({ allowFreshMatches: true });
await rivals.getPlayerMatches(680173547, { fresh: true, season: 19 });
```

## Proxy server configuration

The default configuration gives the proxy 60 seconds for the upstream request and the SDK 65 seconds overall, leaving a small margin for the proxy to return its response:

```ts
const rivals = new RivalsDataClient({
  proxyServer: {
    endpoint: "http://localhost:8191/v1",
    maxTimeoutMs: 60_000,
  },
});
```

You can use an existing persistent session, session rotation, an outbound proxy, or rendering controls supported by the proxy API:

```ts
const rivals = new RivalsDataClient({
  proxyServer: {
    session: "rivals-session", // Create this session in the proxy first.
    sessionTtlMinutes: 30,
    waitInSeconds: 2,
    disableMedia: true,
  },
});
```

For a request without a persistent session, an outbound HTTP or SOCKS proxy can be provided:

```ts
const rivals = new RivalsDataClient({
  proxyServer: {
    proxy: { url: "socks5://127.0.0.1:1080" },
  },
});
```

Per-request proxy authentication is not supported by the proxy API. For an authenticated outbound proxy, create a persistent session with its `username` and `password`, then supply that session ID to this SDK.

To bypass the wrapper and use the original direct `fetch` transport explicitly:

```ts
const rivals = new RivalsDataClient({ proxyServer: false });
```

You can also construct the wrapper independently:

```ts
import { createProxyTransport, RivalsDataClient } from "rivalsdata-player-sdk";

const transport = createProxyTransport({
  endpoint: "http://proxy.internal:8191/v1",
});
const rivals = new RivalsDataClient({ transport });
```

## Authorized custom transport

The SDK can send requests through a server that is authorized to access the upstream API. A transport receives the final URL, method, JSON body, headers, and abort signal:

```ts
import type { RivalsDataTransport } from "rivalsdata-player-sdk";
import { RivalsDataClient } from "rivalsdata-player-sdk";

const transport: RivalsDataTransport = async (request) => {
  const response = await fetch("https://api.your-company.example/rivals-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body,
    }),
    signal: request.signal,
  });

  return {
    status: response.status,
    data: await response.json(),
  };
};

const rivals = new RivalsDataClient({ transport });
```

The package does not include Cloudflare-challenge solving, clearance-cookie reuse, browser impersonation, or CAPTCHA automation.

## Errors and cancellation

```ts
import { RivalsDataError } from "rivalsdata-player-sdk";

const controller = new AbortController();

try {
  await rivals.getPlayer(680173547, { signal: controller.signal });
} catch (error) {
  if (error instanceof RivalsDataError) {
    console.error(error.code, error.status, error.message);
  }
}
```

Error codes include `INVALID_ARGUMENT`, `FRESH_MATCHES_DISABLED`, `NETWORK_ERROR`, `TIMEOUT`, `UPSTREAM_ERROR`, and `INVALID_RESPONSE`.

## Test

```bash
npm test
```

Tests use an in-memory transport and never call Rivals Data.
