const test = require('node:test');
const assert = require('node:assert/strict');
const { hasMarvelRivalsProcess, MARVEL_RIVALS_PROCESS_NAMES } = require('../dist-electron/steam.js');

test('kills the Rivals parent process before protected game children', () => {
  assert.equal(MARVEL_RIVALS_PROCESS_NAMES[0], 'Marvel.exe');
  assert.ok(MARVEL_RIVALS_PROCESS_NAMES.indexOf('Marvel.exe') < MARVEL_RIVALS_PROCESS_NAMES.indexOf('Marvel-Win64-Shipping.exe'));
});

test('detects every Marvel Rivals executable in CSV task-list output', () => {
  for (const imageName of [
    'Marvel-Win64-Shipping.exe',
    'MarvelRivals.exe',
    'MarvelRivals_Launcher.exe',
    'Marvel.exe',
  ]) {
    const output = `"${imageName}","1234","Console","1","512,000 K"`;
    assert.equal(hasMarvelRivalsProcess(output), true, imageName);
  }
});

test('does not mistake similarly named processes for Marvel Rivals', () => {
  const output = [
    '"steam.exe","100","Console","1","10,000 K"',
    '"NotMarvel.exe","200","Console","1","10,000 K"',
    '"MarvelRivalsHelper.exe","300","Console","1","10,000 K"',
  ].join('\r\n');
  assert.equal(hasMarvelRivalsProcess(output), false);
});
