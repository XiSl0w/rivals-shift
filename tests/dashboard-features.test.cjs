const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ProfileStore } = require('../dist-electron/store.js');

const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'App.tsx'), 'utf8');
const styles = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'styles.css'), 'utf8');
const mainSource = fs.readFileSync(path.resolve(__dirname, '..', 'electron', 'main.ts'), 'utf8');

test('account groups, privacy mode, and removed accounts persist in the local store', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rival-shift-dashboard-'));
  const store = new ProfileStore(directory);
  await store.save({ steamId64: '76561198000000001', uid: '', inGameName: '', note: '', favorite: true, group: 'Ranked', updatedAt: new Date().toISOString(), status: 'unlinked' });
  const preferences = await store.preferences();
  await store.savePreferences({ ...preferences, privacyMode: true });
  await store.hideAccount('76561198000000001');
  await store.hideAccount('76561198000000002');
  const reloaded = new ProfileStore(directory);
  assert.equal((await reloaded.get('76561198000000001')).group, 'Ranked');
  assert.equal((await reloaded.preferences()).privacyMode, true);
  assert.deepEqual(await reloaded.hiddenAccounts(), ['76561198000000001', '76561198000000002']);
  assert.deepEqual(await reloaded.restoreHiddenAccounts(['76561198000000001']), ['76561198000000002']);
  assert.deepEqual(await reloaded.hiddenAccounts(), ['76561198000000002']);
  await reloaded.restoreHiddenAccounts(['76561198000000002']);
  assert.deepEqual(await reloaded.hiddenAccounts(), []);
});

test('hero intelligence, privacy, removal, and redesigned account hub are present without compare or health navigation tabs', () => {
  assert.match(appSource, /function HeroIntelligencePage/);
  assert.match(appSource, /function RemoveAccountModal/);
  assert.match(appSource, /function RestoreAccountsModal/);
  assert.match(appSource, /Choose accounts to restore/);
  assert.match(appSource, /api\.restoreHiddenAccounts\(steamId64s\)/);
  assert.match(appSource, /Export profiles for another user/);
  assert.match(appSource, /never includes Steam passwords, cookies, tokens, or login sessions/);
  assert.match(appSource, /What’s new in 0\.9\.50/);
  assert.doesNotMatch(appSource, /aria-label="Compare accounts"/);
  assert.doesNotMatch(appSource, /aria-label="Account health"/);
  assert.match(styles, /\.privacy-mode/);
  assert.match(appSource, /className="account-explorer"/);
  assert.match(appSource, /className="account-card-overview"/);
  assert.match(appSource, />OVERALL PEAK</);
  assert.match(appSource, /<PeakRankIcon profile=\{profile\}/);
  assert.match(styles, /\.peak-rank-icon/);
  assert.match(styles, /\.account-filter-row select option \{/);
  assert.match(styles, /background-color: #12131b/);
  assert.match(styles, /\.account-filter-row select option:checked/);
  assert.match(appSource, /className="card-open-stats"/);
  assert.match(appSource, /> Open stats<\/button>/);
  assert.match(appSource, /className="level-progress"/);
  assert.match(appSource, /aria-valuemax=\{100\}/);
  assert.match(appSource, /function UpdateReadyModal/);
  assert.match(mainSource, /Update ready to install/);
  assert.match(mainSource, /notification\.on\('click', showMainWindow\)/);
  assert.doesNotMatch(appSource, /No main hero/);
  assert.match(styles, /v0\.9\.33 authoritative account hub sizing/);
  assert.match(styles, /grid-auto-rows: 224px/);
  assert.match(appSource, /className="window-controls"/);
  assert.match(mainSource, /frame: false/);
  assert.match(mainSource, /window:toggle-maximize/);
});

test('account avatars prefer the RivalsData profile icon over the Steam avatar', () => {
  assert.match(appSource, /profile\?\.stats\?\.profileIconUrl \|\| account\.avatarUrl/);
});

test('bulk refresh uses a bounded retry queue and shows per-account progress', () => {
  assert.match(appSource, /runBulkProfileRefresh\(/);
  assert.match(appSource, /concurrency: savedPreferences\.rivalsDataMode === 'api' \? 1 : 2/);
  assert.match(appSource, /maxAttempts: 2/);
  assert.match(appSource, /attemptTimeoutMs: savedPreferences\.rivalsDataMode === 'api' \? 115_000 : 75_000/);
  assert.match(appSource, /stopBulkRefresh/);
  assert.match(appSource, /Stop account refresh/);
  assert.match(appSource, /phase === 'cached' \? 'Cached'/);
  assert.doesNotMatch(appSource, /Retry failed/);
  assert.match(appSource, /api\.syncProfile\(steamId64, 'summary'\)/);
  assert.match(appSource, /!hidden\.includes\(account\.steamId64\)/);
  assert.match(appSource, /aria-busy=\{refreshing\}/);
  assert.match(appSource, /className="bulk-refresh-progress"/);
  assert.doesNotMatch(appSource, /className="account-stats-refresh"/);
  assert.match(styles, /@keyframes account-refresh-sweep/);
});

test('adding an account watches Steam and inserts the newly saved login automatically', () => {
  assert.match(appSource, /const knownAccounts = new Set/);
  assert.match(appSource, /const steam = await api\.listAccounts\(\)/);
  assert.match(appSource, /was added to your account hub/);
});
