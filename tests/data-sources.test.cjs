const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPlayerProfileUrl } = require('../dist-electron/data-sources.js');

test('Rivals Data profile links use the linked UID', () => {
  assert.equal(buildPlayerProfileUrl(' 1822797559 '), 'https://rivalsdata.com/player/1822797559');
});

test('Rivals Data profile links require a UID', () => {
  assert.throws(() => buildPlayerProfileUrl(''), /requires a Marvel Rivals UID/i);
});
