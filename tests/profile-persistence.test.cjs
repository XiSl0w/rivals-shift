const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { ProfileStore } = require('../dist-electron/store.js');

test('UID and in-game name survive a full store reload', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rival-shift-store-'));
  try {
    const firstLaunch = new ProfileStore(directory);
    await firstLaunch.save({
      steamId64: '76561198000000100', uid: '1822797559', inGameName: 'KovaaksKid2008',
      note: 'Main account', favorite: true, updatedAt: new Date().toISOString(), status: 'linked',
    });
    const nextLaunch = new ProfileStore(directory);
    const restored = await nextLaunch.get('76561198000000100');
    assert.equal(restored.uid, '1822797559');
    assert.equal(restored.inGameName, 'KovaaksKid2008');
    assert.equal(restored.note, 'Main account');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('old Cloudflare challenge text is never restored as a player name', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rival-shift-migrate-'));
  try {
    await writeFile(path.join(directory, 'rival-shift.json'), JSON.stringify({ profiles: {
      steam: { steamId64: 'steam', uid: '123', inGameName: 'Performing security verification', note: '', favorite: false, updatedAt: null, status: 'synced', stats: { rank: 'Fake' } },
    } }));
    const restored = await new ProfileStore(directory).get('steam');
    assert.equal(restored.inGameName, '');
    assert.equal(restored.status, 'linked');
    assert.equal(restored.stats, undefined);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('favorite state persists before a Marvel Rivals identity is linked', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rival-shift-favorite-'));
  try {
    const store = new ProfileStore(directory);
    await store.save({ steamId64: 'favorite-only', uid: '', inGameName: '', note: '', favorite: true, updatedAt: new Date().toISOString(), status: 'unlinked' });
    const restored = await new ProfileStore(directory).get('favorite-only');
    assert.equal(restored.favorite, true);
    assert.equal(restored.status, 'unlinked');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('manual player favorites persist independently from Steam account profiles', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rival-shift-player-favorites-'));
  try {
    const store = new ProfileStore(directory);
    const player = { uid: '680173547', name: 'Veswa', rank: 'One Above All', rankScore: 5464, presence: 'offline', presenceText: 'Offline', lastSeenAt: null, favorite: true, updatedAt: new Date().toISOString() };
    await store.saveFavoritePlayer(player);
    assert.deepEqual((await new ProfileStore(directory).favoritePlayers()).map(({ uid, favorite }) => ({ uid, favorite })), [{ uid: '680173547', favorite: true }]);
    await store.removeFavoritePlayer(player.uid);
    assert.deepEqual(await new ProfileStore(directory).favoritePlayers(), []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('theme, window behavior, and quick-access keybind preferences persist', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rival-shift-preferences-'));
  try {
    const store = new ProfileStore(directory);
    const defaults = await store.preferences();
    assert.equal(defaults.theme, 'nebula');
    assert.equal(defaults.rivalsDataMode, 'api');
    assert.equal(defaults.discordRichPresence, true);
    assert.equal(defaults.closeAction, 'ask');
    assert.equal(defaults.quickAccessShortcut, 'CommandOrControl+Shift+R');
    assert.equal(defaults.skipLauncher, false);
    assert.equal(defaults.directLaunchReminder, true);
    assert.equal(defaults.autoUpdates, true);
    assert.equal(defaults.startupMode, 'off');

    await store.savePreferences({ ...defaults, theme: 'tide', rivalsDataMode: 'api', discordRichPresence: false, closeAction: 'tray', quickSwitchShortcut: true, quickAccessShortcut: 'Ctrl+Alt+G', skipLauncher: true, startupMode: 'tray' });
    const restored = await new ProfileStore(directory).preferences();
    assert.equal(restored.theme, 'tide');
    assert.equal(restored.rivalsDataMode, 'api');
    assert.equal(restored.closeAction, 'tray');
    assert.equal(restored.discordRichPresence, false);
    assert.equal(restored.quickSwitchShortcut, true);
    assert.equal(restored.quickAccessShortcut, 'Ctrl+Alt+G');
    assert.equal(restored.skipLauncher, true);
    assert.equal(restored.autoUpdates, true);
    assert.equal(restored.startupMode, 'tray');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('concurrent profile and preference writes cannot roll settings backward', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rival-shift-serialized-store-'));
  try {
    const store = new ProfileStore(directory);
    const defaults = await store.preferences();
    const preferences = { ...defaults, quickSwitchShortcut: true, quickAccessShortcut: 'Ctrl+Alt+L', closeAction: 'tray' };
    await Promise.all([
      store.savePreferences(preferences),
      store.save({ steamId64: 'serialized-profile', uid: '123', inGameName: 'Serialized', note: '', favorite: false, updatedAt: null, status: 'linked' }),
    ]);
    const restored = await new ProfileStore(directory).preferences();
    assert.equal(restored.quickSwitchShortcut, true);
    assert.equal(restored.quickAccessShortcut, 'Ctrl+Alt+L');
    assert.equal(restored.closeAction, 'tray');
    assert.equal((await new ProfileStore(directory).get('serialized-profile')).inGameName, 'Serialized');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('each preference change preserves the previous settings in a recovery file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rival-shift-preference-backup-'));
  try {
    const store = new ProfileStore(directory);
    const defaults = await store.preferences();
    await store.savePreferences({ ...defaults, quickSwitchShortcut: true });
    await store.savePreferences({ ...defaults, quickSwitchShortcut: false, startupMode: 'tray' });
    const backup = JSON.parse(await readFile(path.join(directory, 'rival-shift.preferences.bak.json'), 'utf8'));
    assert.equal(backup.preferences.quickSwitchShortcut, true);
    assert.equal(backup.preferences.startupMode, 'off');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
