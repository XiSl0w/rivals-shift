import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, shell, Tray } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { isMarvelRivalsRunning, launchMarvelRivals, listSteamAccounts, openSteamLogin, switchSteamAccount } from './steam';
import { ProfileStore } from './store';
import { DiscordPresence } from './discord';
import { getLauncherSkipStatus, setLauncherSkip } from './launcher-skip';
import { RivalsDataBridge, mergeRivalsDataSnapshot } from './rivals-bridge';
import { buildPlayerProfileUrl } from './data-sources';
import { RivalsDataApi } from './rivals-data-api';
import { decryptProfileBackup, encryptProfileBackup } from './backup';
import type { AppPreferences, AppPrompt, AppUpdateStatus, DiscordLivePresence, MatchSummary, RivalProfile, TrackedPlayer } from './types';

let mainWindow: BrowserWindow | null = null;
let store: ProfileStore;
let discord: DiscordPresence;
let rivalsDataBridge: RivalsDataBridge;
let rivalsDataApi: RivalsDataApi;
let tray: Tray | null = null;
let monitoringTimer: NodeJS.Timeout | null = null;
let gameLaunchTimer: NodeJS.Timeout | null = null;
let updateTimer: NodeJS.Timeout | null = null;
let gameLaunchPollActive = false;
let lastGameRunning = false;
let managedLaunchPendingUntil = 0;
let quitting = false;
let closePromptOpen = false;
let duplicatePromptOpen = false;
let pendingAppPrompt: AppPrompt | null = null;
let appPromptSequence = 0;
let registeredQuickShortcut = '';
let updateStatus: AppUpdateStatus = { enabled: true, configured: false, state: 'unconfigured', currentVersion: app.getVersion(), message: 'The update source has not been configured yet.' };
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const startedInTray = process.argv.includes('--startup-tray');

if (!hasSingleInstanceLock) app.quit();

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
  mainWindow?.moveTop();
}

function triggerQuickAccess() {
  showMainWindow();
  if (!mainWindow) return;
  const send = () => mainWindow?.webContents.send('quick-access:trigger');
  if (mainWindow.webContents.isLoadingMainFrame()) mainWindow.webContents.once('did-finish-load', send);
  else send();
}

function publishUpdateStatus(next: AppUpdateStatus) {
  updateStatus = next;
  mainWindow?.webContents.send('updates:status-changed', next);
}

function showAppPrompt(type: AppPrompt['type']) {
  showMainWindow();
  if (!mainWindow) return;
  const prompt: AppPrompt = { id: `${Date.now()}-${++appPromptSequence}`, type };
  pendingAppPrompt = prompt;
  const send = () => mainWindow?.webContents.send('app-prompt:show', prompt);
  if (mainWindow.webContents.isLoadingMainFrame()) mainWindow.webContents.once('did-finish-load', send);
  else send();
}

async function handleWindowClose() {
  if (!mainWindow || closePromptOpen) return;
  if (pendingAppPrompt?.type === 'duplicate') { showMainWindow(); return; }
  const preferences = await store.preferences();
  if (preferences.closeAction === 'tray') { mainWindow.hide(); return; }
  if (preferences.closeAction === 'quit') { quitting = true; app.quit(); return; }

  closePromptOpen = true;
  showAppPrompt('close');
}

async function handleSecondInstance() {
  if (duplicatePromptOpen) { showMainWindow(); return; }
  duplicatePromptOpen = true;
  closePromptOpen = false;
  showAppPrompt('duplicate');
}

function createWindow(show = true) {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 940,
    minHeight: 620,
    show,
    backgroundColor: '#08090d',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#08090d', symbolColor: '#a9abb7', height: 42 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on('close', (event) => {
    if (!quitting) { event.preventDefault(); void handleWindowClose(); }
  });
  if (!app.isPackaged) mainWindow.loadURL('http://127.0.0.1:5173');
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

function applyStartupMode(mode: AppPreferences['startupMode']) {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: mode !== 'off',
    path: process.execPath,
    args: mode === 'tray' ? ['--startup-tray'] : [],
  });
}

