import type { AppPreferences, AppUpdateStatus, DiscordStatus, LiveMatchSnapshot, RivalProfile, RivalShiftApi, SteamAccount, TopSniperPlayer, TrackedPlayer } from './types';

const accounts: SteamAccount[] = [
  { steamId64: '76561198147273911', accountName: 'nova_main', personaName: 'NOVA', lastLogin: new Date(Date.now() - 18 * 60_000).toISOString(), currentSession: true, remembered: true },
  { steamId64: '76561198905321874', accountName: 'ghostline', personaName: 'Ghostline', lastLogin: new Date(Date.now() - 86400_000).toISOString(), currentSession: false, remembered: true },
  { steamId64: '76561198369421055', accountName: 'kinetic_alt', personaName: 'Kinetic', lastLogin: new Date(Date.now() - 4 * 86400_000).toISOString(), currentSession: false, remembered: true },
  { steamId64: '76561198000000004', accountName: 'support_lab', personaName: 'Orbit', lastLogin: new Date(Date.now() - 6 * 86400_000).toISOString(), currentSession: false, remembered: true },
  { steamId64: '76561198000000005', accountName: 'ranked_two', personaName: 'Rift', lastLogin: new Date(Date.now() - 8 * 86400_000).toISOString(), currentSession: false, remembered: true },
  { steamId64: '76561198000000006', accountName: 'practice_only', personaName: 'Echo', lastLogin: new Date(Date.now() - 12 * 86400_000).toISOString(), currentSession: false, remembered: true },
  { steamId64: '76561198000000007', accountName: 'friends_queue', personaName: 'Vector', lastLogin: new Date(Date.now() - 15 * 86400_000).toISOString(), currentSession: false, remembered: true },
  { steamId64: '76561198000000008', accountName: 'seasonal_alt', personaName: 'Astra', lastLogin: new Date(Date.now() - 21 * 86400_000).toISOString(), currentSession: false, remembered: true },
];
accounts.forEach((account) => { account.avatarUrl = 'https://avatars.fastly.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'; });

