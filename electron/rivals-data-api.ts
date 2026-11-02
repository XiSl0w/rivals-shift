import { BrowserWindow, session, type Session } from 'electron';
import type { FrequentTeammate, HeroPerformance, HeroProficiency, LiveMatchPlayer, LiveMatchSnapshot, LiveMatchTeam, MatchSummary, PlayerNameHistoryEntry, PlayerPresence, PlayerPunishment, PlayerSkin, RivalProfile, SharedCrosshair, TopSniperPlayer, TrackedPlayer } from './types';

type JsonObject = Record<string, unknown>;
type RivalsDataTransport = (request: {
  url: string;
  method: 'GET' | 'POST';
  headers: Readonly<Record<string, string>>;
  body?: Readonly<JsonObject>;
  signal: AbortSignal;
}) => Promise<{ status: number; data: unknown; headers?: Readonly<Record<string, string>> }>;
type RivalsDataClientLike = {
  searchPlayers(name: string): Promise<unknown>;
  getPlayer(uid: string, options?: { preferCache?: boolean }): Promise<unknown>;
  refreshPlayer(uid: string): Promise<unknown>;
  getPlayerHeroes(uid: string): Promise<unknown>;
  getPlayerProficiency(uid: string): Promise<unknown>;
  getPlayerSkins(uid: string): Promise<unknown>;
  getPlayerMatches(uid: string, options?: { fresh?: boolean }): Promise<unknown>;
  getPlayerPunishments(uid: string): Promise<unknown>;
  getPlayerNameHistory(uid: string): Promise<unknown>;
  getPlayerTeammates(uid: string): Promise<unknown>;
  getPlayerCrosshairs(uid: string): Promise<unknown>;
  getLiveMatch(uid: string): Promise<unknown>;
  clearCache(): void;
};

const HERO_NAMES: Record<string, string> = {
  '1011': 'Hulk', '1014': 'The Punisher', '1015': 'Storm', '1016': 'Loki', '1017': 'Human Torch',
  '1018': 'Doctor Strange', '1020': 'Mantis', '1021': 'Hawkeye', '1022': 'Captain America',
  '1023': 'Rocket Raccoon', '1024': 'Hela', '1025': 'Cloak & Dagger', '1026': 'Black Panther',
  '1027': 'Groot', '1028': 'Ultron', '1029': 'Magik', '1030': 'Moon Knight', '1031': 'Luna Snow',
  '1032': 'Squirrel Girl', '1033': 'Black Widow', '1034': 'Iron Man', '1035': 'Venom',
  '1036': 'Spider-Man', '1037': 'Magneto', '1038': 'Scarlet Witch', '1039': 'Thor',
  '1040': 'Mister Fantastic', '1041': 'Winter Soldier', '1042': 'Peni Parker', '1043': 'Star-Lord',
  '1044': 'Blade', '1045': 'Namor', '1046': 'Adam Warlock', '1047': 'Jeff the Land Shark',
  '1048': 'Psylocke', '1049': 'Wolverine', '1050': 'Invisible Woman', '1051': 'The Thing',
  '1052': 'Iron Fist', '1053': 'Emma Frost', '1054': 'Phoenix', '1055': 'Angela',
  '1056': 'Daredevil', '1057': 'Deadpool', '1058': 'Gambit', '1059': 'Elsa Bloodstone',
  '1060': 'White Fox', '1061': 'Black Cat', '1062': 'Devil Dinosaur', '1063': 'Cyclops',
  '1064': 'Jubilee', '1065': 'Rogue', '1066': 'The Hood',
};

