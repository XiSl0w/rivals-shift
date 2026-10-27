import { access, copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverSteamRoot } from './steam';
import { parseVdf, type VdfNode } from './vdf';
import type { LauncherSkipStatus } from './types';

const execFileAsync = promisify(execFile);

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

function libraryPaths(node: VdfNode, result: string[] = []): string[] {
  for (const [key, value] of Object.entries(node)) {
    if (key.toLowerCase() === 'path' && typeof value === 'string') result.push(value.replace(/\\\\/g, '\\'));
    else if (typeof value !== 'string') libraryPaths(value, result);
  }
  return result;
}

export async function locateLaunchRecord(steamRootOverride?: string): Promise<string | null> {
  const steamRoot = await discoverSteamRoot(steamRootOverride);
  if (!steamRoot) return null;
  const libraries = [steamRoot];
  const foldersFile = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  try {
    libraries.push(...libraryPaths(parseVdf(await readFile(foldersFile, 'utf8'))));
  } catch { /* the default library is still valid */ }
  for (const library of [...new Set(libraries.map((entry) => path.resolve(entry)))]) {
    const candidate = path.resolve(library, 'steamapps', 'common', 'MarvelRivals', 'launch_record');
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function isReadOnly(file: string): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  try {
    const { stdout } = await execFileAsync('attrib.exe', [file], { windowsHide: true });
    return /^[^:\r\n]*\bR\b\s+[A-Z]:\\/im.test(stdout);
  } catch { return false; }
}

export async function applyLauncherSkipToFile(file: string, enabled: boolean): Promise<void> {
  const target = path.resolve(file);
  const backup = `${target}.rivalshift.bak`;
  if (!await exists(backup)) await copyFile(target, backup);
  if (process.platform === 'win32') await execFileAsync('attrib.exe', ['-R', target], { windowsHide: true });
  await writeFile(target, enabled ? '0' : '6', { encoding: 'ascii', flag: 'w' });
  const value = await readFile(target, 'ascii');
  if (value !== (enabled ? '0' : '6')) throw new Error('The launcher state could not be verified after writing.');
  if (process.platform === 'win32') await execFileAsync('attrib.exe', [enabled ? '+R' : '-R', target], { windowsHide: true });
}

async function applyElevated(file: string, enabled: boolean): Promise<void> {
  const escaped = file.replace(/'/g, "''");
  const value = enabled ? '0' : '6';
  const attribute = enabled ? '+R' : '-R';
  const inner = `$p='${escaped}'; & attrib.exe -R $p; [IO.File]::WriteAllText($p,'${value}',[Text.Encoding]::ASCII); & attrib.exe ${attribute} $p; if([IO.File]::ReadAllText($p) -ne '${value}'){exit 2}`;
  const encoded = Buffer.from(inner, 'utf16le').toString('base64');
  const outer = `$p=Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoLogo','-NoProfile','-EncodedCommand','${encoded}') -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode`;
  await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', outer], { windowsHide: true });
}

export async function getLauncherSkipStatus(steamRootOverride?: string): Promise<LauncherSkipStatus> {
  if (process.platform !== 'win32') return { available: false, enabled: false, message: 'Launcher skip is supported on Windows only.' };
  const file = await locateLaunchRecord(steamRootOverride);
  if (!file) return { available: false, enabled: false, message: 'Marvel Rivals launch_record was not found.' };
  try {
    const value = (await readFile(file, 'ascii')).trim();
    const readOnly = await isReadOnly(file);
    const enabled = value === '0' && readOnly;
    return {
      available: true,
      enabled,
      launchRecordPath: file,
      message: enabled ? 'Ready to jump straight into the game.' : 'The Marvel Rivals launcher will open before the game.',
    };
  } catch (error) {
    return { available: true, enabled: false, launchRecordPath: file, message: error instanceof Error ? error.message : 'Could not inspect launcher state.' };
  }
}

export async function setLauncherSkip(enabled: boolean, steamRootOverride?: string): Promise<LauncherSkipStatus> {
  const file = await locateLaunchRecord(steamRootOverride);
  if (!file) throw new Error('Marvel Rivals launch_record was not found. Verify the Steam installation.');
  try { await applyLauncherSkipToFile(file, enabled); }
  catch {
    if (process.platform !== 'win32') throw new Error('Could not update launch_record.');
    await applyElevated(file, enabled);
  }
  const status = await getLauncherSkipStatus(steamRootOverride);
  if (status.enabled !== enabled) throw new Error('Launcher skip did not reach the requested state. Close Steam and Marvel Rivals, then retry.');
  return status;
}