const profiles: Record<string, RivalProfile> = {
  [accounts[0].steamId64]: { steamId64: accounts[0].steamId64, uid: '1822797559', inGameName: 'NOVA', note: 'Duelist · Main', favorite: true, updatedAt: new Date(Date.now() - 8 * 60_000).toISOString(), status: 'synced', stats: { level: 62, rank: 'Celestial 1', rankScore: 5078, rankProgress: 78, rankProgressMax: 100, rankIconUrl: 'https://rivalsdata.com/assets/ranks/celestial.webp', leaderboardRank: '#8,241', factionName: 'Midnight Suns', matchHistoryVisible: true, winRate: 58, wins: 142, losses: 103, matches: 245, heroes: ['Psylocke', 'Magik', 'Hela'], heroStats: [{ name: 'Psylocke', kda: 4.8, winRate: 62, matches: 21 }, { name: 'Magik', kda: 3.9, winRate: 57, matches: 18 }, { name: 'Hela', kda: 4.2, winRate: 55, matches: 14 }], proficiency: [{ name: 'Psylocke', tier: 'Guardian', level: 48 }, { name: 'Magik', tier: 'Elite', level: 43 }, { name: 'Hela', tier: 'Elite', level: 41 }], matchHistory: [{ matchId: '5513552_demo_1', mode: 'Competitive', timeAgo: '2h ago', playedAt: new Date(Date.now() - 2 * 3600_000).toISOString(), result: 'win', score: '3:1', scoreChange: 24, hero: 'Psylocke', rank: 'Celestial 1', rankScore: 5078, rankProgress: 78, kills: 31, deaths: 6, assists: 9, kda: 6.67, placement: 'MVP', placementRank: 1, map: 'Midtown', mapId: 1291, mapMode: 'Convoy', season: 19, platform: 'PC' }, { matchId: '5513552_demo_2', mode: 'Competitive', timeAgo: '5h ago', playedAt: new Date(Date.now() - 5 * 3600_000).toISOString(), result: 'loss', score: '1:2', scoreChange: -18, hero: 'Magik', rank: 'Celestial 1', rankScore: 5054, rankProgress: 54, kills: 18, deaths: 9, assists: 5, kda: 2.56, placement: 'SVP', placementRank: 2, map: 'Shin-Shibuya', mapId: 1230, mapMode: 'Convergence', season: 19, platform: 'PC' }], punishments: [{ kind: 'chat', label: 'Chat restriction', active: false }, { kind: 'login', label: 'Account suspension', active: false }, { kind: 'rank', label: 'Competitive restriction', active: false }], nameHistory: [{ name: 'NOVA', firstSeenAt: new Date(Date.now() - 40 * 86400_000).toISOString() }, { name: 'NovaShift', firstSeenAt: new Date(Date.now() - 180 * 86400_000).toISOString() }], teammates: [{ uid: '680173547', name: 'Veswa', matches: 28, wins: 19, losses: 9, winRate: 67.9 }, { uid: '1939904015', name: 'Nightwatch', matches: 16, wins: 10, losses: 6, winRate: 62.5 }], crosshairs: [{ code: '1;0;P;c;5;o;0.6;d;1', uses: 382 }, { code: '1;0;P;c;8;h;0;d;1', uses: 147 }], onlineText: 'Online', source: 'Rivals Data via SDK API' } },
  [accounts[1].steamId64]: { steamId64: accounts[1].steamId64, uid: '1677216165', inGameName: 'Ghostline', note: 'Support queue', favorite: false, updatedAt: new Date(Date.now() - 44 * 60_000).toISOString(), status: 'synced', stats: { level: 49, rank: 'Diamond 2', rankScore: 4331, rankProgress: 31, rankProgressMax: 100, rankIconUrl: 'https://rivalsdata.com/assets/ranks/diamond.webp', winRate: 53, wins: 89, losses: 79, matches: 168, heroes: ['Luna Snow', 'Mantis', 'Invisible Woman'], punishments: [{ kind: 'chat', label: 'Chat restriction', active: false }, { kind: 'login', label: 'Account suspension', active: false }, { kind: 'rank', label: 'Competitive restriction', active: false }], nameHistory: [{ name: 'Ghostline', firstSeenAt: new Date(Date.now() - 90 * 86400_000).toISOString() }], onlineText: 'Offline · 1h ago', source: 'Rivals Data via SDK API' } },
};

// Keep the browser demo exercising demotion protection, where a division can
// legitimately show signed progress down to -30.
Object.assign(profiles[accounts[1].steamId64].stats ?? {}, { rankScore: 4277, rankProgress: -23 });
Object.assign(profiles[accounts[0].steamId64].stats ?? {}, { peakRank: 'One Above All', peakRankScore: 147, peakRankIconUrl: 'https://rivalsdata.com/assets/ranks/one-above-all.webp' });
Object.assign(profiles[accounts[1].steamId64].stats ?? {}, { peakRank: 'Celestial 1', peakRankScore: 83, peakRankIconUrl: 'https://rivalsdata.com/assets/ranks/celestial.webp' });
Object.assign(profiles[accounts[0].steamId64].stats ?? {}, {
  skinInventoryValue: 5_200,
  eventSkinsOwned: 2,
  eventSkinsTotal: 147,
  skins: [
    { id: '1011501', name: 'Green Scar', hero: 'Hulk', iconUrl: 'https://cdn.rivalsdata.com/assets/skins/icon/1011501.webp', value: 2_000, category: 'event', source: 'Event', equipped: true },
    { id: '1029501', name: 'Blood Soul', hero: 'Magik', iconUrl: 'https://cdn.rivalsdata.com/assets/skins/icon/1029501.webp', value: 1_600, category: 'store', source: 'Store' },
    { id: '1048501', name: 'Vengeance', hero: 'Psylocke', iconUrl: 'https://cdn.rivalsdata.com/assets/skins/icon/1048501.webp', value: 1_600, category: 'event', source: 'Event' },
  ],
});

