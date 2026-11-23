const test = require('node:test');
const assert = require('node:assert/strict');
const { hasMarvelRivalsProcess, MARVEL_RIVALS_PROCESS_NAMES, parseTaskListProcesses } = require('../dist-electron/steam.js');

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

test('task-list parsing preserves exact image names and PIDs', () => {
  assert.deepEqual(parseTaskListProcesses([
    '"Marvel.exe","12712","Console","1","21,616 K"',
    '"Marvel-Win64-Shipping.exe","21844","Console","1","12,866,216 K"',
  ].join('\r\n')), [
    { imageName: 'Marvel.exe', pid: 12712 },
    { imageName: 'Marvel-Win64-Shipping.exe', pid: 21844 },
  ]);
});

test('switch sequence verifies game closure twice and reopens Steam before launching', () => {
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', 'electron', 'steam.ts'), 'utf8');
  const switchBody = source.slice(source.indexOf('export async function switchSteamAccount'));
  assert.match(switchBody, /await stopMarvelRivals\(\);\s*await stopSteam\(\);/);
  assert.match(switchBody, /await stopMarvelRivals\(\);\s*await copyFile/);
  assert.match(switchBody, /await disableSteamAccountChooserForQuickLaunch\(steamRoot\)/);
  assert.match(switchBody, /await startSteamAndWait\(steamRoot\)/);
  assert.match(switchBody, /if \(launchGame\) launchSteam\(steamRoot, buildSteamLaunchArgs/);
  assert.match(switchBody, /failed switch must never strand the user with Steam closed/i);
});
