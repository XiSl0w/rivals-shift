const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, 'builders', name), 'utf8');

test('builder entry points cover build, release, and combined workflows', () => {
  for (const name of ['build-installer.cmd', 'release-latest.cmd', 'build-and-release.cmd', 'build-installer.ps1', 'release-latest.ps1', 'build-and-release.ps1']) {
    assert.equal(fs.existsSync(path.join(root, 'builders', name)), true, `${name} is missing`);
  }
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(packageJson.scripts.dist, /builders\/build-installer\.ps1/);
  assert.match(packageJson.scripts['release:latest'], /builders\/release-latest\.ps1/);
  assert.match(packageJson.scripts.release, /builders\/build-and-release\.ps1/);
});

test('GitHub release builder validates updater assets and creates checksums', () => {
  const release = read('release-latest.ps1');
  assert.match(release, /Rival Shift Setup \$version\.exe/);
  assert.match(release, /Rival-Shift-Payload-\$version\.exe\.blockmap/);
  assert.match(release, /latest\.yml/);
  assert.match(release, /SHA256SUMS/);
  assert.match(release, /Security\.Cryptography\.SHA256/);
  assert.match(release, /gh release (?:upload|create)|'release', 'upload'/);
  assert.match(release, /\[string\]\$Target = 'main'/);
  assert.match(release, /--clobber/);
  assert.match(release, /--latest/);
  assert.match(release, /releaseLookupExitCode/);
  assert.match(release, /\[switch\]\$AllowDirty/);
  assert.match(release, /\[switch\]\$RequireClean/);
  assert.match(release, /Only compiled release artifacts will be uploaded/);
});

test('installer builder falls back to Corepack outside the development PATH', () => {
  const builder = read('build-installer.ps1');
  const launcher = read('build-installer.cmd');
  assert.match(builder, /Resolve-Executable 'corepack'/);
  assert.match(builder, /rival-shift-pnpm-shim/);
  assert.match(builder, /'pnpm\.cmd'/);
  assert.match(builder, /corepackPath.*pnpm %\*/s);
  assert.match(builder, /package\.json/);
  assert.match(launcher, /%ProgramFiles%\\nodejs/);
  assert.match(launcher, /%APPDATA%\\npm/);
});
