import { clipboard, contextBridge, ipcRenderer } from 'electron';
import type { AppPreferences, AppPrompt, AppUpdateStatus, DiscordLivePresence, DiscordStatus, LauncherSkipStatus, LiveMatchSnapshot, RivalProfile, RivalsDataExtensionStatus, SteamSnapshot, TopSniperPlayer, TrackedPlayer } from './types';

const quickAccessListeners = new Set<() => void>();
let pendingQuickAccess = 0;
ipcRenderer.on('quick-access:trigger', () => {
  if (!quickAccessListeners.size) { pendingQuickAccess += 1; return; }
  quickAccessListeners.forEach((listener) => listener());
});

const appPromptListeners = new Set<(prompt: AppPrompt) => void>();
let pendingAppPrompt: AppPrompt | undefined;
ipcRenderer.on('app-prompt:show', (_event, prompt: AppPrompt) => {
  if (!appPromptListeners.size) { pendingAppPrompt = prompt; return; }
  appPromptListeners.forEach((listener) => listener(prompt));
});

const gameLaunchReminderListeners = new Set<(message: string) => void>();
let pendingGameLaunchReminder = '';
ipcRenderer.on('game-launch:reminder', (_event, message: string) => {
  if (!gameLaunchReminderListeners.size) { pendingGameLaunchReminder = message; return; }
  gameLaunchReminderListeners.forEach((listener) => listener(message));
});