const MAPS: Record<number, { name: string; mode: string }> = {
  1032: { name: 'Yggdrasill Path', mode: 'Convoy' },
  1034: { name: 'Shin-Shibuya', mode: 'Convergence' },
  1101: { name: 'Hall of Djalia', mode: 'Convergence' },
  1118: { name: 'Sanctum Sanctorum', mode: 'Doom Match' },
  1148: { name: 'Spider-Islands', mode: 'Convoy' },
  1154: { name: "Odin's Archive", mode: 'Domination' },
  1155: { name: 'Royal Palace', mode: 'Domination' },
  1156: { name: 'Royal Palace', mode: 'Domination' },
  1161: { name: "Birnin T'Challa", mode: 'Domination' },
  1162: { name: "Birnin T'Challa", mode: 'Domination' },
  1169: { name: "Birnin T'Challa", mode: 'Domination' },
  1170: { name: 'Royal Palace', mode: 'Domination' },
  1201: { name: 'Midtown', mode: 'Convoy' },
  1217: { name: 'Central Park', mode: 'Convergence' },
  1230: { name: 'Shin-Shibuya', mode: 'Convergence' },
  1231: { name: 'Yggdrasill Path', mode: 'Convoy' },
  1235: { name: "Birnin T'Challa", mode: 'Domination' },
  1236: { name: 'Royal Palace', mode: 'Domination' },
  1240: { name: 'Klyntar', mode: 'Convergence' },
  1243: { name: 'Hydra Charteris Base', mode: 'Domination' },
  1244: { name: 'Hydra Charteris Base', mode: 'Domination' },
  1245: { name: 'Spider-Islands', mode: 'Convoy' },
  1246: { name: 'Ninomaru', mode: 'Conquest' },
  1254: { name: 'Royal Palace', mode: "Jeff's Winter Splash Festival" },
  1267: { name: 'Hall of Djalia', mode: 'Convergence' },
  1272: { name: "Birnin T'Challa", mode: 'Domination' },
  1273: { name: 'Krakoa', mode: 'Domination' },
  1281: { name: 'Krakoa', mode: 'Domination' },
  1286: { name: 'Arakko', mode: 'Convoy' },
  1287: { name: "Hell's Heaven", mode: 'Domination' },
  1288: { name: "Hell's Heaven", mode: 'Domination' },
  1289: { name: 'Dancing Stage', mode: 'Clash of Dancing Lions' },
  1290: { name: 'Klyntar', mode: 'Convergence' },
  1291: { name: 'Midtown', mode: 'Convoy' },
  1292: { name: 'Central Park', mode: 'Convergence' },
  1294: { name: 'Klyntar', mode: 'Domination' },
  1295: { name: 'Klyntar', mode: 'Domination' },
  1296: { name: 'Klyntar', mode: 'Domination' },
  1302: { name: "Birnin T'Challa", mode: 'Clone Rumble' },
  1304: { name: 'Unknown arena', mode: 'Domination' },
  1307: { name: 'Throne of Knull', mode: 'Resource Rumble' },
  1309: { name: 'Krakoa', mode: 'Domination' },
  1310: { name: 'Krakoa', mode: 'Domination' },
  1311: { name: 'Arakko', mode: 'Convoy' },
  1312: { name: 'Ninomaru', mode: 'Giant-Size Brain Blast' },
  1313: { name: 'Ninomaru', mode: 'Arcade' },
  1314: { name: 'Krakoa', mode: "Ultron's Battle Matrix Protocol" },
  1317: { name: 'Celestial Husk', mode: 'Domination' },
  1318: { name: 'Celestial Husk', mode: 'Domination' },
  1320: { name: 'Throne of Knull', mode: 'Resource Rumble' },
  1321: { name: "Odin's Archive", mode: 'Clone Rumble' },
  1322: { name: 'Ninomaru', mode: 'Conquest (Annihilation)' },
  1371: { name: 'Carousel', mode: 'Clone Rumble' },
  1373: { name: 'Bifrost Garden', mode: 'Clone Rumble' },
  1374: { name: 'Throne Room', mode: 'Clone Rumble' },
  1375: { name: 'The Grove', mode: 'Clone Rumble' },
  1376: { name: 'Stellar Spaceport', mode: 'Clone Rumble' },
  1377: { name: 'Imperial Institute of Science', mode: 'Clone Rumble' },
  1378: { name: 'Celestial Codex', mode: 'Clone Rumble' },
  1379: { name: 'Celestial Vault', mode: 'Clone Rumble' },
  1380: { name: 'Celestial Hand', mode: 'Clone Rumble' },
  1381: { name: 'Warrior Falls', mode: 'Clone Rumble' },
  1382: { name: 'Cradle', mode: 'Clone Rumble' },
  1383: { name: 'Eldritch Monument', mode: 'Clone Rumble' },
  1384: { name: 'Frozen Airfield', mode: 'Clone Rumble' },
  1385: { name: 'Super-Soldier Factory', mode: 'Clone Rumble' },
  1388: { name: 'Shin-Shibuya', mode: 'Free Fight' },
  1389: { name: 'Spider-Islands', mode: 'Free Fight' },
  1391: { name: "Birnin T'Challa", mode: 'Free Fight' },
  1392: { name: "Hell's Heaven", mode: 'Free Fight' },
  1393: { name: 'Symbiotic Surface', mode: 'Free Fight' },
  1394: { name: 'Midtown', mode: 'Free Fight' },
  1395: { name: 'Central Park', mode: 'Free Fight' },
  1396: { name: 'Krakoa', mode: 'Free Fight' },
  1397: { name: 'Arakko', mode: 'Free Fight' },
  1398: { name: 'Celestial Husk', mode: 'Free Fight' },
  1400: { name: 'Yggdrasill Path', mode: 'Free Fight' },
  1401: { name: 'Royal Palace', mode: 'Free Fight' },
  1402: { name: 'Hall of Djalia', mode: 'Free Fight' },
  1403: { name: 'Midtown', mode: 'Marvel Zombies' },
  1404: { name: 'Heart of Heaven', mode: 'Convergence' },
  1405: { name: 'Midtown', mode: 'Marvel Zombies' },
  1411: { name: 'Manhattan', mode: 'Convergence' },
  1413: { name: 'Museum', mode: 'Convoy' },
  1418: { name: 'Museum', mode: 'Convoy' },
  1421: { name: 'Manhattan', mode: 'Convergence' },
  1434: { name: 'Thebes', mode: 'Convoy' },
  2041: { name: 'Heart of Heaven', mode: 'Convergence' },
  2042: { name: 'Heart of Heaven', mode: 'Convergence' },
};

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}

function rows(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.map(object) : [];
}

function number(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function text(value: unknown): string { return value == null ? '' : String(value).trim(); }

function rankName(level?: number): string {
  if (!level || level < 1) return 'Unranked';
  const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Grandmaster', 'Celestial'];
  if (level <= 21) return `${tiers[Math.floor((level - 1) / 3)]} ${3 - ((level - 1) % 3)}`;
  if (level === 22) return 'Eternity';
  return 'One Above All';
}

function slug(value: string): string {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function heroName(id: unknown): string {
  const key = text(id);
  return HERO_NAMES[key] ?? `Hero ${key || 'unknown'}`;
}

function heroIcon(name: string): string {
  return name.startsWith('Hero ') ? '' : `https://rivalsdata.com/assets/heroes/${slug(name)}.webp`;
}

function rankIcon(rank: string): string {
  return rank === 'Unranked' ? '' : `https://rivalsdata.com/assets/ranks/${slug(rank.replace(/\s+[123]$/, ''))}.webp`;
}

function profileIconUrl(icon: unknown): string {
  const value = text(icon);
  return value ? `https://cdn.rivalsdata.com/assets/icons/${encodeURIComponent(value)}.webp` : '';
}

function liveModeName(value: unknown): string | undefined {
  const mode = number(value);
  if (mode === 100) return 'Quick Play';
  if (mode === 200) return 'Competitive';
  if (mode === 300 || mode === 301) return 'Custom Room';
  if (mode === 600) return 'Practice Range';
  return undefined;
}

function elapsedTime(value: unknown): string | undefined {
  const startedAt = number(value);
  if (!startedAt) return undefined;
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000 - startedAt));
  const minutes = Math.floor(elapsed / 60);
  return `${minutes}:${String(elapsed % 60).padStart(2, '0')}`;
}

function liveRankScore(score?: number, level?: number): number | undefined {
  if (score == null || level == null) return undefined;
  if (level < 22) {
    const divisionFloor = 5_100 - (22 - level) * 100;
    const progress = Math.floor(score - divisionFloor);
    return progress < -30 || progress > 100 ? undefined : progress;
  }
  return Math.floor(score - 5_100 + 30);
}

type OverallPeakRank = { rank: string; score?: number; iconUrl?: string };

