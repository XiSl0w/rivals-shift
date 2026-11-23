export type SteamAccount = {
  steamId64: string;
  accountName: string;
  personaName: string;
  avatarUrl?: string;
  lastLogin: string | null;
  currentSession: boolean;
  remembered: boolean;
};

export type RivalsDataMode = 'extension' | 'api';

export type PlayerPresence = 'online' | 'in-team' | 'in-game' | 'away' | 'offline';

export type TrackedPlayer = {
  uid: string;
  name: string;
  iconUrl?: string;
  level?: number;
  rank?: string;
  rankScore?: number;
  rankProgress?: number;
  presence: PlayerPresence;
  presenceText: string;
  lastSeenAt: string | null;
  favorite: boolean;
  updatedAt: string;
};

export type TopSniperPlayer = TrackedPlayer & {
  leaderboardPosition: number;
  statusSinceAt?: string;
  wins?: number;
  losses?: number;
  winRate?: number;
};

export type HeroPerformance = {
  name: string;
  iconUrl?: string;
  kda?: number;
  winRate?: number;
  wins?: number;
  losses?: number;
  matches?: number;
};

export type HeroProficiency = {
  name: string;
  iconUrl?: string;
  tier?: string;
  tierIconUrl?: string;
  level?: number;
};

export type PlayerSkin = {
  id?: string;
  name: string;
  hero?: string;
  iconUrl?: string;
  rarity?: string;
  value?: number;
  category?: string;
  source?: string;
  equipped?: boolean;
};

export type MatchSummary = {
  matchId?: string;
  mode: string;
  timeAgo: string;
  playedAt?: string;
  result?: 'win' | 'loss' | 'draw';
  score?: string;
  scoreChange?: number;
  hero?: string;
  heroIconUrl?: string;
  rank?: string;
  rankScore?: number;
  rankProgress?: number;
  kills?: number;
  deaths?: number;
  assists?: number;
  kda?: number;
  placement?: string;
  map?: string;
  mapId?: number;
  mapMode?: string;
  season?: number;
  platform?: string;
  placementRank?: number;
};

export type PlayerPunishment = {
  kind: 'chat' | 'login' | 'rank';
  label: string;
  active: boolean;
  expired?: boolean;
  reason?: string;
  startsAt?: string | null;
  expiresAt?: string | null;
  details?: string[];
};

export type PlayerNameHistoryEntry = { name: string; firstSeenAt: string | null };

export type FrequentTeammate = {
  uid: string;
  name: string;
  iconUrl?: string;
  matches?: number;
  wins?: number;
  losses?: number;
  winRate?: number;
};

export type SharedCrosshair = { code: string; uses?: number };

export type RankHistoryPoint = {
  at: string;
  rank?: string;
  rankScore?: number;
  rankProgress?: number;
  winRate?: number;
  wins?: number;
  losses?: number;
  matches?: number;
};

export type LiveMatchHero = { name: string; iconUrl?: string };

export type LiveMatchHeroStat = LiveMatchHero & {
  matches?: number;
  winRate?: number;
};

export type LiveMatchProficiency = LiveMatchHero & {
  level?: number;
};

export type LiveMatchRecentResult = LiveMatchHero & {
  result: 'win' | 'loss' | 'draw';
  rankChange?: number;
};

export type LiveMatchPlayer = {
  uid: string;
  name: string;
  avatarUrl?: string;
  rank?: string;
  rankScore?: number;
  rankIconUrl?: string;
  peakRank?: string;
  peakRankScore?: number;
  peakRankIconUrl?: string;
  wins?: number;
  losses?: number;
  winRate?: number;
  inParty?: boolean;
  heroes: LiveMatchHero[];
  detailSeason?: string;
  heroStats?: LiveMatchHeroStat[];
  proficiency?: LiveMatchProficiency[];
  recentResults?: LiveMatchRecentResult[];
};

export type LiveMatchTeam = {
  name: string;
  averageRankScore?: number;
  projectedChange?: number;
  players: LiveMatchPlayer[];
};

export type LiveMatchSnapshot = {
  status: 'in-game' | 'offline';
  checkedAt: string;
  playerName?: string;
  mode?: string;
  elapsed?: string;
  teams: LiveMatchTeam[];
  refreshCycles?: number;
};

export type DiscordLivePresence = {
  status: 'idle' | 'checking' | 'in-game' | 'offline';
  playerName?: string;
  mode?: string;
  elapsed?: string;
  checkedAt?: string;
};

export type AppPrompt = {
  id: string;
  type: 'close' | 'duplicate';
};

export type AppPreferences = {
  theme: 'nebula' | 'tide' | 'ember' | 'verdant';
  rivalsDataMode: RivalsDataMode;
  discordRichPresence: boolean;
  quickSwitchShortcut: boolean;
  quickAccessShortcut: string;
  closeAction: 'ask' | 'tray' | 'quit';
  matchNotifications: boolean;
  backgroundMonitoring: boolean;
  skipLauncher: boolean;
  directLaunchReminder: boolean;
  autoUpdates: boolean;
  privacyMode: boolean;
  startupMode: 'window' | 'tray' | 'off';
};

export type AppUpdateStatus = {
  enabled: boolean;
  configured: boolean;
  state: 'disabled' | 'unconfigured' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error';
  currentVersion: string;
  availableVersion?: string;
  progress?: number;
  message: string;
};

export type RivalProfile = {
  steamId64: string;
  uid: string;
  inGameName: string;
  note: string;
  favorite: boolean;
  group?: string;
  updatedAt: string | null;
  status: 'unlinked' | 'linked' | 'synced' | 'error';
  error?: string;
  refreshNotice?: 'cached';
  refreshMessage?: string;
  rankHistory?: RankHistoryPoint[];
  stats?: {
    level?: number;
    rank?: string;
    rankScore?: number;
    rankProgress?: number;
    rankProgressMax?: number;
    peakRank?: string;
    peakRankScore?: number;
    peakRankIconUrl?: string;
    leaderboardRank?: string;
    winRate?: number;
    wins?: number;
    losses?: number;
    matches?: number;
    kd?: number;
    heroes?: string[];
    heroIcons?: Record<string, string>;
    heroStats?: HeroPerformance[];
    proficiency?: HeroProficiency[];
    skins?: PlayerSkin[];
    skinInventoryValue?: number;
    eventSkinsOwned?: number;
    eventSkinsTotal?: number;
    matchHistory?: MatchSummary[];
    punishments?: PlayerPunishment[];
    nameHistory?: PlayerNameHistoryEntry[];
    teammates?: FrequentTeammate[];
    crosshairs?: SharedCrosshair[];
    factionName?: string;
    matchHistoryVisible?: boolean;
    lastSeenAt?: string | null;
    profileIconUrl?: string;
    rankIconUrl?: string;
    rankIconRemoteUrl?: string;
    onlineText?: string;
    syncedAt?: string;
    source?: string;
  };
};

export type RivalsDataExtensionStatus = {
  connected: boolean;
  lastSeen: string | null;
  extensionPath: string;
  pendingJobs: number;
  message: string;
  version?: string | null;
};

export type SteamSnapshot = {
  steamRoot: string | null;
  accounts: SteamAccount[];
  platform: NodeJS.Platform;
  error?: string;
};

export type DiscordStatus = {
  enabled: boolean;
  clientId: string;
  state: 'disabled' | 'connecting' | 'connected' | 'error';
  message: string;
};

export type LauncherSkipStatus = {
  available: boolean;
  enabled: boolean;
  launchRecordPath?: string;
  message: string;
};

