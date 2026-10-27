const test = require('node:test');
const assert = require('node:assert/strict');
const { decryptProfileBackup, encryptProfileBackup } = require('../dist-electron/backup.js');

test('encrypted profile backups round-trip without exposing profile contents', async () => {
  const profiles = { steam: { steamId64: 'steam', uid: '123', inGameName: 'Secret Player', note: 'private note', favorite: true, updatedAt: null, status: 'linked' } };
  const encrypted = await encryptProfileBackup(profiles, 'strong passphrase');
  assert.doesNotMatch(encrypted, /Secret Player|private note/);
  assert.deepEqual(await decryptProfileBackup(encrypted, 'strong passphrase'), profiles);
  await assert.rejects(() => decryptProfileBackup(encrypted, 'wrong password'), /Could not decrypt/);
});

test('backup encryption rejects short passphrases', async () => {
  await assert.rejects(() => encryptProfileBackup({}, 'short'), /at least 8/);
});