contextBridge.exposeInMainWorld('rivalShift', {
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  onWindowMaximized: (listener: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => listener(maximized);
    ipcRenderer.on('window:maximized-changed', handler);
    return () => ipcRenderer.removeListener('window:maximized-changed', handler);
  },
  listAccounts: (): Promise<SteamSnapshot> => ipcRenderer.invoke('steam:list'),
  openSteamLogin: (): Promise<void> => ipcRenderer.invoke('steam:open-login'),
  isGameRunning: (): Promise<boolean> => ipcRenderer.invoke('game:running'),
  launchCurrentGame: (): Promise<void> => ipcRenderer.invoke('game:launch-current'),
  switchAccount: (steamId64: string, launchGame = true) => ipcRenderer.invoke('steam:switch', { steamId64, launchGame }),
  getProfiles: (): Promise<Record<string, RivalProfile>> => ipcRenderer.invoke('profiles:list'),
  getStoragePath: (): Promise<string> => ipcRenderer.invoke('profiles:storage-path'),
  saveProfile: (profile: RivalProfile): Promise<RivalProfile> => ipcRenderer.invoke('profiles:save', profile),
  removeProfile: (steamId64: string): Promise<void> => ipcRenderer.invoke('profiles:remove', steamId64),
  getHiddenAccounts: (): Promise<string[]> => ipcRenderer.invoke('accounts:hidden'),
  hideAccount: (steamId64: string): Promise<string[]> => ipcRenderer.invoke('accounts:hide', steamId64),
  restoreHiddenAccounts: (): Promise<string[]> => ipcRenderer.invoke('accounts:restore-hidden'),
  openPlayerProfile: (uid: string): Promise<void> => ipcRenderer.invoke('profiles:open', uid),
  copyText: async (text: string): Promise<void> => { clipboard.writeText(text); },
  syncProfile: (steamId64: string): Promise<RivalProfile> => ipcRenderer.invoke('profiles:sync', steamId64),
  refreshAllProfiles: (): Promise<Record<string, RivalProfile>> => ipcRenderer.invoke('profiles:refresh-all'),
  searchRivalsDataPlayers: (query: string): Promise<TrackedPlayer[]> => ipcRenderer.invoke('players:search', query),
  getTopSnipers: (): Promise<TopSniperPlayer[]> => ipcRenderer.invoke('top-sniper:list'),
  getFavoritePlayers: (): Promise<TrackedPlayer[]> => ipcRenderer.invoke('players:favorites'),
  saveFavoritePlayer: (player: TrackedPlayer): Promise<TrackedPlayer[]> => ipcRenderer.invoke('players:favorite-save', player),
  removeFavoritePlayer: (uid: string): Promise<TrackedPlayer[]> => ipcRenderer.invoke('players:favorite-remove', uid),
  refreshFavoritePlayers: (): Promise<TrackedPlayer[]> => ipcRenderer.invoke('players:favorites-refresh'),
  refreshPostMatchPlayers: (players: Array<Pick<TrackedPlayer, 'uid' | 'name'>>): Promise<TrackedPlayer[]> => ipcRenderer.invoke('players:post-match-refresh', players),
  checkLiveMatch: (steamId64: string, forceRefresh = false): Promise<LiveMatchSnapshot> => ipcRenderer.invoke('live-match:check', { steamId64, forceRefresh }),
  restartLiveMatch: (steamId64: string): Promise<LiveMatchSnapshot> => ipcRenderer.invoke('live-match:check', { steamId64, forceRefresh: true, restart: true }),
  getPreferences: (): Promise<AppPreferences> => ipcRenderer.invoke('preferences:get'),
  setPreference: <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]): Promise<AppPreferences> => ipcRenderer.invoke('preferences:set', { key, value }),
  getUpdateStatus: (): Promise<AppUpdateStatus> => ipcRenderer.invoke('updates:status'),
  checkForUpdates: (): Promise<AppUpdateStatus> => ipcRenderer.invoke('updates:check'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('updates:install'),
  exportProfiles: (passphrase: string): Promise<{ canceled: boolean; path?: string }> => ipcRenderer.invoke('profiles:export', passphrase),
  importProfiles: (passphrase: string): Promise<{ canceled: boolean; count: number; profiles: Record<string, RivalProfile> }> => ipcRenderer.invoke('profiles:import', passphrase),
  getRivalsDataExtensionStatus: (): Promise<RivalsDataExtensionStatus> => ipcRenderer.invoke('rivals-data-extension:status'),
  openRivalsDataExtensionFolder: (): Promise<void> => ipcRenderer.invoke('rivals-data-extension:open-folder'),
  getLauncherSkipStatus: (): Promise<LauncherSkipStatus> => ipcRenderer.invoke('launcher-skip:status'),
  setLauncherSkip: (enabled: boolean): Promise<LauncherSkipStatus> => ipcRenderer.invoke('launcher-skip:set', enabled),
  getDiscordStatus: (): Promise<DiscordStatus> => ipcRenderer.invoke('discord:status'),
  reconnectDiscord: (): Promise<DiscordStatus> => ipcRenderer.invoke('discord:reconnect'),
  updateDiscordPresence: (accountCount: number, selectedName: string, rank: string, rankIconUrl: string, liveGame?: DiscordLivePresence): Promise<void> => ipcRenderer.invoke('discord:update', { accountCount, selectedName, rank, rankIconUrl, liveGame }),
  respondToAppPrompt: (id: string, choice: 'tray' | 'quit' | 'keep' | 'restart', remember = false): Promise<void> => ipcRenderer.invoke('app-prompt:respond', { id, choice, remember }),
  onDiscordStatus: (listener: (status: DiscordStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: DiscordStatus) => listener(status);
    ipcRenderer.on('discord:status-changed', handler);
    return () => ipcRenderer.removeListener('discord:status-changed', handler);
  },
  onQuickAccess: (listener: () => void) => {
    quickAccessListeners.add(listener);
    if (pendingQuickAccess) {
      pendingQuickAccess -= 1;
      queueMicrotask(listener);
    }
    return () => quickAccessListeners.delete(listener);
  },
  onPreferencesChanged: (listener: (preferences: AppPreferences) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, preferences: AppPreferences) => listener(preferences);
    ipcRenderer.on('preferences:changed', handler);
    return () => ipcRenderer.removeListener('preferences:changed', handler);
  },
  onUpdateStatus: (listener: (status: AppUpdateStatus) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: AppUpdateStatus) => listener(status);
    ipcRenderer.on('updates:status-changed', handler);
    return () => ipcRenderer.removeListener('updates:status-changed', handler);
  },
  onGameLaunchReminder: (listener: (message: string) => void) => {
    gameLaunchReminderListeners.add(listener);
    if (pendingGameLaunchReminder) {
      const message = pendingGameLaunchReminder;
      pendingGameLaunchReminder = '';
      queueMicrotask(() => listener(message));
    }
    return () => gameLaunchReminderListeners.delete(listener);
  },
  onAppPrompt: (listener: (prompt: AppPrompt) => void) => {
    appPromptListeners.add(listener);
    if (pendingAppPrompt) {
      const prompt = pendingAppPrompt;
      pendingAppPrompt = undefined;
      queueMicrotask(() => listener(prompt));
    }
    return () => appPromptListeners.delete(listener);
  },
});