export function overallPeakRank(profilePayload: unknown): OverallPeakRank | undefined {
  const seasons = Object.values(object(object(profilePayload).rank_game_season)).map(object);
  const peaks = seasons.map((season) => {
    const level = number(season.max_level) ?? number(season.season_max_level) ?? number(season.level);
    const absoluteScore = number(season.max_rank_score) ?? number(season.rank_score);
    return { level, absoluteScore };
  }).filter((peak): peak is { level: number; absoluteScore: number | undefined } => peak.level != null && peak.level > 0);
  const peak = peaks.sort((left, right) => {
    const levelDifference = right.level - left.level;
    return levelDifference || (right.absoluteScore ?? Number.NEGATIVE_INFINITY) - (left.absoluteScore ?? Number.NEGATIVE_INFINITY);
  })[0];
  if (!peak) return undefined;
  const rank = rankName(peak.level);
  if (rank === 'Unranked') return undefined;
  const score = liveRankScore(peak.absoluteScore, peak.level);
  const iconUrl = rankIcon(rank);
  return { rank, ...(score != null ? { score } : {}), ...(iconUrl ? { iconUrl } : {}) };
}

type LivePlayerWithSide = { side: number; partyId?: string; player: LiveMatchPlayer };

function normalizeLivePlayer(entryKey: string, payload: unknown, profilePayload?: unknown): LivePlayerWithSide | undefined {
  const info = object(payload);
  const side = number(info.side);
  if (side == null) return undefined;
  const uid = text(Object.hasOwn(info, 'uid') ? info.uid : entryKey);
  const rank = object(info.rank);
  const profileRank = latestRank(object(profilePayload));
  const peakRank = overallPeakRank(profilePayload);
  const rankLevel = number(profileRank.level) ?? number(rank.level);
  const absoluteRankScore = number(profileRank.rank_score) ?? number(rank.score ?? rank.elo_score);
  const rankLabel = rankName(rankLevel);
  const wins = number(info.wins);
  const losses = number(info.losses);
  const rankedMatches = wins != null && losses != null ? wins + losses : undefined;
  const topHeroes = rows(info.top_heroes).map((hero) => {
    const name = heroName(hero.hero_id);
    const heroWins = number(hero.wins);
    const heroLosses = number(hero.losses);
    const matches = heroWins != null && heroLosses != null ? heroWins + heroLosses : undefined;
    return {
      name,
      ...(heroIcon(name) ? { iconUrl: heroIcon(name) } : {}),
      matches,
      winRate: heroWins != null && matches ? Math.round((heroWins / matches) * 100) : undefined,
    };
  }).filter((hero) => !hero.name.startsWith('Hero '));
  const proficiency = rows(info.proficiency).map((hero) => {
    const name = heroName(hero.hero_id);
    return { name, ...(heroIcon(name) ? { iconUrl: heroIcon(name) } : {}), level: number(hero.level) };
  }).filter((hero) => !hero.name.startsWith('Hero '));
  const icon = text(info.icon);
  const partyId = text(info.team_id) || undefined;
  return {
    side,
    partyId,
    player: {
      uid: uid === 'null' || uid === 'undefined' ? '' : uid,
      name: text(info.name) || (uid ? `Player ${uid}` : 'Hidden player'),
      ...(profileIconUrl(icon) ? { avatarUrl: profileIconUrl(icon) } : {}),
      ...(rankLabel !== 'Unranked' ? { rank: rankLabel, rankIconUrl: rankIcon(rankLabel) } : {}),
      rankScore: liveRankScore(absoluteRankScore, rankLevel),
      ...(peakRank ? {
        peakRank: peakRank.rank,
        peakRankScore: peakRank.score,
        peakRankIconUrl: peakRank.iconUrl,
      } : {}),
      wins,
      losses,
      winRate: wins != null && rankedMatches ? Math.round((wins / rankedMatches) * 100) : undefined,
      heroes: topHeroes.slice(0, 4).map(({ name, iconUrl }) => ({ name, iconUrl })),
      heroStats: topHeroes.slice(0, 10),
      proficiency: proficiency.sort((left, right) => (right.level ?? 0) - (left.level ?? 0)).slice(0, 10),
    },
  };
}

export function normalizeLiveMatchResponse(profile: RivalProfile, profilePayload: unknown, livePayload: unknown, playerProfiles: Record<string, unknown> = {}): LiveMatchSnapshot {
  const status = object(object(profilePayload).status);
  const state = number(status.state);
  if (![6, 10, 12, 13, 14].includes(state ?? -1)) {
    return { status: 'offline', checkedAt: new Date().toISOString(), playerName: profile.inGameName || profile.uid, teams: [] };
  }

  const live = object(livePayload);
  const normalized = Object.entries(object(live.players)).map(([key, value]) => {
    const info = object(value);
    const uid = text(Object.hasOwn(info, 'uid') ? info.uid : key);
    return normalizeLivePlayer(key, value, playerProfiles[uid]);
  }).filter((value): value is LivePlayerWithSide => Boolean(value));
  const partyCounts = new Map<string, number>();
  for (const item of normalized) if (item.partyId) partyCounts.set(item.partyId, (partyCounts.get(item.partyId) ?? 0) + 1);
  for (const item of normalized) item.player.inParty = Boolean(item.partyId && (partyCounts.get(item.partyId) ?? 0) >= 2);

  const currentSide = normalized.find((item) => item.player.uid === profile.uid)?.side;
  const sides = [...new Set(normalized.map((item) => item.side))].sort((left, right) => left - right);
  if (currentSide != null && sides.includes(currentSide)) sides.splice(sides.indexOf(currentSide), 1), sides.unshift(currentSide);
  const averages = object(live.team_avg_rank);
  const teams: LiveMatchTeam[] = sides.map((side, index) => {
    const players = normalized.filter((item) => item.side === side).map((item) => item.player);
    const suppliedAverage = number(averages[String(side)]);
    return {
      name: `Team ${index + 1}`,
      averageRankScore: suppliedAverage ?? undefined,
      players,
    };
  });
  if (teams.length === 2 && teams[0].averageRankScore != null && teams[1].averageRankScore != null) {
    teams[0].projectedChange = Math.round(teams[0].averageRankScore - teams[1].averageRankScore);
    teams[1].projectedChange = -teams[0].projectedChange;
  }
  return {
    status: 'in-game',
    checkedAt: new Date().toISOString(),
    playerName: profile.inGameName || text(object(profilePayload).name) || profile.uid,
    mode: liveModeName(status.game_play_mode_id),
    elapsed: elapsedTime(status.start_time),
    teams,
  };
}

