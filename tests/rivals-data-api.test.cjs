const test = require('node:test');
const assert = require('node:assert/strict');
const { createElectronTransport, isDestroyedBrowserError, normalizeLiveMatchResponse, normalizeRivalsDataResponses, normalizeRivalsDataSummary, normalizeSkins, normalizeTopSnipers, normalizeTrackedPlayer, overallPeakRank, rankProgress } = require('../dist-electron/rivals-data-api.js');

test('skin inventory responses normalize current and legacy Rivals Data field names', () => {
  assert.deepEqual(normalizeSkins({ skins: [
    { skin_id: 101, skin_name: 'Vengeance', hero_name: 'Psylocke', image_url: '/assets/skins/vengeance.webp', rarity: 'Legendary', units: 2200 },
    { costume_id: 102, costume_name: 'Blood Soul', character_id: 1029, icon: 'https://cdn.example/blood-soul.webp', quality: 'Epic' },
  ] }), [
    { id: '101', name: 'Vengeance', hero: 'Psylocke', iconUrl: 'https://rivalsdata.com/assets/skins/vengeance.webp', rarity: 'Legendary', value: 2200 },
    { id: '102', name: 'Blood Soul', hero: 'Magik', iconUrl: 'https://cdn.example/blood-soul.webp', rarity: 'Epic' },
  ]);
});

const profile = {
  steamId64: 'steam', uid: '680173547', inGameName: '', note: '', favorite: false,
  updatedAt: null, status: 'linked',
};

