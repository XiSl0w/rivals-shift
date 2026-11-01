import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const version = packageJson.version;
const temporaryOutput = await mkdtemp(path.join(tmpdir(), 'rival-shift-installer-'));
const cli = path.join(projectRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
const updateUrl = process.env.RIVAL_SHIFT_UPDATE_URL?.trim();
if (updateUrl && new URL(updateUrl).protocol !== 'https:') throw new Error('RIVAL_SHIFT_UPDATE_URL must use HTTPS.');
const publishConfig = updateUrl ? [{ provider: 'generic', url: updateUrl }] : packageJson.build.publish;

try {
  const builderConfigPath = path.join(temporaryOutput, 'electron-builder.json');
  await writeFile(builderConfigPath, JSON.stringify({
    ...packageJson.build,
    directories: { ...packageJson.build.directories, output: temporaryOutput },
    ...(publishConfig ? { publish: publishConfig } : {}),
  }, null, 2), 'utf8');
  const packageResult = spawnSync(process.execPath, [cli, '--win', 'nsis', '--config', builderConfigPath], {
    cwd: projectRoot,
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
    stdio: 'inherit',
  });
  if (packageResult.status !== 0) process.exit(packageResult.status ?? 1);

  const payloadName = (await readdir(temporaryOutput)).find((name) => /^Rival-Shift-Payload-.*\.exe$/i.test(name));
  if (!payloadName) throw new Error('Electron Builder completed without producing the silent installer payload.');

  const sourceTemplate = await readFile(path.join(projectRoot, 'build', 'CustomInstaller.cs'), 'utf8');
  const sourcePath = path.join(temporaryOutput, 'CustomInstaller.cs');
  await writeFile(sourcePath, sourceTemplate.replaceAll('__VERSION__', version), 'utf8');

  const compilerCandidates = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ];
  const compiler = compilerCandidates.find((candidate) => {
    try { return spawnSync(candidate, ['/help'], { stdio: 'ignore' }).status === 0; } catch { return false; }
  });
  if (!compiler) throw new Error('The Windows C# compiler required for the custom installer was not found.');

  const releaseDir = path.join(projectRoot, 'release');
  await mkdir(releaseDir, { recursive: true });
  await copyFile(path.join(temporaryOutput, payloadName), path.join(releaseDir, payloadName));
  for (const artifact of await readdir(temporaryOutput)) {
    if (artifact === `${payloadName}.blockmap` || artifact === 'latest.yml') await copyFile(path.join(temporaryOutput, artifact), path.join(releaseDir, artifact));
  }
  const destination = path.join(releaseDir, `Rival Shift Setup ${version}.exe`);
  const compiled = spawnSync(compiler, [
    '/nologo', '/target:winexe', '/platform:x64', '/optimize+', '/langversion:5',
    `/win32icon:${path.join(projectRoot, 'build', 'icon.ico')}`,
    '/reference:System.dll', '/reference:System.Core.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll',
    `/resource:${path.join(temporaryOutput, payloadName)},RivalShiftPayload`,
    `/resource:${path.join(projectRoot, 'public', 'rivals-rush-icon.png')},RivalShiftIcon`,
    `/resource:${path.join(projectRoot, 'build', 'icon.ico')},RivalShiftSetupIcon`,
    `/out:${destination}`,
    sourcePath,
  ], { cwd: projectRoot, stdio: 'inherit' });
  if (compiled.status !== 0) process.exit(compiled.status ?? 1);

  console.log(`Custom installer ready: ${destination}`);
  console.log(updateUrl ? `Auto-update feed embedded: ${updateUrl}` : publishConfig ? 'Auto-update provider embedded from package.json.' : 'Auto-update feed not configured. Set RIVAL_SHIFT_UPDATE_URL to an HTTPS release directory when packaging.');
} finally {
  await rm(temporaryOutput, { recursive: true, force: true }).catch(() => undefined);
}
