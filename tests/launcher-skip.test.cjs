const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdir, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { applyLauncherSkipToFile, getLauncherSkipStatus } = require('../dist-electron/launcher-skip.js');

test('launcher skip writes exact file states and preserves an original backup', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rival-shift-launcher-'));
  const file = path.join(directory, 'steamapps', 'common', 'MarvelRivals', 'launch_record');
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await mkdir(path.join(directory, 'config'), { recursive: true });
    await writeFile(path.join(directory, 'config', 'loginusers.vdf'), '"users" {}', 'utf8');
    await writeFile(file, '6', 'ascii');
    await applyLauncherSkipToFile(file, true);
    assert.equal(await readFile(file, 'ascii'), '0');
    assert.equal(await readFile(`${file}.rivalshift.bak`, 'ascii'), '6');
    assert.equal((await getLauncherSkipStatus(directory)).enabled, true);
    await applyLauncherSkipToFile(file, false);
    assert.equal(await readFile(file, 'ascii'), '6');
    assert.equal(await readFile(`${file}.rivalshift.bak`, 'ascii'), '6');
    assert.equal((await getLauncherSkipStatus(directory)).enabled, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
