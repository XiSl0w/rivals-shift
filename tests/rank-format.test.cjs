const test = require('node:test');
const assert = require('node:assert/strict');

test('live-game rank labels use the requested shorthand', async () => {
  const { shortRankName } = await import('../src/rank-format.ts');
  assert.equal(shortRankName('Bronze 1'), 'B1');
  assert.equal(shortRankName('Silver 1'), 'S1');
  assert.equal(shortRankName('Gold 1'), 'G1');
  assert.equal(shortRankName('Diamond 1'), 'D1');
  assert.equal(shortRankName('Grandmaster 1'), 'GM1');
  assert.equal(shortRankName('Celestial 1'), 'C1');
  assert.equal(shortRankName('Eternity'), 'E');
  assert.equal(shortRankName('One Above All'), 'OAA');
});

test('peak labels show division progress and top-tier rating points', async () => {
  const { peakRankLabel } = await import('../src/rank-format.ts');
  assert.equal(peakRankLabel('Celestial 1', 84), 'C1 84/100');
  assert.equal(peakRankLabel('Grandmaster 1', 51), 'GM1 51/100');
  assert.equal(peakRankLabel('Eternity', 106), 'E 106 RS');
  assert.equal(peakRankLabel('One Above All', 147), 'OAA 147 RS');
});