test('SDK responses normalize into the single Rivals Data profile model', () => {
  const result = normalizeRivalsDataResponses(
    profile,
    {
      uid: 680173547,
      name: 'Veswa',
      level: 77,
      icon: 31065203,
      faction: { name: 'Night Shift' },
      leaderboard: { 19: 84 },
      match_history_is_visible: 1,
      rank_game_season: {
        old: { update_time: 10, level: 20, battle_count: 10, win_count: 5, rank_score: 4300, max_level: 21, max_rank_score: 5088 },
        current: { update_time: 20, level: 20, battle_count: 30, win_count: 24, rank_score: 4877.186, max_level: 20, max_rank_score: 4892 },
      },
    },
    [
      { hero_id: 1066, games: 12, wins: 9, losses: 3, kda: 4.5 },
      { hero_id: 1037, games: 8, wins: 4, losses: 4, kda: 2.25 },
    ],
    { '1037_680173547': { hero_proficiency_infos: { 1037: { proficiency_level: 40 }, 1066: { proficiency_level: 12 } } } },
    { matches: [{ match_uid: 'match-1', game_mode_id: 2, game_play_mode_id: 200, timestamp: Math.floor(Date.now() / 1000) - 120, season: 19, is_win: false, hero_id: 1066, rank_level: 20, rank_score: 4877.186, score_change: -23, kills: 12, deaths: 3, assists: 6, is_mvp: true, placement: 1, map_id: 1291, platform: 1, team_score: { player: 2, opponent: 3 } }] },
    { chat: { reason: 'Test restriction', expire_time: 4_102_444_800 }, login: null, rank: null },
    [{ name: 'Veswa', first_seen: 1_700_000_000 }, { name: 'Old name', first_seen: 1_600_000_000 }],
    [{ teammate_uid: 42, name: 'Friend', icon: 31060001, games: 10, wins: 7, losses: 3 }],
    [{ crosshair: '1;0;P;c;5', uses: 200 }],
    { units_value: 4200, event_skins: { owned: 2, total: 147 }, skins: [{ id: 1011501, name: 'Green Scar', hero_id: 1011, price: 2000, category: 'event', source: 'Event' }] },
  );

  assert.equal(result.inGameName, 'Veswa');
  assert.equal(result.status, 'synced');
  assert.deepEqual({ rank: result.stats.rank, score: result.stats.rankScore, wins: result.stats.wins, losses: result.stats.losses, matches: result.stats.matches, winRate: result.stats.winRate },
    { rank: 'Celestial 2', score: 4877, wins: 24, losses: 6, matches: 30, winRate: 80 });
  assert.equal(result.stats.rankProgress, -23);
  assert.equal(result.stats.rankProgressMax, 100);
  assert.equal(result.stats.peakRank, 'Celestial 1');
  assert.equal(result.stats.peakRankScore, 88);
  assert.equal(result.stats.rankIconUrl, 'https://rivalsdata.com/assets/ranks/celestial.webp');
  assert.equal(result.stats.rankIconRemoteUrl, result.stats.rankIconUrl);
  assert.equal(result.stats.leaderboardRank, '#84');
  assert.equal(result.stats.factionName, 'Night Shift');
  assert.equal(result.stats.matchHistoryVisible, true);
  assert.equal(result.stats.profileIconUrl, 'https://cdn.rivalsdata.com/assets/icons/31065203.webp');
  assert.deepEqual(result.stats.heroes, ['The Hood', 'Magneto']);
  assert.equal(result.stats.heroStats[0].iconUrl, 'https://rivalsdata.com/assets/heroes/the-hood.webp');
  assert.deepEqual(result.stats.proficiency.map(({ name, level }) => ({ name, level })), [{ name: 'Magneto', level: 40 }, { name: 'The Hood', level: 12 }]);
  assert.deepEqual({ mode: result.stats.matchHistory[0].mode, result: result.stats.matchHistory[0].result, hero: result.stats.matchHistory[0].hero, score: result.stats.matchHistory[0].score, placement: result.stats.matchHistory[0].placement },
    { mode: 'Competitive', result: 'loss', hero: 'The Hood', score: '2:3', placement: 'MVP' });
  assert.deepEqual({ id: result.stats.matchHistory[0].matchId, change: result.stats.matchHistory[0].scoreChange, progress: result.stats.matchHistory[0].rankProgress, season: result.stats.matchHistory[0].season, map: result.stats.matchHistory[0].map, mapMode: result.stats.matchHistory[0].mapMode, platform: result.stats.matchHistory[0].platform },
    { id: 'match-1', change: -23, progress: -23, season: 19, map: 'Midtown', mapMode: 'Convoy', platform: 'PC' });
  assert.equal(result.stats.punishments.find((item) => item.kind === 'chat').active, true);
  assert.equal(result.stats.punishments.find((item) => item.kind === 'login').active, false);
  assert.deepEqual(result.stats.nameHistory.map((entry) => entry.name), ['Veswa', 'Old name']);
  assert.deepEqual({ name: result.stats.teammates[0].name, winRate: result.stats.teammates[0].winRate }, { name: 'Friend', winRate: 70 });
  assert.deepEqual(result.stats.crosshairs[0], { code: '1;0;P;c;5', uses: 200 });
  assert.deepEqual({ inventoryValue: result.stats.skinInventoryValue, eventOwned: result.stats.eventSkinsOwned, eventTotal: result.stats.eventSkinsTotal, skins: result.stats.skins.length }, { inventoryValue: 4200, eventOwned: 2, eventTotal: 147, skins: 1 });
  assert.equal(result.stats.source, 'Rivals Data via SDK API');
});

test('rank progress follows the signed -30 to 100 division range', () => {
  assert.equal(rankProgress(4877.186, 20), -23);
  assert.equal(rankProgress(5078, 21), 78);
  assert.equal(rankProgress(5463.7, 23), undefined);
  assert.equal(rankProgress(undefined, 20), undefined);
});