if (hasSingleInstanceLock) app.on('second-instance', () => { void handleSecondInstance(); });

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  store = new ProfileStore(app.getPath('userData'));
  const existingLauncherSkip = await getLauncherSkipStatus();
  const existingPreferences = await store.preferences();
  const updateConfigPath = path.join(process.resourcesPath, 'app-update.yml');
  const updatesConfigured = app.isPackaged && existsSync(updateConfigPath);
  let updaterEnabled = existingPreferences.autoUpdates;
  let updateCancellation: { cancel(): void } | null = null;
  const updaterStatus = (state: AppUpdateStatus['state'], message: string, extra: Partial<AppUpdateStatus> = {}): AppUpdateStatus => ({
    enabled: updaterEnabled,
    configured: updatesConfigured,
    state,
    currentVersion: app.getVersion(),
    ...extra,
    message,
  });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => publishUpdateStatus(updaterStatus('checking', 'Checking the release feed for a newer version.')));
  autoUpdater.on('update-available', (info) => { if (updaterEnabled) publishUpdateStatus(updaterStatus('available', `Rival Shift ${info.version} is available and downloading.`, { availableVersion: info.version })); });
  autoUpdater.on('download-progress', (progress) => { if (updaterEnabled) publishUpdateStatus(updaterStatus('downloading', `Downloading Rival Shift ${updateStatus.availableVersion ?? ''}…`, { availableVersion: updateStatus.availableVersion, progress: Math.max(0, Math.min(100, progress.percent)) })); });
  autoUpdater.on('update-not-available', () => { if (updaterEnabled) publishUpdateStatus(updaterStatus('not-available', 'You are running the latest available version.')); });
  autoUpdater.on('update-downloaded', (info) => { updateCancellation = null; if (updaterEnabled) publishUpdateStatus(updaterStatus('downloaded', `Rival Shift ${info.version} is ready to install.`, { availableVersion: info.version, progress: 100 })); });
  autoUpdater.on('error', (error) => { updateCancellation = null; if (updaterEnabled) publishUpdateStatus(updaterStatus('error', error.message || 'The update check failed.')); });
  const checkForUpdates = async () => {
    const preferences = await store.preferences();
    if (!preferences.autoUpdates) {
      const status = updaterStatus('disabled', 'Automatic updates are turned off.', { enabled: false });
      publishUpdateStatus(status);
      return status;
    }
    if (!updatesConfigured) {
      const status = updaterStatus('unconfigured', 'Add a release feed URL when building Rival Shift to activate updates.');
      publishUpdateStatus(status);
      return status;
    }
    const result = await autoUpdater.checkForUpdates();
    updateCancellation = result?.cancellationToken ?? null;
    return updateStatus;
  };
  const configureUpdates = async (preferences: AppPreferences, checkNow = false) => {
    updaterEnabled = preferences.autoUpdates;
    autoUpdater.autoInstallOnAppQuit = preferences.autoUpdates;
    if (updateTimer) clearInterval(updateTimer);
    updateTimer = null;
    if (!preferences.autoUpdates) {
      updateCancellation?.cancel();
      updateCancellation = null;
      publishUpdateStatus(updaterStatus('disabled', 'Automatic updates are turned off.', { enabled: false }));
      return;
    }
    if (!updatesConfigured) {
      publishUpdateStatus(updaterStatus('unconfigured', 'Add a release feed URL when building Rival Shift to activate updates.'));
      return;
    }
    publishUpdateStatus(updaterStatus('idle', 'Automatic updates are on. Rival Shift checks silently in the background.'));
    updateTimer = setInterval(() => { void checkForUpdates(); }, 6 * 60 * 60_000);
    if (checkNow) void checkForUpdates();
  };
  if (existingLauncherSkip.enabled && !existingPreferences.skipLauncher) {
    await store.savePreferences({ ...existingPreferences, skipLauncher: true });
  }
  const extensionPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'extension')
    : path.join(app.getAppPath(), 'extension');
  rivalsDataBridge = new RivalsDataBridge(extensionPath);
  void rivalsDataBridge.start().catch((error) => console.error('Could not start Rivals Data extension bridge:', error));
  rivalsDataApi = new RivalsDataApi();
  discord = new DiscordPresence((status) => mainWindow?.webContents.send('discord:status-changed', status));
  const performSwitch = async (steamId64: string, launchGame = true) => {
    const preferences = await store.preferences();
    const launcherSkip = launchGame && preferences.skipLauncher;
    if (launchGame) managedLaunchPendingUntil = Date.now() + 120_000;
    const prepareLaunch = launchGame && launcherSkip ? async () => { await setLauncherSkip(true); } : undefined;
    return switchSteamAccount(steamId64, launchGame, undefined, launcherSkip, prepareLaunch);
  };
  const launchCurrentGame = async () => {
    if (await isMarvelRivalsRunning()) return;
    const preferences = await store.preferences();
    const launcherSkip = preferences.skipLauncher;
    managedLaunchPendingUntil = Date.now() + 120_000;
    if (launcherSkip) await setLauncherSkip(true);
    await launchMarvelRivals(launcherSkip);
  };
  const rebuildTray = async () => {
    if (!tray) return;
    const [steam, profiles] = await Promise.all([listSteamAccounts(), store.profiles()]);
    const accountItems = steam.accounts.map((account) => ({
      label: `${account.currentSession ? '● ' : ''}${profiles[account.steamId64]?.inGameName || account.personaName || account.accountName}`,
      enabled: !account.currentSession,
      click: () => { void performSwitch(account.steamId64, true); },
    }));
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Rival Shift', click: showMainWindow },
      { type: 'separator' },
      ...accountItems,
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]));
  };
  const registerQuickShortcut = async (preferences?: AppPreferences) => {
    if (registeredQuickShortcut) globalShortcut.unregister(registeredQuickShortcut);
    registeredQuickShortcut = '';
    const current = preferences ?? await store.preferences();
    if (!current.quickSwitchShortcut) return;
    const shortcut = current.quickAccessShortcut.trim();
    if (!shortcut) throw new Error('Choose a keyboard shortcut before enabling quick access.');
    if (!globalShortcut.register(shortcut, triggerQuickAccess)) throw new Error(`${shortcut} is already used by another app.`);
    registeredQuickShortcut = shortcut;
  };
  const newestMatchKey = (match?: MatchSummary) => match ? `${match.timeAgo}|${match.hero}|${match.score}|${match.result}` : '';
  const syncWithNotification = async (steamId64: string) => {
    const before = await store.get(steamId64);
    const beforeMatch = newestMatchKey(before?.stats?.matchHistory?.[0]);
    const saved = await syncProfile(steamId64);
    const preferences = await store.preferences();
    const nextMatch = saved.stats?.matchHistory?.[0];
    // An empty cache is a baseline sync, not a newly completed match.
    if (preferences.matchNotifications && beforeMatch && nextMatch && newestMatchKey(nextMatch) !== beforeMatch) {
      new Notification({ title: `${saved.inGameName || 'Marvel Rivals'} match finished`, body: `${nextMatch.result?.toUpperCase() || 'MATCH'} · ${nextMatch.hero || nextMatch.mode}${nextMatch.kda != null ? ` · ${nextMatch.kda} KDA` : ''}` }).show();
    }
    return saved;
  };
  const configureMonitoring = async (preferences?: AppPreferences) => {
    if (monitoringTimer) clearInterval(monitoringTimer);
    monitoringTimer = null;
    const current = preferences ?? await store.preferences();
    if (current.backgroundMonitoring) monitoringTimer = setInterval(async () => {
      if (current.rivalsDataMode === 'extension' && !rivalsDataBridge.status().connected) return;
      const profiles = Object.values(await store.profiles()).filter((profile) => profile.uid.trim() || profile.inGameName.trim());
      for (const profile of profiles) await syncWithNotification(profile.steamId64).catch(() => undefined);
    }, 10 * 60_000);
  };
  const showDirectLaunchReminder = async () => {
    const preferences = await store.preferences();
    if (!preferences.directLaunchReminder) return;
    if (!preferences.skipLauncher) return;
    const message = 'Skip Launcher only applies when Marvel Rivals is launched through Rival Shift.';
    mainWindow?.webContents.send('game-launch:reminder', message);
    if (Notification.isSupported()) {
      const notification = new Notification({ title: 'Launch through Rival Shift', body: message });
      notification.on('click', showMainWindow);
      notification.show();
    }
  };
  const pollGameLaunch = async () => {
    if (gameLaunchPollActive) return;
    gameLaunchPollActive = true;
    try {
      const running = await isMarvelRivalsRunning();
      if (running && !lastGameRunning) {
        if (Date.now() <= managedLaunchPendingUntil) managedLaunchPendingUntil = 0;
        else await showDirectLaunchReminder();
      }
      if (!running && managedLaunchPendingUntil && Date.now() > managedLaunchPendingUntil) managedLaunchPendingUntil = 0;
      lastGameRunning = running;
    } catch (error) { console.error('Could not monitor Marvel Rivals launch state:', error); }
    finally { gameLaunchPollActive = false; }
  };
  ipcMain.handle('steam:list', () => listSteamAccounts());
  ipcMain.handle('steam:open-login', () => openSteamLogin());
  ipcMain.handle('game:running', () => isMarvelRivalsRunning());
  ipcMain.handle('game:launch-current', () => launchCurrentGame());
  ipcMain.handle('steam:switch', async (_event, args: { steamId64: string; launchGame: boolean }) => {
    const result = await performSwitch(args.steamId64, args.launchGame);
    await rebuildTray();
    return result;
  });
  ipcMain.handle('profiles:list', () => store.profiles());
  ipcMain.handle('profiles:storage-path', () => store.path());
  ipcMain.handle('profiles:save', (_event, profile: RivalProfile) => store.save(profile));
  ipcMain.handle('profiles:remove', (_event, steamId64: string) => store.remove(steamId64));
  ipcMain.handle('profiles:open', (_event, uid: string) => shell.openExternal(buildPlayerProfileUrl(uid)));
  const syncProfile = async (steamId64: string) => {
    const profile = await store.get(steamId64);
    if (!profile) throw new Error('Save the player identity first.');
    let current = profile;
    try {
      const preferences = await store.preferences();
      current = preferences.rivalsDataMode === 'api'
        ? await rivalsDataApi.refresh(profile)
        : mergeRivalsDataSnapshot(profile, await rivalsDataBridge.refresh(profile));
      return store.save(current);
    } catch (error) {
      const failed: RivalProfile = { ...current, status: 'error', error: error instanceof Error ? error.message : 'Player data lookup failed.' };
      return store.save(failed);
    }
  };
  ipcMain.handle('profiles:sync', (_event, steamId64: string) => syncWithNotification(steamId64));
  ipcMain.handle('profiles:refresh-all', async () => {
    const profiles = await store.profiles();
    const linked = Object.values(profiles).filter((profile) => profile.inGameName.trim() || profile.uid.trim());
    if (!linked.length) return profiles;
    await Promise.all(linked.map((profile) => syncProfile(profile.steamId64)));
    return store.profiles();
  });
  ipcMain.handle('players:search', (_event, query: string) => rivalsDataApi.searchPlayers(query));
  ipcMain.handle('top-sniper:list', () => rivalsDataApi.topSnipers());
  ipcMain.handle('players:favorites', () => store.favoritePlayers());
  ipcMain.handle('players:favorite-save', (_event, player: TrackedPlayer) => store.saveFavoritePlayer(player));
  ipcMain.handle('players:favorite-remove', (_event, uid: string) => store.removeFavoritePlayer(uid));
  ipcMain.handle('players:favorites-refresh', async () => {
    const favorites = await store.favoritePlayers();
    if (!favorites.length) return favorites;
    return store.replaceFavoritePlayers(await rivalsDataApi.refreshTrackedPlayers(favorites));
  });
  ipcMain.handle('players:post-match-refresh', (_event, players: Array<Pick<TrackedPlayer, 'uid' | 'name'>>) => rivalsDataApi.refreshPostMatchPlayers(players));
  ipcMain.handle('rivals-data-extension:status', () => rivalsDataBridge.status());
  ipcMain.handle('rivals-data-extension:open-folder', () => shell.showItemInFolder(path.join(extensionPath, 'manifest.json')));
  ipcMain.handle('live-match:check', async (_event, args: { steamId64: string; forceRefresh: boolean; restart?: boolean }) => {
    const profile = await store.get(args.steamId64);
    if (!profile) throw new Error('Save the player identity first.');
    const preferences = await store.preferences();
    const snapshot = preferences.rivalsDataMode === 'api'
      ? await rivalsDataApi.liveMatch(profile, Boolean(args.forceRefresh || args.restart))
      : await rivalsDataBridge.liveMatch(profile, Boolean(args.forceRefresh), Boolean(args.restart));
    return { ...snapshot, playerName: profile.inGameName || profile.uid, refreshCycles: args.forceRefresh ? 1 : 0 };
  });
  ipcMain.handle('preferences:get', () => store.preferences());
  ipcMain.handle('updates:status', () => updateStatus);
  ipcMain.handle('updates:check', () => checkForUpdates());
  ipcMain.handle('updates:install', () => {
    if (updateStatus.state !== 'downloaded') throw new Error('No downloaded update is ready to install.');
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  });
  ipcMain.handle('preferences:set', async (_event, args: { key: keyof AppPreferences; value: unknown }) => {
    const previous = await store.preferences();
    if (!(args.key in previous)) throw new Error('Unknown preference.');
    if ((args.key === 'discordRichPresence' || args.key === 'quickSwitchShortcut' || args.key === 'matchNotifications' || args.key === 'backgroundMonitoring' || args.key === 'skipLauncher' || args.key === 'directLaunchReminder' || args.key === 'autoUpdates') && typeof args.value !== 'boolean') throw new Error('This preference must be on or off.');
    if (args.key === 'quickAccessShortcut' && (typeof args.value !== 'string' || !args.value.trim())) throw new Error('Enter a valid keyboard shortcut.');
    if (args.key === 'closeAction' && !['ask', 'tray', 'quit'].includes(String(args.value))) throw new Error('Choose a valid close behavior.');
    if (args.key === 'startupMode' && !['window', 'tray', 'off'].includes(String(args.value))) throw new Error('Choose a valid startup behavior.');
    if (args.key === 'rivalsDataMode' && !['extension', 'api'].includes(String(args.value))) throw new Error('Choose a valid Rivals Data connection.');
    if (args.key === 'theme' && !['nebula', 'tide', 'ember', 'verdant'].includes(String(args.value))) throw new Error('Choose a valid theme preset.');
    const preferences = { ...previous, [args.key]: args.value } as AppPreferences;
    try {
      if (args.key === 'quickSwitchShortcut' || args.key === 'quickAccessShortcut') await registerQuickShortcut(preferences);
      if (args.key === 'startupMode') applyStartupMode(preferences.startupMode);
      await store.savePreferences(preferences);
      if (args.key === 'discordRichPresence') await discord.setEnabled(preferences.discordRichPresence);
      if (args.key === 'autoUpdates') await configureUpdates(preferences, preferences.autoUpdates);
    } catch (error) {
      if (args.key === 'quickSwitchShortcut' || args.key === 'quickAccessShortcut') await registerQuickShortcut(previous).catch(() => undefined);
      if (args.key === 'startupMode') applyStartupMode(previous.startupMode);
      throw error;
    }
    await configureMonitoring(preferences);
    return preferences;
  });
  ipcMain.handle('app-prompt:respond', async (_event, args: { id: string; choice: 'tray' | 'quit' | 'keep' | 'restart'; remember?: boolean }) => {
    const prompt = pendingAppPrompt;
    if (!prompt || prompt.id !== args.id) return;
    pendingAppPrompt = null;
    if (prompt.type === 'close') {
      if (args.choice !== 'tray' && args.choice !== 'quit') throw new Error('Invalid close choice.');
      closePromptOpen = false;
      const action: AppPreferences['closeAction'] = args.choice;
      if (args.remember) {
        const saved = await store.savePreferences({ ...await store.preferences(), closeAction: action });
        mainWindow?.webContents.send('preferences:changed', saved);
      }
      if (action === 'quit') { quitting = true; app.quit(); }
      else mainWindow?.hide();
      return;
    }
    if (args.choice !== 'keep' && args.choice !== 'restart') throw new Error('Invalid instance choice.');
    duplicatePromptOpen = false;
    if (args.choice === 'restart') {
      quitting = true;
      app.relaunch();
      app.quit();
    } else showMainWindow();
  });
  ipcMain.handle('profiles:export', async (_event, passphrase: string) => {
    const chosen = await dialog.showSaveDialog(mainWindow!, { title: 'Export encrypted Rival Shift backup', defaultPath: `rival-shift-backup-${new Date().toISOString().slice(0, 10)}.rsbackup`, filters: [{ name: 'Rival Shift encrypted backup', extensions: ['rsbackup'] }] });
    if (chosen.canceled || !chosen.filePath) return { canceled: true };
    await writeFile(chosen.filePath, await encryptProfileBackup(await store.profiles(), passphrase), 'utf8');
    return { canceled: false, path: chosen.filePath };
  });
  ipcMain.handle('profiles:import', async (_event, passphrase: string) => {
    const chosen = await dialog.showOpenDialog(mainWindow!, { title: 'Import encrypted Rival Shift backup', properties: ['openFile'], filters: [{ name: 'Rival Shift encrypted backup', extensions: ['rsbackup'] }] });
    if (chosen.canceled || !chosen.filePaths[0]) return { canceled: true, count: 0, profiles: await store.profiles() };
    const incoming = await decryptProfileBackup(await readFile(chosen.filePaths[0], 'utf8'), passphrase);
    const profiles = await store.replaceProfiles({ ...await store.profiles(), ...incoming });
    await rebuildTray();
    return { canceled: false, count: Object.keys(incoming).length, profiles };
  });
  ipcMain.handle('launcher-skip:status', () => getLauncherSkipStatus());
  ipcMain.handle('launcher-skip:set', async (_event, enabled: boolean) => {
    const next = Boolean(enabled);
    if (await isMarvelRivalsRunning()) throw new Error('Close Marvel Rivals and its launcher before changing Skip Launcher.');
    const status = await setLauncherSkip(next);
    const preferences = await store.savePreferences({ ...await store.preferences(), skipLauncher: next });
    mainWindow?.webContents.send('preferences:changed', preferences);
    return status;
  });
  ipcMain.handle('discord:status', () => discord.getStatus());
  ipcMain.handle('discord:reconnect', () => discord.connect());
  ipcMain.handle('discord:update', (_event, args: { accountCount: number; selectedName: string; rank: string; rankIconUrl: string; liveGame?: DiscordLivePresence }) => discord.update(args.accountCount, args.selectedName, args.rank, args.rankIconUrl, args.liveGame));
  createWindow(!startedInTray);
  const trayIconPath = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'rivals-rush-icon.png') : path.join(app.getAppPath(), 'public', 'rivals-rush-icon.png');
  tray = new Tray(nativeImage.createFromPath(trayIconPath).resize({ width: 18, height: 18 }));
  tray.setToolTip('Rival Shift');
  tray.on('double-click', showMainWindow);
  void rebuildTray();
  void registerQuickShortcut().catch((error) => console.error('Could not register quick-access shortcut:', error));
  void configureMonitoring();
  void configureUpdates(existingPreferences, true);
  void isMarvelRivalsRunning().then((running) => { lastGameRunning = running; }).catch((error) => console.error('Could not read Marvel Rivals state:', error));
  gameLaunchTimer = setInterval(() => { void pollGameLaunch(); }, 2_500);
  void store.preferences().then((preferences) => applyStartupMode(preferences.startupMode));
  discord.start(existingPreferences.discordRichPresence);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { quitting = true; if (monitoringTimer) clearInterval(monitoringTimer); if (gameLaunchTimer) clearInterval(gameLaunchTimer); if (updateTimer) clearInterval(updateTimer); globalShortcut.unregisterAll(); rivalsDataBridge?.close(); void discord?.stop(); });
app.on('window-all-closed', () => {});
