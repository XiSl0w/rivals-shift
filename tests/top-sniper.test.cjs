const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

test('top sniper starts and stops five-second scans with queue, game, and online grouping', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'electron', 'rivals-data-api.ts'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');
  assert.match(app, /activeTab !== 'top-sniper' \|\| !topSniperActive/);
  assert.match(app, /setInterval\(\(\) => void refreshTopSnipers\(\), 5_000\)/);
  assert.match(app, /onStart=\{\(\) => setTopSniperActive\(true\)\}/);
  assert.match(app, /onStop=\{\(\) => setTopSniperActive\(false\)\}/);
  assert.match(app, /\{ id: 'queue' as const/);
  assert.match(app, /\{ id: 'game' as const/);
  assert.match(app, /\{ id: 'online' as const/);
  assert.match(app, /statusSinceAt: sameStatus \? before\.statusSinceAt/);
  assert.match(app, /LIVE SCAN|SCAN PAUSED/);
  assert.match(api, /leaderboards\?limit=1000&os=1/);
  assert.match(main, /ipcMain\.handle\('top-sniper:list'/);
});
