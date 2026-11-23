const test = require('node:test');
const assert = require('node:assert/strict');

test('rank ordering understands every Marvel Rivals tier and division', async () => {
  const { rankOrder } = await import('../src/account-order.ts');
  assert.ok(rankOrder('One Above All') > rankOrder('Eternity'));
  assert.ok(rankOrder('Celestial 1') > rankOrder('Celestial 2'));
  assert.ok(rankOrder('Celestial II') > rankOrder('Diamond 1'));
  assert.equal(rankOrder('Loading Profile'), null);
});

test('highest-rank ordering keeps unranked accounts last and uses favorites as a tie-breaker', async () => {
  const { sortAccounts } = await import('../src/account-order.ts');
  const accounts = [
    { steamId64: 'unranked', accountName: 'u', personaName: 'Unranked', lastLogin: null, currentSession: false, remembered: true },
    { steamId64: 'diamond', accountName: 'd', personaName: 'Diamond', lastLogin: null, currentSession: false, remembered: true },
    { steamId64: 'celestial', accountName: 'c', personaName: 'Celestial', lastLogin: null, currentSession: false, remembered: true },
  ];
  const profiles = {
    diamond: { steamId64: 'diamond', uid: '1', inGameName: '', note: '', favorite: true, updatedAt: null, status: 'synced', stats: { rank: 'Diamond 1' } },
    celestial: { steamId64: 'celestial', uid: '2', inGameName: '', note: '', favorite: false, updatedAt: null, status: 'synced', stats: { rank: 'Celestial 3' } },
  };
  assert.deepEqual(sortAccounts(accounts, profiles, 'rank-desc').map((account) => account.steamId64), ['celestial', 'diamond', 'unranked']);
  assert.deepEqual(sortAccounts(accounts, profiles, 'rank-asc').map((account) => account.steamId64), ['diamond', 'celestial', 'unranked']);
});

test('rank ordering uses rank score as the secondary measurement inside the same rank', async () => {
  const { sortAccounts } = await import('../src/account-order.ts');
  const accounts = [
    { steamId64: 'lower', accountName: 'lower', personaName: 'Lower', lastLogin: null },
    { steamId64: 'higher', accountName: 'higher', personaName: 'Higher', lastLogin: null },
    { steamId64: 'next-tier', accountName: 'next', personaName: 'Next', lastLogin: null },
  ];
  const profiles = {
    lower: { stats: { rank: 'Diamond 1', rankScore: 22 } },
    higher: { stats: { rank: 'Diamond 1', rankScore: 81 } },
    'next-tier': { stats: { rank: 'Celestial 3', rankScore: 1 } },
  };
  assert.deepEqual(sortAccounts(accounts, profiles, 'rank-desc').map((account) => account.steamId64), ['next-tier', 'higher', 'lower']);
  assert.deepEqual(sortAccounts(accounts, profiles, 'rank-asc').map((account) => account.steamId64), ['lower', 'higher', 'next-tier']);
});

test('current Steam session stays first in every account order', async () => {
  const { sortAccounts } = await import('../src/account-order.ts');
  const accounts = [
    { steamId64: 'favorite', accountName: 'a', personaName: 'Alpha', lastLogin: '2026-11-23T20:00:00.000Z', currentSession: false },
    { steamId64: 'current', accountName: 'z', personaName: 'Zulu', lastLogin: '2020-01-01T00:00:00.000Z', currentSession: true },
    { steamId64: 'ranked', accountName: 'b', personaName: 'Bravo', lastLogin: '2026-11-22T20:00:00.000Z', currentSession: false },
  ];
  const profiles = {
    favorite: { favorite: true, inGameName: 'Alpha', stats: { rank: 'Bronze 3', rankScore: 10, winRate: 99, level: 100 } },
    current: { favorite: false, inGameName: 'Zulu', stats: { rank: 'Unranked', rankScore: 0, winRate: 1, level: 1 } },
    ranked: { favorite: false, inGameName: 'Bravo', stats: { rank: 'Celestial 1', rankScore: 99, winRate: 80, level: 80 } },
  };
  for (const order of ['rank-desc', 'rank-asc', 'favorites', 'recent', 'win-rate', 'level', 'name']) {
    assert.equal(sortAccounts(accounts, profiles, order)[0].steamId64, 'current', order);
  }
});

test('rank filtering supports ranked, unranked, and exact tiers', async () => {
  const { accountMatchesRankFilter } = await import('../src/account-order.ts');
  const profile = { stats: { rank: 'Grandmaster 2' } };
  assert.equal(accountMatchesRankFilter(profile, 'ranked'), true);
  assert.equal(accountMatchesRankFilter(profile, 'Grandmaster'), true);
  assert.equal(accountMatchesRankFilter(profile, 'Celestial'), false);
  assert.equal(accountMatchesRankFilter(undefined, 'unranked'), true);
});