test('summary refresh updates card fields without clearing cached detail data', () => {
  const cached = {
    ...profile,
    stats: {
      heroStats: [{ name: 'Magneto', matches: 9 }],
      proficiency: [{ name: 'Magneto', level: 40 }],
      matchHistory: [{ mode: 'Competitive', timeAgo: '2m ago' }],
      skins: [{ name: 'Costume' }],
    },
  };
  const result = normalizeRivalsDataSummary(cached, {
    uid: 680173547,
    name: 'Veswa',
    level: 81,
    rank_game_season: { current: { update_time: 20, level: 20, battle_count: 40, win_count: 30, rank_score: 4890 } },
  });
  assert.deepEqual({ level: result.stats.level, matches: result.stats.matches, wins: result.stats.wins, rank: result.stats.rank }, { level: 81, matches: 40, wins: 30, rank: 'Celestial 2' });
  assert.deepEqual(result.stats.heroStats, cached.stats.heroStats);
  assert.deepEqual(result.stats.proficiency, cached.stats.proficiency);
  assert.deepEqual(result.stats.matchHistory, cached.stats.matchHistory);
  assert.deepEqual(result.stats.skins, cached.stats.skins);
});

test('full refresh keeps cached detail sections when secondary endpoints time out', () => {
  const cached = {
    ...profile,
    stats: {
      rank: 'Celestial 2',
      heroStats: [{ name: 'Magneto', matches: 9 }],
      proficiency: [{ name: 'Magneto', level: 40 }],
      matchHistory: [{ mode: 'Competitive', timeAgo: '2m ago' }],
      skins: [{ id: 'skin-1', name: 'Costume' }],
    },
  };
  const result = normalizeRivalsDataResponses(cached, {
    uid: 680173547,
    rank_game_season: { current: { update_time: 30, level: 18, rank_score: 4650 } },
  }, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
  assert.equal(result.stats.rank, 'Grandmaster 1');
  assert.deepEqual(result.stats.heroStats, cached.stats.heroStats);
  assert.deepEqual(result.stats.proficiency, cached.stats.proficiency);
  assert.deepEqual(result.stats.matchHistory, cached.stats.matchHistory);
  assert.deepEqual(result.stats.skins, cached.stats.skins);
});

test('duration-based punishments expire from their start time', () => {
  const result = normalizeRivalsDataResponses(
    profile,
    { uid: 1487699139 }, [], {}, { matches: [] },
    { chat: { time: '1785593560', expire: '604800', reason: '101', uid: '1487699139' }, login: null, rank: null },
  );
  const chat = result.stats.punishments.find((item) => item.kind === 'chat');
  assert.equal(chat.startsAt, '2026-08-01T14:12:40.000Z');
  assert.equal(chat.expiresAt, '2026-08-08T14:12:40.000Z');
  assert.equal(chat.expired, true);
  assert.equal(chat.active, false);
});

test('Electron transport sends the SDK body as JSON and returns JSON data', async () => {
  let captured;
  const transport = createElectronTransport({
    async fetch(url, options) {
      captured = { url, options };
      return new Response(JSON.stringify({ uid: 680173547 }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const controller = new AbortController();
  const response = await transport({
    url: 'https://api.rivalsdata.com/player', method: 'POST',
    headers: { 'content-type': 'application/json' }, body: { uid: 680173547, prefer_cache: 1 }, signal: controller.signal,
  });
  assert.equal(captured.url, 'https://api.rivalsdata.com/player');
  assert.equal(captured.options.body, JSON.stringify({ uid: 680173547, prefer_cache: 1 }));
  assert.equal(captured.options.signal, controller.signal);
  assert.deepEqual(response.data, { uid: 680173547 });
});

test('Electron transport sends leaderboard GET requests without a body', async () => {
  let captured;
  const transport = createElectronTransport({
    async fetch(url, options) {
      captured = { url, options };
      return new Response(JSON.stringify({ players: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const response = await transport({ url: 'https://api.rivalsdata.com/leaderboards?limit=1000&os=1', method: 'GET', headers: {}, signal: new AbortController().signal });
  assert.equal(captured.options.method, 'GET');
  assert.equal(captured.options.body, undefined);
  assert.deepEqual(response.data, { players: [] });
});

test('preferred browser transport falls back when a direct request hangs', async () => {
  let directRequests = 0;
  let browserRequests = 0;
  const transport = createElectronTransport({
    async fetch() {
      directRequests += 1;
      return new Promise(() => {});
    },
  }, async () => {
    browserRequests += 1;
    return { status: 200, data: { ok: true } };
  }, true);
  const response = await transport({ url: 'https://api.rivalsdata.com/player', method: 'POST', headers: {}, body: { uid: '1' }, signal: new AbortController().signal });
  assert.deepEqual(response, { status: 200, data: { ok: true } });
  assert.equal(directRequests, 1);
  assert.equal(browserRequests, 1);
});

test('top sniper groups queued, in-game, and online top-1,000 players in priority order', () => {
  const result = normalizeTopSnipers({ players: [
    { position: 9, uid: 9, name: 'Grouped', icon: 31060001, rank_level: 23, rank_score: 5600, wins: 10, losses: 5, status: { state: 4, team_member_count: 2, max_member: 6 } },
    { position: 33, uid: 33, name: 'Queued', rank_level: 22, rank_score: 5480, wins: 7, losses: 3, status: { state: 7 } },
    { position: 59, uid: 59, name: 'Playing', rank_level: 21, rank_score: 5090, status: { state: 10, game_play_mode_id: 200 } },
    { position: 70, uid: 70, name: 'Online', status: { state: 1 } },
    { position: 1001, uid: 1001, name: 'Outside', status: { state: 10 } },
  ] });
  assert.deepEqual(result.map(({ leaderboardPosition, name, presenceText }) => ({ leaderboardPosition, name, presenceText })), [
    { leaderboardPosition: 33, name: 'Queued', presenceText: 'In queue' },
    { leaderboardPosition: 59, name: 'Playing', presenceText: 'In game (Competitive)' },
    { leaderboardPosition: 9, name: 'Grouped', presenceText: 'In team (2/6)' },
    { leaderboardPosition: 70, name: 'Online', presenceText: 'Online' },
  ]);
  assert.equal(result[2].iconUrl, 'https://cdn.rivalsdata.com/assets/icons/31060001.webp');
  assert.equal(result[2].winRate, 66.7);
});

test('Electron transport rejects a successful HTML challenge as an API response', async () => {
  const transport = createElectronTransport({
    async fetch() { return new Response('<html>challenge</html>', { status: 200, headers: { 'content-type': 'text/html' } }); },
  });
  const response = await transport({ url: 'https://api.rivalsdata.com/player', method: 'POST', headers: {}, body: {}, signal: new AbortController().signal });
  assert.equal(response.status, 502);
  assert.match(response.data.error, /non-JSON/i);
});

test('Electron transport returns to its normal session after browser verification succeeds', async () => {
  let directRequests = 0;
  const fallbackRequests = [];
  const transport = createElectronTransport({
    async fetch() {
      directRequests += 1;
      if (directRequests > 1) return new Response(JSON.stringify({ ok: true, direct: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      return new Response('<html><title>Just a moment...</title></html>', {
        status: 403,
        headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' },
      });
    },
  }, async (request) => {
    fallbackRequests.push(request.url);
    return { status: 200, data: { ok: true } };
  });
  const request = { url: 'https://api.rivalsdata.com/player', method: 'POST', headers: {}, body: {}, signal: new AbortController().signal };
  assert.deepEqual((await transport(request)).data, { ok: true });
  assert.deepEqual((await transport(request)).data, { ok: true, direct: true });
  assert.equal(directRequests, 2);
  assert.deepEqual(fallbackRequests, [request.url]);
});

test('Electron transport treats Rivals Data Turnstile JSON errors as a browser challenge', async () => {
  let directRequests = 0;
  const fallbackRequests = [];
  const transport = createElectronTransport({
    async fetch() {
      directRequests += 1;
      if (directRequests > 1) return new Response(JSON.stringify({ ok: true, direct: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      return new Response(JSON.stringify({ error: 'Turnstile verification required' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    },
  }, async (request) => {
    fallbackRequests.push(request.url);
    return { status: 200, data: { ok: true } };
  });
  const request = { url: 'https://api.rivalsdata.com/player', method: 'POST', headers: {}, body: { uid: '264256233' }, signal: new AbortController().signal };
  assert.deepEqual(await transport(request), { status: 200, data: { ok: true } });
  assert.deepEqual(await transport(request), { status: 200, data: { ok: true, direct: true }, headers: { 'content-type': 'application/json' } });
  assert.equal(directRequests, 2);
  assert.deepEqual(fallbackRequests, [request.url]);
});

test('Electron transport shares one browser verification across concurrent requests', async () => {
  let verified = false;
  let verificationRequests = 0;
  let releaseVerification;
  const verificationGate = new Promise((resolve) => { releaseVerification = resolve; });
  const transport = createElectronTransport({
    async fetch() {
      if (verified) return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      return new Response(JSON.stringify({ error: 'turnstile required' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    },
  }, async () => {
    verificationRequests += 1;
    await verificationGate;
    verified = true;
    return { status: 200, data: { ok: true, verified: true } };
  });
  const first = transport({ url: 'https://api.rivalsdata.com/player', method: 'POST', headers: {}, body: { uid: '1' }, signal: new AbortController().signal });
  const second = transport({ url: 'https://api.rivalsdata.com/player', method: 'POST', headers: {}, body: { uid: '2' }, signal: new AbortController().signal });
  await new Promise((resolve) => setImmediate(resolve));
  releaseVerification();
  const responses = await Promise.all([first, second]);
  assert.equal(verificationRequests, 1);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
});

test('Electron transport preserves an actionable browser-verification failure', async () => {
  const transport = createElectronTransport({
    async fetch() {
      return new Response('<title>Just a moment...</title>', {
        status: 403,
        headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' },
      });
    },
  }, async () => { throw new Error('Rivals Data verification was closed or timed out.'); });
  const request = { url: 'https://api.rivalsdata.com/player', method: 'POST', headers: {}, body: { uid: '264256233' }, signal: new AbortController().signal };
  assert.deepEqual(await transport(request), {
    status: 503,
    data: { error: 'Rivals Data verification was closed or timed out.' },
  });
});

test('Electron transport aborts a browser verification that never settles', async () => {
  const transport = createElectronTransport({
    async fetch() {
      return new Response(JSON.stringify({ error: 'turnstile required' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    },
  }, async () => new Promise(() => {}));
  const controller = new AbortController();
  const request = transport({ url: 'https://api.rivalsdata.com/player', method: 'POST', headers: {}, body: { uid: '1' }, signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort(new Error('deadline'));
  await assert.rejects(request, /deadline/);
});

test('Rivals Data browser fallback triggers the site verification dialog and waits for API access', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', 'electron', 'rivals-data-api.ts'), 'utf8');
  assert.match(source, /verificationUrl\(request/);
  assert.match(source, /rivalsdata\.com\/player\/\$\{bodyUid\}/);
  assert.doesNotMatch(source, /return requested\.href/);
  assert.doesNotMatch(source, /'api\.rivalsdata\.com'\]\.includes\(hostname\)/);
  assert.match(source, /void browser\.loadURL\(this\.verificationUrl\(request\)\)\.catch/);
  assert.match(source, /iframe\[src\*="challenges\.cloudflare\.com"\]/);
  assert.match(source, /browser\.setSize\(500, 440\)/);
  assert.match(source, /Network\.getResponseBody/);
  assert.match(source, /apiProbe = capturedResponse \?\? await Promise\.race/);
  assert.match(source, /visibleChallengeChecks >= 2/);
  assert.match(source, /const showVerificationAt = Date\.now\(\) \+ 750/);
  assert.match(source, /const showVerificationTimer = setTimeout\(showVerification, 750\)/);
  assert.match(source, /clearTimeout\(showVerificationTimer\)/);
  assert.match(source, /probeChallenge/);
  assert.doesNotMatch(source, /if \(verificationShown && !confirmedChallenge\)/);
  assert.match(source, /element\.checkVisibility/);
  assert.match(source, /browser\.setSkipTaskbar\(true\);\s*browser\.hide\(\)/);
  assert.match(source, /this\.executeInPage\(browser, request\),\s*new Promise<null>/);
  assert.match(source, /browser\.hide\(\)/);
  assert.match(source, /if \(request\.signal\.aborted\) \{\s*this\.resetBrowserWindow\(backgroundWindow\)/);
  assert.match(source, /private requestQueue: Promise<void> = Promise\.resolve\(\)/);
  assert.match(source, /this\.requestQueue = run\.then/);
  assert.match(source, /createElectronTransport\(chromiumSession, \(request\) => browserTransport\.request\(request\), true\)/);
  assert.doesNotMatch(source, /leaderboards\?limit=1&os=1/);
  assert.match(source, /retryAfter = Date\.now\(\) \+ 60_000/);
  assert.match(source, /verifying you're human/);
  assert.match(source, /turnstile\(\?: verification\)\? required/);
  assert.match(source, /Finish both Cloudflare verification steps/);
});

test('bulk account refresh serializes protected API work and deduplicates profile requests', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', 'electron', 'main.ts'), 'utf8');
  assert.match(source, /preferences\.rivalsDataMode === 'api' \? 1 : 2/);
  assert.match(source, /Math\.min\(concurrency, linked\.length\)/);
  assert.match(source, /profileRefreshes\.get\(steamId64\)/);
  assert.match(source, /scope === 'summary' \? 165_000 : 195_000/);
  assert.match(source, /settleWithSignal\(operation, refreshDeadline\)/);
  assert.match(source, /profile\.stats && \(scope === 'summary' \|\| disposedBrowserSession\)/);
  assert.match(source, /refreshNotice: 'cached'/);
  assert.match(source, /refreshSummary\(profile, refreshDeadline\)/);
  assert.match(source, /Cached stats were kept and the remaining accounts will continue/);
});

test('destroyed Electron browser sessions are recreated without surfacing the internal error', () => {
  const apiSource = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', 'electron', 'rivals-data-api.ts'), 'utf8');
  const mainSource = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', 'electron', 'main.ts'), 'utf8');
  assert.match(apiSource, /function isDestroyedBrowserError/);
  assert.match(apiSource, /this\.resetBrowserWindow\(backgroundWindow\)/);
  assert.match(apiSource, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(apiSource, /browser session restarted before the API request completed/);
  assert.match(mainSource, /The Rivals Data browser session restarted\. Cached stats were kept/);
});

test('destroyed Electron object detection covers API lifecycle variants', () => {
  for (const message of [
    'Object has been destroyed',
    'Render frame was disposed',
    'WebContents is destroyed',
    'Browser window was destroyed',
    'Session is destroyed',
  ]) assert.equal(isDestroyedBrowserError(new Error(message)), true, message);
  assert.equal(isDestroyedBrowserError(new Error('Rivals Data returned HTTP 500')), false);
});

test('profile refresh shares one deadline across every SDK request', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', 'electron', 'rivals-data-api.ts'), 'utf8');
  assert.match(source, /async refreshSummary\(profile: RivalProfile, signal\?: AbortSignal\)/);
  assert.match(source, /return normalizeRivalsDataSummary\(profile, player\)/);
  assert.match(source, /async refresh\(profile: RivalProfile, signal\?: AbortSignal\)/);
  assert.match(source, /refreshPlayer\(uid, \{ signal \}\)/);
  assert.match(source, /getPlayerSkins\(uid, \{ signal: detailSignal \}\)/);
  assert.match(source, /timeoutMs: 150_000/);
  assert.match(source, /AbortSignal\.timeout\(25_000\)/);
  const refreshSource = source.slice(source.indexOf('async refreshSummary'), source.indexOf('async liveMatch'));
  assert.doesNotMatch(refreshSource, /refreshPlayer\(uid, \{ signal \}\)\.catch/);
  assert.doesNotMatch(refreshSource, /getPlayer\(uid, \{ preferCache: true/);
});

test('tracked players preserve Rivals Data presence, team size, and last-seen state', () => {
  const inTeam = normalizeTrackedPlayer({ uid: 12, name: 'Party', icon: 31060001, level: 42, status: { state: 4, team_member_count: 2, max_member: 6 }, rank_game_season: { current: { update_time: 20, level: 18, rank_score: 4722 } } }, { uid: '12' }, true);
  assert.deepEqual({ presence: inTeam.presence, text: inTeam.presenceText, favorite: inTeam.favorite, rank: inTeam.rank, score: inTeam.rankScore, progress: inTeam.rankProgress }, { presence: 'in-team', text: 'In team (2/6)', favorite: true, rank: 'Grandmaster 1', score: 4722, progress: 22 });
  assert.equal(inTeam.iconUrl, 'https://cdn.rivalsdata.com/assets/icons/31060001.webp');

  const inGame = normalizeTrackedPlayer({ uid: 13, name: 'Playing', status: { state: 10, game_play_mode_id: 200 } }, { uid: '13' });
  assert.deepEqual({ presence: inGame.presence, text: inGame.presenceText }, { presence: 'in-game', text: 'In game (Competitive)' });

  const offline = normalizeTrackedPlayer({ uid: 14, name: 'Sleeping', last_seen: 1_700_000_000 }, { uid: '14' });
  assert.equal(offline.presenceText, 'Offline');
  assert.equal(offline.lastSeenAt, '2023-11-14T22:13:20.000Z');
});

test('SDK live responses normalize into lobby teams with rank progress and details', () => {
  const startedAt = Math.floor(Date.now() / 1000) - 125;
  const snapshot = normalizeLiveMatchResponse(
    profile,
    { name: 'Veswa', status: { state: 10, game_play_mode_id: 200, start_time: startedAt } },
    {
      team_avg_rank: { 0: 5200, 1: 4900 },
      players: {
        hidden: { uid: 22, side: 0, name: 'Opponent', rank: { level: 23, score: 3900 }, wins: 5, losses: 3, icon: 31060002, top_heroes: [{ hero_id: 1037, wins: 4, losses: 2 }] },
        680173547: { side: 1, name: 'Veswa', rank: { level: 20, score: 3877.186 }, games: 154, wins: 24, losses: 6, icon: 31060001, team_id: 77, top_heroes: [{ hero_id: 1066, wins: 9, losses: 3 }], proficiency: [{ hero_id: 1037, level: 40, points: 100 }] },
        42: { side: 1, name: 'Friend', rank: { level: 20, score: 4925 }, wins: 7, losses: 3, team_id: 77 },
      },
    },
    {
      22: { rank_game_season: { old: { update_time: 10, level: 20, rank_score: 4880, max_level: 22, max_rank_score: 5206 }, current: { update_time: 20, level: 23, rank_score: 5300, max_level: 23, max_rank_score: 5355 } } },
      680173547: { rank_game_season: { old: { update_time: 10, level: 18, rank_score: 4710, max_level: 21, max_rank_score: 5088 }, current: { update_time: 20, level: 20, rank_score: 4877.186, max_level: 20, max_rank_score: 4892 } } },
    },
  );

  assert.equal(snapshot.status, 'in-game');
  assert.equal(snapshot.mode, 'Competitive');
  assert.match(snapshot.elapsed, /^2:0[45]$/);
  assert.deepEqual(snapshot.teams.map((team) => ({ average: team.averageRankScore, change: team.projectedChange })), [
    { average: 4900, change: -300 },
    { average: 5200, change: 300 },
  ]);
  const current = snapshot.teams[0].players.find((player) => player.uid === '680173547');
  assert.deepEqual({ rank: current.rank, score: current.rankScore, party: current.inParty, wins: current.wins, losses: current.losses, winRate: current.winRate },
    { rank: 'Celestial 2', score: -23, party: true, wins: 24, losses: 6, winRate: 80 });
  assert.deepEqual({ rank: current.peakRank, score: current.peakRankScore }, { rank: 'Celestial 1', score: 88 });
  assert.deepEqual(current.heroes.map((hero) => hero.name), ['The Hood']);
  assert.deepEqual(current.heroStats[0], { name: 'The Hood', iconUrl: 'https://rivalsdata.com/assets/heroes/the-hood.webp', matches: 12, winRate: 75 });
  assert.deepEqual({ name: current.proficiency[0].name, level: current.proficiency[0].level }, { name: 'Magneto', level: 40 });
  assert.equal(snapshot.teams[1].players[0].rankScore, 230);
  assert.deepEqual({ rank: snapshot.teams[1].players[0].peakRank, score: snapshot.teams[1].players[0].peakRankScore }, { rank: 'One Above All', score: 285 });
});

test('overall peak selects the highest achieved rank across every season', () => {
  const peak = overallPeakRank({
    rank_game_season: {
      newest: { update_time: 30, level: 18, rank_score: 4720, max_level: 18, max_rank_score: 4762 },
      middle: { update_time: 20, level: 19, rank_score: 4810, max_level: 20, max_rank_score: 4963 },
      oldest: { update_time: 10, level: 20, rank_score: 4900, max_level: 20, max_rank_score: 4977 },
    },
  });
  assert.deepEqual(peak, {
    rank: 'Celestial 2',
    score: 77,
    iconUrl: 'https://rivalsdata.com/assets/ranks/celestial.webp',
  });
});

test('live matchmaking rating is never clamped into a fake -30 rank progress', () => {
  const snapshot = normalizeLiveMatchResponse(
    profile,
    { status: { state: 10, battle_id: 'live', game_play_mode_id: 100 } },
    { players: { 1: { uid: 42, side: 1, name: 'MMR player', rank: { level: 19, score: 3877.88 } } } },
  );
  assert.equal(snapshot.teams[0].players[0].rankScore, undefined);
});

test('SDK live normalization returns offline without an active in-game state', () => {
  const snapshot = normalizeLiveMatchResponse(profile, { status: { state: 1 } }, {});
  assert.deepEqual({ status: snapshot.status, teams: snapshot.teams }, { status: 'offline', teams: [] });
});

test('a populated live lobby overrides a stale cached offline profile status', () => {
  const snapshot = normalizeLiveMatchResponse(
    profile,
    { status: { state: 1 } },
    { mode: 'Competitive', elapsed: '07:55', team_avg_rank: { 0: 4935, 1: 4926 }, players: {
      2133703603: { uid: 2133703603, side: 0, name: 't1mbur', rank: { level: 20, score: 4963 }, wins: 19, losses: 12 },
      42: { uid: 42, side: 1, name: 'Opponent', rank: { level: 20, score: 4954 }, wins: 10, losses: 8 },
    } },
  );
  assert.equal(snapshot.status, 'in-game');
  assert.equal(snapshot.mode, 'Competitive');
  assert.equal(snapshot.elapsed, '07:55');
  assert.equal(snapshot.teams.flatMap((team) => team.players).length, 2);
});

test('SDK live lookup starts with the authoritative endpoint and skips opponent profile fan-out', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', 'electron', 'rivals-data-api.ts'), 'utf8');
  assert.match(source, /const firstLive = client\.getLiveMatch\(uid\)/);
  assert.match(source, /const deadline = Date\.now\(\) \+ 25_000/);
  assert.match(source, /setTimeout\(resolve, 2_000\)/);
  assert.doesNotMatch(source, /const publicUids =/);
});