let favoritePlayers: TrackedPlayer[] = [{ uid: '680173547', name: 'Veswa', level: 86, rank: 'One Above All', rankScore: 5464, presence: 'offline', presenceText: 'Offline', lastSeenAt: new Date(Date.now() - 86_400_000).toISOString(), favorite: true, updatedAt: new Date().toISOString() }];
let hiddenAccounts: string[] = [];
const demoTopSnipers: TopSniperPlayer[] = [
  { uid: '934100021', name: 'falores', rank: 'One Above All', rankScore: 5612, presence: 'in-game', presenceText: 'In queue', lastSeenAt: null, favorite: false, updatedAt: new Date().toISOString(), leaderboardPosition: 9, wins: 126, losses: 61, winRate: 67.4 },
  { uid: '934100033', name: '赛斐', rank: 'One Above All', rankScore: 5526, presence: 'in-game', presenceText: 'In game (Competitive)', lastSeenAt: null, favorite: false, updatedAt: new Date().toISOString(), leaderboardPosition: 33, wins: 98, losses: 52, winRate: 65.3 },
  { uid: '934100059', name: 'Erigori', rank: 'Eternity', rankScore: 5438, presence: 'in-game', presenceText: 'In game (Quick Play)', lastSeenAt: null, favorite: false, updatedAt: new Date().toISOString(), leaderboardPosition: 59, wins: 77, losses: 44, winRate: 63.6 },
  { uid: '934100081', name: 'Woofles.', rank: 'Eternity', rankScore: 5391, presence: 'in-team', presenceText: 'In team (1/6)', lastSeenAt: null, favorite: false, updatedAt: new Date().toISOString(), leaderboardPosition: 81, wins: 69, losses: 43, winRate: 61.6 },
  { uid: '934100103', name: 'Nightwatch', rank: 'Eternity', rankScore: 5352, presence: 'online', presenceText: 'Online', lastSeenAt: null, favorite: false, updatedAt: new Date().toISOString(), leaderboardPosition: 103, wins: 58, losses: 39, winRate: 59.8 },
];

let discordStatus: DiscordStatus = { enabled: true, clientId: '1535197736289439786', state: 'connected', message: 'Rich Presence is active.' };
let launcherSkip = false;
let preferences: AppPreferences = { theme: 'nebula', rivalsDataMode: 'api', discordRichPresence: true, quickSwitchShortcut: false, quickAccessShortcut: 'CommandOrControl+Shift+R', closeAction: 'ask', matchNotifications: true, backgroundMonitoring: false, skipLauncher: false, directLaunchReminder: true, autoUpdates: true, privacyMode: false, startupMode: 'off' };
const demoUpdateReady = new URLSearchParams(window.location.search).has('updateReady');
let updateStatus: AppUpdateStatus = demoUpdateReady
  ? { enabled: true, configured: true, state: 'downloaded', currentVersion: '0.9.39', availableVersion: '0.9.40', progress: 100, message: 'Rival Shift 0.9.40 is ready to install.' }
  : { enabled: true, configured: false, state: 'unconfigured', currentVersion: '0.9.39', message: 'Add a release feed to activate automatic updates.' };

