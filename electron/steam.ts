import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { SteamAccount, SteamSnapshot } from './types';
import { findKey, parseVdf, readValue, setValue, stringifyVdf, type VdfNode } from './vdf';

const execFileAsync = promisify(execFile);
const STEAM_REGISTRY = 'HKCU\\Software\\Valve\\Steam';
export const MARVEL_RIVALS_APP_ID = '2767030';
export const MARVEL_RIVALS_PROCESS_NAMES = [
  // Kill the parent/launcher processes first so they cannot respawn the game.
  'Marvel.exe',
  'MarvelRivals_Launcher.exe',
  'MarvelRivals.exe',
  'Marvel-Win64-Shipping.exe',
] as const;
const avatarCache = new Map<string, string | null>();

export function hasMarvelRivalsProcess(taskListOutput: string): boolean {
  const imageNames = taskListOutput.match(/^"?([^",\r\n]+\.exe)"?(?:,|\s)/gim) ?? [];
  return imageNames.some((row) => {
    const imageName = row.replace(/[",\s]/g, '').toLowerCase();
    return MARVEL_RIVALS_PROCESS_NAMES.some((name) => name.toLowerCase() === imageName);
  });
}

async function marvelRivalsIsRunning(): Promise<boolean> {
  const { stdout } = await execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true });
  return hasMarvelRivalsProcess(stdout);
}

export async function isMarvelRivalsRunning(): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  try { return await marvelRivalsIsRunning(); }
  catch { return false; }
}

async function waitForMarvelRivalsToClose(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (!await marvelRivalsIsRunning()) return true; }
    catch { throw new Error('Could not confirm that Marvel Rivals closed. Close it manually, then try switching again.'); }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

async function stopMarvelRivalsElevated(): Promise<void> {
  const taskkillCommands = MARVEL_RIVALS_PROCESS_NAMES
    .map((name) => `& $rivalShiftTaskkill /F /IM '${name}' /T 2>$null | Out-Null`)
    .join('\r\n');
  const elevatedScript = [
    `$rivalShiftTaskkill = Join-Path $env:SystemRoot 'System32\\taskkill.exe'`,
    taskkillCommands,
    'exit 0',
  ].join('\r\n');
  const encodedScript = Buffer.from(elevatedScript, 'utf16le').toString('base64');
  const launcherScript = [
    `$rivalShiftPowerShell = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'`,
    `$rivalShiftElevatedProcess = Start-Process -FilePath $rivalShiftPowerShell -ArgumentList @('-NoProfile','-NonInteractive','-WindowStyle','Hidden','-EncodedCommand','${encodedScript}') -Verb RunAs -Wait -PassThru -WindowStyle Hidden`,
    'exit $rivalShiftElevatedProcess.ExitCode',
  ].join('; ');
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', launcherScript], { windowsHide: true });
  } catch {
    throw new Error('Marvel Rivals needs administrator permission to close. Approve the Windows prompt, then try switching again.');
  }
}

export function buildSteamLaunchArgs(launchGame: boolean, skipLauncher = false): string[] {
  if (!launchGame) return [];
  // Launcher skipping is controlled by Marvel Rivals' launch_record file.
  // -PSOCompileMode changes shader compilation and must not be coupled to it.
  void skipLauncher;
  return ['-silent', '-applaunch', MARVEL_RIVALS_APP_ID];
}

