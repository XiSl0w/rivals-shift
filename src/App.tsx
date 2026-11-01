import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, Bell, Check, ChevronDown, ChevronRight, CircleHelp, Copy, Crosshair, Database, Download, ExternalLink, Gamepad2, Heart, History, House,
  Keyboard, Link2, LoaderCircle, LockKeyhole, LogOut, Maximize2, Minimize2, Monitor, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Power, Radio, RefreshCw,
  Palette, Puzzle, Search, Settings, ShieldCheck, SkipForward, SlidersHorizontal, Sparkles, Star, Swords, TrendingUp, Unlink, Upload, UserPlus, Users, X, Zap,
} from 'lucide-react';
import { demoApi } from './demo';
import type { AppPreferences, AppPrompt, AppUpdateStatus, DiscordLivePresence, HeroPerformance, LauncherSkipStatus, LiveMatchPlayer, LiveMatchSnapshot, MatchSummary, RivalProfile, RivalsDataExtensionStatus, SteamAccount, SteamSnapshot, TopSniperPlayer, TrackedPlayer } from './types';
import { shortRankName } from './rank-format';
import { accountMatchesRankFilter, rankFilterOptions, sortAccounts, type AccountSort, type RankFilter } from './account-order';
import { hasMaskedLivePlayerNames, postMatchSourcePlayers, selectedPostMatchSourcePlayers } from './live-match';
import { reliableRivalsAssetUrl } from './rivals-assets';

const api = window.rivalShift ?? demoApi;
const SUPPORTED_BROWSERS = [
  { name: 'Chrome', extensionsPage: 'chrome://extensions' },
  { name: 'Edge', extensionsPage: 'edge://extensions' },
  { name: 'Opera', extensionsPage: 'opera://extensions' },
  { name: 'Brave', extensionsPage: 'brave://extensions' },
  { name: 'Vivaldi', extensionsPage: 'vivaldi://extensions' },
] as const;
const MAX_PROFICIENCY_LEVEL = 70;
const THEME_PRESETS: Array<{ id: AppPreferences['theme']; name: string; description: string; colors: [string, string, string] }> = [
  { id: 'nebula', name: 'Nebula', description: 'Midnight violet · luminous', colors: ['#8b5cf6', '#c4a7ff', '#c7f464'] },
  { id: 'tide', name: 'Tide', description: 'Arctic blue · crisp', colors: ['#2d9cff', '#86d8ff', '#67f0d2'] },
  { id: 'ember', name: 'Ember', description: 'Sunset coral · warm', colors: ['#ff704d', '#ffb36b', '#ffd76a'] },
  { id: 'verdant', name: 'Verdant', description: 'Emerald night · calm', colors: ['#27c98a', '#83e8b7', '#d5ed70'] },
];

