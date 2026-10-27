const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeRivalsDataSnapshot, RIVALS_DATA_EXTENSION_VERSION, RivalsDataBridge } = require('../dist-electron/rivals-bridge.js');
const fs = require('node:fs');
const path = require('node:path');

test('desktop bridge requires the same extension runtime version as the manifest', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'extension', 'manifest.json'), 'utf8'));
  assert.equal(RIVALS_DATA_EXTENSION_VERSION, manifest.version);
});

test('desktop bridge reports a recently seen stale browser runtime as disconnected', () => {
  const bridge = new RivalsDataBridge('extension');
  bridge.lastSeenAt = Date.now();
  bridge.lastExtensionVersion = '0.6.3';
  const status = bridge.status();
  assert.equal(status.connected, false);
  assert.match(status.message, new RegExp(`running extension v0\\.6\\.3.*Reload.*v${RIVALS_DATA_EXTENSION_VERSION.replace(/\./g, '\\.')}.*`, 'i'));
});

test('desktop bridge accepts only the exact current browser runtime', () => {
  const bridge = new RivalsDataBridge('extension');
  bridge.lastSeenAt = Date.now();
  bridge.lastExtensionVersion = RIVALS_DATA_EXTENSION_VERSION;
  assert.equal(bridge.status().connected, true);
});

test('desktop bridge health checks do not impersonate an extension heartbeat', async () => {
  // Use an ephemeral port so a developer's loaded extension cannot race this test.
  const bridge = new RivalsDataBridge('extension', 0);
  await bridge.start();
  try {
    const health = await fetch(`http://127.0.0.1:${bridge.port()}/v1/health`).then((response) => response.json());
    assert.equal(health.connected, false);
    assert.equal(bridge.lastSeenAt, 0);
  } finally { bridge.close(); }
});

test('force restart cancels the active live-match job before starting over', async () => {
  const bridge = new RivalsDataBridge('extension');
  bridge.lastSeenAt = Date.now();
  bridge.lastExtensionVersion = RIVALS_DATA_EXTENSION_VERSION;
  const profile = { steamId64: 'steam', uid: '1487699139', inGameName: 'Def not Xi', note: '', favorite: false, updatedAt: null, status: 'linked' };
  const first = bridge.liveMatch(profile);
  const second = bridge.liveMatch(profile, false, true);
  await assert.rejects(first, /restarted from the beginning/i);
  assert.equal(bridge.jobs.size, 1);
  assert.equal(bridge.cancellations.size, 1);
  const secondRejected = assert.rejects(second, /closed before.*refresh completed/i);
  bridge.close();
  await secondRejected;
});

test('Rivals Data snapshot merges stats and game asset URLs without dropping cached fields', () => {
  const profile = {
    steamId64: 'steam', uid: '123', inGameName: 'Old', note: '', favorite: false,
    updatedAt: null, status: 'linked', stats: { matches: 9, heroIcons: { Magik: 'https://old/magik.png' } },
  };
  const merged = mergeRivalsDataSnapshot(profile, {
    uid: '123', name: 'Fresh', rank: 'Diamond 2', rankIconUrl: 'https://assets/rank.png',
    winRate: 55.4, heroes: [{ name: 'Magik', iconUrl: 'https://assets/magik.png' }, { name: 'Luna Snow', iconUrl: 'https://assets/luna.png' }],
  });
  assert.equal(merged.inGameName, 'Old');
  assert.equal(merged.stats.rank, 'Diamond 2');
  assert.equal(merged.stats.matches, 9);
  assert.equal(merged.stats.rankIconUrl, 'https://assets/rank.png');
  assert.deepEqual(merged.stats.heroes, ['Magik', 'Luna Snow']);
  assert.equal(merged.stats.heroIcons.Magik, 'https://assets/magik.png');
  assert.equal(merged.stats.source, 'Rivals Data via browser extension');
});

test('Rivals Data loading placeholders cannot overwrite linked identity or cached rank assets', () => {
  const profile = {
    steamId64: 'steam', uid: '1487699139', inGameName: 'Def not xi', note: '', favorite: false,
    updatedAt: null, status: 'linked', stats: { rank: 'Diamond 1', rankIconUrl: 'https://assets/diamond.png' },
  };
  const merged = mergeRivalsDataSnapshot(profile, {
    uid: 'wrong', name: 'Loading Profile', rank: 'Me Game', rankIconUrl: 'https://assets/celestial.png',
  });
  assert.equal(merged.uid, '1487699139');
  assert.equal(merged.inGameName, 'Def not xi');
  assert.equal(merged.stats.rank, 'Diamond 1');
  assert.equal(merged.stats.rankIconUrl, 'https://assets/diamond.png');
});

test('Rivals Data snapshot persists hero performance, proficiency, match history, and local icons', () => {
  const profile = {
    steamId64: 'steam', uid: '316383392', inGameName: 'elsa chadstone', note: '', favorite: false,
    updatedAt: null, status: 'linked',
  };
  const merged = mergeRivalsDataSnapshot(profile, {
    rank: 'Celestial 3',
    rankScore: 4850,
    rankProgress: 50,
    rankIconUrl: 'data:image/webp;base64,rank',
    rankIconRemoteUrl: 'https://rivalsdata.com/assets/ranks/celestial.webp',
    heroes: [{ name: 'Black Widow', iconUrl: 'data:image/webp;base64,hero' }],
    heroStats: [{ name: 'Black Widow', kda: 4.25, winRate: 75, wins: 3, losses: 1, iconUrl: 'data:image/webp;base64,hero' }],
    proficiency: [{ name: 'Elsa Bloodstone', tier: 'Captain', level: 11, iconUrl: 'data:image/webp;base64,elsa' }],
    matchHistory: [{ mode: 'Competitive', timeAgo: '6h ago', result: 'loss', score: '1:3', hero: 'Venom', map: 'Museum' }],
  });
  assert.equal(merged.stats.rankIconUrl, 'data:image/webp;base64,rank');
  assert.equal(merged.stats.rankIconRemoteUrl, 'https://rivalsdata.com/assets/ranks/celestial.webp');
  assert.equal(merged.stats.rankProgress, 50);
  assert.equal(merged.stats.rankProgressMax, 100);
  assert.equal(merged.stats.heroIcons['Black Widow'], 'data:image/webp;base64,hero');
  assert.equal(merged.stats.heroStats[0].kda, 4.25);
  assert.equal(merged.stats.proficiency[0].tier, 'Captain');
  assert.equal(merged.stats.matchHistory[0].map, 'Museum');
  assert.equal(merged.stats.source, 'Rivals Data via browser extension');
});