export async function launchMarvelRivals(skipLauncher = false, override?: string): Promise<void> {
  if (process.platform !== 'win32') throw new Error('Launching Marvel Rivals is currently supported on Windows only.');
  const steamRoot = await discoverSteamRoot(override);
  if (!steamRoot) throw new Error('Steam installation not found.');
  const child = spawn(path.join(steamRoot, 'steam.exe'), buildSteamLaunchArgs(true, skipLauncher), {
    cwd: steamRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

async function registrySteamPath(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  try {
    const { stdout } = await execFileAsync('reg.exe', ['query', STEAM_REGISTRY, '/v', 'SteamPath'], { windowsHide: true });
    const match = stdout.match(/SteamPath\s+REG_\w+\s+(.+)$/im);
    return match?.[1]?.trim().replace(/\//g, '\\') ?? null;
  } catch { return null; }
}

export async function discoverSteamRoot(override?: string): Promise<string | null> {
  const candidates = [
    override,
    await registrySteamPath(),
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)']!, 'Steam') : undefined,
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'Steam') : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    const clean = path.resolve(candidate);
    if (await exists(path.join(clean, 'config', 'loginusers.vdf'))) return clean;
  }
  return null;
}

function usersNode(document: VdfNode): VdfNode {
  const usersKey = findKey(document, 'users');
  if (usersKey && typeof document[usersKey] !== 'string') return document[usersKey] as VdfNode;
  const first = Object.entries(document).find(([key, value]) => /^\d{15,20}$/.test(key) && typeof value !== 'string');
  if (first) return document;
  throw new Error('Steam loginusers.vdf does not contain a users block.');
}

function parseAccounts(document: VdfNode): SteamAccount[] {
  const rows = usersNode(document);
  const raw = Object.entries(rows).filter(([id, value]) => /^\d{15,20}$/.test(id) && typeof value !== 'string') as [string, VdfNode][];
  const hasAutoLogin = raw.some(([, value]) => readValue(value, 'AutoLogin') !== '');
  const activeCandidates = raw.filter(([, value]) => readValue(value, hasAutoLogin ? 'AutoLogin' : 'MostRecent') === '1');
  const activeSteamId = activeCandidates.length === 1 ? activeCandidates[0][0] : '';
  return raw.map(([steamId64, value]) => {
    const timestamp = Number(readValue(value, 'Timestamp'));
    return {
      steamId64,
      accountName: readValue(value, 'AccountName'),
      personaName: readValue(value, 'PersonaName') || readValue(value, 'AccountName'),
      lastLogin: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null,
      currentSession: steamId64 === activeSteamId,
      remembered: readValue(value, 'RememberPassword') === '1',
    };
  });
}

function decodeXml(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function steamAvatar(steamId64: string): Promise<string | undefined> {
  const cached = avatarCache.get(steamId64);
  if (cached !== undefined) return cached || undefined;
  try {
    const response = await fetch(`https://steamcommunity.com/profiles/${steamId64}?xml=1`, {
      signal: AbortSignal.timeout(2500),
      headers: { 'user-agent': 'Rival Shift/0.7.3' },
    });
    if (!response.ok) throw new Error(`Steam Community returned ${response.status}.`);
    const xml = await response.text();
    const url = decodeXml(xml.match(/<avatarFull><!\[CDATA\[(.*?)\]\]><\/avatarFull>/s)?.[1]?.trim() ?? '');
    avatarCache.set(steamId64, url || null);
    return url || undefined;
  } catch {
    avatarCache.set(steamId64, null);
    return undefined;
  }
}

export function selectLoginUser(document: VdfNode, steamId64: string): string {
  const rows = usersNode(document);
  const selected = Object.entries(rows).find(([id, value]) => id === steamId64 && typeof value !== 'string') as [string, VdfNode] | undefined;
  if (!selected) throw new Error('That account is no longer present in Steam loginusers.vdf.');
  const accountName = readValue(selected[1], 'AccountName');
  if (!accountName) throw new Error('The selected Steam account has no account name.');
  for (const [id, value] of Object.entries(rows)) {
    if (typeof value === 'string' || !/^\d{15,20}$/.test(id)) continue;
    const active = id === steamId64 ? '1' : '0';
    setValue(value, 'MostRecent', active);
    setValue(value, 'AutoLogin', active);
    setValue(value, 'RememberPassword', active);
  }
  return accountName;
}

export async function listSteamAccounts(override?: string): Promise<SteamSnapshot> {
  if (process.platform !== 'win32') {
    return { steamRoot: null, accounts: [], platform: process.platform, error: 'Account switching is currently supported on Windows.' };
  }
  const steamRoot = await discoverSteamRoot(override);
  if (!steamRoot) return { steamRoot: null, accounts: [], platform: process.platform, error: 'Steam was not found. Install Steam or choose its folder in Settings.' };
  try {
    const source = await readFile(path.join(steamRoot, 'config', 'loginusers.vdf'), 'utf8');
    const accounts = parseAccounts(parseVdf(source));
    await Promise.all(accounts.map(async (account) => { account.avatarUrl = await steamAvatar(account.steamId64); }));
    return { steamRoot, accounts, platform: process.platform };
  } catch (error) {
    return { steamRoot, accounts: [], platform: process.platform, error: error instanceof Error ? error.message : 'Could not read Steam accounts.' };
  }
}

export function clearSteamLoginSelection(document: VdfNode): VdfNode {
  const rows = usersNode(document);
  for (const [id, value] of Object.entries(rows)) {
    if (typeof value === 'string' || !/^\d{15,20}$/.test(id)) continue;
    setValue(value, 'MostRecent', '0');
    setValue(value, 'AutoLogin', '0');
    setValue(value, 'RememberPassword', '0');
  }
  return document;
}

async function clearRegistryAutoLogin(): Promise<void> {
  try {
    await execFileAsync('reg.exe', ['query', STEAM_REGISTRY, '/v', 'AutoLoginUser'], { windowsHide: true });
  } catch { return; }
  await execFileAsync('reg.exe', ['delete', STEAM_REGISTRY, '/v', 'AutoLoginUser', '/f'], { windowsHide: true });
}

function launchSteam(steamRoot: string, args: string[] = [], windowsHide = false): void {
  const child = spawn(path.join(steamRoot, 'steam.exe'), args, {
    cwd: steamRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide,
  });
  child.unref();
}

export async function openSteamLogin(override?: string): Promise<void> {
  if (process.platform !== 'win32') throw new Error('Adding a Steam account is currently supported on Windows only.');
  const steamRoot = await discoverSteamRoot(override);
  if (!steamRoot) throw new Error('Steam installation not found.');
  const loginPath = path.join(steamRoot, 'config', 'loginusers.vdf');
  const backupPath = path.join(steamRoot, 'config', 'loginusers.vdf_last');

  await stopSteam();
  let backupCreated = false;
  try {
    const original = await readFile(loginPath, 'utf8');
    const document = clearSteamLoginSelection(parseVdf(original));
    await copyFile(loginPath, backupPath);
    backupCreated = true;
    await writeAtomic(loginPath, stringifyVdf(document));
    await clearRegistryAutoLogin();
    await execFileAsync('reg.exe', ['add', STEAM_REGISTRY, '/v', 'RememberPassword', '/t', 'REG_DWORD', '/d', '1', '/f'], { windowsHide: true });
  } catch (error) {
    if (backupCreated) await copyFile(backupPath, loginPath).catch(() => undefined);
    launchSteam(steamRoot);
    throw error;
  }
  launchSteam(steamRoot);
}

async function stopSteam(): Promise<void> {
  const names = ['steam.exe', 'steamwebhelper.exe', 'GameOverlayUI.exe'];
  for (const name of names) {
    try { await execFileAsync('taskkill.exe', ['/F', '/IM', name, '/T'], { windowsHide: true }); } catch { /* not running */ }
  }
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync('tasklist.exe', ['/FI', 'IMAGENAME eq steam.exe', '/NH'], { windowsHide: true });
      if (!/steam\.exe/i.test(stdout)) return;
    } catch { return; }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Steam did not close in time. Close it manually, then try again.');
}

export async function stopMarvelRivals(): Promise<void> {
  if (process.platform !== 'win32') return;
  let running: boolean;
  try { running = await marvelRivalsIsRunning(); }
  catch { throw new Error('Could not check whether Marvel Rivals is running. Try switching again.'); }
  if (!running) return;

  for (const name of MARVEL_RIVALS_PROCESS_NAMES) {
    try { await execFileAsync('taskkill.exe', ['/F', '/IM', name, '/T'], { windowsHide: true }); } catch { /* not running */ }
  }
  if (await waitForMarvelRivalsToClose(1500)) return;

  // The game commonly runs elevated because of its anti-cheat. Ask for elevation
  // only when the ordinary same-user process-tree kill was not enough.
  await stopMarvelRivalsElevated();
  if (await waitForMarvelRivalsToClose(10_000)) return;
  throw new Error('Marvel Rivals did not close in time. Close it manually, then try switching again.');
}

async function writeRegistry(accountName: string): Promise<void> {
  await execFileAsync('reg.exe', ['add', STEAM_REGISTRY, '/v', 'AutoLoginUser', '/t', 'REG_SZ', '/d', accountName, '/f'], { windowsHide: true });
  await execFileAsync('reg.exe', ['add', STEAM_REGISTRY, '/v', 'RememberPassword', '/t', 'REG_DWORD', '/d', '1', '/f'], { windowsHide: true });
}

async function writeAtomic(file: string, contents: string): Promise<void> {
  const temporary = `${file}.rivalshift.tmp`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o644 });
  try { await rename(temporary, file); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}

export async function switchSteamAccount(steamId64: string, launchGame: boolean, override?: string, skipLauncher = false, beforeLaunch?: () => Promise<void>): Promise<{ ok: true; accountName: string }> {
  if (process.platform !== 'win32') throw new Error('Steam switching is currently supported on Windows only.');
  if (!/^\d{15,20}$/.test(steamId64)) throw new Error('Invalid Steam ID.');
  const steamRoot = await discoverSteamRoot(override);
  if (!steamRoot) throw new Error('Steam installation not found.');
  const loginPath = path.join(steamRoot, 'config', 'loginusers.vdf');
  const original = await readFile(loginPath, 'utf8');
  const document = parseVdf(original);
  const accountName = selectLoginUser(document, steamId64);

  // The game must release Steam session state before loginusers.vdf changes.
  await stopMarvelRivals();
  await stopSteam();

  const backupPath = path.join(steamRoot, 'config', 'loginusers.vdf_last');
  await copyFile(loginPath, backupPath);
  try {
    await writeAtomic(loginPath, stringifyVdf(document));
    await writeRegistry(accountName);
  } catch (error) {
    await copyFile(backupPath, loginPath).catch(() => undefined);
    throw error;
  }

  const args = buildSteamLaunchArgs(launchGame, skipLauncher);
  if (launchGame && beforeLaunch) await beforeLaunch();
  const child = spawn(path.join(steamRoot, 'steam.exe'), args, {
    cwd: steamRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: launchGame,
  });
  child.unref();
  return { ok: true, accountName };
}
