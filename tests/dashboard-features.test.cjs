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
  const reloaded = new ProfileStore(directory);
  assert.equal((await reloaded.get('76561198000000001')).group, 'Ranked');
  assert.equal((await reloaded.preferences()).privacyMode, true);
  assert.deepEqual(await reloaded.hiddenAccounts(), ['76561198000000001']);
  await reloaded.restoreHiddenAccounts();
  assert.deepEqual(await reloaded.hiddenAccounts(), []);
});

test('hero intelligence, privacy, removal, and redesigned account hub are present without compare or health navigation tabs', () => {
  assert.match(appSource, /function HeroIntelligencePage/);
  assert.match(appSource, /function RemoveAccountModal/);
  assert.match(appSource, /What’s new in 0\.9\.42/);
  assert.doesNotMatch(appSource, /aria-label="Compare accounts"/);
  assert.doesNotMatch(appSource, /aria-label="Account health"/);
  assert.match(styles, /\.privacy-mode/);
  assert.match(appSource, /className="account-explorer"/);
  assert.match(appSource, /className="account-card-overview"/);
  assert.match(appSource, />OVERALL PEAK</);
  assert.match(appSource, /<PeakRankIcon profile=\{profile\}/);
  assert.match(styles, /\.peak-rank-icon/);
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