export const demoApi: RivalShiftApi = {
  async minimizeWindow() {},
  async toggleMaximizeWindow() { return false; },
  async closeWindow() {},
  async isWindowMaximized() { return false; },
  onWindowMaximized() { return () => undefined; },
  async listAccounts() { return { steamRoot: 'C:\\Program Files (x86)\\Steam', accounts, platform: 'win32' }; },
  async openSteamLogin() {},
  async isGameRunning() { return false; },
  async launchCurrentGame() {},
  async getProfiles() { return { ...profiles }; },
  async getStoragePath() { return '%APPDATA%\\Rival Shift\\rival-shift.json'; },
  async saveProfile(profile) { profiles[profile.steamId64] = profile; return profile; },
  async removeProfile(steamId64) { delete profiles[steamId64]; },
  async getHiddenAccounts() { return [...hiddenAccounts]; },
  async hideAccount(steamId64) { hiddenAccounts = [...new Set([...hiddenAccounts, steamId64])]; return [...hiddenAccounts]; },
  async restoreHiddenAccounts() { hiddenAccounts = []; return []; },
  async switchAccount(steamId64) { await new Promise((resolve) => setTimeout(resolve, 1100)); accounts.forEach((account) => { account.currentSession = account.steamId64 === steamId64; }); return { ok: true, accountName: accounts.find((account) => account.steamId64 === steamId64)?.accountName ?? '' }; },
  async openPlayerProfile(uid) { window.open(`https://rivalsdata.com/player/${encodeURIComponent(uid)}`, '_blank'); },
  async copyText(text) { await navigator.clipboard.writeText(text); },
  async syncProfile(steamId64) { const profile = profiles[steamId64]; if (!profile) throw new Error('Save the player identity first.'); return profile; },
  async refreshAllProfiles() { return { ...profiles }; },
  async searchRivalsDataPlayers(query) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const result: TrackedPlayer = { uid: /^\d+$/.test(query) ? query : '680173547', name: /^\d+$/.test(query) ? `Player ${query}` : 'Veswa', level: 86, rank: 'One Above All', rankScore: 5464, presence: 'online', presenceText: 'Online', lastSeenAt: null, favorite: false, updatedAt: new Date().toISOString() };
    return [result];
  },
  async getTopSnipers() { return demoTopSnipers.map((player) => ({ ...player, updatedAt: new Date().toISOString() })); },
  async getFavoritePlayers() { return [...favoritePlayers]; },
  async saveFavoritePlayer(player) { favoritePlayers = [...favoritePlayers.filter((item) => item.uid !== player.uid), { ...player, favorite: true }]; return [...favoritePlayers]; },
  async removeFavoritePlayer(uid) { favoritePlayers = favoritePlayers.filter((player) => player.uid !== uid); return [...favoritePlayers]; },
  async refreshFavoritePlayers() { favoritePlayers = favoritePlayers.map((player) => ({ ...player, updatedAt: new Date().toISOString() })); return [...favoritePlayers]; },
  async refreshPostMatchPlayers(players) {
    return players.map((player, index) => ({
      ...player,
      level: 40 + index,
      rank: index % 2 ? 'Diamond 1' : 'Celestial 2',
      rankScore: 4800 + index * 15,
      presence: index < 2 ? 'in-game' : index < 4 ? 'online' : 'offline',
      presenceText: index < 2 ? 'In queue' : index < 4 ? 'Online' : 'Offline',
      lastSeenAt: index < 4 ? null : new Date(Date.now() - 10 * 60_000).toISOString(),
      favorite: false,
      updatedAt: new Date().toISOString(),
    }));
  },
  async checkLiveMatch(steamId64, forceRefresh) {
    const target = profiles[steamId64];
    if (!target) throw new Error('Save the player identity first.');
    await new Promise((resolve) => setTimeout(resolve, forceRefresh ? 900 : 450));
    if (target.inGameName === 'Ghostline') return { status: 'offline', checkedAt: new Date().toISOString(), playerName: target.inGameName, teams: [], refreshCycles: forceRefresh ? 1 : 0 };
    const result: LiveMatchSnapshot = { status: 'in-game', checkedAt: new Date().toISOString(), playerName: target.inGameName, mode: 'Competitive', elapsed: '10:08', refreshCycles: forceRefresh ? 1 : 0, teams: [
      { name: 'Team 1', averageRankScore: 5125, projectedChange: -14, players: [{ uid: '1', name: 'NOVA', rank: 'Celestial 1', rankScore: 95, wins: 38, losses: 36, winRate: 51, inParty: true, heroes: [{ name: 'Psylocke' }, { name: 'Magik' }], detailSeason: 'Season 9.5', heroStats: [{ name: 'Psylocke', matches: 12, winRate: 67 }, { name: 'Magik', matches: 7, winRate: 57 }, { name: 'Hela', matches: 4, winRate: 50 }], proficiency: [{ name: 'Psylocke', level: 48 }, { name: 'Magik', level: 43 }, { name: 'Hela', level: 41 }], recentResults: [{ name: 'Psylocke', result: 'win', rankChange: 24 }, { name: 'Magik', result: 'loss', rankChange: -18 }, { name: 'Hela', result: 'win', rankChange: 21 }, { name: 'Psylocke', result: 'win', rankChange: 23 }] }, { uid: '2', name: 'MACE', rank: 'One Above All', rankScore: 177, wins: 33, losses: 23, winRate: 59, heroes: [{ name: 'Hela' }] }] },
      { name: 'Team 2', averageRankScore: 5139, projectedChange: 14, players: [{ uid: '3', name: 'Daes', rank: 'One Above All', rankScore: 175, wins: 5, losses: 3, winRate: 63, heroes: [{ name: 'Magneto' }] }, { uid: '4', name: 'Konuya', rank: 'Eternity', rankScore: 88, wins: 0, losses: 1, winRate: 0, heroes: [{ name: 'Luna Snow' }] }] },
    ] };
    Object.assign(result.teams[0].players[0], { peakRank: 'Eternity', peakRankScore: 106 });
    Object.assign(result.teams[0].players[1], { peakRank: 'One Above All', peakRankScore: 147 });
    Object.assign(result.teams[1].players[0], { peakRank: 'One Above All', peakRankScore: 84 });
    Object.assign(result.teams[1].players[1], { peakRank: 'Celestial 1', peakRankScore: 43 });
    return result;
  },
  async restartLiveMatch(steamId64) { return this.checkLiveMatch(steamId64, true); },
  async getPreferences() { return preferences; },
  async setPreference(key, value) { preferences = { ...preferences, [key]: value }; return preferences; },
  async getUpdateStatus() { return updateStatus; },
  async checkForUpdates() { return updateStatus; },
  async installUpdate() {},
  async exportProfiles() { return { canceled: false, path: 'rival-shift-backup.rsbackup' }; },
  async importProfiles() { return { canceled: false, count: Object.keys(profiles).length, profiles: { ...profiles } }; },
  async getRivalsDataExtensionStatus() { return { connected: true, lastSeen: new Date().toISOString(), extensionPath: 'extension', pendingJobs: 0, message: 'Rivals Data extension connected and ready.' }; },
  async openRivalsDataExtensionFolder() {},
  async getLauncherSkipStatus() { return { available: true, enabled: launcherSkip, launchRecordPath: 'C:\\Steam\\steamapps\\common\\MarvelRivals\\launch_record', message: launcherSkip ? 'Ready to jump straight into the game.' : 'The Marvel Rivals launcher will open before the game.' }; },
  async setLauncherSkip(enabled) { launcherSkip = enabled; preferences = { ...preferences, skipLauncher: enabled }; return { available: true, enabled, launchRecordPath: 'C:\\Steam\\steamapps\\common\\MarvelRivals\\launch_record', message: enabled ? 'Ready to jump straight into the game.' : 'The Marvel Rivals launcher will open before the game.' }; },
  async getDiscordStatus() { return discordStatus; },
  async reconnectDiscord() { discordStatus = { ...discordStatus, state: 'connected', message: 'Rich Presence is active.' }; return discordStatus; },
  async updateDiscordPresence() {},
  async respondToAppPrompt() {},
  onDiscordStatus() { return () => {}; },
  onQuickAccess() { return () => {}; },
  onPreferencesChanged() { return () => {}; },
  onUpdateStatus() { return () => {}; },
  onGameLaunchReminder() { return () => {}; },
  onAppPrompt() { return () => {}; },
};
