import type { LiveMatchSnapshot, TrackedPlayer } from './types';

export function isMaskedLiveName(name: string): boolean {
  return /^\*+\d+$/.test(name.trim());
}

export function hasMaskedLivePlayerNames(snapshot: LiveMatchSnapshot | null): boolean {
  return snapshot?.status === 'in-game' && snapshot.teams.some((team) => team.players.some((player) => isMaskedLiveName(player.name)));
}

export function postMatchSourcePlayers(snapshot: LiveMatchSnapshot | null): Array<Pick<TrackedPlayer, 'uid' | 'name'>> {
  if (snapshot?.status !== 'in-game') return [];
  const unique = new Map<string, Pick<TrackedPlayer, 'uid' | 'name'>>();
  for (const player of snapshot.teams.flatMap((team) => team.players)) {
    const uid = player.uid.trim();
    if (!/^\d+$/.test(uid) || unique.has(uid)) continue;
    unique.set(uid, { uid, name: player.name.trim() || `Player ${uid}` });
  }
  return [...unique.values()];
}

export function selectedPostMatchSourcePlayers(snapshot: LiveMatchSnapshot | null, selectedUids: Iterable<string>): Array<Pick<TrackedPlayer, 'uid' | 'name'>> {
  const selected = new Set(selectedUids);
  return postMatchSourcePlayers(snapshot).filter((player) => selected.has(player.uid));
}
