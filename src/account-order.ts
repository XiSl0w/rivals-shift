import type { RivalProfile, SteamAccount } from './types';

export type AccountSort = 'rank-desc' | 'rank-asc' | 'favorites' | 'recent' | 'win-rate' | 'level' | 'name';
export type RankFilter = 'all' | 'ranked' | 'unranked' | string;

const RANK_TIERS = [
  'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Grandmaster', 'Celestial', 'Eternity', 'One Above All',
] as const;

const RANK_ALIASES = new Map(RANK_TIERS.map((tier) => [tier.toLowerCase(), tier]));

export function rankTier(rank?: string): string | null {
  const normalized = rank?.trim().replace(/\s+/g, ' ') ?? '';
  if (!normalized) return null;
  for (const [key, tier] of RANK_ALIASES) {
    if (normalized.toLowerCase() === key || normalized.toLowerCase().startsWith(`${key} `)) return tier;
  }
  return null;
}

export function rankOrder(rank?: string): number | null {
  const tier = rankTier(rank);
  if (!tier) return null;
  const tierIndex = RANK_TIERS.indexOf(tier as (typeof RANK_TIERS)[number]);
  const divisionText = rank?.trim().match(/\s+(I{1,3}|[123])$/i)?.[1]?.toUpperCase();
  const division = divisionText === 'I' ? 1 : divisionText === 'II' ? 2 : divisionText === 'III' ? 3 : Number(divisionText);
  const divisionScore = Number.isFinite(division) && division >= 1 && division <= 3 ? 4 - division : 0;
  return (tierIndex + 1) * 100 + divisionScore;
}

export function accountMatchesRankFilter(profile: RivalProfile | undefined, filter: RankFilter): boolean {
  const tier = rankTier(profile?.stats?.rank);
  if (filter === 'all') return true;
  if (filter === 'ranked') return tier !== null;
  if (filter === 'unranked') return tier === null;
  return tier === filter;
}

function newestFirst(a: SteamAccount, b: SteamAccount) {
  return new Date(b.lastLogin ?? 0).getTime() - new Date(a.lastLogin ?? 0).getTime();
}

export function sortAccounts(accounts: SteamAccount[], profiles: Record<string, RivalProfile>, sort: AccountSort): SteamAccount[] {
  const favoriteFirst = (a: SteamAccount, b: SteamAccount) => Number(Boolean(profiles[b.steamId64]?.favorite)) - Number(Boolean(profiles[a.steamId64]?.favorite));
  const nameOrder = (a: SteamAccount, b: SteamAccount) => {
    const aName = profiles[a.steamId64]?.inGameName || a.personaName || a.accountName;
    const bName = profiles[b.steamId64]?.inGameName || b.personaName || b.accountName;
    return aName.localeCompare(bName, undefined, { sensitivity: 'base', numeric: true });
  };
  const numericWithMissingLast = (aValue: number | null | undefined, bValue: number | null | undefined, direction: 1 | -1) => {
    const aMissing = aValue == null || !Number.isFinite(aValue);
    const bMissing = bValue == null || !Number.isFinite(bValue);
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    if (aMissing || bMissing) return 0;
    return (aValue - bValue) * direction;
  };

  return [...accounts].sort((a, b) => {
    const currentSessionFirst = Number(Boolean(b.currentSession)) - Number(Boolean(a.currentSession));
    if (currentSessionFirst) return currentSessionFirst;
    const aProfile = profiles[a.steamId64];
    const bProfile = profiles[b.steamId64];
    let primary = 0;
    if (sort === 'rank-desc') {
      primary = numericWithMissingLast(rankOrder(aProfile?.stats?.rank), rankOrder(bProfile?.stats?.rank), -1);
      if (!primary) primary = numericWithMissingLast(aProfile?.stats?.rankScore ?? aProfile?.stats?.rankProgress, bProfile?.stats?.rankScore ?? bProfile?.stats?.rankProgress, -1);
    }
    else if (sort === 'rank-asc') {
      primary = numericWithMissingLast(rankOrder(aProfile?.stats?.rank), rankOrder(bProfile?.stats?.rank), 1);
      if (!primary) primary = numericWithMissingLast(aProfile?.stats?.rankScore ?? aProfile?.stats?.rankProgress, bProfile?.stats?.rankScore ?? bProfile?.stats?.rankProgress, 1);
    }
    else if (sort === 'win-rate') primary = numericWithMissingLast(aProfile?.stats?.winRate, bProfile?.stats?.winRate, -1);
    else if (sort === 'level') primary = numericWithMissingLast(aProfile?.stats?.level, bProfile?.stats?.level, -1);
    else if (sort === 'recent') primary = newestFirst(a, b);
    else if (sort === 'favorites') primary = favoriteFirst(a, b);
    else primary = nameOrder(a, b);
    return primary || favoriteFirst(a, b) || nameOrder(a, b);
  });
}

export function rankFilterOptions(profiles: Record<string, RivalProfile>): string[] {
  return [...new Set(Object.values(profiles).map((profile) => rankTier(profile.stats?.rank)).filter((tier): tier is string => Boolean(tier)))]
    .sort((a, b) => (rankOrder(b) ?? 0) - (rankOrder(a) ?? 0));
}
