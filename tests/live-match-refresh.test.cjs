const test = require('node:test');
const assert = require('node:assert/strict');

test('masked live names are stars followed by a number', async () => {
  const { isMaskedLiveName } = await import('../src/live-match.ts');
  assert.equal(isMaskedLiveName('******1'), true);
  assert.equal(isMaskedLiveName('  ***24  '), true);
  assert.equal(isMaskedLiveName('Player 1'), false);
  assert.equal(isMaskedLiveName('***'), false);
  assert.equal(isMaskedLiveName('**1name'), false);
});

test('post-match player source keeps every unique numeric lobby UID', async () => {
  const { postMatchSourcePlayers, selectedPostMatchSourcePlayers } = await import('../src/live-match.ts');
  const snapshot = {
    status: 'in-game', checkedAt: new Date().toISOString(), teams: [
      { name: 'Team 1', players: [{ uid: '11', name: 'Alpha', heroes: [] }, { uid: '12', name: '******1', heroes: [] }] },
      { name: 'Team 2', players: [{ uid: '11', name: 'Alpha duplicate', heroes: [] }, { uid: 'hidden', name: '******2', heroes: [] }] },
    ],
  };
  const source = postMatchSourcePlayers(snapshot);
  assert.deepEqual(source, [{ uid: '11', name: 'Alpha' }, { uid: '12', name: '******1' }]);
  assert.deepEqual(selectedPostMatchSourcePlayers(snapshot, ['12']), [{ uid: '12', name: '******1' }]);
});

test('post-match lookup is opt-in and polls selected players every five seconds', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'App.tsx'), 'utf8');
  assert.match(source, /selectedPostMatchSourcePlayers\(lastCapturedMatch, postMatchSelectedUids\)/);
  assert.match(source, /setInterval\([\s\S]*5_000\)/);
  assert.match(source, /Select players to look up/);
  assert.match(source, /Look up selected/);
});

test('live-game hotkey polls until a match is found or the stop control is used', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'App.tsx'), 'utf8');
  assert.match(source, /api\.onQuickAccess\([\s\S]*setLiveSearchActive\(true\)/);
  assert.match(source, /if \(!liveSearchActive \|\| checkingLiveMatch \|\| !currentSession\) return/);
  assert.match(source, /result\.status === 'in-game'[\s\S]*setLiveSearchActive\(false\)/);
  assert.match(source, /STOP SEARCHING/);
  assert.match(source, /const stopLiveSearch = \(\) =>/);
});