function relativeTime(iso: string | null) {
  if (!iso) return 'Never';
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function fullDate(iso?: string | null) {
  if (!iso) return 'Unknown date';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function rankLevelFromName(rank?: string) {
  const match = rank?.trim().match(/^(Bronze|Silver|Gold|Platinum|Diamond|Grandmaster|Celestial)\s+([123])$/i);
  if (!match) return undefined;
  const tier = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'grandmaster', 'celestial'].indexOf(match[1].toLowerCase());
  return tier * 3 + (4 - Number(match[2]));
}

function rankProgressValue(score?: number, rank?: string, explicit?: number, maximum = 100) {
  const level = rankLevelFromName(rank);
  const derived = score != null && Number.isFinite(score) && level != null ? Math.floor(score - (5_100 - (22 - level) * 100)) : undefined;
  const value = derived ?? explicit;
  return value == null || !Number.isFinite(value) ? undefined : Math.max(-30, Math.min(maximum, Math.floor(value)));
}

function rankProgressPercent(progress?: number, maximum = 100) {
  return progress == null ? 0 : ((Math.max(-30, Math.min(maximum, progress)) + 30) / (maximum + 30)) * 100;
}

function rankScoreProgress(score?: number, rank?: string, explicit?: number) {
  const progress = rankProgressValue(score, rank, explicit);
  if (score == null) return progress == null ? 'No rank score' : `${progress}/100 progress`;
  return progress == null ? `${score} RS` : `${score} RS · ${progress}/100`;
}

function initials(name: string) {
  return name.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '??';
}

function shortId(id: string) { return `${id.slice(0, 7)}...${id.slice(-4)}`; }
function hasIdentity(profile?: RivalProfile) { return Boolean(profile?.uid.trim() || profile?.inGameName.trim()); }
function shortcutFromKey(event: React.KeyboardEvent<HTMLInputElement>) {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return '';
  const keyAliases: Record<string, string> = { ' ': 'Space', '+': 'Plus', Escape: 'Esc' };
  const key = keyAliases[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  const modifiers = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super'].filter(Boolean);
  if (!modifiers.length && !/^F(?:[1-9]|1\d|2[0-4])$/.test(key)) return '';
  return [...modifiers, key].join('+');
}

type Modal = 'link' | 'switch' | 'about' | 'history' | 'backup' | null;
type ActiveTab = 'accounts' | 'intelligence' | 'players' | 'top-sniper' | 'live-game' | 'post-match' | 'settings';

export function App() {
  const [snapshot, setSnapshot] = useState<SteamSnapshot>({ steamRoot: null, accounts: [], platform: 'win32' });
  const [profiles, setProfiles] = useState<Record<string, RivalProfile>>({});
  const [selectedId, setSelectedId] = useState('');
  const [accountView, setAccountView] = useState<'library' | 'details'>('library');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<AccountSort>(() => (localStorage.getItem('rival-shift-account-sort') as AccountSort) || 'rank-desc');
  const [rankFilter, setRankFilter] = useState<RankFilter>('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [groupEditor, setGroupEditor] = useState<SteamAccount | null>(null);
  const [removeAccount, setRemoveAccount] = useState<SteamAccount | null>(null);
  const [hiddenAccounts, setHiddenAccounts] = useState<string[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('accounts');
  const [railExpanded, setRailExpanded] = useState(() => localStorage.getItem('rival-shift-sidebar-expanded') === 'true');
  const [windowMaximized, setWindowMaximized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState('');
  const [switching, setSwitching] = useState(false);
  const [launchingCurrentGame, setLaunchingCurrentGame] = useState(false);
  const [quickLaunching, setQuickLaunching] = useState('');
  const [gameRunning, setGameRunning] = useState(false);
  const [launchGame, setLaunchGame] = useState(true);
  const [toast, setToast] = useState('');
  const [storagePath, setStoragePath] = useState('');
  const [launcherSkipStatus, setLauncherSkipStatus] = useState<LauncherSkipStatus>({ available: false, enabled: false, message: 'Checking Marvel Rivals installation...' });
  const [extensionStatus, setExtensionStatus] = useState<RivalsDataExtensionStatus>({ connected: false, lastSeen: null, extensionPath: '', pendingJobs: 0, message: 'Checking Rivals Data extension...' });
  const [preferences, setPreferences] = useState<AppPreferences>({ theme: 'nebula', rivalsDataMode: 'api', discordRichPresence: true, quickSwitchShortcut: false, quickAccessShortcut: 'CommandOrControl+Shift+R', closeAction: 'ask', matchNotifications: true, backgroundMonitoring: false, skipLauncher: false, directLaunchReminder: true, autoUpdates: true, privacyMode: false, startupMode: 'off' });
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus>({ enabled: true, configured: false, state: 'unconfigured', currentVersion: '0.9.39', message: 'Checking update configuration…' });
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState('');
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [appPrompt, setAppPrompt] = useState<AppPrompt | null>(null);
  const [rememberPromptChoice, setRememberPromptChoice] = useState(false);
  const [respondingToPrompt, setRespondingToPrompt] = useState(false);
  const [liveMatch, setLiveMatch] = useState<LiveMatchSnapshot | null>(null);
  const [lastCapturedMatch, setLastCapturedMatch] = useState<LiveMatchSnapshot | null>(null);
  const [checkingLiveMatch, setCheckingLiveMatch] = useState(false);
  const [liveSearchActive, setLiveSearchActive] = useState(false);
  const [quickCheckRequest, setQuickCheckRequest] = useState(0);
  const [favoritePlayers, setFavoritePlayers] = useState<TrackedPlayer[]>([]);
  const [playerResults, setPlayerResults] = useState<TrackedPlayer[]>([]);
  const [playerQuery, setPlayerQuery] = useState('');
  const [searchingPlayers, setSearchingPlayers] = useState(false);
  const [playerAutoRefresh, setPlayerAutoRefresh] = useState(false);
  const [refreshingFavorites, setRefreshingFavorites] = useState(false);
  const [topSnipers, setTopSnipers] = useState<TopSniperPlayer[]>([]);
  const [topSniperLoading, setTopSniperLoading] = useState(false);
  const [topSniperActive, setTopSniperActive] = useState(false);
  const [topSniperError, setTopSniperError] = useState('');
  const [topSniperUpdatedAt, setTopSniperUpdatedAt] = useState<string | null>(null);
  const [postMatchPlayers, setPostMatchPlayers] = useState<TrackedPlayer[]>([]);
  const [postMatchLooking, setPostMatchLooking] = useState(false);
  const [postMatchRefreshing, setPostMatchRefreshing] = useState(false);
  const [postMatchSelectedUids, setPostMatchSelectedUids] = useState<string[]>([]);
  const liveRequest = useRef(0);
  const handledQuickCheck = useRef(0);
  const postMatchSource = useRef<Array<Pick<TrackedPlayer, 'uid' | 'name'>>>([]);
  const postMatchGeneration = useRef(0);
  const postMatchRefreshInFlight = useRef(false);
  const topSniperRefreshInFlight = useRef(false);
  const playerSearchInFlight = useRef(false);

  const refresh = async (refreshPlayers = false) => {
    setLoading(true);
    try {
      const [steam, linked, savedPath, launcherSkip, extension, savedPreferences, running, savedPlayers, updater, hidden] = await Promise.all([
        api.listAccounts(), api.getProfiles(), api.getStoragePath(), api.getLauncherSkipStatus(), api.getRivalsDataExtensionStatus(), api.getPreferences(), api.isGameRunning(), api.getFavoritePlayers(), api.getUpdateStatus(), api.getHiddenAccounts(),
      ]);
      setSnapshot(steam);
      setProfiles(linked);
      setStoragePath(savedPath);
      setLauncherSkipStatus(launcherSkip);
      setExtensionStatus(extension);
      setPreferences(savedPreferences);
      setGameRunning(running);
      setFavoritePlayers(savedPlayers);
      setUpdateStatus(updater);
      setHiddenAccounts(hidden);
      setSelectedId((current) => current && steam.accounts.some((account) => account.steamId64 === current && !hidden.includes(account.steamId64))
        ? current
        : (steam.accounts.find((account) => account.currentSession && !hidden.includes(account.steamId64)) ?? steam.accounts.find((account) => !hidden.includes(account.steamId64)))?.steamId64 ?? '');
      if (refreshPlayers && Object.values(linked).some(hasIdentity)) {
        setToast(`Refreshing linked profiles through Rivals Data ${savedPreferences.rivalsDataMode === 'api' ? 'SDK API' : 'browser extension'}...`);
        const refreshed = await api.refreshAllProfiles();
        setProfiles(refreshed);
        setExtensionStatus(await api.getRivalsDataExtensionStatus());
        const failed = Object.values(refreshed).filter((item) => item.status === 'error').length;
        setToast(failed ? `Player refresh finished with ${failed} profile error${failed === 1 ? '' : 's'}.` : 'Steam library and linked player data refreshed.');
      }
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not load accounts.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(false); }, []);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(''), 4800); return () => clearTimeout(timeout); }, [toast]);
  useEffect(() => { localStorage.setItem('rival-shift-account-sort', sortOrder); }, [sortOrder]);
  useEffect(() => { localStorage.setItem('rival-shift-sidebar-expanded', String(railExpanded)); }, [railExpanded]);
  useEffect(() => { document.documentElement.dataset.theme = preferences.theme; }, [preferences.theme]);
  useEffect(() => { void api.isWindowMaximized().then(setWindowMaximized); return api.onWindowMaximized(setWindowMaximized); }, []);
  useEffect(() => api.onPreferencesChanged(setPreferences), []);
  useEffect(() => api.onUpdateStatus(setUpdateStatus), []);
  useEffect(() => api.onGameLaunchReminder(setToast), []);
  useEffect(() => {
    let active = true;
    const update = async () => {
      try { const running = await api.isGameRunning(); if (active) setGameRunning(running); }
      catch { /* Keep the last known state when process detection is unavailable. */ }
    };
    const timer = window.setInterval(() => void update(), 2_500);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => api.onAppPrompt((prompt) => {
    setRememberPromptChoice(false);
    setRespondingToPrompt(false);
    setAppPrompt(prompt);
  }), []);
  useEffect(() => {
    if (activeTab !== 'players' || !favoritePlayers.length) return;
    const timer = window.setInterval(async () => {
      try { setFavoritePlayers(await api.refreshFavoritePlayers()); }
      catch { /* Keep the last known presence when Rivals Data is temporarily unavailable. */ }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [activeTab, favoritePlayers.length]);

  const availableRanks = useMemo(() => rankFilterOptions(profiles), [profiles]);
  const availableGroups = useMemo(() => [...new Set(Object.values(profiles).map((item) => item.group?.trim()).filter((item): item is string => Boolean(item)))].sort((a, b) => a.localeCompare(b)), [profiles]);
  const accounts = useMemo(() => sortAccounts(snapshot.accounts.filter((account) => {
    if (hiddenAccounts.includes(account.steamId64)) return false;
    const linked = profiles[account.steamId64];
    const matchesSearch = `${account.personaName} ${account.accountName} ${linked?.inGameName ?? ''} ${linked?.uid ?? ''} ${linked?.stats?.rank ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesGroup = groupFilter === 'all' || (groupFilter === 'ungrouped' ? !linked?.group?.trim() : linked?.group === groupFilter);
    return matchesSearch && matchesGroup && accountMatchesRankFilter(linked, rankFilter);
  }), profiles, sortOrder), [snapshot.accounts, profiles, hiddenAccounts, search, rankFilter, groupFilter, sortOrder]);

  const selected = snapshot.accounts.find((account) => account.steamId64 === selectedId);
  const profile = selected ? profiles[selected.steamId64] : undefined;
  const currentSession = snapshot.accounts.find((account) => account.currentSession);
  const currentProfile = currentSession ? profiles[currentSession.steamId64] : undefined;
  const resolvingHiddenLiveNames = hasMaskedLivePlayerNames(liveMatch);
  const linked = hasIdentity(profile);
  const visibleAccounts = snapshot.accounts.filter((account) => !hiddenAccounts.includes(account.steamId64));
  const linkedCount = visibleAccounts.filter((account) => hasIdentity(profiles[account.steamId64])).length;

  // Privacy rule: presence only uses a manually linked Marvel Rivals identity with cached player data.
  useEffect(() => {
    const presenceProfile = activeTab === 'live-game' ? currentProfile : profile;
    const presenceName = !preferences.privacyMode && presenceProfile?.stats ? presenceProfile.inGameName.trim() : '';
    const presenceRank = presenceProfile?.stats ? presenceProfile.stats.rank?.trim() || 'Unranked' : '';
    const liveGame: DiscordLivePresence | undefined = activeTab === 'live-game' ? {
      status: checkingLiveMatch ? 'checking' : liveMatch?.status || 'idle',
      playerName: preferences.privacyMode ? undefined : liveMatch?.playerName || presenceName,
      mode: liveMatch?.mode,
      elapsed: liveMatch?.elapsed,
      checkedAt: liveMatch?.checkedAt,
    } : undefined;
    void api.updateDiscordPresence(snapshot.accounts.length, presenceName, presenceRank, presenceProfile?.stats?.rankIconRemoteUrl || presenceProfile?.stats?.rankIconUrl || '', liveGame);
  }, [activeTab, preferences.privacyMode, checkingLiveMatch, liveMatch?.status, liveMatch?.playerName, liveMatch?.mode, liveMatch?.elapsed, liveMatch?.checkedAt, snapshot.accounts.length, profile?.inGameName, profile?.stats?.rank, profile?.stats?.rankIconRemoteUrl, profile?.stats?.rankIconUrl, currentProfile?.inGameName, currentProfile?.stats?.rank, currentProfile?.stats?.rankIconRemoteUrl, currentProfile?.stats?.rankIconUrl]);

  const toggleFavorite = async (account: SteamAccount, current?: RivalProfile) => {
    const next: RivalProfile = current
      ? { ...current, favorite: !current.favorite }
      : { steamId64: account.steamId64, uid: '', inGameName: '', note: '', favorite: true, updatedAt: new Date().toISOString(), status: 'unlinked' };
    try {
      const saved = await api.saveProfile(next);
      setProfiles((all) => ({ ...all, [account.steamId64]: saved }));
      setToast(saved.favorite ? 'Account added to favorites.' : 'Account removed from favorites.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not update favorite.'); }
  };

  const saveAccountGroup = async (account: SteamAccount, group: string) => {
    const current = profiles[account.steamId64];
    const next: RivalProfile = current
      ? { ...current, group: group.trim() || undefined }
      : { steamId64: account.steamId64, uid: '', inGameName: '', note: '', favorite: false, group: group.trim() || undefined, updatedAt: new Date().toISOString(), status: 'unlinked' };
    try {
      const saved = await api.saveProfile(next);
      setProfiles((all) => ({ ...all, [account.steamId64]: saved }));
      setGroupEditor(null);
      setToast(saved.group ? `${account.personaName} moved to ${saved.group}.` : `${account.personaName} removed from its group.`);
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not update the account group.'); }
  };

  const confirmRemoveAccount = async () => {
    if (!removeAccount) return;
    try {
      const hidden = await api.hideAccount(removeAccount.steamId64);
      setHiddenAccounts(hidden);
      if (selectedId === removeAccount.steamId64) setSelectedId(visibleAccounts.find((account) => account.steamId64 !== removeAccount.steamId64)?.steamId64 ?? '');
      setRemoveAccount(null);
      setAccountView('library');
      setToast('Account removed from Rival Shift. Its Steam login and saved profile were not deleted.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not remove the account.'); }
  };

  const restoreRemovedAccounts = async () => {
    try {
      setHiddenAccounts(await api.restoreHiddenAccounts());
      setToast('Removed accounts are visible in the hub again.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not restore removed accounts.'); }
  };

  const syncPlayer = async (steamId64: string) => {
    setSyncing(steamId64);
    try {
      const result = await api.syncProfile(steamId64);
      setProfiles((all) => ({ ...all, [steamId64]: result }));
      setToast(result.status === 'synced' ? 'Rank and player stats updated.' : (result.error || 'Player lookup failed.'));
    } catch (error) { setToast(error instanceof Error ? error.message : 'Player lookup failed.'); }
    finally { setSyncing(''); }
  };

  const confirmSwitch = async () => {
    if (!selected) return;
    setSwitching(true);
    try {
      await api.switchAccount(selected.steamId64, launchGame);
      setLiveMatch(null);
      setLastCapturedMatch(null);
      setPostMatchSelectedUids([]);
      setModal(null);
      setToast(`${profile?.inGameName || selected.personaName} is ready${launchGame ? ' - launching Marvel Rivals.' : '.'}`);
      await refresh(false);
    } catch (error) { setToast(error instanceof Error ? error.message : 'Account switch failed.'); }
    finally { setSwitching(false); }
  };

  const addSteamAccount = async () => {
    try {
      await api.openSteamLogin();
      setToast('Steam is ready for a new account. Sign in, choose Remember me, then refresh your accounts.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not open Steam login.'); }
  };

  const launchCurrentSession = async () => {
    if (launchingCurrentGame || gameRunning) return;
    setLaunchingCurrentGame(true);
    try {
      await api.launchCurrentGame();
      setToast('Launching Marvel Rivals with the current Steam account.');
      setGameRunning(await api.isGameRunning());
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not launch Marvel Rivals.'); }
    finally { setLaunchingCurrentGame(false); }
  };

  const quickLaunchAccount = async (account: SteamAccount) => {
    if (quickLaunching || (account.currentSession && gameRunning)) return;
    setQuickLaunching(account.steamId64);
    try {
      if (account.currentSession) await api.launchCurrentGame();
      else await api.switchAccount(account.steamId64, true);
      setSelectedId(account.steamId64);
      setLiveMatch(null);
      setLastCapturedMatch(null);
      setPostMatchSelectedUids([]);
      setToast(`${profiles[account.steamId64]?.inGameName || account.personaName} is launching.`);
      await refresh(false);
    } catch (error) { setToast(error instanceof Error ? error.message : 'Quick launch failed.'); }
    finally { setQuickLaunching(''); }
  };

  const checkLiveMatch = async (mode: 'check' | 'refresh' | 'restart' = 'check') => {
    if (!currentSession) return;
    const request = ++liveRequest.current;
    setCheckingLiveMatch(true);
    if (mode !== 'refresh') setLiveMatch(null);
    try {
      const result = mode === 'restart'
        ? await api.restartLiveMatch(currentSession.steamId64)
        : await api.checkLiveMatch(currentSession.steamId64, mode === 'refresh');
      if (request === liveRequest.current) {
        setLiveMatch(result);
        if (result.status === 'in-game') {
          setLastCapturedMatch(result);
          setLiveSearchActive(false);
        }
      }
    } catch (error) {
      if (request === liveRequest.current) setToast(error instanceof Error ? error.message : 'Could not check the live match.');
    } finally { if (request === liveRequest.current) setCheckingLiveMatch(false); }
  };

  useEffect(() => {
    if (!liveSearchActive || checkingLiveMatch || !currentSession) return;
    const timer = window.setTimeout(() => void checkLiveMatch('refresh'), 5_000);
    return () => window.clearTimeout(timer);
  }, [liveSearchActive, checkingLiveMatch, currentSession?.steamId64, liveMatch?.checkedAt]);

  useEffect(() => {
    if (!resolvingHiddenLiveNames || checkingLiveMatch || !currentSession) return;
    const timer = window.setTimeout(() => void checkLiveMatch('refresh'), 15_000);
    return () => window.clearTimeout(timer);
  }, [resolvingHiddenLiveNames, checkingLiveMatch, currentSession?.steamId64, liveMatch?.checkedAt]);

  useEffect(() => api.onQuickAccess(() => {
    setActiveTab('live-game');
    setLiveSearchActive(true);
    setQuickCheckRequest((request) => request + 1);
  }), []);
  useEffect(() => {
    if (!quickCheckRequest || !currentSession || handledQuickCheck.current === quickCheckRequest) return;
    handledQuickCheck.current = quickCheckRequest;
    void checkLiveMatch('restart');
  }, [quickCheckRequest, currentSession?.steamId64]);

  const startLiveSearch = () => {
    setLiveSearchActive(true);
    setQuickCheckRequest((request) => request + 1);
  };

  const stopLiveSearch = () => {
    setLiveSearchActive(false);
    liveRequest.current += 1;
    setCheckingLiveMatch(false);
  };

  const updatePreference = async <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => {
    try {
      setPreferences(await api.setPreference(key, value));
      if (key === 'autoUpdates') setUpdateStatus(await api.getUpdateStatus());
    }
    catch (error) { setToast(error instanceof Error ? error.message : 'Could not update the setting.'); }
  };

  const answerAppPrompt = async (choice: 'tray' | 'quit' | 'keep' | 'restart') => {
    if (!appPrompt || respondingToPrompt) return;
    setRespondingToPrompt(true);
    try {
      await api.respondToAppPrompt(appPrompt.id, choice, appPrompt.type === 'close' && rememberPromptChoice);
      setAppPrompt(null);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not apply that choice.');
    } finally { setRespondingToPrompt(false); }
  };

  const openLiveGame = () => {
    setActiveTab('live-game');
  };

  const searchPlayers = async () => {
    const query = playerQuery.trim();
    if (query.length < 2) { setToast('Enter at least two characters or a complete Marvel Rivals UID.'); return; }
    if (playerSearchInFlight.current) return;
    playerSearchInFlight.current = true;
    setSearchingPlayers(true);
    try {
      const favorites = new Set(favoritePlayers.map((player) => player.uid));
      setPlayerResults((await api.searchRivalsDataPlayers(query)).map((player) => ({ ...player, favorite: favorites.has(player.uid) })));
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not search Rivals Data.'); }
    finally { playerSearchInFlight.current = false; setSearchingPlayers(false); }
  };

  useEffect(() => {
    if (activeTab !== 'players' || !playerAutoRefresh || playerQuery.trim().length < 2) return;
    void searchPlayers();
    const timer = window.setInterval(() => void searchPlayers(), 3_000);
    return () => window.clearInterval(timer);
  }, [activeTab, playerAutoRefresh, playerQuery]);

  const togglePlayerFavorite = async (player: TrackedPlayer) => {
    try {
      const next = player.favorite ? await api.removeFavoritePlayer(player.uid) : await api.saveFavoritePlayer({ ...player, favorite: true });
      setFavoritePlayers(next);
      const favoriteIds = new Set(next.map((item) => item.uid));
      setPlayerResults((results) => results.map((item) => ({ ...item, favorite: favoriteIds.has(item.uid) })));
      setToast(player.favorite ? `${player.name} removed from player favorites.` : `${player.name} added to player favorites.`);
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not update player favorites.'); }
  };

  const refreshPlayerFavorites = async () => {
    setRefreshingFavorites(true);
    try {
      const next = await api.refreshFavoritePlayers();
      setFavoritePlayers(next);
      setToast(next.length ? 'Favorite player statuses refreshed.' : 'No favorite players to refresh.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not refresh player statuses.'); }
    finally { setRefreshingFavorites(false); }
  };

  const refreshTopSnipers = async () => {
    if (topSniperRefreshInFlight.current) return;
    topSniperRefreshInFlight.current = true;
    setTopSniperLoading(true);
    try {
      const next = await api.getTopSnipers();
      const detectedAt = new Date().toISOString();
      setTopSnipers((current) => {
        const previous = new Map(current.map((player) => [player.uid, player]));
        return next.map((player) => {
          const before = previous.get(player.uid);
          const sameStatus = before && topSniperGroup(before) === topSniperGroup(player) && before.presenceText === player.presenceText;
          return { ...player, statusSinceAt: sameStatus ? before.statusSinceAt ?? detectedAt : detectedAt };
        });
      });
      setTopSniperUpdatedAt(detectedAt);
      setTopSniperError('');
    } catch (error) {
      setTopSniperError(error instanceof Error ? error.message : 'Could not load the top 1,000 leaderboard.');
    } finally {
      topSniperRefreshInFlight.current = false;
      setTopSniperLoading(false);
    }
  };

  const refreshPostMatchLookup = async (source: Array<Pick<TrackedPlayer, 'uid' | 'name'>>, generation: number) => {
    if (!source.length || postMatchRefreshInFlight.current) return;
    postMatchRefreshInFlight.current = true;
    if (generation === postMatchGeneration.current) setPostMatchRefreshing(true);
    try {
      const next = await api.refreshPostMatchPlayers(source);
      if (generation === postMatchGeneration.current) setPostMatchPlayers(next);
    } catch (error) {
      if (generation === postMatchGeneration.current) setToast(error instanceof Error ? error.message : 'Could not refresh post-match statuses.');
    } finally {
      postMatchRefreshInFlight.current = false;
      if (generation === postMatchGeneration.current) setPostMatchRefreshing(false);
    }
  };

  const startPostMatchLookup = () => {
    const captured = postMatchSourcePlayers(lastCapturedMatch);
    if (!captured.length) {
      setToast('Check a live game first so Rival Shift can capture its players.');
      return;
    }
    const source = selectedPostMatchSourcePlayers(lastCapturedMatch, postMatchSelectedUids);
    if (!source.length) {
      setToast('Select at least one player from the last match.');
      return;
    }
    const generation = ++postMatchGeneration.current;
    postMatchSource.current = source;
    setPostMatchPlayers([]);
    setPostMatchLooking(true);
    void refreshPostMatchLookup(source, generation);
  };

  const stopPostMatchLookup = () => {
    postMatchGeneration.current += 1;
    setPostMatchLooking(false);
    setPostMatchRefreshing(false);
  };

  const togglePostMatchPlayer = (uid: string) => {
    if (postMatchLooking) return;
    setPostMatchSelectedUids((current) => current.includes(uid) ? current.filter((item) => item !== uid) : [...current, uid]);
  };

  useEffect(() => {
    if (!postMatchLooking || !postMatchSource.current.length) return;
    const timer = window.setInterval(() => void refreshPostMatchLookup(postMatchSource.current, postMatchGeneration.current), 5_000);
    return () => window.clearInterval(timer);
  }, [postMatchLooking]);

  useEffect(() => {
    if (activeTab !== 'top-sniper' || !topSniperActive) return;
    void refreshTopSnipers();
    const timer = window.setInterval(() => void refreshTopSnipers(), 5_000);
    return () => window.clearInterval(timer);
  }, [activeTab, topSniperActive]);

  return <div className={`app-shell ${railExpanded ? 'rail-expanded' : ''} ${preferences.privacyMode ? 'privacy-mode' : ''}`}>
    <div className="titlebar"><div className="titlebar-mark"><span>R</span><b>RIVAL SHIFT</b></div><span className="titlebar-sub">MARVEL RIVALS ACCOUNT HUB</span><div className="titlebar-actions"><button className={`title-privacy ${preferences.privacyMode ? 'active' : ''}`} onClick={() => void updatePreference('privacyMode', !preferences.privacyMode)} title={preferences.privacyMode ? 'Turn privacy mode off' : 'Hide player names and UIDs'}><span className="privacy-led" /><LockKeyhole size={13} /><b>{preferences.privacyMode ? 'Privacy on' : 'Privacy'}</b></button><div className="window-controls" aria-label="Window controls"><button aria-label="Minimize" title="Minimize" onClick={() => void api.minimizeWindow()}><Minimize2 size={14} /></button><button aria-label={windowMaximized ? 'Restore window' : 'Maximize'} title={windowMaximized ? 'Restore window' : 'Maximize'} onClick={async () => setWindowMaximized(await api.toggleMaximizeWindow())}>{windowMaximized ? <PanelLeftClose size={13} /> : <Maximize2 size={13} />}</button><button className="window-close" aria-label="Close" title="Close" onClick={() => void api.closeWindow()}><X size={15} /></button></div></div></div>
    <aside className="rail" aria-label="Main navigation">
      <nav>
        <button className={`rail-button ${activeTab === 'accounts' ? 'active' : ''}`} aria-label="Accounts" title="Accounts" onClick={() => { setActiveTab('accounts'); setAccountView('library'); }}><House size={20} /><span>Accounts</span></button>
        <button className={`rail-button ${activeTab === 'intelligence' ? 'active' : ''}`} aria-label="Hero intelligence" title="Hero intelligence" onClick={() => setActiveTab('intelligence')}><Sparkles size={20} /><span>Heroes</span></button>
        <button className={`rail-button ${activeTab === 'players' ? 'active' : ''}`} aria-label="Player search" title="Player search" onClick={() => setActiveTab('players')}><Users size={20} /><span>Players</span></button>
        <button className={`rail-button ${activeTab === 'top-sniper' ? 'active' : ''}`} aria-label="Top sniper" title="Top sniper" onClick={() => setActiveTab('top-sniper')}><Crosshair size={20} /><span>Top sniper</span></button>
        <button className={`rail-button ${activeTab === 'live-game' ? 'active' : ''}`} aria-label="Live game" title="Live game" onClick={openLiveGame}><Radio size={20} /><span>Live game</span></button>
        <button className={`rail-button ${activeTab === 'post-match' ? 'active' : ''}`} aria-label="Post match" title="Post match" onClick={() => setActiveTab('post-match')}><History size={20} /><span>Post match</span></button>
      </nav>
      <div className="rail-bottom">
        <button className={`rail-button ${activeTab === 'settings' ? 'active' : ''}`} aria-label="Settings" onClick={() => setActiveTab('settings')}><Settings size={20} /><span>Settings</span></button>
        <button className="rail-button" aria-label="About Rival Shift" onClick={() => setModal('about')}><CircleHelp size={20} /><span>About</span></button>
        <button className="rail-button rail-toggle" aria-label={railExpanded ? 'Collapse sidebar' : 'Expand sidebar'} aria-expanded={railExpanded} onClick={() => setRailExpanded((value) => !value)}>{railExpanded ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}<span>{railExpanded ? 'Collapse' : 'Expand'}</span></button>
      </div>
    </aside>

    {activeTab === 'accounts' ? <main className={`workspace ${accountView === 'library' ? 'account-library-mode' : 'account-details-mode'}`}>
      {accountView === 'library' ? <section className="accounts-pane accounts-home-pane">
        <header className="pane-header"><div><span className="eyebrow">STEAM LIBRARY</span><h1>Your accounts</h1><p className="pane-subtitle">Use Open stats on any account card to view its full profile.</p></div><div className="pane-actions"><button className="add-account-button" onClick={() => void addSteamAccount()}><UserPlus size={15} /> Add account</button><button className="icon-button" onClick={() => void refresh(true)} aria-label="Refresh Steam and linked player data" title="Refresh Steam and player data"><RefreshCw size={17} className={loading ? 'spin' : ''} /></button></div></header>
        <div className="account-explorer" aria-label="Search, filter, and order accounts">
          <div className="account-explorer-heading"><div><SlidersHorizontal size={14} /><span><b>Browse your library</b><small>{visibleAccounts.length} accounts · {linkedCount} linked</small></span></div><strong>{accounts.length} shown</strong></div>
          <div className="account-explorer-tools">
            <label className="account-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, Steam account, or UID" />{search && <button aria-label="Clear search" title="Clear search" onClick={() => setSearch('')}><X size={13} /></button>}</label>
            <div className="account-filter-row">
              <label><span>Rank</span><select aria-label="Filter accounts by rank" value={rankFilter} onChange={(event) => setRankFilter(event.target.value)}><option value="all">All ranks</option><option value="ranked">Ranked only</option><option value="unranked">Unranked</option>{availableRanks.map((tier) => <option value={tier} key={tier}>{tier}</option>)}</select></label>
              <label><span>Group</span><select aria-label="Filter accounts by group" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}><option value="all">All groups</option><option value="ungrouped">Ungrouped</option>{availableGroups.map((group) => <option value={group} key={group}>{group}</option>)}</select></label>
              <label><span>Sort</span><select aria-label="Order accounts" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as AccountSort)}><option value="rank-desc">Highest rank</option><option value="rank-asc">Lowest rank</option><option value="favorites">Favorites</option><option value="win-rate">Win rate</option><option value="level">Level</option><option value="recent">Recently used</option><option value="name">Name</option></select></label>
            </div>
            {(search || rankFilter !== 'all' || groupFilter !== 'all' || sortOrder !== 'rank-desc') && <button className="account-filter-reset" onClick={() => { setSearch(''); setRankFilter('all'); setGroupFilter('all'); setSortOrder('rank-desc'); }}><X size={12} /> Reset</button>}
          </div>
        </div>
        {snapshot.error && <div className="inline-warning"><ShieldCheck size={17} /><span>{snapshot.error}</span></div>}
        <div className="account-list" tabIndex={0} role="region" aria-label="Steam account library">
          {loading && [1, 2, 3, 4].map((key) => <div className="account-skeleton" key={key} />)}
          {!loading && accounts.map((account, index) => <AccountCard key={account.steamId64} account={account} profile={profiles[account.steamId64]} active={selectedId === account.steamId64} index={index} launching={quickLaunching === account.steamId64} launchDisabled={Boolean(quickLaunching) || (account.currentSession && gameRunning)} onClick={() => setSelectedId(account.steamId64)} onOpen={() => { setSelectedId(account.steamId64); setAccountView('details'); }} onFavorite={() => void toggleFavorite(account, profiles[account.steamId64])} onGroup={() => setGroupEditor(account)} onRemove={() => setRemoveAccount(account)} onQuickLaunch={() => void quickLaunchAccount(account)} />)}
          {!loading && !accounts.length && <div className="empty-list"><Gamepad2 size={26} /><b>No accounts found</b><span>{search || rankFilter !== 'all' ? 'No account matches your search and filters.' : 'Add a Steam login, select Remember me, then refresh.'}</span>{!search && rankFilter === 'all' && <button className="primary-button compact" onClick={() => void addSteamAccount()}><UserPlus size={14} /> Add Steam account</button>}</div>}
        </div>
        <footer className="pane-footer"><span className="status-dot" />{snapshot.steamRoot ? 'Steam connected' : 'Steam not detected'}{hiddenAccounts.length > 0 && <button className="footer-presence" onClick={() => void restoreRemovedAccounts()}><RefreshCw size={11} /> Restore {hiddenAccounts.length} removed</button>}<button className="footer-presence" onClick={() => setActiveTab('settings')}><Settings size={11} /> Settings</button><span>v0.9.39</span></footer>
      </section> :

      <section className="detail-pane account-detail-page">
        {selected ? <>
          <header className="detail-topbar">
            <button className="detail-back" onClick={() => setAccountView('library')}><ChevronRight size={16} /> Back to accounts</button>
            <div className="crumbs"><span>Account details</span><ChevronRight size={14} /><b>{profile?.inGameName || selected.personaName}</b></div>
            <div className="detail-actions"><button className="secondary-button" onClick={() => setModal('link')}><Pencil size={15} /> {linked ? 'Edit' : 'Link'}</button><button className="primary-button" onClick={() => selected.currentSession ? void launchCurrentSession() : setModal('switch')} disabled={selected.currentSession && (gameRunning || launchingCurrentGame)}>{launchingCurrentGame && selected.currentSession ? <LoaderCircle className="spin" size={16} /> : <Swords size={16} />} {selected.currentSession ? (launchingCurrentGame ? 'Launching…' : gameRunning ? 'Active' : 'Launch') : 'Switch & play'}</button></div>
          </header>
          <div className="detail-scroll" tabIndex={0} role="region" aria-label="Selected account details">
            <section className="identity-card">
              <AccountAvatar account={selected} profile={profile} name={profile?.inGameName || selected.personaName} className="identity-avatar" />
              <div className="identity-copy"><div className="identity-flags">{selected.currentSession && <span className="live-chip"><i /> CURRENT SESSION</span>}{linked && <span className="data-chip"><Database size={12} /> SAVED LOCALLY</span>}</div><h2>{profile?.inGameName || selected.personaName}</h2><p>@{selected.accountName} <span>·</span> Steam ID {shortId(selected.steamId64)}</p>{profile?.note && <div className="identity-note">{profile.note}</div>}</div>
              <button className={`favorite-button ${profile?.favorite ? 'active' : ''}`} aria-label={profile?.favorite ? 'Remove favorite' : 'Add favorite'} onClick={() => void toggleFavorite(selected, profile)}><Star size={19} fill={profile?.favorite ? 'currentColor' : 'none'} /></button>
            </section>

            {!linked ? <LinkPrompt onLink={() => setModal('link')} /> : <>
              <section className="section-heading player-data-heading"><div><span className="eyebrow">{profile?.stats ? 'CACHED PLAYER DATA' : 'PLAYER DATA'}</span><h3>{profile?.stats ? `Updated ${relativeTime(profile.stats.syncedAt || profile.updatedAt)}` : 'Load rank and performance'}</h3></div><div className="section-actions"><button className="secondary-button compact" onClick={() => setModal('history')}><TrendingUp size={14} /> History</button><button className="secondary-button compact" onClick={() => void syncPlayer(selected.steamId64)} disabled={syncing === selected.steamId64}>{syncing === selected.steamId64 ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} Refresh stats</button><button className="source-link-button" title="Open Rivals Data" onClick={() => void api.openPlayerProfile(profile?.uid || '')}><span>Rivals Data</span><ExternalLink size={14} /></button></div></section>
              {profile?.status === 'error' && <div className="profile-error"><div><b>Player data could not load</b><span>{profile.error}</span></div></div>}
              {profile?.stats ? <div className="stats-grid">
                <RankCard profile={profile} />
                <StatCard label="WIN RATE" value={profile.stats.winRate != null ? `${profile.stats.winRate}%` : '-'} sub={profile.stats.wins != null ? `${profile.stats.wins} wins / ${profile.stats.losses ?? 0} losses` : 'Not available'} progress={profile.stats.winRate} icon={<Activity size={16} />} />
                <StatCard label="MATCHES" value={profile.stats.matches?.toString() ?? '-'} sub={profile.stats.kd != null ? `${profile.stats.kd} K/D` : 'Competitive and quickplay'} icon={<Swords size={16} />} />
              </div> : <div className="data-empty"><Database size={24} /><div><b>No stats cached yet</b><span>Load rank, win rate, matches, level and heroes from Rivals Data.</span></div><button className="primary-button" onClick={() => void syncPlayer(selected.steamId64)}>Load stats</button></div>}
              <div className="lower-grid">
                <PlayerDataPanel key={profile?.steamId64} profile={profile} refreshing={syncing === selected.steamId64} onRefresh={() => void syncPlayer(selected.steamId64)} />
                <section className="panel-card connection-card"><div className="card-title"><div><span className="eyebrow">ACCOUNT LINK</span><h3>Saved identity</h3></div><Link2 size={17} /></div><div className="link-row"><span>Marvel Rivals UID</span><b>{profile?.uid || 'Not entered'}</b></div><div className="link-row"><span>In-game name</span><b>{profile?.inGameName || 'Not entered'}</b></div><div className="link-row"><span>Player level</span><b>{profile?.stats?.level ?? '-'}</b></div><div className="link-row"><span>Leaderboard</span><b>{profile?.stats?.leaderboardRank ?? 'Not ranked'}</b></div><div className="link-row"><span>Faction</span><b>{profile?.stats?.factionName || 'None shown'}</b></div><div className="link-row"><span>Match history</span><b>{profile?.stats?.matchHistoryVisible == null ? 'Unknown' : profile.stats.matchHistoryVisible ? 'Public' : 'Private / cached'}</b></div><div className="link-row"><span>Known names</span><b>{profile?.stats?.nameHistory?.length ?? 0}</b></div><div className="link-row"><span>Data source</span><b>{profile?.stats?.source ?? 'Rivals Data'}</b></div><button className="wide-ghost" onClick={() => void api.openPlayerProfile(profile?.uid || '')}>View full profile on Rivals Data <ExternalLink size={14} /></button></section>
              </div>
            </>}
          </div>
        </> : <div className="no-selection"><Swords /><h2>Select an account</h2><p>Choose a Steam account from the grid.</p></div>}
      </section>}
    </main> : activeTab === 'intelligence' ? <HeroIntelligencePage accounts={snapshot.accounts} profiles={profiles} onAccounts={() => setActiveTab('accounts')} /> : activeTab === 'players' ? <PlayerSearchPage query={playerQuery} setQuery={setPlayerQuery} results={playerResults} favorites={favoritePlayers} searching={searchingPlayers} refreshing={refreshingFavorites} autoRefresh={playerAutoRefresh} onToggleAutoRefresh={() => setPlayerAutoRefresh((active) => !active)} onSearch={searchPlayers} onToggleFavorite={togglePlayerFavorite} onRefreshFavorites={refreshPlayerFavorites} onOpenProfile={(uid) => api.openPlayerProfile(uid)} /> : activeTab === 'top-sniper' ? <TopSniperPage players={topSnipers} loading={topSniperLoading} active={topSniperActive} error={topSniperError} updatedAt={topSniperUpdatedAt} onStart={() => setTopSniperActive(true)} onStop={() => setTopSniperActive(false)} onRefresh={refreshTopSnipers} onOpenProfile={(uid) => api.openPlayerProfile(uid)} /> : activeTab === 'live-game' ? <LiveGamePage account={currentSession} profile={currentProfile} snapshot={liveMatch} loading={checkingLiveMatch} searching={liveSearchActive} onStart={startLiveSearch} onStop={stopLiveSearch} onRefresh={() => void checkLiveMatch('refresh')} onRecheck={startLiveSearch} onForceRefresh={startLiveSearch} onAccounts={() => setActiveTab('accounts')} /> : activeTab === 'post-match' ? <PostMatchPage capturedPlayers={postMatchSourcePlayers(lastCapturedMatch)} selectedUids={postMatchSelectedUids} players={postMatchPlayers} looking={postMatchLooking} refreshing={postMatchRefreshing} onTogglePlayer={togglePostMatchPlayer} onSelectAll={() => setPostMatchSelectedUids(postMatchSourcePlayers(lastCapturedMatch).map((player) => player.uid))} onClearSelection={() => setPostMatchSelectedUids([])} onStart={startPostMatchLookup} onStop={stopPostMatchLookup} /> : <SettingsPage extension={extensionStatus} launcherSkip={launcherSkipStatus} updateStatus={updateStatus} preferences={preferences} onBack={() => setActiveTab('accounts')} onRefreshExtension={async () => setExtensionStatus(await api.getRivalsDataExtensionStatus())} onOpenExtensionFolder={() => api.openRivalsDataExtensionFolder()} onSetLauncherSkip={async (enabled) => { try { const status = await api.setLauncherSkip(enabled); setLauncherSkipStatus(status); setToast(status.message); } catch (error) { setToast(error instanceof Error ? error.message : 'Could not change launcher skip.'); } }} onSetPreference={updatePreference} onCheckUpdates={async () => setUpdateStatus(await api.checkForUpdates())} onInstallUpdate={() => api.installUpdate()} onBackup={() => setModal('backup')} />}

    {modal === 'link' && selected && <ProfileModal account={selected} profile={profile} storagePath={storagePath} onClose={() => setModal(null)} onSave={async (next) => {
      const saved = await api.saveProfile(next);
      setProfiles((all) => ({ ...all, [selected.steamId64]: saved }));
      setModal(null);
      await syncPlayer(selected.steamId64);
    }} onRemove={linked ? async () => { await api.removeProfile(selected.steamId64); setProfiles((all) => { const next = { ...all }; delete next[selected.steamId64]; return next; }); setModal(null); setToast('Profile link removed.'); } : undefined} />}
    {modal === 'switch' && selected && <SwitchModal account={selected} launchGame={launchGame} setLaunchGame={setLaunchGame} working={switching} onClose={() => setModal(null)} onConfirm={() => void confirmSwitch()} />}
    {modal === 'history' && selected && <HistoryModal name={profile?.inGameName || selected.personaName} profile={profile} onClose={() => setModal(null)} />}
    {modal === 'backup' && <BackupModal onClose={() => setModal(null)} onExport={async (passphrase) => { try { const result = await api.exportProfiles(passphrase); if (!result.canceled) setToast(`Encrypted backup saved to ${result.path}.`); } catch (error) { setToast(error instanceof Error ? error.message : 'Could not export the encrypted backup.'); } }} onImport={async (passphrase) => { try { const result = await api.importProfiles(passphrase); if (!result.canceled) { setProfiles(result.profiles); setToast(`Imported ${result.count} profiles from the encrypted backup.`); } } catch (error) { setToast(error instanceof Error ? error.message : 'Could not import the encrypted backup.'); } }} />}
    {modal === 'about' && <AboutModal onClose={() => setModal(null)} />}
    {updateStatus.state === 'downloaded' && updateStatus.availableVersion && dismissedUpdateVersion !== updateStatus.availableVersion && <UpdateReadyModal version={updateStatus.availableVersion} installing={installingUpdate} onLater={() => setDismissedUpdateVersion(updateStatus.availableVersion || '')} onInstall={async () => { setInstallingUpdate(true); try { await api.installUpdate(); } catch (error) { setInstallingUpdate(false); setToast(error instanceof Error ? error.message : 'Could not install the downloaded update.'); } }} />}
    {groupEditor && <GroupModal account={groupEditor} current={profiles[groupEditor.steamId64]?.group || ''} groups={availableGroups} onClose={() => setGroupEditor(null)} onSave={(group) => void saveAccountGroup(groupEditor, group)} />}
    {removeAccount && <RemoveAccountModal account={removeAccount} profile={profiles[removeAccount.steamId64]} onClose={() => setRemoveAccount(null)} onConfirm={() => void confirmRemoveAccount()} />}
    {appPrompt && <SystemPromptModal prompt={appPrompt} remember={rememberPromptChoice} setRemember={setRememberPromptChoice} working={respondingToPrompt} onChoose={(choice) => void answerAppPrompt(choice)} />}
    {toast && <div className="toast"><Check size={16} /><span>{toast}</span><button onClick={() => setToast('')}><X size={14} /></button></div>}
  </div>;
}

function accountHealth(account: SteamAccount, profile?: RivalProfile) {
  const issues: string[] = [];
  let score = 100;
  if (!account.remembered) { score -= 25; issues.push('Steam did not mark this login as remembered'); }
  if (!hasIdentity(profile)) { score -= 30; issues.push('Marvel Rivals profile is not linked'); }
  if (profile?.status === 'error') { score -= 25; issues.push(profile.error || 'Latest RivalsData refresh failed'); }
  if (hasIdentity(profile) && !profile?.stats) { score -= 15; issues.push('Player stats have not been loaded'); }
  if (hasIdentity(profile) && !profile?.uid.trim()) { score -= 10; issues.push('UID is missing'); }
  const syncedAt = profile?.stats?.syncedAt || profile?.updatedAt;
  if (profile?.stats && syncedAt && Date.now() - new Date(syncedAt).getTime() > 7 * 86_400_000) { score -= 15; issues.push('Cached data is over seven days old'); }
  const normalized = Math.max(0, score);
  return { score: normalized, issues, tone: normalized >= 80 ? 'good' : normalized >= 55 ? 'warn' : 'bad' } as const;
}

function DashboardHeader({ eyebrow, title, description, onAccounts }: { eyebrow: string; title: string; description: string; onAccounts: () => void }) {
  return <header className="dashboard-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><button className="secondary-button" onClick={onAccounts}><ChevronRight className="back-chevron" size={15} /> Accounts</button></header>;
}

function AccountComparisonPage({ accounts, profiles, selectedIds, onToggle, onAccounts }: { accounts: SteamAccount[]; profiles: Record<string, RivalProfile>; selectedIds: string[]; onToggle: (id: string) => void; onAccounts: () => void }) {
  const selected = selectedIds.map((id) => accounts.find((account) => account.steamId64 === id)).filter((account): account is SteamAccount => Boolean(account));
  const metrics = [
    { label: 'Rank', value: (profile?: RivalProfile) => profile?.stats?.rank || 'Unranked' },
    { label: 'Rank score', value: (profile?: RivalProfile) => profile?.stats?.rankScore?.toLocaleString() ?? '—' },
    { label: 'Win rate', value: (profile?: RivalProfile) => profile?.stats?.winRate != null ? `${profile.stats.winRate}%` : '—' },
    { label: 'Record', value: (profile?: RivalProfile) => profile?.stats?.wins != null ? `${profile.stats.wins}W · ${profile.stats.losses ?? 0}L` : '—' },
    { label: 'Matches', value: (profile?: RivalProfile) => profile?.stats?.matches?.toLocaleString() ?? '—' },
    { label: 'Level', value: (profile?: RivalProfile) => profile?.stats?.level?.toLocaleString() ?? '—' },
    { label: 'Best hero', value: (profile?: RivalProfile) => [...(profile?.stats?.heroStats ?? [])].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0))[0]?.name || profile?.stats?.heroes?.[0] || '—' },
    { label: 'Inventory', value: (profile?: RivalProfile) => profile?.stats?.skinInventoryValue != null ? `${profile.stats.skinInventoryValue.toLocaleString()} units` : '—' },
  ];
  return <main className="dashboard-page compare-page"><DashboardHeader eyebrow="ACCOUNT LAB" title="Compare accounts" description="Select up to four accounts and see their progression side by side." onAccounts={onAccounts} /><div className="dashboard-scroll">
    <section className="compare-picker"><div className="section-inline-title"><div><b>Choose accounts</b><span>{selected.length}/4 selected</span></div>{selected.length >= 4 && <small>Remove one to choose another.</small>}</div><div className="compare-choices">{accounts.map((account, index) => { const profile = profiles[account.steamId64]; const checked = selectedIds.includes(account.steamId64); return <button key={account.steamId64} className={checked ? 'selected' : ''} disabled={!checked && selected.length >= 4} onClick={() => onToggle(account.steamId64)}><AccountAvatar account={account} profile={profile} name={profile?.inGameName || account.personaName} className={`compare-avatar tint-${index % 4}`} /><span><b>{profile?.inGameName || account.personaName}</b><small>{profile?.stats?.rank || 'Unranked'}</small></span><i>{checked && <Check size={12} />}</i></button>; })}</div></section>
    {selected.length < 2 ? <div className="dashboard-empty"><SlidersHorizontal size={30} /><b>Select at least two accounts</b><span>The comparison table appears once two accounts are selected.</span></div> : <section className="comparison-table"><div className="comparison-row comparison-head"><span>METRIC</span>{selected.map((account, index) => <div key={account.steamId64}><AccountAvatar account={account} profile={profiles[account.steamId64]} name={profiles[account.steamId64]?.inGameName || account.personaName} className={`compare-head-avatar tint-${index % 4}`} /><b>{profiles[account.steamId64]?.inGameName || account.personaName}</b></div>)}</div>{metrics.map((metric) => <div className="comparison-row" key={metric.label}><span>{metric.label}</span>{selected.map((account) => <b key={account.steamId64}>{metric.value(profiles[account.steamId64])}</b>)}</div>)}</section>}
  </div></main>;
}

function AccountHealthPage({ accounts, profiles, onOpen, onAccounts }: { accounts: SteamAccount[]; profiles: Record<string, RivalProfile>; onOpen: (id: string) => void; onAccounts: () => void }) {
  const reports = accounts.map((account) => ({ account, profile: profiles[account.steamId64], health: accountHealth(account, profiles[account.steamId64]) })).sort((a, b) => a.health.score - b.health.score);
  const ready = reports.filter((item) => item.health.score >= 80).length;
  return <main className="dashboard-page health-page"><DashboardHeader eyebrow="ACCOUNT HEALTH" title="Everything ready to play" description="See connection, identity, freshness, and Steam readiness in one place." onAccounts={onAccounts} /><div className="dashboard-scroll"><div className="health-summary"><div className="health-ring"><b>{accounts.length ? Math.round(reports.reduce((sum, item) => sum + item.health.score, 0) / accounts.length) : 0}%</b><span>Overall health</span></div><div><b>{ready}</b><span>Ready accounts</span></div><div><b>{reports.filter((item) => !hasIdentity(item.profile)).length}</b><span>Need linking</span></div><div><b>{reports.filter((item) => item.profile?.status === 'error').length}</b><span>Refresh errors</span></div></div><div className="health-grid">{reports.map(({ account, profile, health }, index) => <article className={`health-card health-${health.tone}`} key={account.steamId64}><div className="health-card-head"><AccountAvatar account={account} profile={profile} name={profile?.inGameName || account.personaName} className={`health-avatar tint-${index % 4}`} /><div><b>{profile?.inGameName || account.personaName}</b><span>{profile?.group || 'Ungrouped'} · {profile?.stats?.rank || 'Unranked'}</span></div><strong>{health.score}%</strong></div><div className="health-track"><i style={{ width: `${health.score}%` }} /></div>{health.issues.length ? <ul>{health.issues.map((issue) => <li key={issue}><X size={10} /> {issue}</li>)}</ul> : <div className="health-ready"><Check size={13} /> Account is linked, fresh, and ready.</div>}<button onClick={() => onOpen(account.steamId64)}>Open account <ChevronRight size={13} /></button></article>)}</div></div></main>;
}

function HeroIntelligencePage({ accounts, profiles, onAccounts }: { accounts: SteamAccount[]; profiles: Record<string, RivalProfile>; onAccounts: () => void }) {
  const rows = new Map<string, { name: string; iconUrl?: string; matches: number; weightedWinRate: number; weightedKda: number; accounts: number }>();
  for (const account of accounts) for (const hero of profiles[account.steamId64]?.stats?.heroStats ?? []) {
    const matches = Math.max(1, hero.matches ?? ((hero.wins ?? 0) + (hero.losses ?? 0)));
    const current = rows.get(hero.name) ?? { name: hero.name, iconUrl: hero.iconUrl, matches: 0, weightedWinRate: 0, weightedKda: 0, accounts: 0 };
    current.matches += matches; current.weightedWinRate += (hero.winRate ?? 0) * matches; current.weightedKda += (hero.kda ?? 0) * matches; current.accounts += 1; current.iconUrl ||= hero.iconUrl; rows.set(hero.name, current);
  }
  const heroes = [...rows.values()].map((hero) => ({ ...hero, winRate: hero.weightedWinRate / hero.matches, kda: hero.weightedKda / hero.matches })).sort((a, b) => b.matches - a.matches);
  const best = [...heroes].filter((hero) => hero.matches >= 5).sort((a, b) => b.winRate - a.winRate)[0];
  const opportunity = [...heroes].filter((hero) => hero.matches >= 5).sort((a, b) => a.winRate - b.winRate)[0];
  const mostPlayed = heroes[0];
  return <main className="dashboard-page intelligence-page"><DashboardHeader eyebrow="HERO INTELLIGENCE" title="Your hero portfolio" description="Local insights calculated across the hero performance cached for every account." onAccounts={onAccounts} /><div className="dashboard-scroll">{!heroes.length ? <div className="dashboard-empty"><Sparkles size={30} /><b>No hero performance loaded</b><span>Refresh linked accounts to build recommendations from RivalsData.</span></div> : <><div className="intel-highlights"><IntelHighlight label="STRONGEST PICK" hero={best} detail={best ? `${best.winRate.toFixed(1)}% win rate across ${best.matches} matches` : 'More matches needed'} tone="good" /><IntelHighlight label="MOST EXPERIENCED" hero={mostPlayed} detail={mostPlayed ? `${mostPlayed.matches} matches across ${mostPlayed.accounts} account${mostPlayed.accounts === 1 ? '' : 's'}` : 'No data'} tone="main" /><IntelHighlight label="IMPROVEMENT FOCUS" hero={opportunity} detail={opportunity ? `${opportunity.winRate.toFixed(1)}% win rate · review recent matches` : 'More matches needed'} tone="warn" /></div><section className="hero-intel-table"><div className="hero-intel-head"><span>Hero</span><span>Accounts</span><span>Matches</span><span>Win rate</span><span>KDA</span></div>{heroes.map((hero, index) => <div className="hero-intel-row" key={hero.name}><span><i>{hero.iconUrl ? <img src={reliableRivalsAssetUrl(hero.iconUrl)} alt="" referrerPolicy="no-referrer" /> : initials(hero.name)}</i><b>{hero.name}</b><small>#{index + 1}</small></span><b>{hero.accounts}</b><b>{hero.matches}</b><span><b>{hero.winRate.toFixed(1)}%</b><i><i style={{ width: `${Math.min(100, hero.winRate)}%` }} /></i></span><b>{hero.kda ? hero.kda.toFixed(2) : '—'}</b></div>)}</section></>}</div></main>;
}

function IntelHighlight({ label, hero, detail, tone }: { label: string; hero?: { name: string; iconUrl?: string }; detail: string; tone: string }) {
  return <article className={`intel-highlight ${tone}`}><span>{label}</span><div>{hero?.iconUrl ? <img src={reliableRivalsAssetUrl(hero.iconUrl)} alt="" referrerPolicy="no-referrer" /> : <Sparkles size={22} />}<b>{hero?.name || 'Not enough data'}</b></div><p>{detail}</p></article>;
}

function GroupModal({ account, current, groups, onClose, onSave }: { account: SteamAccount; current: string; groups: string[]; onClose: () => void; onSave: (group: string) => void }) {
  const [group, setGroup] = useState(current);
  return <div className="modal-backdrop"><div className="modal-card group-modal"><button className="modal-close" onClick={onClose}><X size={18} /></button><div className="modal-icon"><Plus /></div><span className="eyebrow">CUSTOM GROUP</span><h2>Organize {account.personaName}</h2><p className="modal-lead">Use an existing group or create a new one. Groups are stored locally and included in encrypted backups.</p>{groups.length > 0 && <div className="group-suggestions">{groups.map((item) => <button className={group === item ? 'active' : ''} key={item} onClick={() => setGroup(item)}>{item}</button>)}</div>}<label className="form-label"><span>Group name</span><input value={group} maxLength={32} onChange={(event) => setGroup(event.target.value)} placeholder="Main, Ranked, Practice…" autoFocus /></label><div className="modal-actions"><button className="secondary-button" onClick={() => onSave('')}>Remove group</button><button className="primary-button" onClick={() => onSave(group)} disabled={!group.trim()}>Save group</button></div></div></div>;
}

function RemoveAccountModal({ account, profile, onClose, onConfirm }: { account: SteamAccount; profile?: RivalProfile; onClose: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop"><div className="modal-card remove-account-modal"><button className="modal-close" onClick={onClose}><X size={18} /></button><div className="modal-icon hot"><Unlink /></div><span className="eyebrow">REMOVE FROM RIVAL SHIFT</span><h2>Remove {profile?.inGameName || account.personaName}?</h2><p className="modal-lead">This account will disappear from the Rival Shift hub. Its Steam login, Marvel Rivals account, and saved profile data will not be deleted.</p><div className="remove-account-note"><ShieldCheck size={16} /><span>You can restore all removed accounts from the hub footer at any time.</span></div><div className="modal-actions"><span /><button className="secondary-button" onClick={onClose}>Cancel</button><button className="danger-button" onClick={onConfirm}><Unlink size={14} /> Remove account</button></div></div></div>;
}

function SystemPromptModal({ prompt, remember, setRemember, working, onChoose }: { prompt: AppPrompt; remember: boolean; setRemember: (value: boolean) => void; working: boolean; onChoose: (choice: 'tray' | 'quit' | 'keep' | 'restart') => void }) {
  const closing = prompt.type === 'close';
  return <div className="modal-backdrop system-prompt-backdrop" role="dialog" aria-modal="true" aria-labelledby="system-prompt-title">
    <div className={`modal-card system-prompt-card ${closing ? 'close-prompt' : 'duplicate-prompt'}`}>
      <div className={`modal-icon ${closing ? 'hot' : ''}`}>{closing ? <LogOut size={21} /> : <Copy size={21} />}</div>
      <span className="eyebrow">{closing ? 'BEFORE YOU GO' : 'INSTANCE CHECK'}</span>
      <h2 id="system-prompt-title">{closing ? 'Close Rival Shift?' : 'Rival Shift is already running'}</h2>
      <p className="modal-lead">{closing ? 'Choose whether to keep quick access and monitoring available in the tray, or fully terminate the app.' : 'Another launch was detected. Choose which app session you want to keep before continuing.'}</p>
      <div className="system-prompt-choices">
        {closing ? <>
          <button className="system-choice recommended" disabled={working} onClick={() => onChoose('tray')}><span><Minimize2 size={18} /></span><div><b>Minimize to tray</b><small>Keep shortcuts and monitoring active</small></div><ChevronRight size={15} /></button>
          <button className="system-choice danger" disabled={working} onClick={() => onChoose('quit')}><span><LogOut size={18} /></span><div><b>Quit Rival Shift</b><small>Terminate the app and background services</small></div><ChevronRight size={15} /></button>
        </> : <>
          <button className="system-choice recommended" disabled={working} onClick={() => onChoose('keep')}><span><ShieldCheck size={18} /></span><div><b>Keep current instance</b><small>Continue with the session already open</small></div><ChevronRight size={15} /></button>
          <button className="system-choice" disabled={working} onClick={() => onChoose('restart')}><span><RefreshCw size={18} /></span><div><b>Use new launch</b><small>Restart Rival Shift from the new request</small></div><ChevronRight size={15} /></button>
        </>}
      </div>
      {closing && <label className="prompt-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><i>{remember && <Check size={11} />}</i><span><b>Remember this choice</b><small>You can always change it later in Settings.</small></span></label>}
      {!closing && <div className="prompt-required"><ShieldCheck size={13} /> This decision is required to continue.</div>}
      {working && <div className="prompt-working"><LoaderCircle className="spin" size={14} /> Applying your choice…</div>}
    </div>

  </div>;
}

function AccountAvatar({ account, profile, name, className }: { account: SteamAccount; profile?: RivalProfile; name: string; className: string }) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = profile?.stats?.profileIconUrl || account.avatarUrl;
  useEffect(() => setFailed(false), [avatarUrl]);
  return <div className={className}>
    {avatarUrl && !failed ? <img src={reliableRivalsAssetUrl(avatarUrl)} alt="Player avatar" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span>{initials(name)}</span>}
    {className === 'identity-avatar' && <div className="avatar-ring" />}
    {account.currentSession && className.includes('account-avatar') && <i />}
  </div>;
}

function AccountCard({ account, profile, active, index, launching, launchDisabled, onClick, onOpen, onFavorite, onGroup, onRemove, onQuickLaunch }: { account: SteamAccount; profile?: RivalProfile; active: boolean; index: number; launching: boolean; launchDisabled: boolean; onClick: () => void; onOpen: () => void; onFavorite: () => void; onGroup: () => void; onRemove: () => void; onQuickLaunch: () => void }) {
  const cardProgress = rankProgressValue(profile?.stats?.rankScore, profile?.stats?.rank, profile?.stats?.rankProgress);
  const cardLevel = profile?.stats?.level == null ? undefined : Math.max(0, Math.min(100, profile.stats.level));
  const peakRank = shortRankName(profile?.stats?.peakRank);
  const peakScore = profile?.stats?.peakRankScore == null ? 'No peak data' : /^(?:E|OAA)$/.test(peakRank) ? `${profile.stats.peakRankScore} RS` : `${Math.floor(profile.stats.peakRankScore)}/100`;
  return <div className={`account-card ${active ? 'selected' : ''} ${account.currentSession ? 'current-session-card' : ''}`} role="button" tabIndex={0} onClick={onClick} onDoubleClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onOpen(); } }} title="Double-click to open account details" style={{ animationDelay: `${index * 35}ms` }}>
    <div className="account-card-top"><AccountAvatar account={account} profile={profile} name={profile?.inGameName || account.personaName} className={`account-avatar tint-${index % 4}`} /><div className="account-copy"><b>{profile?.inGameName || account.personaName}</b><span>@{account.accountName}</span><div className="account-tags">{profile?.group && <i>{profile.group}</i>}{profile?.stats?.onlineText && <i className="presence-tag">{profile.stats.onlineText}</i>}</div></div><button className={`card-favorite ${profile?.favorite ? 'active' : ''}`} aria-label="Toggle favorite" onClick={(event) => { event.stopPropagation(); onFavorite(); }}><Star size={16} fill={profile?.favorite ? 'currentColor' : 'none'} /></button></div>
    <div className="account-card-overview"><div className="account-rank-spotlight"><small>COMPETITIVE RANK</small><div className="grid-rank"><RankIcon profile={profile} /><span className="account-rank-copy"><strong>{profile?.stats?.rank || 'Unranked'}</strong><span className="account-rank-metrics"><strong>{cardProgress != null ? `${cardProgress}/100` : profile?.stats?.rankScore != null ? `${profile.stats.rankScore} RS` : 'No score'}</strong>{cardProgress != null && profile?.stats?.rankScore != null && <em>{profile.stats.rankScore} RS</em>}</span></span></div></div><div className="account-card-metrics"><span className="account-card-metric peak-metric" title={profile?.stats?.peakRank ? `Overall peak: ${profile.stats.peakRank}` : 'Overall peak unavailable'}><small>OVERALL PEAK</small><b>{peakRank || '—'}</b><em>{peakScore}</em></span><span className="account-card-metric"><small>WIN RATE</small><b>{profile?.stats?.winRate != null ? `${profile.stats.winRate}%` : '—'}</b><em>{profile?.stats?.matches != null ? `${profile.stats.matches} matches` : 'No match data'}</em></span><span className="account-card-metric level-metric"><small>PLAYER LEVEL</small><span className="level-value"><b>{cardLevel ?? '—'}</b>{cardLevel != null && <em>/ 100</em>}</span><span className="level-progress" role="progressbar" aria-label={cardLevel == null ? 'Player level unavailable' : `Player level ${cardLevel} out of 100`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={cardLevel}><i style={{ width: `${cardLevel ?? 0}%` }} /></span></span></div></div>
    <div className="account-card-foot"><div className="card-state"><span className={account.currentSession ? 'active-session' : ''}>{account.currentSession ? <><i /> Current session</> : `Last used ${relativeTime(account.lastLogin)}`}</span></div><div className="card-actions"><button className="card-remove" title="Remove from Rival Shift" aria-label="Remove account from Rival Shift" onClick={(event) => { event.stopPropagation(); onRemove(); }} onDoubleClick={(event) => event.stopPropagation()}><Unlink size={12} /></button><button className="card-group" onClick={(event) => { event.stopPropagation(); onGroup(); }} onDoubleClick={(event) => event.stopPropagation()}><Plus size={11} /> {profile?.group || 'Group'}</button><button className="card-open-stats" onClick={(event) => { event.stopPropagation(); onOpen(); }} onDoubleClick={(event) => event.stopPropagation()}><Database size={11} /> Open stats</button><button className="account-quick-launch" disabled={launchDisabled} onClick={(event) => { event.stopPropagation(); onQuickLaunch(); }} onDoubleClick={(event) => event.stopPropagation()}>{launching ? <LoaderCircle className="spin" size={11} /> : account.currentSession && launchDisabled ? <Activity size={11} /> : <Swords size={11} />}{launching ? 'Launching…' : account.currentSession && launchDisabled ? 'Active' : 'Quick launch'}</button></div></div>
  </div>;
}

function RankIcon({ profile }: { profile?: RivalProfile }) {
  const url = profile?.stats?.rankIconUrl || profile?.stats?.rankIconRemoteUrl;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return url && !failed
    ? <img className="rank-icon" src={reliableRivalsAssetUrl(url)} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="rank-icon-fallback">R</span>;
}

function RankCard({ profile }: { profile: RivalProfile }) {
  const maximum = profile.stats?.rankProgressMax ?? 100;
  const progress = rankProgressValue(profile.stats?.rankScore, profile.stats?.rank, profile.stats?.rankProgress, maximum);
  return <section className="stat-card rank-card"><div className="stat-label"><ShieldCheck size={16} /> CURRENT RANK</div><div className="rank-body"><div className="rank-emblem"><RankIcon profile={profile} /></div><div><strong>{profile.stats?.rank || 'Unranked'}</strong>{progress != null ? <p className="rank-metrics"><b className="rank-progress-primary">{progress}<small>/{maximum}</small><em> progress</em></b>{profile.stats?.rankScore != null && <span className="rank-score-secondary">{profile.stats.rankScore}<small> RS</small></span>}</p> : profile.stats?.rankScore != null ? <p><span>{profile.stats.rankScore} RS</span></p> : <p><span>Level {profile.stats?.level ?? '-'}</span></p>}</div></div>{progress != null && <div className="rank-track" aria-label={`${progress} of ${maximum} rank progress`}><i style={{ width: `${rankProgressPercent(progress, maximum)}%` }} /></div>}</section>;
}

function StatCard({ label, value, sub, progress, icon }: { label: string; value: string; sub: string; progress?: number; icon: React.ReactNode }) {
  return <section className="stat-card"><div className="stat-label">{icon} {label}</div><strong className="stat-value">{value}</strong><p>{sub}</p>{progress != null && <div className="mini-progress"><i style={{ width: `${progress}%` }} /></div>}</section>;
}

function PlayerDataPanel({ profile, refreshing, onRefresh }: { profile?: RivalProfile; refreshing: boolean; onRefresh: () => void }) {
  const [tab, setTab] = useState<'heroes' | 'proficiency' | 'skins' | 'matches' | 'profile'>('heroes');
  const [skinHero, setSkinHero] = useState('all');
  const [skinType, setSkinType] = useState('all');
  const heroStats: HeroPerformance[] = profile?.stats?.heroStats?.length
    ? profile.stats.heroStats
    : (profile?.stats?.heroes ?? []).map((name) => ({ name, iconUrl: profile?.stats?.heroIcons?.[name] }));
  const proficiency = profile?.stats?.proficiency ?? [];
  const matches = profile?.stats?.matchHistory ?? [];
  const skins = profile?.stats?.skins ?? [];
  const skinHeroes = [...new Set(skins.map((skin) => skin.hero).filter((hero): hero is string => Boolean(hero)))].sort((left, right) => left.localeCompare(right));
  const skinTypes = [...new Set(skins.map((skin) => skin.category || skin.source || skin.rarity).filter((type): type is string => Boolean(type)))].sort((left, right) => left.localeCompare(right));
  const visibleSkins = skins.filter((skin) => (skinHero === 'all' || skin.hero === skinHero) && (skinType === 'all' || (skin.category || skin.source || skin.rarity) === skinType));
  const inventoryValue = profile?.stats?.skinInventoryValue ?? skins.reduce((total, skin) => total + (skin.value ?? 0), 0);
  const eventSkinsOwned = profile?.stats?.eventSkinsOwned ?? skins.filter((skin) => /event/i.test(`${skin.category ?? ''} ${skin.source ?? ''}`)).length;
  const nameHistory = profile?.stats?.nameHistory ?? [];
  return <section className="panel-card heroes-card player-data-card">
    <div className="card-title"><div><span className="eyebrow">PLAYER INSIGHTS</span><h3>{tab === 'heroes' ? 'Hero performance' : tab === 'proficiency' ? 'Hero proficiency' : tab === 'skins' ? 'Skin inventory' : tab === 'matches' ? 'Detailed match history' : 'Profile intelligence'}</h3></div><Sparkles size={17} /></div>
    <div className="insight-tabs" role="tablist" aria-label="Player insights"><button role="tab" aria-selected={tab === 'heroes'} className={tab === 'heroes' ? 'active' : ''} onClick={() => setTab('heroes')}>Heroes <span>{heroStats.length}</span></button><button role="tab" aria-selected={tab === 'proficiency'} className={tab === 'proficiency' ? 'active' : ''} onClick={() => setTab('proficiency')}>Proficiency <span>{proficiency.length}</span></button><button role="tab" aria-selected={tab === 'skins'} className={tab === 'skins' ? 'active' : ''} onClick={() => setTab('skins')}>Skins <span>{skins.length}</span></button><button role="tab" aria-selected={tab === 'matches'} className={tab === 'matches' ? 'active' : ''} onClick={() => setTab('matches')}>Matches <span>{matches.length}</span></button><button role="tab" aria-selected={tab === 'profile'} className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>Profile <span>{nameHistory.length}</span></button></div>
    {tab === 'heroes' && <div className="hero-list insight-list">{heroStats.length ? heroStats.slice(0, 6).map((hero, index) => <div className="hero-row" key={hero.name}><div className="hero-index">{String(index + 1).padStart(2, '0')}</div><HeroIcon name={hero.name} url={hero.iconUrl || profile?.stats?.heroIcons?.[hero.name]} /><div className="hero-copy"><b>{hero.name}</b><span>{hero.kda != null ? `${hero.kda} KDA` : index === 0 ? 'Primary pick' : 'Rotation'}</span></div><HeroPerformanceMetric hero={hero} /></div>) : <InsightEmpty text="No hero performance data yet." />}</div>}
    {tab === 'proficiency' && <div className="proficiency-list insight-list">{proficiency.length ? proficiency.slice(0, 12).map((hero, index) => <article className="proficiency-card" key={hero.name}><div className="proficiency-index">{String(index + 1).padStart(2, '0')}</div><HeroIcon name={hero.name} url={hero.iconUrl || profile?.stats?.heroIcons?.[hero.name]} /><div className="proficiency-copy"><b>{hero.name}</b><span className="proficiency-tier">{hero.tierIconUrl && <img src={reliableRivalsAssetUrl(hero.tierIconUrl)} alt="" referrerPolicy="no-referrer" />}{hero.tier || 'No tier yet'}</span></div><ProficiencyMetric level={hero.level} /></article>) : <InsightEmpty text="No proficiency data yet." />}</div>}
    {tab === 'skins' && <div className="skin-inventory insight-list">
      <div className="skin-summary"><div><span>INVENTORY VALUE</span><b>{inventoryValue.toLocaleString()} <small>units</small></b></div><div><span>EVENT SKINS</span><b>{eventSkinsOwned.toLocaleString()}{profile?.stats?.eventSkinsTotal != null && <small> / {profile.stats.eventSkinsTotal.toLocaleString()}</small>}</b></div><div><span>OWNED SKINS</span><b>{skins.length.toLocaleString()}</b></div></div>
      <div className="skin-filters" aria-label="Skin inventory filters"><label><span>Hero</span><select value={skinHero} onChange={(event) => setSkinHero(event.target.value)}><option value="all">All heroes</option>{skinHeroes.map((hero) => <option value={hero} key={hero}>{hero}</option>)}</select></label><label><span>Type</span><select value={skinType} onChange={(event) => setSkinType(event.target.value)}><option value="all">All types</option>{skinTypes.map((type) => <option value={type} key={type}>{type.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}</option>)}</select></label><span>{visibleSkins.length} shown</span></div>
      <div className="skin-grid">{visibleSkins.length ? visibleSkins.map((skin, index) => <article className={`skin-card ${skin.equipped ? 'equipped' : ''}`} key={skin.id || `${skin.hero}-${skin.name}-${index}`}>{skin.iconUrl ? <img src={reliableRivalsAssetUrl(skin.iconUrl)} alt="" referrerPolicy="no-referrer" /> : <div className="skin-placeholder"><Palette size={22} /></div>}<div><b>{skin.name}{skin.equipped && <small> Equipped</small>}</b><span>{[skin.hero, skin.category || skin.rarity, skin.source].filter(Boolean).join(' · ') || 'Marvel Rivals skin'}</span></div>{skin.value != null && <strong>{skin.value.toLocaleString()} <small>units</small></strong>}</article>) : skins.length ? <div className="skin-empty"><Search size={25} /><b>No matching skins</b><span>Change the Hero or Type filter to see more of this inventory.</span></div> : <div className="skin-empty"><Palette size={25} /><b>No skins loaded</b><span>Refresh the player to request the current inventory directly from RivalsData.</span><button className="secondary-button compact" onClick={onRefresh} disabled={refreshing}>{refreshing ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />} {refreshing ? 'Loading inventory…' : 'Refresh inventory'}</button></div>}</div>
    </div>}
    {tab === 'matches' && <div className="match-history-list insight-list">{matches.length ? matches.map((match, index) => <MatchHistoryRow match={match} heroIconUrl={match.heroIconUrl || (match.hero ? profile?.stats?.heroIcons?.[match.hero] : undefined)} key={match.matchId || `${match.timeAgo}-${match.map}-${index}`} />) : <InsightEmpty text="No recent matches available." />}</div>}
    {tab === 'profile' && <ProfileIntelligence profile={profile} />}
  </section>;
}

function MatchHistoryRow({ match, heroIconUrl }: { match: MatchSummary; heroIconUrl?: string }) {
  const [expanded, setExpanded] = useState(false);
  const delta = match.scoreChange;
  const progress = rankProgressValue(match.rankScore, match.rank, match.rankProgress);
  return <article className={`match-history-card ${expanded ? 'expanded' : ''}`}>
    <button className="match-history-summary" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <span className={`match-result ${match.result ?? ''}`}>{match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : 'D'}</span>
      <HeroIcon name={match.hero || '?'} url={heroIconUrl} />
      <span className="match-history-copy"><b>{match.hero || 'Unknown hero'} <small>{match.placement || match.mode}</small></b><span>{match.mode} · {match.timeAgo || fullDate(match.playedAt)}</span></span>
      <span className="match-history-score"><b>{match.score || '—'}</b><small>{match.rank || 'Unranked'}</small></span>
      <span className={`match-rank-change ${delta == null ? '' : delta >= 0 ? 'positive' : 'negative'}`}>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta} RS`}</span>
      <ChevronDown size={14} />
    </button>
    {expanded && <div className="match-history-details">
      <div><span>K / D / A</span><b>{match.kills ?? '—'} / {match.deaths ?? '—'} / {match.assists ?? '—'}</b><small>{match.kda != null ? `${match.kda} KDA` : 'KDA unavailable'}</small></div>
      <div><span>RANK AFTER</span><b>{match.rankScore != null ? `${match.rankScore} RS` : '—'}</b><small>{progress != null ? `${progress}/100 progress` : match.rank || 'Unranked'}</small></div>
      <div><span>MAP</span><b>{match.map || 'Unknown map'}</b><small>{[match.mapMode, match.mapId != null ? `Map ID ${match.mapId}` : undefined].filter(Boolean).join(' · ') || 'Map details unavailable'}</small></div>
      <div><span>SESSION</span><b>{match.season != null ? `Season ${match.season}` : 'Unknown season'}</b><small>{match.platform || 'Unknown platform'}</small></div>
      <div><span>PLACEMENT</span><b>{match.placement || (match.placementRank != null ? `#${match.placementRank}` : '—')}</b><small>{match.placementRank != null ? `Overall #${match.placementRank}` : 'No placement'}</small></div>
      <div><span>PLAYED</span><b>{fullDate(match.playedAt)}</b><small>{match.matchId ? `ID ${match.matchId}` : 'No match ID'}</small></div>
    </div>}
  </article>;
}

function ProfileIntelligence({ profile }: { profile?: RivalProfile }) {
  const punishments = profile?.stats?.punishments ?? [];
  const names = profile?.stats?.nameHistory ?? [];
  const teammates = profile?.stats?.teammates ?? [];
  const crosshairs = profile?.stats?.crosshairs ?? [];
  return <div className="profile-intelligence insight-list">
    <section className="profile-intel-section"><header><div><ShieldCheck size={14} /><span>ACCOUNT STANDING</span></div><small>{punishments.some((item) => item.active) ? 'RESTRICTION FOUND' : punishments.some((item) => item.expired) ? 'RESTRICTION HISTORY' : 'CLEAR'}</small></header><div className="punishment-grid">{punishments.length ? punishments.map((item) => <div className={`punishment-row ${item.active ? 'active' : item.expired ? 'expired' : 'clear'}`} key={item.kind}><i /><span><b>{item.label}</b><small>{item.active ? `${item.reason || 'Active restriction'}${item.expiresAt ? ` · until ${fullDate(item.expiresAt)}` : ''}` : item.expired ? `Expired ${fullDate(item.expiresAt)}` : 'No public restriction'}</small></span><strong>{item.active ? 'ACTIVE' : item.expired ? 'EXPIRED' : 'CLEAR'}</strong></div>) : <InsightEmpty text="Punishment data is unavailable." />}</div></section>
    <section className="profile-intel-section"><header><div><History size={14} /><span>NAME HISTORY</span></div><small>{names.length} NAMES</small></header><div className="name-history-list">{names.length ? names.map((entry, index) => <div key={`${entry.name}-${entry.firstSeenAt}-${index}`}><span>{entry.name}</span><small>{entry.firstSeenAt ? `First seen ${fullDate(entry.firstSeenAt)}` : 'First seen date unknown'}</small>{index === 0 && <b>LATEST</b>}</div>) : <p>No previous public names found.</p>}</div></section>
    <section className="profile-intel-section"><header><div><Users size={14} /><span>FREQUENT TEAMMATES</span></div><small>TOP {teammates.length}</small></header><div className="teammate-list">{teammates.length ? teammates.slice(0, 8).map((player) => <div key={player.uid}><HeroIcon name={player.name} url={player.iconUrl} /><span><b>{player.name}</b><small>UID {player.uid}</small></span><strong>{player.matches ?? '—'} games<small>{player.winRate != null ? `${player.winRate}% WR` : ''}</small></strong></div>) : <p>No teammate data available.</p>}</div></section>
    <section className="profile-intel-section"><header><div><Crosshair size={14} /><span>SHARED CROSSHAIRS</span></div><small>{crosshairs.length} CODES</small></header><div className="crosshair-list">{crosshairs.length ? crosshairs.map((entry, index) => <CrosshairRow entry={entry} index={index} key={`${entry.code}-${index}`} />) : <p>No public crosshairs shared.</p>}</div></section>
  </div>;
}

function CrosshairRow({ entry, index }: { entry: { code: string; uses?: number }; index: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await api.copyText(entry.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return <div><code title={entry.code}>{entry.code}</code><span>{entry.uses != null ? `${entry.uses.toLocaleString()} uses` : 'Usage unavailable'}</span><button className={`crosshair-copy ${copied ? 'copied' : ''}`} onClick={() => void copy()} aria-label={`Copy crosshair ${index + 1}`}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}</button></div>;
}

function HeroPerformanceMetric({ hero }: { hero: HeroPerformance }) {
  const matches = hero.matches ?? ((hero.wins != null || hero.losses != null) ? (hero.wins ?? 0) + (hero.losses ?? 0) : undefined);
  const winRate = hero.winRate == null ? undefined : Math.max(0, Math.min(100, hero.winRate));
  const record = hero.wins != null || hero.losses != null ? `${hero.wins ?? 0}–${hero.losses ?? 0}` : '—';
  return <div className="hero-performance-metric" aria-label={winRate == null ? 'Win rate unavailable' : `${winRate}% win rate`}>
    <div className="win-rate-ring" style={{ background: `conic-gradient(#a985ff ${winRate ?? 0}%, #292633 0)` }}><div><b>{winRate ?? '—'}</b>{winRate != null && <small>%</small>}</div></div>
    <div className="record-metric"><span>RECORD</span><b>{record}</b><small>{matches != null ? `${matches} ${matches === 1 ? 'match' : 'matches'}` : 'No match count'}</small></div>
  </div>;
}

function ProficiencyMetric({ level }: { level?: number }) {
  const value = level == null ? null : Math.max(0, Math.min(MAX_PROFICIENCY_LEVEL, Math.round(level)));
  const progress = value == null ? 0 : (value / MAX_PROFICIENCY_LEVEL) * 100;
  const remaining = value == null ? null : MAX_PROFICIENCY_LEVEL - value;
  return <div className="proficiency-metric" aria-label={value == null ? 'Proficiency level unavailable' : `Proficiency level ${value} of ${MAX_PROFICIENCY_LEVEL}`}>
    <div className="proficiency-level"><span>LEVEL</span><b>{value ?? '—'}</b><small>/ {MAX_PROFICIENCY_LEVEL}</small></div>
    <div className="proficiency-track"><i style={{ width: `${progress}%` }} /></div>
    <div className="proficiency-scale"><span>01</span><span>{remaining === 0 ? 'MAX LEVEL' : remaining == null ? 'PROGRESS' : `${remaining} TO MAX`}</span><span>{MAX_PROFICIENCY_LEVEL}</span></div>
  </div>;
}

function HeroIcon({ name, url }: { name: string; url?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return <div className="hero-medallion">{url && !failed ? <img src={reliableRivalsAssetUrl(url)} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initials(name)}</div>;
}

function InsightEmpty({ text }: { text: string }) {
  return <div className="insight-empty"><Database size={18} /><span>{text}</span></div>;
}

function LinkPrompt({ onLink }: { onLink: () => void }) {
  return <section className="link-prompt"><div className="link-visual"><div className="node steam-node"><Gamepad2 /></div><div className="link-line"><i /></div><div className="node rivals-node"><Swords /></div></div><span className="eyebrow">ONE-TIME SETUP</span><h3>Link this account to Marvel Rivals</h3><p>Save the player’s Marvel Rivals UID to load their public profile from Rivals Data.</p><button className="primary-button" onClick={onLink}><Plus size={16} /> Link player profile</button></section>;
}

function ProfileModal({ account, profile, storagePath, onClose, onSave, onRemove }: { account: SteamAccount; profile?: RivalProfile; storagePath: string; onClose: () => void; onSave: (profile: RivalProfile) => Promise<void>; onRemove?: () => void }) {
  const [uid, setUid] = useState(profile?.uid ?? '');
  const [name, setName] = useState(profile?.inGameName ?? '');
  const [note, setNote] = useState(profile?.note ?? '');
  const [saving, setSaving] = useState(false);
  const valid = /^\d+$/.test(uid.trim());
  const save = async () => {
    setSaving(true);
    await onSave({ steamId64: account.steamId64, uid: uid.trim(), inGameName: name.trim(), note: note.trim(), favorite: profile?.favorite ?? false, group: profile?.group, updatedAt: new Date().toISOString(), status: 'linked', stats: profile?.stats });
    setSaving(false);
  };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-card"><div className="modal-icon"><Link2 /></div><button className="modal-close" onClick={onClose}><X size={18} /></button><span className="eyebrow">RIVALS DATA IDENTITY</span><h2>{hasIdentity(profile) ? 'Edit saved profile' : 'Save Marvel Rivals profile'}</h2><p className="modal-lead">Rival Shift uses the Marvel Rivals UID to load this player exclusively from Rivals Data.</p><label className="form-label"><span>Exact in-game name <small>OPTIONAL</small></span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Filled from Rivals Data when left blank" autoFocus /></label><label className="form-label"><span>Marvel Rivals UID <small>REQUIRED</small></span><input value={uid} onChange={(event) => setUid(event.target.value.replace(/\D/g, ''))} placeholder="e.g. 1822797559" inputMode="numeric" /></label><label className="form-label"><span>Private note <small>OPTIONAL</small></span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Support queue, EU region" maxLength={80} /></label><div className="privacy-note"><ShieldCheck size={16} /><span>Saved permanently at {storagePath || 'the Rival Shift app-data folder'}. It is not temporary storage.</span></div><div className="modal-actions">{onRemove && <button className="danger-text" onClick={onRemove}><Unlink size={15} /> Unlink</button>}<span /><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!valid || saving} onClick={() => void save()}>{saving ? <LoaderCircle className="spin" size={15} /> : <Database size={15} />} Save & load data</button></div></div></div>;
}

function playerPresenceDetail(player: TrackedPlayer) {
  if (player.presence !== 'offline') return player.presenceText;
  return player.lastSeenAt ? `Offline · last seen ${relativeTime(player.lastSeenAt)}` : 'Offline';
}

function TrackedPlayerCard({ player, onToggleFavorite, onOpenProfile }: { player: TrackedPlayer; onToggleFavorite: (player: TrackedPlayer) => Promise<void>; onOpenProfile: (uid: string) => Promise<void> }) {
  return <article className="tracked-player-card">
    <div className="tracked-player-main"><LiveArtwork src={player.iconUrl} name={player.name} className="tracked-player-avatar" /><div><b>{player.name}</b><span>UID {player.uid} · Level {player.level ?? '—'}</span></div><button className={`tracked-favorite ${player.favorite ? 'active' : ''}`} aria-label={player.favorite ? `Remove ${player.name} from favorites` : `Add ${player.name} to favorites`} onClick={() => void onToggleFavorite(player)}><Star size={16} fill={player.favorite ? 'currentColor' : 'none'} /></button></div>
    <div className="tracked-player-meta"><span className={`presence-chip ${player.presence}`}><i />{playerPresenceDetail(player)}</span><div className="tracked-rank"><b>{player.rank || 'Unranked'}</b><span>{rankScoreProgress(player.rankScore, player.rank, player.rankProgress)}</span></div></div>
    <div className="tracked-player-actions"><span>Updated {relativeTime(player.updatedAt)}</span><button className="text-button" onClick={() => void onOpenProfile(player.uid)}>Full profile <ExternalLink size={12} /></button></div>
  </article>;
}

function PlayerSearchPage({ query, setQuery, results, favorites, searching, refreshing, autoRefresh, onToggleAutoRefresh, onSearch, onToggleFavorite, onRefreshFavorites, onOpenProfile }: { query: string; setQuery: (value: string) => void; results: TrackedPlayer[]; favorites: TrackedPlayer[]; searching: boolean; refreshing: boolean; autoRefresh: boolean; onToggleAutoRefresh: () => void; onSearch: () => Promise<void>; onToggleFavorite: (player: TrackedPlayer) => Promise<void>; onRefreshFavorites: () => Promise<void>; onOpenProfile: (uid: string) => Promise<void> }) {
  const presenceOrder: Record<TrackedPlayer['presence'], number> = { 'in-game': 0, 'in-team': 1, online: 2, away: 3, offline: 4 };
  const orderedFavorites = [...favorites].sort((left, right) => presenceOrder[left.presence] - presenceOrder[right.presence] || left.name.localeCompare(right.name));
  return <main className="player-search-page">
    <header className="player-search-header"><div><span className="eyebrow">RIVALS DATA PLAYERS</span><h2>Find and track players</h2><p>Search by exact name or UID, then favorite players to keep their live status close.</p></div><div className="player-search-header-actions"><button className={`player-auto-refresh ${autoRefresh ? 'active' : ''}`} disabled={!autoRefresh && query.trim().length < 2} onClick={onToggleAutoRefresh}>{autoRefresh ? <X size={14} /> : <Radio size={14} />}<span><b>{autoRefresh ? 'Stop auto search' : 'Auto search'}</b><small>{autoRefresh ? 'Searching every 3 seconds' : 'Refresh every 3 seconds'}</small></span></button><button className="secondary-button" disabled={refreshing || !favorites.length} onClick={() => void onRefreshFavorites()}>{refreshing ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Refresh favorites</button></div></header>
    <div className="player-search-scroll">
      <form className="player-lookup" onSubmit={(event) => { event.preventDefault(); void onSearch(); }}><Search size={20} /><div><label htmlFor="manual-player-search">Player name or UID</label><input id="manual-player-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Veswa or 680173547" autoComplete="off" /></div><button className="primary-button" disabled={searching || query.trim().length < 2}>{searching ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />} Search</button></form>
      <section className="tracked-section"><div className="tracked-section-heading"><div><span className="eyebrow">FAVORITES</span><h3>Player watchlist</h3></div><span>{favorites.length} saved</span></div>{orderedFavorites.length ? <div className="tracked-player-grid">{orderedFavorites.map((player) => <TrackedPlayerCard key={player.uid} player={player} onToggleFavorite={onToggleFavorite} onOpenProfile={onOpenProfile} />)}</div> : <div className="tracked-empty"><Star size={26} /><b>No favorite players yet</b><span>Search for a player and tap the star to track rank and presence here.</span></div>}</section>
      <section className="tracked-section search-results-section"><div className="tracked-section-heading"><div><span className="eyebrow">SEARCH RESULTS</span><h3>{results.length ? `${results.length} player${results.length === 1 ? '' : 's'} found` : 'Ready to search'}</h3></div></div>{results.length ? <div className="tracked-player-grid">{results.map((player) => <TrackedPlayerCard key={player.uid} player={player} onToggleFavorite={onToggleFavorite} onOpenProfile={onOpenProfile} />)}</div> : <div className="tracked-empty compact-empty"><Users size={26} /><b>Look up any public profile</b><span>Results include current rank, score, level, and Rivals Data presence.</span></div>}</section>
    </div>
  </main>;
}

function topSniperGroup(player: TopSniperPlayer): 'queue' | 'game' | 'online' {
  if (/^in queue$/i.test(player.presenceText)) return 'queue';
  if (player.presence === 'in-game') return 'game';
  return 'online';
}

function sniperElapsed(since: string | undefined, now: number) {
  if (!since) return 'Just detected';
  const seconds = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  if (seconds < 60) return `${seconds}s observed`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes < 60 ? `${minutes}m ${remainder.toString().padStart(2, '0')}s observed` : `${Math.floor(minutes / 60)}h ${minutes % 60}m observed`;
}

function TopSniperRow({ player, now, onOpenProfile }: { player: TopSniperPlayer; now: number; onOpenProfile: (uid: string) => Promise<void> }) {
  return <article className="top-sniper-row">
    <strong className="top-sniper-position">#{player.leaderboardPosition}</strong>
    <div className="top-sniper-player">{player.iconUrl ? <img src={reliableRivalsAssetUrl(player.iconUrl)} alt="" /> : <span className="top-sniper-avatar">{initials(player.name)}</span>}<div><b>{player.name}</b><small>UID {player.uid}</small></div></div>
    <div className="top-sniper-status-cell"><span className={`presence-badge ${player.presence}`}><i />{player.presenceText}</span>{topSniperGroup(player) !== 'online' && <small><History size={10} /> {sniperElapsed(player.statusSinceAt, now)}</small>}</div>
    <div className="top-sniper-rank"><b>{player.rank || 'Unranked'}</b><small>{player.rankScore != null ? `${player.rankScore.toLocaleString()} RS` : 'No score'}</small></div>
    <div className="top-sniper-record"><b>{player.winRate != null ? `${player.winRate}%` : '—'}</b><small>{player.wins ?? 0}W · {player.losses ?? 0}L</small></div>
    <button className="icon-button" aria-label={`Open ${player.name} on Rivals Data`} title="Open Rivals Data profile" onClick={() => void onOpenProfile(player.uid)}><ExternalLink size={16} /></button>
  </article>;
}

function TopSniperPage({ players, loading, active, error, updatedAt, onStart, onStop, onRefresh, onOpenProfile }: { players: TopSniperPlayer[]; loading: boolean; active: boolean; error: string; updatedAt: string | null; onStart: () => void; onStop: () => void; onRefresh: () => Promise<void>; onOpenProfile: (uid: string) => Promise<void> }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);
  const groups = [
    { id: 'queue' as const, eyebrow: 'IN QUEUE', title: 'Queue targets', empty: 'No top-1,000 players are queued right now.' },
    { id: 'game' as const, eyebrow: 'IN GAME', title: 'Active games', empty: 'No top-1,000 players are in a game right now.' },
    { id: 'online' as const, eyebrow: 'ONLINE', title: 'Online players', empty: 'No other top-1,000 players are online right now.' },
  ].map((group) => ({ ...group, players: players.filter((player) => topSniperGroup(player) === group.id) }));
  const [queueGroup, gameGroup, onlineGroup] = groups;
  return <main className="top-sniper-page">
    <header className="player-search-header top-sniper-header">
      <div><span className="eyebrow">TOP 1,000 LIVE TRACKER</span><h2>Top sniper</h2><p>Queue targets first, active games second, then everyone else online.</p></div>
      <div className="top-sniper-live"><div className={`top-sniper-scan-state ${active ? 'active' : 'stopped'}`}><i /><span><b>{active ? 'LIVE SCAN' : 'SCAN PAUSED'}</b><small>{active ? 'Every 5 seconds' : 'Results held'}</small></span></div>{active ? <button className="top-sniper-toggle stop" onClick={onStop}><X size={15} /><span>Stop</span></button> : <button className="top-sniper-toggle start" onClick={onStart}><Radio size={15} /><span>Start</span></button>}<button className="top-sniper-refresh" disabled={loading} onClick={() => void onRefresh()} aria-label="Refresh Top Sniper now" title="Refresh now">{loading ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}</button></div>
    </header>
    <div className="top-sniper-scroll">
      <section className="top-sniper-summary">
        <div><span>In queue</span><b>{queueGroup.players.length}</b><small>highest-priority targets</small></div>
        <div><span>In game</span><b>{gameGroup.players.length}</b><small>currently playing</small></div>
        <div><span>Online</span><b>{onlineGroup.players.length}</b><small>online or in a team</small></div>
        <div><span>Last scan</span><b className="scan-time">{updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</b><small>{active ? 'refreshing every 5 seconds' : 'scanning is stopped'}</small></div>
      </section>
      {error && <div className="top-sniper-error"><ShieldCheck size={18} /><div><b>Leaderboard scan failed</b><span>{error}</span></div><button className="secondary-button compact" onClick={() => void onRefresh()}>Try again</button></div>}
      {!players.length && loading ? <div className="top-sniper-empty"><LoaderCircle className="spin" size={30} /><b>Scanning the top 1,000…</b><span>Checking the live Rivals Data leaderboard.</span></div> : !players.length && !error ? <div className="top-sniper-empty"><Crosshair size={30} /><b>{active ? 'No live targets right now' : 'Top Sniper is stopped'}</b><span>{active ? 'The next scan starts within five seconds.' : 'Press Start to scan now and repeat every five seconds.'}</span></div> : <div className="top-sniper-groups">{groups.map((group) => <section className={`top-sniper-group ${group.id}`} key={group.id}>
        <div className="top-sniper-group-heading"><div><span className="eyebrow">{group.eyebrow}</span><h3>{group.title}</h3></div><b>{group.players.length}</b></div>
        <div className="top-sniper-board"><div className="top-sniper-table-head"><span>Rank</span><span>Player</span><span>Status & time</span><span>Competitive</span><span>Record</span><span /></div>{group.players.length ? <div className="top-sniper-rows">{group.players.map((player) => <TopSniperRow player={player} now={now} onOpenProfile={onOpenProfile} key={player.uid} />)}</div> : <div className="top-sniper-group-empty">{group.empty}</div>}</div>
      </section>)}</div>}
    </div>
  </main>;
}

function postMatchStatus(player: TrackedPlayer) {
  if (/^in queue\b/i.test(player.presenceText)) return 'IN QUEUE';
  if (/^post-game\b/i.test(player.presenceText)) return 'POST-GAME';
  if (player.presence === 'in-game') return 'IN GAME';
  if (player.presence === 'in-team') return 'IN TEAM';
  if (player.presence === 'online') return 'ONLINE';
  if (player.presence === 'away') return 'AWAY';
  return 'OFFLINE';
}

function PostMatchPlayerRow({ player }: { player: TrackedPlayer }) {
  return <article className="post-match-player">
    <LiveArtwork src={player.iconUrl} name={player.name} className="tracked-player-avatar" />
    <div><b>{player.name}</b><span>UID {player.uid}</span></div>
    <span className={`presence-chip ${player.presence}`}><i />{playerPresenceDetail(player)}</span>
    <small>Updated {relativeTime(player.updatedAt)}</small>
  </article>;
}

function PostMatchPage({ capturedPlayers, selectedUids, players, looking, refreshing, onTogglePlayer, onSelectAll, onClearSelection, onStart, onStop }: { capturedPlayers: Array<Pick<TrackedPlayer, 'uid' | 'name'>>; selectedUids: string[]; players: TrackedPlayer[]; looking: boolean; refreshing: boolean; onTogglePlayer: (uid: string) => void; onSelectAll: () => void; onClearSelection: () => void; onStart: () => void; onStop: () => void }) {
  const queuePlayers = players.filter((player) => postMatchStatus(player) === 'IN QUEUE').sort((left, right) => left.name.localeCompare(right.name));
  const otherGroups = [...new Set(players.filter((player) => postMatchStatus(player) !== 'IN QUEUE').map(postMatchStatus))]
    .map((status) => ({ status, players: players.filter((player) => postMatchStatus(player) === status).sort((left, right) => left.name.localeCompare(right.name)) }));
  const statusOrder = ['IN GAME', 'POST-GAME', 'IN TEAM', 'ONLINE', 'AWAY', 'OFFLINE'];
  otherGroups.sort((left, right) => statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status));
  const capturedUidSet = new Set(capturedPlayers.map((player) => player.uid));
  const selectedCount = selectedUids.filter((uid) => capturedUidSet.has(uid)).length;
  const hasCapturedMatch = capturedPlayers.length > 0;

  return <main className="post-match-page">
    <header className="player-search-header"><div><span className="eyebrow">POST MATCH</span><h2>Where the lobby went next</h2><p>Choose who to track, then keep players in queue at the top.</p></div><div className="post-match-actions">
      {looking && <button className="secondary-button" onClick={onStop}><X size={15} /> Stop looking</button>}
      <button className="primary-button" disabled={!hasCapturedMatch || !selectedCount || looking} onClick={onStart}>{refreshing && !players.length ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Look up selected{selectedCount ? ` (${selectedCount})` : ''}</button>
    </div></header>
    <div className="post-match-scroll">
      {hasCapturedMatch && <section className="post-match-selection"><header><div><span className="eyebrow">LAST MATCH ROSTER</span><h3>Select players to look up</h3></div><div><span>{selectedCount} OF {capturedPlayers.length} SELECTED</span><button className="text-button" disabled={looking || selectedCount === capturedPlayers.length} onClick={onSelectAll}>Select all</button><button className="text-button" disabled={looking || !selectedCount} onClick={onClearSelection}>Clear</button></div></header><div className="post-match-roster">{capturedPlayers.map((player) => { const selected = selectedUids.includes(player.uid); return <button type="button" className={selected ? 'selected' : ''} aria-pressed={selected} disabled={looking} onClick={() => onTogglePlayer(player.uid)} key={player.uid}><span className="post-match-check">{selected && <Check size={12} />}</span><span><b>{player.name}</b><small>UID {player.uid}</small></span></button>; })}</div>{looking && <footer><LockKeyhole size={12} /> Stop looking before changing this selection.</footer>}</section>}

      <section className={`post-match-monitor ${looking ? 'active' : 'paused'}`}><div className="post-match-monitor-icon">{refreshing ? <LoaderCircle className="spin" size={19} /> : looking ? <Radio size={19} /> : <History size={19} />}</div><div><b>{looking ? 'Watching selected players' : players.length ? 'Status lookup stopped' : 'Ready after your match'}</b><span>{looking ? 'Refreshing every 5 seconds until you press Stop looking.' : players.length ? 'These are the last statuses received. Adjust the roster selection before looking again.' : hasCapturedMatch ? 'Select one or more players above to begin.' : 'Open Live game and capture a lobby, then come back here to begin.'}</span></div>{players.length > 0 && <strong>{players.length} PLAYERS</strong>}</section>

      {!players.length && !refreshing ? <div className="tracked-empty post-match-empty"><History size={30} /><b>{hasCapturedMatch ? 'Choose who to monitor' : 'No captured lobby yet'}</b><span>{hasCapturedMatch ? 'Only selected players will be checked, once every 5 seconds.' : 'Find a live game first. Rival Shift will keep that lobby ready for this tab.'}</span></div> : <>
        <section className="post-status-section queue-section"><div className="post-status-heading"><div><span className="eyebrow">IN QUEUE</span><h3>Queue watch</h3></div><b>{queuePlayers.length}</b></div>{queuePlayers.length ? <div className="post-match-player-list">{queuePlayers.map((player) => <PostMatchPlayerRow player={player} key={player.uid} />)}</div> : <div className="post-status-empty">No players are in queue right now.</div>}</section>
        {otherGroups.map((group) => <section className="post-status-section" key={group.status}><div className="post-status-heading"><div><span className="eyebrow">{group.status}</span><h3>{group.status === 'OFFLINE' ? 'Offline players' : `${group.status[0]}${group.status.slice(1).toLowerCase()}`}</h3></div><b>{group.players.length}</b></div><div className="post-match-player-list">{group.players.map((player) => <PostMatchPlayerRow player={player} key={player.uid} />)}</div></section>)}
      </>}
    </div>
  </main>;
}

function BrowserSupport({ compact = false }: { compact?: boolean }) {
  return <div className={`browser-support ${compact ? 'compact-support' : ''}`} aria-label="Supported browsers">
    <span>SUPPORTED BROWSERS</span>
    <div>{SUPPORTED_BROWSERS.map((browser) => <span className="browser-chip" key={browser.name} title={browser.extensionsPage}><Check size={10} /> {browser.name}</span>)}</div>
  </div>;
}

function SettingsPage({ extension, launcherSkip, updateStatus, preferences, onBack, onRefreshExtension, onOpenExtensionFolder, onSetLauncherSkip, onSetPreference, onCheckUpdates, onInstallUpdate, onBackup }: { extension: RivalsDataExtensionStatus; launcherSkip: LauncherSkipStatus; updateStatus: AppUpdateStatus; preferences: AppPreferences; onBack: () => void; onRefreshExtension: () => Promise<void>; onOpenExtensionFolder: () => Promise<void>; onSetLauncherSkip: (enabled: boolean) => Promise<void>; onSetPreference: <K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) => Promise<void>; onCheckUpdates: () => Promise<void>; onInstallUpdate: () => Promise<void>; onBackup: () => void }) {
  const [changingLauncher, setChangingLauncher] = useState(false);
  return <main className="settings-page"><header className="settings-header"><div><span className="eyebrow">SETTINGS</span><h2>Make Rival Shift yours</h2><p>Choose a look, manage player data, game startup, quick access, and backups.</p></div><button className="secondary-button" onClick={onBack}><ChevronRight className="back-chevron" size={15} /> Accounts</button></header><div className="settings-scroll" tabIndex={0}>

    <div className="integration-block theme-settings-block">
      <div className="integration-heading"><Palette size={16} /><div><b>Theme preset</b><span>Set the accent and atmosphere across Rival Shift</span></div><i className="ok" /></div>
      <div className="theme-preset-grid" role="radiogroup" aria-label="Theme preset">
        {THEME_PRESETS.map((preset) => <button type="button" key={preset.id} className={preferences.theme === preset.id ? 'active' : ''} role="radio" aria-checked={preferences.theme === preset.id} onClick={() => void onSetPreference('theme', preset.id)}>
          <span className="theme-preview" aria-hidden="true" style={{ '--theme-a': preset.colors[0], '--theme-b': preset.colors[1], '--theme-c': preset.colors[2] } as React.CSSProperties}><i /><i /><i /></span>
          <span className="theme-preset-copy"><b>{preset.name}</b><small>{preset.description}</small></span>
          <span className="theme-selected"><Check size={11} /></span>
        </button>)}
      </div>
    </div>

    <div className="integration-block privacy-settings-block">
      <div className="integration-heading"><LockKeyhole size={16} /><div><b>Privacy mode</b><span>Protect account identities while streaming or sharing your screen</span></div><i className={preferences.privacyMode ? 'ok' : ''} /></div>
      <label className="toggle-row integration-toggle"><div><b>Hide player names and UIDs</b><span>{preferences.privacyMode ? 'Protected — identity text and player avatars are obscured throughout the app.' : 'Names and account identifiers are currently visible.'}</span></div><input type="checkbox" checked={preferences.privacyMode} onChange={(event) => void onSetPreference('privacyMode', event.target.checked)} /><i /></label>
      <div className="privacy-note"><ShieldCheck size={16} /><span>The title-bar Privacy button lets you toggle this instantly before a stream or screenshot.</span></div>
    </div>

    <div className="integration-block connection-settings-block">
      <div className="integration-heading"><Database size={16} /><div><b>Rivals Data connection</b><span>Choose how Rival Shift loads rank, matches, heroes, and proficiency</span></div><i className={preferences.rivalsDataMode === 'api' || extension.connected ? 'ok' : ''} /></div>
      <div className="connection-mode-grid" role="radiogroup" aria-label="Rivals Data connection">
        <button type="button" className={preferences.rivalsDataMode === 'api' ? 'active' : ''} role="radio" aria-checked={preferences.rivalsDataMode === 'api'} onClick={() => void onSetPreference('rivalsDataMode', 'api')}><span className="connection-mode-icon"><Database size={18} /></span><span className="connection-mode-copy"><b>SDK API</b><small>Direct JSON profiles and live lobbies. No extension.</small></span><span className="connection-mode-check"><Check size={12} /></span></button>
        <button type="button" className={preferences.rivalsDataMode === 'extension' ? 'active' : ''} role="radio" aria-checked={preferences.rivalsDataMode === 'extension'} onClick={() => void onSetPreference('rivalsDataMode', 'extension')}><span className="connection-mode-icon"><Puzzle size={18} /></span><span className="connection-mode-copy"><b>Browser extension</b><small>Browser-backed profiles and live lobbies.</small></span><span className="connection-mode-check"><Check size={12} /></span></button>
      </div>
      {preferences.rivalsDataMode === 'api'
        ? <div className="connection-summary ready"><i /><div><b>SDK API ready</b><span>Profiles, favorites, match history, and live lobby data are available.</span></div></div>
        : <div className="connection-extension-panel"><div className={`connection-summary ${extension.connected ? 'ready' : 'error'}`}><i /><div><b>{extension.connected ? 'Extension connected' : 'Extension not connected'}</b><span>{extension.message}</span></div></div><div className="connection-extension-actions"><BrowserSupport compact /><span className="extension-path" title={extension.extensionPath}>{extension.extensionPath || 'Extension folder unavailable'}</span><button className="secondary-button compact" onClick={() => void onOpenExtensionFolder()}>Show folder</button><button className="text-button" onClick={() => void onRefreshExtension()}><RefreshCw size={13} /> Recheck</button></div></div>}
    </div>

    <div className="integration-block">
      <div className="integration-heading"><Radio size={16} /><div><b>Discord Rich Presence</b><span>Show your Rival Shift activity and selected player in Discord</span></div><i className={preferences.discordRichPresence ? 'ok' : ''} /></div>
      <label className="toggle-row integration-toggle"><div><b>Enable Discord Rich Presence</b><span>{preferences.discordRichPresence ? 'Active while Rival Shift is running; Discord reconnects automatically.' : 'Off — Rival Shift is not sharing activity with Discord.'}</span></div><input type="checkbox" checked={preferences.discordRichPresence} onChange={(event) => void onSetPreference('discordRichPresence', event.target.checked)} /><i /></label>
      <div className="privacy-note"><ShieldCheck size={16} /><span>Only cached Marvel Rivals player data is shared. Steam usernames are never used as a fallback.</span></div>
    </div>

    <div className="integration-block">
      <div className="integration-heading"><Zap size={16} /><div><b>Managed game launch</b><span>Start Marvel Rivals directly through your selected Steam account</span></div><i className={preferences.skipLauncher ? 'ok' : ''} /></div>
      <label className={`toggle-row integration-toggle ${!launcherSkip.available ? 'disabled-row' : ''}`}><div><b>Skip the game launcher</b><span>{preferences.skipLauncher ? (launcherSkip.enabled ? 'Enabled — your game starts with one less step.' : 'Enabled — Rival Shift will repair the launcher state before launch.') : launcherSkip.message}</span></div><input type="checkbox" checked={preferences.skipLauncher} disabled={!launcherSkip.available || changingLauncher} onChange={async (event) => { const next = event.target.checked; setChangingLauncher(true); try { await onSetLauncherSkip(next); } finally { setChangingLauncher(false); } }} /><i /></label>
      <label className="toggle-row integration-toggle"><div><b>Remind me about direct launches</b><span>Show a Windows notification when Steam starts the game without Rival Shift’s launch features.</span></div><input type="checkbox" checked={preferences.directLaunchReminder} onChange={(event) => void onSetPreference('directLaunchReminder', event.target.checked)} /><i /></label>
      <div className="privacy-note"><ShieldCheck size={16} /><span>Rival Shift keeps a backup of the original launcher state and restores it when this option is disabled.</span></div>
    </div>

    <div className="integration-block">
      <div className="integration-heading"><Power size={16} /><div><b>Windows startup</b><span>Choose what Rival Shift does when you sign in</span></div><i className={preferences.startupMode !== 'off' ? 'ok' : ''} /></div>
      <div className="startup-mode-grid" role="group" aria-label="Windows startup behavior">
        <button type="button" className={preferences.startupMode === 'window' ? 'active' : ''} aria-pressed={preferences.startupMode === 'window'} onClick={() => void onSetPreference('startupMode', 'window')}><Monitor size={17} /><b>Open Rival Shift</b><span>Show the account window when Windows starts.</span></button>
        <button type="button" className={preferences.startupMode === 'tray' ? 'active' : ''} aria-pressed={preferences.startupMode === 'tray'} onClick={() => void onSetPreference('startupMode', 'tray')}><Minimize2 size={17} /><b>Start in tray</b><span>Keep shortcuts and reminders ready in the background.</span></button>
        <button type="button" className={preferences.startupMode === 'off' ? 'active' : ''} aria-pressed={preferences.startupMode === 'off'} onClick={() => void onSetPreference('startupMode', 'off')}><SkipForward size={17} /><b>Don’t start automatically</b><span>Run only when you open Rival Shift yourself.</span></button>
      </div>
    </div>

    <div className="integration-block update-settings-block">
      <div className="integration-heading"><Download size={16} /><div><b>Automatic updates</b><span>Keep Rival Shift current with signed release packages</span></div><i className={preferences.autoUpdates && updateStatus.configured ? 'ok' : ''} /></div>
      <label className="toggle-row integration-toggle"><div><b>Download updates automatically</b><span>{preferences.autoUpdates ? 'Check at startup and every six hours while Rival Shift is running.' : 'Off — this installation will stay on its current version.'}</span></div><input type="checkbox" checked={preferences.autoUpdates} onChange={(event) => void onSetPreference('autoUpdates', event.target.checked)} /><i /></label>
      <div className={`update-status-card state-${updateStatus.state}`}><span className="update-status-icon">{updateStatus.state === 'checking' || updateStatus.state === 'downloading' || updateStatus.state === 'available' ? <LoaderCircle className="spin" size={16} /> : updateStatus.state === 'downloaded' ? <Check size={16} /> : <Download size={16} />}</span><div><b>{updateStatus.state === 'downloaded' ? `Version ${updateStatus.availableVersion} ready` : updateStatus.state === 'not-available' ? `Rival Shift ${updateStatus.currentVersion} is current` : updateStatus.state === 'unconfigured' ? 'Release feed required' : updateStatus.state === 'disabled' ? 'Updates are off' : updateStatus.state === 'error' ? 'Update check failed' : updateStatus.state === 'downloading' ? `Downloading ${Math.round(updateStatus.progress ?? 0)}%` : updateStatus.state === 'checking' ? 'Checking for updates' : 'Update service ready'}</b><span>{updateStatus.message}</span>{updateStatus.state === 'downloading' && <i className="update-progress"><i style={{ width: `${updateStatus.progress ?? 0}%` }} /></i>}</div><div className="update-status-actions">{updateStatus.state === 'downloaded' ? <button className="primary-button compact" onClick={() => void onInstallUpdate()}><Power size={13} /> Restart & install</button> : <button className="secondary-button compact" disabled={!preferences.autoUpdates || !updateStatus.configured || updateStatus.state === 'checking' || updateStatus.state === 'downloading' || updateStatus.state === 'available'} onClick={() => void onCheckUpdates()}><RefreshCw size={13} /> Check now</button>}</div></div>
      <details className="update-changelog" open><summary><span><History size={13} /> What’s new in 0.9.39</span><ChevronDown size={14} /></summary><div><span><Check size={11} /> Overall peak ranks now load across every season in live games and the account hub</span><span><Check size={11} /> Mandatory hidden-name reveal refresh every 15 seconds</span><span><Check size={11} /> Open stats button on every account card</span><span><Check size={11} /> Optional three-second auto search in Players</span></div></details>
      {!updateStatus.configured && <div className="privacy-note"><ShieldCheck size={16} /><span>The updater is safely inactive until a release feed is embedded during packaging.</span></div>}
    </div>

    <div className="integration-block">
      <div className="integration-heading"><Keyboard size={16} /><div><b>Quick access</b><span>Bring Rival Shift forward and check the active live game</span></div><i className={preferences.quickSwitchShortcut ? 'ok' : ''} /></div>
      <div className="feature-toggle-grid">
        <label className="toggle-row integration-toggle"><div><b>Enable global shortcut</b><span>Open Live Game and run a fresh check from anywhere.</span></div><input type="checkbox" checked={preferences.quickSwitchShortcut} onChange={(event) => void onSetPreference('quickSwitchShortcut', event.target.checked)} /><i /></label>
        <div className="feature-static"><Gamepad2 size={16} /><div><b>System-tray switcher</b><span>Right-click Rival Shift in the tray to launch any saved Steam account.</span></div><Check size={15} /></div>
      </div>
      <div className="shortcut-editor"><div><b>Shortcut keybind</b><span>Click the field, then press your preferred key combination.</span></div><input aria-label="Quick access keyboard shortcut" readOnly value={preferences.quickAccessShortcut.replace('CommandOrControl', 'Ctrl')} onKeyDown={(event) => { event.preventDefault(); const shortcut = shortcutFromKey(event); if (shortcut) void onSetPreference('quickAccessShortcut', shortcut); }} /><button className="text-button" onClick={() => void onSetPreference('quickAccessShortcut', 'CommandOrControl+Shift+R')}>Reset</button></div>
    </div>

    <div className="integration-block">
      <div className="integration-heading"><PanelLeftClose size={16} /><div><b>Close button behavior</b><span>Choose whether the window asks, stays in the tray, or fully exits</span></div><i className="ok" /></div>
      <label className="setting-select-row"><div><b>When I close Rival Shift</b><span>You can change a remembered choice here at any time.</span></div><select value={preferences.closeAction} onChange={(event) => void onSetPreference('closeAction', event.target.value as AppPreferences['closeAction'])}><option value="ask">Ask every time</option><option value="tray">Minimize to tray</option><option value="quit">Quit the app</option></select></label>
    </div>

    <div className="integration-block">
      <div className="integration-heading"><Bell size={16} /><div><b>Match monitoring</b><span>Post-match alerts and fresh daily/weekly summaries</span></div><i className={preferences.matchNotifications ? 'ok' : ''} /></div>
      <label className="toggle-row integration-toggle"><div><b>Post-match notifications</b><span>Show the result, hero, and KDA when a new match appears.</span></div><input type="checkbox" checked={preferences.matchNotifications} onChange={(event) => void onSetPreference('matchNotifications', event.target.checked)} /><i /></label>
      <label className="toggle-row integration-toggle"><div><b>Background monitoring</b><span>Check linked profiles every 10 minutes while Rival Shift is running.</span></div><input type="checkbox" checked={preferences.backgroundMonitoring} onChange={(event) => void onSetPreference('backgroundMonitoring', event.target.checked)} /><i /></label>
    </div>

    <div className="integration-block">
      <div className="integration-heading"><LockKeyhole size={16} /><div><b>Encrypted profile backup</b><span>Move saved identities, notes, stats, and history between PCs</span></div><i className="ok" /></div>
      <div className="integration-status status-connected"><i /><div><b>AES-256-GCM encryption</b><span>Your passphrase never leaves this computer and is not stored.</span></div></div>
      <div className="integration-inline end"><button className="secondary-button" onClick={onBackup}><LockKeyhole size={14} /> Export or import</button></div>
    </div>

  </div></main>;
}

function SwitchModal({ account, launchGame, setLaunchGame, working, onClose, onConfirm }: { account: SteamAccount; launchGame: boolean; setLaunchGame: (value: boolean) => void; working: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop"><div className="modal-card"><div className="modal-icon hot"><Swords /></div><button className="modal-close" onClick={onClose} disabled={working}><X size={18} /></button><span className="eyebrow">READY TO SWITCH</span><h2>Switch to {account.personaName}?</h2><p className="modal-lead">Rival Shift will close Marvel Rivals and Steam, switch the remembered login, then start everything again for you.</p><div className="switch-target"><AccountAvatar account={account} name={account.personaName} className="account-avatar tint-0" /><div><b>{account.personaName}</b><span>@{account.accountName} · {shortId(account.steamId64)}</span></div><Check size={18} /></div><label className="toggle-row"><div><b>Launch Marvel Rivals after switching</b><span>Turn this off if you only want to change the active Steam account.</span></div><input type="checkbox" checked={launchGame} onChange={(event) => setLaunchGame(event.target.checked)} /><i /></label><div className="modal-actions"><span /><button className="secondary-button" onClick={onClose} disabled={working}>Cancel</button><button className="primary-button hot-button" onClick={onConfirm} disabled={working}>{working ? <LoaderCircle className="spin" size={16} /> : <Swords size={16} />} {working ? 'Switching...' : 'Switch account'}</button></div></div></div>;
}

function LiveArtwork({ src, name, className = '' }: { src?: string; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return src && !failed
    ? <img className={className} src={reliableRivalsAssetUrl(src)} alt={name} title={name} onError={() => setFailed(true)} />
    : <span className={`${className} live-artwork-fallback`} title={name}>{initials(name)}</span>;
}

function LiveRankStat({ rank, score, iconUrl, peak = false }: { rank: string; score?: string; iconUrl?: string; peak?: boolean }) {
  if (!rank) return <span className="live-rank-missing">—</span>;
  return <div className={`live-rank-stat ${peak ? 'peak' : 'current'}`} title={`${peak ? 'Overall peak' : 'Current'} rank: ${rank}${score ? ` · ${score}` : ''}`}>
    <LiveArtwork src={iconUrl} name={`${rank} ${peak ? 'overall peak' : 'current'} rank`} />
    <div><b>{rank}</b>{score && <small>{score}</small>}</div>
  </div>;
}

function LivePlayerRow({ player }: { player: LiveMatchPlayer }) {
  const [expanded, setExpanded] = useState(false);
  const heroStats = player.heroStats ?? [];
  const proficiency = player.proficiency ?? [];
  const recentResults = player.recentResults ?? [];
  const hasDetails = heroStats.length > 0 || proficiency.length > 0 || recentResults.length > 0;
  const currentRank = shortRankName(player.rank);
  const peakRank = shortRankName(player.peakRank);
  const currentScore = player.rankScore == null ? undefined : /^(?:E|OAA)$/.test(currentRank) ? `${player.rankScore} RS` : `${Math.floor(player.rankScore)}/100`;
  const peakScore = player.peakRankScore == null ? undefined : /^(?:E|OAA)$/.test(peakRank) ? `${player.peakRankScore} RS` : `${Math.floor(player.peakRankScore)}/100`;
  return <div className={`live-player-shell ${expanded ? 'expanded' : ''}`}>
    <article className="live-player">
      <div className="live-player-name"><LiveArtwork src={player.avatarUrl} name={player.name} /><div><b>{player.name}</b><small>{player.uid ? `UID ${player.uid}` : 'Marvel Rivals player'}{player.inParty ? ' · IN PARTY' : ''}</small></div></div>
      <LiveRankStat rank={currentRank} score={currentScore} iconUrl={player.rankIconUrl} />
      <LiveRankStat rank={peakRank} score={peakScore} iconUrl={player.peakRankIconUrl} peak />
      <div className="live-record"><b>{player.wins != null ? `${player.wins}W – ${player.losses ?? 0}L` : '-'}</b><span>{player.winRate != null ? `${player.winRate}% WR` : ''}</span></div>
      <div className="live-heroes">{player.heroes.length ? player.heroes.map((hero) => <LiveArtwork src={hero.iconUrl} name={hero.name} key={hero.name} />) : <small>Not shown</small>}</div>
      {hasDetails && <button className="live-player-toggle" aria-label={`${expanded ? 'Hide' : 'Show'} details for ${player.name}`} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><ChevronDown size={13} /></button>}
    </article>
    {hasDetails && expanded && <div className="live-player-details">
      <div className="live-detail-heading"><span>PLAYER DETAILS</span>{player.detailSeason && <b>{player.detailSeason}</b>}</div>
      <div className="live-detail-grid">
        <section><header><span>HERO RECORD</span><small>{heroStats.length || '—'} HEROES</small></header><div className="live-detail-list">{heroStats.length ? heroStats.map((hero) => <div className="live-detail-hero" key={hero.name}><LiveArtwork src={hero.iconUrl} name={hero.name} /><b>{hero.name}</b><span>{hero.matches ?? '—'} games</span><strong className={(hero.winRate ?? 0) >= 50 ? 'positive' : 'negative'}>{hero.winRate != null ? `${hero.winRate}%` : '—'}</strong></div>) : <p>No public hero record</p>}</div></section>
        <section><header><span>PROFICIENCY</span><small>TOP {proficiency.length || '—'}</small></header><div className="live-detail-list live-proficiency-list">{proficiency.length ? proficiency.map((hero, index) => { const level = hero.level == null ? undefined : Math.max(0, Math.min(MAX_PROFICIENCY_LEVEL, hero.level)); return <div className="live-detail-proficiency" key={hero.name}><span className="live-proficiency-index">{String(index + 1).padStart(2, '0')}</span><LiveArtwork src={hero.iconUrl} name={hero.name} /><b>{hero.name}</b><div className="live-proficiency-level"><span>LEVEL</span><strong>{level ?? '—'}</strong><small>/ {MAX_PROFICIENCY_LEVEL}</small></div><div className="live-proficiency-track"><i style={{ width: `${level == null ? 0 : (level / MAX_PROFICIENCY_LEVEL) * 100}%` }} /></div></div>; }) : <p>Not publicly available</p>}</div></section>
        <section><header><span>RECENT FORM</span><small>{recentResults.length || '—'} MATCHES</small></header><div className="live-result-grid">{recentResults.length ? recentResults.map((match, index) => <div className={`live-result ${match.result}`} key={`${match.name}-${index}`}><LiveArtwork src={match.iconUrl} name={match.name} /><b>{match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : 'D'}</b><span>{match.rankChange != null ? `${match.rankChange > 0 ? '+' : ''}${match.rankChange}` : '—'}</span></div>) : <p>No recent results</p>}</div></section>
      </div>
    </div>}
  </div>;
}

type LiveVisualState = 'idle' | 'checking' | 'offline' | 'live';

function LiveStateIcon({ state, size = 24 }: { state: LiveVisualState; size?: number }) {
  if (state === 'checking') return <LoaderCircle className="spin" size={size} />;
  if (state === 'offline') return <Users size={size} />;
  if (state === 'live') return <Swords size={size} />;
  return <Radio size={size} />;
}

function LiveSignal({ state }: { state: Exclude<LiveVisualState, 'live'> }) {
  const label = state === 'checking' ? 'Checking live game' : state === 'offline' ? 'Player offline' : 'Ready to check';
  return <div className={`live-signal ${state}`} role="img" aria-label={label}><LiveStateIcon state={state} size={27} /></div>;
}

function LiveGamePage({ account, profile, snapshot, loading, searching, onStart, onStop, onRefresh, onRecheck, onForceRefresh, onAccounts }: { account?: SteamAccount; profile?: RivalProfile; snapshot: LiveMatchSnapshot | null; loading: boolean; searching: boolean; onStart: () => void; onStop: () => void; onRefresh: () => void; onRecheck: () => void; onForceRefresh: () => void; onAccounts: () => void }) {
  const name = profile?.inGameName || account?.personaName || 'Current session';
  const visualState: LiveVisualState = loading ? 'checking' : snapshot?.status === 'in-game' ? 'live' : snapshot?.status === 'offline' ? 'offline' : 'idle';
  const maskedNames = hasMaskedLivePlayerNames(snapshot);
  return <main className="live-game-page"><header className="settings-header live-page-header"><div><span className="eyebrow">CURRENT SESSION</span><h2>Live game</h2><p>Lobby intelligence for the Steam account that is active right now.</p></div><div className="live-page-actions">{snapshot?.status === 'in-game' ? maskedNames ? <span className="manual-check-pill hidden-name-lock"><LockKeyhole size={11} /> NAME REVEAL LOCKED</span> : <button className="manual-check-pill recheck" onClick={onRecheck}><RefreshCw size={11} /> CHECK NEXT MATCH</button> : searching ? <button className="manual-check-pill stop-search" onClick={onStop}><X size={11} /> STOP SEARCHING</button> : <span className="manual-check-pill"><Radio size={11} /> READY</span>}<button className="secondary-button" onClick={onAccounts}><ChevronRight className="back-chevron" size={15} /> Accounts</button></div></header><div className="live-game-scroll">
    {!account ? <div className="live-page-empty"><Gamepad2 size={30} /><h3>No active Steam session</h3><p>Open Steam with a remembered account, then refresh Rival Shift.</p><button className="secondary-button" onClick={onAccounts}>View accounts</button></div>
      : !profile?.uid ? <div className="live-page-empty"><Link2 size={30} /><h3>Link the current account first</h3><p>{account.personaName} needs a Marvel Rivals UID before Rival Shift can check Rivals Data.</p><button className="primary-button" onClick={onAccounts}>Link current account</button></div>
      : <section className="live-game-board">
    <div className="live-modal-heading"><div className={`modal-icon live-heading-icon ${visualState}`}><LiveStateIcon state={visualState} /></div><div><span className="eyebrow">LIVE MATCH · RIVALS DATA</span><h2>{name}</h2><p>{snapshot?.status === 'in-game' ? `${snapshot.mode || 'In game'} · ${snapshot.elapsed || 'Live now'}` : 'Current game status and lobby details'}</p></div>{snapshot?.status === 'in-game' && <span className="live-status-pill"><i /> IN GAME</span>}</div>
    {loading && !snapshot ? <div className="live-loading"><LiveSignal state="checking" /><b>Searching for a live match…</b><span>{searching ? 'Rival Shift will keep checking until you stop it manually.' : 'Rivals Data may take about 15 seconds before its live lobby is ready.'}</span><button className="force-refresh-button" onClick={searching ? onStop : onForceRefresh}>{searching ? <X size={14} /> : <Zap size={14} />} {searching ? 'Stop searching' : 'Force refresh from zero'}</button></div>
      : snapshot?.status === 'offline' ? <div className="live-offline"><LiveSignal state="offline" /><h3>{searching ? 'Still searching for a live game' : 'Player is not currently in game'}</h3><p>{searching ? 'Rival Shift checks Rivals Data again every five seconds and will continue until you press Stop searching.' : 'Start searching to keep checking until a live lobby appears or you stop it.'}</p><button className={searching ? 'secondary-button stop-live-search' : 'primary-button'} onClick={searching ? onStop : onStart}>{searching ? <X size={15} /> : <RefreshCw size={15} />} {searching ? 'Stop searching' : 'Start searching'}</button></div>
      : snapshot ? <div className="live-teams">{snapshot.teams.map((team) => <section className="live-team" key={team.name}><header><div><span>{team.name}</span><b>AVG {team.averageRankScore ?? '-'} RS</b></div><strong className={(team.projectedChange ?? 0) >= 0 ? 'positive' : 'negative'}>{team.projectedChange != null ? `${team.projectedChange > 0 ? '+' : ''}${team.projectedChange}` : '-'}</strong></header><div className="live-player-labels"><span>PLAYER</span><span>CURRENT</span><span>OVERALL PEAK</span><span>RECORD</span><span>TOP HEROES</span></div>{team.players.map((player) => <LivePlayerRow player={player} key={`${team.name}-${player.uid || player.name}`} />)}</section>)}</div>
      : <div className="live-ready"><LiveSignal state="idle" /><h3>Ready to search</h3><p>Rival Shift will keep checking Rivals Data until you stop the search manually.</p><button className="primary-button" onClick={onStart}><Radio size={15} /> Start live-game search</button></div>}
    {snapshot?.status === 'in-game' && <div className="live-modal-footer"><span>{maskedNames ? (loading ? 'Refreshing hidden names now · this continues until every name is visible' : 'Hidden names found · mandatory refresh again in 15 seconds') : `Captured ${relativeTime(snapshot.checkedAt)} · all player names are visible`}</span><span className="live-lock-note">{maskedNames ? <><RefreshCw className={loading ? 'spin' : ''} size={11} /> REVEALING NAMES</> : <><LockKeyhole size={11} /> LOBBY SNAPSHOT</>}</span></div>}
  </section>}
  </div></main>;
}

function matchAgeHours(timeAgo: string) {
  const value = Number.parseFloat(timeAgo);
  if (/\bmin/i.test(timeAgo)) return value / 60;
  if (/\bh/i.test(timeAgo)) return value;
  if (/\bd/i.test(timeAgo)) return value * 24;
  return 0;
}

function MatchSummaryCard({ label, matches }: { label: string; matches: NonNullable<RivalProfile['stats']>['matchHistory'] }) {
  const games = matches ?? [];
  const wins = games.filter((match) => match.result === 'win').length;
  const kdas = games.map((match) => match.kda).filter((value): value is number => value != null);
  return <div className="summary-period"><span>{label}</span><strong>{games.length}</strong><small>MATCHES</small><div><b>{games.length ? `${Math.round((wins / games.length) * 100)}%` : '—'} <small>WIN RATE</small></b><b>{kdas.length ? (kdas.reduce((sum, value) => sum + value, 0) / kdas.length).toFixed(2) : '—'} <small>AVG KDA</small></b></div></div>;
}

function HistoryModal({ name, profile, onClose }: { name: string; profile?: RivalProfile; onClose: () => void }) {
  const history = profile?.rankHistory ?? [];
  const points = history.length ? history : profile?.stats ? [{ at: profile.stats.syncedAt || profile.updatedAt || new Date().toISOString(), rank: profile.stats.rank, rankScore: profile.stats.rankScore, rankProgress: profile.stats.rankProgress, winRate: profile.stats.winRate, wins: profile.stats.wins, losses: profile.stats.losses, matches: profile.stats.matches }] : [];
  const scores = points.map((point) => point.rankScore).filter((value): value is number => value != null);
  const min = Math.min(...scores, 0); const max = Math.max(...scores, 100); const span = Math.max(1, max - min);
  const polyline = scores.map((score, index) => `${scores.length === 1 ? 50 : (index / (scores.length - 1)) * 100},${88 - ((score - min) / span) * 70}`).join(' ');
  const matches = profile?.stats?.matchHistory ?? [];
  return <div className="modal-backdrop"><div className="modal-card history-modal"><button className="modal-close" onClick={onClose}><X size={18} /></button><div className="modal-icon"><TrendingUp /></div><span className="eyebrow">PERFORMANCE HISTORY</span><h2>{name}</h2><p className="modal-lead">Rank snapshots are saved whenever player data changes. Match summaries use the latest cached history.</p><div className="history-overview"><div className="rank-chart"><header><div><span>CURRENT RATING</span><b>{profile?.stats?.rankScore ?? '—'} <small>{profile?.stats?.rankScore != null ? `RS${rankProgressValue(profile.stats.rankScore, profile.stats.rank, profile.stats.rankProgress) != null ? ` · ${rankProgressValue(profile.stats.rankScore, profile.stats.rank, profile.stats.rankProgress)}/100` : ''}` : 'RS'}</small></b></div><span>{points.length} SNAPSHOT{points.length === 1 ? '' : 'S'}</span></header>{scores.length ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Rank score history"><defs><linearGradient id="rankFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9b6eff" stopOpacity=".34"/><stop offset="1" stopColor="#9b6eff" stopOpacity="0"/></linearGradient></defs><polygon points={`0,100 ${polyline} 100,100`} fill="url(#rankFill)"/><polyline points={polyline} fill="none" stroke="#a77eff" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg> : <div className="chart-empty">Refresh stats to begin rank history.</div>}<footer><span>{points[0] ? new Date(points[0].at).toLocaleDateString() : 'FIRST SYNC'}</span><span>NOW</span></footer></div><div className="period-summaries"><MatchSummaryCard label="TODAY" matches={matches.filter((match) => matchAgeHours(match.timeAgo) <= 24)} /><MatchSummaryCard label="LAST 7 DAYS" matches={matches.filter((match) => matchAgeHours(match.timeAgo) <= 168)} /></div></div><div className="history-list"><span className="eyebrow">RECENT SNAPSHOTS</span>{points.slice(-6).reverse().map((point) => <div key={point.at}><span>{new Date(point.at).toLocaleString()}</span><b>{point.rank || 'Unranked'}</b><strong>{point.rankScore != null || point.rankProgress != null ? rankScoreProgress(point.rankScore, point.rank, point.rankProgress) : '—'}</strong><small>{point.winRate != null ? `${point.winRate}% WR` : ''}</small></div>)}</div></div></div>;
}

function BackupModal({ onClose, onExport, onImport }: { onClose: () => void; onExport: (passphrase: string) => Promise<void>; onImport: (passphrase: string) => Promise<void> }) {
  const [passphrase, setPassphrase] = useState(''); const [working, setWorking] = useState(false); const valid = passphrase.length >= 8;
  const run = async (action: (value: string) => Promise<void>) => { setWorking(true); try { await action(passphrase); } finally { setWorking(false); } };
  return <div className="modal-backdrop"><div className="modal-card backup-modal"><button className="modal-close" onClick={onClose} disabled={working}><X size={18} /></button><div className="modal-icon"><LockKeyhole /></div><span className="eyebrow">PORTABLE PROFILE BACKUP</span><h2>Encrypted export & import</h2><p className="modal-lead">The backup includes linked identities, private notes, cached stats, and rank history. Steam passwords are never included.</p><label className="form-label"><span>Backup passphrase <small>MINIMUM 8 CHARACTERS</small></span><input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} autoFocus placeholder="Enter a strong passphrase" /></label><div className="backup-security"><ShieldCheck size={17} /><span><b>AES-256-GCM protected</b>Keep this passphrase safe. Rival Shift cannot recover it.</span></div><div className="backup-actions"><button className="secondary-button" disabled={!valid || working} onClick={() => void run(onImport)}>{working ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />} Import backup</button><button className="primary-button" disabled={!valid || working} onClick={() => void run(onExport)}>{working ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />} Export encrypted backup</button></div></div></div>;
}

function UpdateReadyModal({ version, installing, onLater, onInstall }: { version: string; installing: boolean; onLater: () => void; onInstall: () => Promise<void> }) {
  return <div className="modal-backdrop update-ready-backdrop" role="dialog" aria-modal="true" aria-labelledby="update-ready-title"><div className="modal-card update-ready-modal"><div className="update-ready-icon"><Download size={22} /></div><span className="eyebrow">UPDATE DOWNLOADED</span><h2 id="update-ready-title">Rival Shift {version} is ready</h2><p className="modal-lead">The update has finished downloading. Restart Rival Shift now to install it, or continue playing and install it later from Settings.</p><div className="update-ready-version"><span><Check size={14} /></span><div><b>Ready to install</b><small>Your accounts and local settings will stay exactly as they are.</small></div></div><div className="update-ready-actions"><button className="secondary-button" disabled={installing} onClick={onLater}>Later</button><button className="primary-button" disabled={installing} onClick={() => void onInstall()}>{installing ? <LoaderCircle className="spin" size={15} /> : <Power size={15} />}{installing ? 'Restarting…' : 'Install & restart'}</button></div></div></div>;
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal-card about-modal"><div className="modal-icon"><Sparkles /></div><button className="modal-close" onClick={onClose}><X size={18} /></button><span className="eyebrow">RIVAL SHIFT v0.9.39</span><h2>Focused Marvel Rivals switching.</h2><p className="modal-lead">Steam switching follows the open-source TcNo Account Switcher approach. No passwords are stored. Linked identities and cached stats persist in app data.</p><div className="about-points"><div><ShieldCheck /><span><b>Safe local state</b>Backs up loginusers.vdf before every switch.</span></div><div><Gamepad2 /><span><b>Steam-native logic</b>Updates remembered account state and registry values.</span></div><div><Heart /><span><b>Live-tested data</b>Loads a verified source without bypassing site security.</span></div></div><div className="modal-actions"><span /><button className="primary-button" onClick={onClose}>Got it</button></div></div></div>;
}