export function rankProgress(score?: number, level?: number): number | undefined {
  if (score == null || !Number.isFinite(score) || level == null || !Number.isInteger(level) || level < 1 || level >= 22) return undefined;
  const divisionFloor = 5_100 - (22 - level) * 100;
  return Math.max(-30, Math.min(100, Math.floor(score - divisionFloor)));
}

function relativeTimestamp(value: unknown): string {
  const timestamp = number(value);
  if (!timestamp) return '';
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function latestRank(profile: JsonObject): JsonObject {
  return Object.values(object(profile.rank_game_season)).map(object)
    .sort((left, right) => (number(right.update_time) ?? 0) - (number(left.update_time) ?? 0))[0] ?? {};
}

function timestampIso(value: unknown): string | null {
  const raw = number(value);
  if (!raw) return null;
  const milliseconds = raw < 10_000_000_000 ? raw * 1000 : raw;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function presence(profile: JsonObject): { presence: PlayerPresence; presenceText: string } {
  const status = object(profile.status);
  const state = number(status.state);
  const mode = number(status.game_play_mode_id);
  if (state === 1) return { presence: 'online', presenceText: 'Online' };
  if (state === 2) return { presence: 'away', presenceText: 'Away' };
  if (state === 3) return { presence: 'away', presenceText: 'Invisible' };
  if (state === 4) {
    const members = number(status.team_member_count);
    const maximum = number(status.max_member);
    return { presence: 'in-team', presenceText: members != null && maximum != null ? `In team (${members}/${maximum})` : 'In team' };
  }
  if (state === 5) return { presence: 'online', presenceText: 'In custom room' };
  if (state === 7) return { presence: 'in-game', presenceText: 'In queue' };
  if (state === 8) return { presence: 'away', presenceText: 'Post-game' };
  if (state === 9) return { presence: 'in-game', presenceText: 'Spectating' };
  if ([6, 10, 12, 13, 14].includes(state ?? -1)) {
    const modeName = mode === 100 ? 'Quick Play' : mode === 200 ? 'Competitive' : mode === 300 || mode === 301 ? 'Custom Room' : mode === 600 ? 'Practice Range' : '';
    return { presence: 'in-game', presenceText: modeName ? `In game (${modeName})` : 'In game' };
  }
  return { presence: 'offline', presenceText: 'Offline' };
}

export function normalizeTrackedPlayer(payload: unknown, fallback: { uid: string; name?: string; icon?: string }, favorite = false): TrackedPlayer {
  const info = object(payload);
  const rank = latestRank(info);
  const uid = text(info.uid) || fallback.uid;
  const name = text(info.name) || fallback.name?.trim() || `Player ${uid}`;
  const icon = text(info.icon) || fallback.icon?.trim();
  const playerPresence = presence(info);
  const rankLevel = number(rank.level);
  const rankScore = number(rank.rank_score);
  return {
    uid,
    name,
    ...(profileIconUrl(icon) ? { iconUrl: profileIconUrl(icon) } : {}),
    level: number(info.level),
    rank: rankName(rankLevel),
    rankScore: rankScore != null ? Math.round(rankScore) : undefined,
    rankProgress: rankProgress(rankScore, rankLevel),
    ...playerPresence,
    lastSeenAt: timestampIso(info.last_seen),
    favorite,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeTopSnipers(payload: unknown): TopSniperPlayer[] {
  return rows(object(payload).players).map((entry) => {
    const uid = text(entry.uid);
    const name = text(entry.name) || `Player ${uid}`;
    const icon = text(entry.icon);
    const rankLevel = number(entry.rank_level);
    const score = number(entry.rank_score);
    const wins = number(entry.wins);
    const losses = number(entry.losses);
    const matches = (wins ?? 0) + (losses ?? 0);
    const playerPresence = presence({ status: entry.status });
    return {
      uid,
      name,
      ...(profileIconUrl(icon) ? { iconUrl: profileIconUrl(icon) } : {}),
      rank: rankName(rankLevel),
      rankScore: score != null ? Math.round(score) : undefined,
      rankProgress: rankProgress(score, rankLevel),
      ...playerPresence,
      lastSeenAt: null,
      favorite: false,
      updatedAt: new Date().toISOString(),
      leaderboardPosition: Math.round(number(entry.position) ?? 0),
      wins,
      losses,
      winRate: matches ? Math.round(((wins ?? 0) / matches) * 1000) / 10 : undefined,
    };
  }).filter((player) => /^\d+$/.test(player.uid) && player.leaderboardPosition >= 1 && player.leaderboardPosition <= 1000)
    .filter((player) => player.presence === 'in-game' || player.presence === 'in-team' || player.presence === 'online')
    .sort((left, right) => {
      const group = (player: TopSniperPlayer) => /^in queue$/i.test(player.presenceText) ? 0 : player.presence === 'in-game' ? 1 : 2;
      return group(left) - group(right) || left.leaderboardPosition - right.leaderboardPosition;
    });
}

function normalizeHeroes(payload: unknown): HeroPerformance[] {
  return rows(payload).map((hero) => {
    const name = heroName(hero.hero_id);
    const wins = number(hero.wins);
    const losses = number(hero.losses);
    const matches = number(hero.games) ?? (wins != null && losses != null ? wins + losses : undefined);
    return {
      name,
      ...(heroIcon(name) ? { iconUrl: heroIcon(name) } : {}),
      kda: number(hero.kda),
      winRate: wins != null && matches ? Math.round((wins / matches) * 1000) / 10 : undefined,
      wins,
      losses,
      matches,
    };
  }).filter((hero) => hero.matches).sort((left, right) => (right.matches ?? 0) - (left.matches ?? 0));
}

function normalizeProficiency(payload: unknown): HeroProficiency[] {
  const root = object(payload);
  const container = Object.values(root).map(object).find((value) => Object.keys(object(value.hero_proficiency_infos)).length);
  return Object.entries(object(container?.hero_proficiency_infos)).map(([id, value]) => {
    const info = object(value);
    const name = heroName(id);
    return { name, ...(heroIcon(name) ? { iconUrl: heroIcon(name) } : {}), level: number(info.proficiency_level) };
  }).filter((hero) => (hero.level ?? 0) > 1 && !hero.name.startsWith('Hero '))
    .sort((left, right) => (right.level ?? 0) - (left.level ?? 0)).slice(0, 12);
}

function normalizeMatches(payload: unknown): MatchSummary[] {
  return rows(object(payload).matches).slice(0, 20).map((match) => {
    const name = heroName(match.hero_id);
    const playerScore = number(object(match.team_score).player);
    const opponentScore = number(object(match.team_score).opponent);
    const kills = number(match.kills);
    const deaths = number(match.deaths);
    const assists = number(match.assists);
    const playedAt = timestampIso(match.timestamp);
    const rankScore = number(match.rank_score) != null ? Math.round(number(match.rank_score) as number) : undefined;
    const mapId = number(match.map_id);
    const map = mapId == null ? undefined : MAPS[mapId];
    const platformId = number(match.platform) ?? number(match.os);
    return {
      matchId: text(match.match_uid) || undefined,
      mode: number(match.game_mode_id) === 2 || number(match.game_play_mode_id) === 200 ? 'Competitive' : number(match.game_mode_id) === 1 || number(match.game_play_mode_id) === 100 ? 'Quick Play' : 'Match',
      timeAgo: relativeTimestamp(match.timestamp),
      playedAt: playedAt ?? undefined,
      result: typeof match.is_win === 'boolean' ? (match.is_win ? 'win' : 'loss') : undefined,
      score: playerScore != null && opponentScore != null ? `${playerScore}:${opponentScore}` : undefined,
      scoreChange: number(match.score_change) != null ? Math.round(number(match.score_change) as number) : undefined,
      hero: name,
      ...(heroIcon(name) ? { heroIconUrl: heroIcon(name) } : {}),
      rank: rankName(number(match.rank_level)),
      rankScore,
      rankProgress: rankProgress(number(match.rank_score), number(match.rank_level)),
      kills,
      deaths,
      assists,
      kda: deaths ? Math.round((((kills ?? 0) + (assists ?? 0)) / deaths) * 100) / 100 : undefined,
      placement: match.is_mvp ? 'MVP' : match.is_svp ? 'SVP' : undefined,
      map: map?.name,
      mapId,
      mapMode: map?.mode,
      season: number(match.season),
      platform: platformId === 1 ? 'PC' : platformId != null ? `Platform ${platformId}` : undefined,
      placementRank: number(match.placement),
    };
  });
}

function normalizePunishments(payload: unknown): PlayerPunishment[] {
  const source = object(payload);
  const labels: Record<PlayerPunishment['kind'], string> = { chat: 'Chat restriction', login: 'Account suspension', rank: 'Competitive restriction' };
  return (Object.keys(labels) as PlayerPunishment['kind'][]).map((kind) => {
    const raw = source[kind];
    const info = object(raw);
    const startTimestamp = number(info.time ?? info.start_time ?? info.started_at ?? info.create_time);
    const startsAt = timestampIso(startTimestamp);
    const durationSeconds = number(info.expire);
    const expiresAt = timestampIso(info.end_time ?? info.expire_time ?? info.expires_at)
      ?? (startTimestamp != null && durationSeconds != null && durationSeconds > 0 ? timestampIso(startTimestamp + durationSeconds) : null);
    const explicitActive = typeof info.active === 'boolean' ? info.active : typeof info.is_active === 'boolean' ? info.is_active : undefined;
    const expired = raw != null && expiresAt != null && Date.parse(expiresAt) <= Date.now();
    const active = raw != null && !expired && (explicitActive ?? true);
    const reason = text(info.reason ?? info.ban_reason ?? info.description ?? info.desc) || undefined;
    const ignored = new Set(['active', 'is_active', 'time', 'expire', 'start_time', 'started_at', 'create_time', 'end_time', 'expire_time', 'expires_at', 'reason', 'ban_reason', 'description', 'desc']);
    const details = Object.entries(info).filter(([key, value]) => !ignored.has(key) && ['string', 'number', 'boolean'].includes(typeof value))
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value)}`).slice(0, 4);
    return { kind, label: labels[kind], active, expired, ...(reason ? { reason } : {}), startsAt, expiresAt, ...(details.length ? { details } : {}) };
  });
}

function normalizeNameHistory(payload: unknown): PlayerNameHistoryEntry[] {
  return rows(payload).map((entry) => ({ name: text(entry.name), firstSeenAt: timestampIso(entry.first_seen ?? entry.timestamp) }))
    .filter((entry) => entry.name).sort((left, right) => (right.firstSeenAt ?? '').localeCompare(left.firstSeenAt ?? '')).slice(0, 20);
}

function normalizeTeammates(payload: unknown): FrequentTeammate[] {
  return rows(payload).map((entry) => {
    const matches = number(entry.games);
    const wins = number(entry.wins);
    const losses = number(entry.losses);
    const icon = text(entry.icon);
    return {
      uid: text(entry.teammate_uid ?? entry.uid),
      name: text(entry.name) || 'Unknown player',
      ...(profileIconUrl(icon) ? { iconUrl: profileIconUrl(icon) } : {}),
      matches,
      wins,
      losses,
      winRate: wins != null && matches ? Math.round((wins / matches) * 1000) / 10 : undefined,
    };
  }).filter((entry) => entry.uid || entry.name !== 'Unknown player').sort((left, right) => (right.matches ?? 0) - (left.matches ?? 0)).slice(0, 12);
}

function normalizeCrosshairs(payload: unknown): SharedCrosshair[] {
  return rows(payload).map((entry) => ({ code: text(entry.crosshair ?? entry.code), uses: number(entry.uses) }))
    .filter((entry) => entry.code).sort((left, right) => (right.uses ?? 0) - (left.uses ?? 0)).slice(0, 8);
}

export function normalizeSkins(payload: unknown): PlayerSkin[] {
  const root = object(payload);
  const collection = root.skins ?? root.items ?? root.inventory ?? root.data ?? payload;
  const entries = Array.isArray(collection)
    ? collection.map((value) => ['', object(value)] as const)
    : Object.entries(object(collection)).map(([key, value]) => [key, object(value)] as const);
  return entries.map(([key, entry]) => {
    const id = text(entry.skin_id ?? entry.costume_id ?? entry.item_id ?? entry.id ?? key) || undefined;
    const name = text(entry.skin_name ?? entry.costume_name ?? entry.item_name ?? entry.name ?? entry.title);
    const heroId = entry.hero_id ?? entry.character_id;
    const hero = text(entry.hero_name ?? entry.character_name) || (heroId != null ? heroName(heroId) : '');
    const image = text(entry.icon_url ?? entry.image_url ?? entry.image ?? entry.icon ?? entry.thumbnail)
      || (id ? `https://cdn.rivalsdata.com/assets/skins/icon/${encodeURIComponent(id)}.webp` : '');
    const iconUrl = image
      ? (/^https?:\/\//i.test(image) ? image : new URL(image, 'https://rivalsdata.com').href)
      : undefined;
    return {
      ...(id ? { id } : {}),
      name,
      ...(hero && !hero.startsWith('Hero ') ? { hero } : {}),
      ...(iconUrl ? { iconUrl } : {}),
      ...(text(entry.rarity ?? entry.quality ?? entry.grade) ? { rarity: text(entry.rarity ?? entry.quality ?? entry.grade) } : {}),
      ...(number(entry.value ?? entry.units ?? entry.price ?? entry.cost) != null ? { value: number(entry.value ?? entry.units ?? entry.price ?? entry.cost) } : {}),
      ...(text(entry.category) ? { category: text(entry.category) } : {}),
      ...(text(entry.source) ? { source: text(entry.source) } : {}),
      ...(entry.equipped === true ? { equipped: true } : {}),
    };
  }).filter((skin) => skin.name).filter((skin, index, all) => all.findIndex((candidate) => (candidate.id && skin.id ? candidate.id === skin.id : `${candidate.hero}|${candidate.name}` === `${skin.hero}|${skin.name}`)) === index);
}

function isCloudflareChallenge(status: number, headers: Headers, data: unknown): boolean {
  if (headers.get('cf-mitigated')?.toLowerCase() === 'challenge') return true;
  if (status < 400) return false;
  const challengeText = typeof data === 'string'
    ? data
    : data && typeof data === 'object'
      ? JSON.stringify(data)
      : '';
  return /(?:Just a moment|cdn-cgi\/challenge-platform|cf_chl_opt|turnstile(?: verification)? required)/i.test(challengeText);
}

export function createElectronTransport(
  chromiumSession: Pick<Session, 'fetch'>,
  challengeTransport?: RivalsDataTransport,
): RivalsDataTransport {
  let useChallengeTransport = false;
  const runChallengeTransport = async (request: Parameters<RivalsDataTransport>[0]) => {
    try {
      return await challengeTransport!(request);
    } catch (error) {
      if (request.signal.aborted) throw request.signal.reason;
      return {
        status: 503,
        data: { error: error instanceof Error ? error.message : 'Rivals Data verification failed.' },
      };
    }
  };
  return async (request) => {
    if (useChallengeTransport && challengeTransport) return runChallengeTransport(request);
    const response = await chromiumSession.fetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.method === 'POST' ? { body: JSON.stringify(request.body ?? {}) } : {}),
      signal: request.signal,
      credentials: 'include',
    });
    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');
    if (challengeTransport && isCloudflareChallenge(response.status, response.headers, data)) {
      useChallengeTransport = true;
      return runChallengeTransport(request);
    }
    if (response.ok && !contentType.includes('application/json')) {
      return { status: 502, data: { error: 'Rivals Data returned a non-JSON response.' } };
    }
    return { status: response.status, data, headers: Object.fromEntries(response.headers.entries()) };
  };
}

class RivalsDataBrowserTransport {
  private window: BrowserWindow | null = null;
  private ready: Promise<BrowserWindow> | null = null;

  constructor(private readonly chromiumSession: Session) {}

  private async createWindow(): Promise<BrowserWindow> {
    const browser = new BrowserWindow({
      show: false,
      width: 560,
      height: 700,
      minWidth: 460,
      minHeight: 560,
      title: 'Rival Shift · Verify Rivals Data',
      autoHideMenuBar: true,
      webPreferences: {
        session: this.chromiumSession,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    browser.setSkipTaskbar(true);
    browser.webContents.on('page-title-updated', (event) => {
      event.preventDefault();
      browser.setTitle('Rival Shift · Verify Rivals Data');
    });
    browser.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    browser.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== 'https://api.rivalsdata.com') event.preventDefault();
    });
    browser.on('closed', () => {
      if (this.window === browser) this.window = null;
      this.ready = null;
    });
    this.window = browser;
    await browser.loadURL('https://api.rivalsdata.com/').catch(() => undefined);

    let verificationShown = false;
    const showVerificationAt = Date.now() + 750;
    const deadline = Date.now() + 120_000;
    while (!browser.isDestroyed() && Date.now() < deadline) {
      let title = '';
      let cookies: Awaited<ReturnType<Session['cookies']['get']>> = [];
      try {
        title = browser.webContents.getTitle();
        cookies = await this.chromiumSession.cookies.get({ url: 'https://api.rivalsdata.com/' });
      } catch {
        if (browser.isDestroyed()) break;
        throw new Error('Rivals Data verification could not read the browser session. Try again.');
      }
      if (!/just a moment/i.test(title) && cookies.some((cookie) => cookie.name === 'cf_clearance')) {
        if (browser.isVisible()) browser.hide();
        return browser;
      }
      if (!verificationShown && Date.now() >= showVerificationAt) {
        verificationShown = true;
        browser.setSkipTaskbar(false);
        browser.center();
        browser.setAlwaysOnTop(true, 'floating');
        browser.show();
        browser.focus();
        setTimeout(() => {
          if (!browser.isDestroyed()) browser.setAlwaysOnTop(false);
        }, 1_500);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!browser.isDestroyed()) browser.destroy();
    throw new Error(verificationShown
      ? 'Rivals Data verification was closed or timed out. Try again and finish the verification prompt, or use the browser extension connection.'
      : 'Rivals Data browser verification could not open. Try the browser extension connection instead.');
  }

  private ensureWindow(): Promise<BrowserWindow> {
    if (this.window && !this.window.isDestroyed() && this.ready) return this.ready;
    this.ready = this.createWindow().catch((error) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  private async execute(browser: BrowserWindow, request: Parameters<RivalsDataTransport>[0]): Promise<Awaited<ReturnType<RivalsDataTransport>>> {
    const script = `fetch(${JSON.stringify(request.url)}, {
      method: ${JSON.stringify(request.method)},
      headers: ${JSON.stringify(request.headers)},
      ${request.method === 'POST' ? `body: ${JSON.stringify(JSON.stringify(request.body ?? {}))},` : ''}
      credentials: 'include'
    }).then(async (response) => {
      const contentType = response.headers.get('content-type') || '';
      const bodyText = await response.text();
      let data = bodyText;
      if (contentType.includes('application/json')) {
        try { data = JSON.parse(bodyText); } catch { data = null; }
      }
      return { status: response.status, data, headers: Object.fromEntries(response.headers.entries()) };
    })`;
    return browser.webContents.executeJavaScript(script, true);
  }

  async request(request: Parameters<RivalsDataTransport>[0]): Promise<Awaited<ReturnType<RivalsDataTransport>>> {
    if (request.signal.aborted) throw request.signal.reason;
    let browser = await this.ensureWindow();
    if (request.signal.aborted) throw request.signal.reason;
    let response = await this.execute(browser, request);
    if (isCloudflareChallenge(response.status, new Headers(response.headers), response.data)) {
      browser.destroy();
      browser = await this.ensureWindow();
      if (request.signal.aborted) throw request.signal.reason;
      response = await this.execute(browser, request);
    }
    return response;
  }
}

export function createChallengeAwareElectronTransport(chromiumSession: Session): RivalsDataTransport {
  const browserTransport = new RivalsDataBrowserTransport(chromiumSession);
  return createElectronTransport(chromiumSession, (request) => browserTransport.request(request));
}

export function normalizeRivalsDataResponses(
  profile: RivalProfile,
  profilePayload: unknown,
  heroesPayload: unknown,
  proficiencyPayload: unknown,
  matchesPayload: unknown,
  punishmentsPayload?: unknown,
  nameHistoryPayload?: unknown,
  teammatesPayload?: unknown,
  crosshairsPayload?: unknown,
  skinsPayload?: unknown,
): RivalProfile {
  const info = object(profilePayload);
  const rank = latestRank(info);
  const wins = number(rank.win_count);
  const matches = number(rank.battle_count);
  const losses = wins != null && matches != null ? Math.max(0, matches - wins) : undefined;
  const rankLevel = number(rank.level);
  const heroStats = normalizeHeroes(heroesPayload);
  const proficiency = normalizeProficiency(proficiencyPayload);
  const matchHistory = normalizeMatches(matchesPayload);
  const punishments = normalizePunishments(punishmentsPayload);
  const nameHistory = normalizeNameHistory(nameHistoryPayload);
  const teammates = normalizeTeammates(teammatesPayload);
  const crosshairs = normalizeCrosshairs(crosshairsPayload);
  const skins = normalizeSkins(skinsPayload);
  const skinsRoot = object(skinsPayload);
  const eventSkins = object(skinsRoot.event_skins);
  const skinInventoryValue = number(skinsRoot.units_value) ?? skins.reduce((total, skin) => total + (skin.value ?? 0), 0);
  const eventSkinsOwned = number(eventSkins.owned) ?? skins.filter((skin) => /event/i.test(`${skin.category ?? ''} ${skin.source ?? ''}`)).length;
  const eventSkinsTotal = number(eventSkins.total);
  const heroIcons = Object.fromEntries([...heroStats, ...proficiency]
    .filter((hero) => hero.iconUrl).map((hero) => [hero.name, hero.iconUrl as string]));
  const currentRank = rankName(rankLevel);
  const currentRankScoreRaw = number(rank.rank_score);
  const currentRankScore = currentRankScoreRaw != null ? Math.round(currentRankScoreRaw) : undefined;
  const currentRankProgress = rankProgress(currentRankScoreRaw, rankLevel);
  const currentRankIcon = rankIcon(currentRank);
  const peakRank = overallPeakRank(info);
  const faction = object(info.faction);
  const leaderboard = object(info.leaderboard);
  const leaderboardValue = number(leaderboard[String(number(rank.rank_game_id) ?? '')]) ?? Object.values(leaderboard).map(number).find((value) => value != null);
  const profileIcon = text(info.icon);
  return {
    ...profile,
    uid: text(info.uid) || profile.uid,
    inGameName: profile.inGameName || text(info.name),
    updatedAt: new Date().toISOString(),
    status: 'synced',
    error: undefined,
    stats: {
      ...profile.stats,
      level: number(info.level),
      rank: currentRank,
      rankScore: currentRankScore,
      rankProgress: currentRankProgress,
      rankProgressMax: currentRankProgress != null ? 100 : undefined,
      peakRank: peakRank?.rank,
      peakRankScore: peakRank?.score,
      peakRankIconUrl: peakRank?.iconUrl,
      leaderboardRank: leaderboardValue != null ? `#${Math.round(leaderboardValue).toLocaleString('en-US')}` : undefined,
      winRate: wins != null && matches ? Math.round((wins / matches) * 1000) / 10 : undefined,
      wins,
      losses,
      matches,
      heroes: heroStats.slice(0, 6).map((hero) => hero.name),
      heroIcons,
      heroStats,
      proficiency,
      matchHistory,
      punishments,
      nameHistory,
      teammates,
      crosshairs,
      skins,
      skinInventoryValue,
      eventSkinsOwned,
      eventSkinsTotal,
      factionName: text(faction.name) || undefined,
      matchHistoryVisible: number(info.match_history_is_visible) === 1,
      lastSeenAt: timestampIso(info.last_seen),
      profileIconUrl: profileIconUrl(profileIcon) || undefined,
      rankIconUrl: currentRankIcon || undefined,
      rankIconRemoteUrl: currentRankIcon || undefined,
      syncedAt: new Date().toISOString(),
      source: 'Rivals Data via SDK API',
    },
  };
}

export class RivalsDataApi {
  private readonly client: Promise<RivalsDataClientLike>;
  private readonly transport: RivalsDataTransport;

  constructor(chromiumSession: Session = session.fromPartition('persist:rival-shift-rivals-data-api')) {
    this.transport = createChallengeAwareElectronTransport(chromiumSession);
    this.client = import('rivalsdata-player-sdk').then(({ RivalsDataClient: Client }) => new Client({
      transport: this.transport,
      timeoutMs: 30_000,
      cacheTtlMs: 30_000,
      allowFreshMatches: true,
    }));
  }

  async refresh(profile: RivalProfile): Promise<RivalProfile> {
    const uid = profile.uid.trim();
    if (!/^\d+$/.test(uid)) throw new Error('Add a valid Marvel Rivals UID before using the SDK API.');
    const client = await this.client;
    client.clearCache();
    const optional = async (request: Promise<unknown>, fallback: unknown) => request.catch(() => fallback);
    // Rivals Data's website refreshes upstream with POST /player { uid } first.
    // Only use prefer_cache when that fresh request is unavailable.
    const player = await client.refreshPlayer(uid).catch(() => client.getPlayer(uid, { preferCache: true }));
    const [heroes, proficiency, matches, punishments, nameHistory, teammates, crosshairs, skins] = await Promise.all([
      client.getPlayerHeroes(uid),
      client.getPlayerProficiency(uid),
      client.getPlayerMatches(uid, { fresh: true }).catch(() => client.getPlayerMatches(uid)),
      optional(client.getPlayerPunishments(uid), {}),
      optional(client.getPlayerNameHistory(uid), []),
      optional(client.getPlayerTeammates(uid), []),
      optional(client.getPlayerCrosshairs(uid), []),
      client.getPlayerSkins(uid),
    ]);
    return normalizeRivalsDataResponses(profile, player, heroes, proficiency, matches, punishments, nameHistory, teammates, crosshairs, skins);
  }

  async liveMatch(profile: RivalProfile, forceRefresh = false): Promise<LiveMatchSnapshot> {
    const uid = profile.uid.trim();
    if (!/^\d+$/.test(uid)) throw new Error('Add a valid Marvel Rivals UID before checking a live match.');
    const client = await this.client;
    if (forceRefresh) client.clearCache();
    const player = forceRefresh
      ? await client.refreshPlayer(uid).catch(() => client.getPlayer(uid, { preferCache: true }))
      : await client.getPlayer(uid, { preferCache: true });
    const status = object(object(player).status);
    const state = number(status.state);
    if (![6, 10, 12, 13, 14].includes(state ?? -1)) return normalizeLiveMatchResponse(profile, player, {});

    const deadline = Date.now() + 90_000;
    while (true) {
      try {
        const live = await client.getLiveMatch(uid);
        const livePlayers = object(object(live).players);
        const publicUids = [...new Set(Object.entries(livePlayers).map(([key, value]) => {
          const info = object(value);
          const candidate = text(Object.hasOwn(info, 'uid') ? info.uid : key);
          return /^\d+$/.test(candidate) ? candidate : '';
        }).filter(Boolean))];
        const profiles = Object.fromEntries(await Promise.all(publicUids.map(async (playerUid) => [
          playerUid,
          playerUid === uid ? player : await client.getPlayer(playerUid, { preferCache: true }).catch(() => undefined),
        ] as const)));
        return normalizeLiveMatchResponse(profile, player, live, profiles);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/match still loading/i.test(message) || Date.now() + 10_000 >= deadline) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
    }
  }

  private async trackedPlayer(uid: string, fallback: { uid: string; name?: string; icon?: string }, favorite = false): Promise<TrackedPlayer> {
    const client = await this.client;
    try { return normalizeTrackedPlayer(await client.refreshPlayer(uid), fallback, favorite); }
    catch { return normalizeTrackedPlayer(await client.getPlayer(uid, { preferCache: true }), fallback, favorite); }
  }

  async searchPlayers(query: string): Promise<TrackedPlayer[]> {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) throw new Error('Enter at least two characters or a complete Marvel Rivals UID.');
    const client = await this.client;
    const hits = /^\d+$/.test(cleanQuery)
      ? [{ uid: cleanQuery }]
      : rows(await client.searchPlayers(cleanQuery));
    const candidates = hits.map((hit) => {
      const uid = text(hit.uid) || text(hit.aid).match(/_(\d+)$/)?.[1] || '';
      return { uid, name: text(hit.name), icon: text(object(hit.config_server).cur_head_icon_id) };
    }).filter((hit) => /^\d+$/.test(hit.uid));
    const unique = [...new Map(candidates.map((hit) => [hit.uid, hit])).values()].slice(0, 10);
    return Promise.all(unique.map(async (hit) => {
      try { return await this.trackedPlayer(hit.uid, hit); }
      catch { return normalizeTrackedPlayer({}, hit); }
    }));
  }

  async topSnipers(): Promise<TopSniperPlayer[]> {
    const response = await this.transport({
      url: 'https://api.rivalsdata.com/leaderboards?limit=1000&os=1',
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: new AbortController().signal,
    });
    if (response.status < 200 || response.status >= 300) {
      const detail = text(object(response.data).error) || `HTTP ${response.status}`;
      throw new Error(`Could not load the Rivals Data leaderboard (${detail}).`);
    }
    return normalizeTopSnipers(response.data);
  }

  async refreshTrackedPlayers(players: TrackedPlayer[]): Promise<TrackedPlayer[]> {
    return Promise.all(players.map(async (player) => {
      try { return await this.trackedPlayer(player.uid, player, true); }
      catch { return { ...player, favorite: true }; }
    }));
  }

  async refreshPostMatchPlayers(players: Array<Pick<TrackedPlayer, 'uid' | 'name'>>): Promise<TrackedPlayer[]> {
    const unique = [...new Map(players
      .filter((player) => /^\d+$/.test(player.uid.trim()))
      .map((player) => [player.uid.trim(), { uid: player.uid.trim(), name: player.name.trim() || `Player ${player.uid.trim()}` }])).values()];
    return Promise.all(unique.map(async (player) => {
      try { return await this.trackedPlayer(player.uid, player); }
      catch { return normalizeTrackedPlayer({}, player); }
    }));
  }
}
