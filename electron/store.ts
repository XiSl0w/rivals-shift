import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { AppPreferences, RankHistoryPoint, RivalProfile, TrackedPlayer } from './types';

const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'nebula',
  rivalsDataMode: 'api',
  discordRichPresence: true,
  quickSwitchShortcut: false,
  quickAccessShortcut: 'CommandOrControl+Shift+R',
  closeAction: 'ask',
  matchNotifications: true,
  backgroundMonitoring: false,
  skipLauncher: false,
  directLaunchReminder: true,
  autoUpdates: true,
  startupMode: 'off',
};

type StoreShape = {
  profiles: Record<string, RivalProfile>;
  favoritePlayers?: Record<string, TrackedPlayer>;
  settings?: { preferences?: Partial<AppPreferences> };
  steamRoot?: string;
};

export class ProfileStore {
  private readonly file: string;
  private readonly preferencesBackup: string;
  private mutationQueue: Promise<void> = Promise.resolve();
  constructor(userData: string) {
    this.file = path.join(userData, 'rival-shift.json');
    this.preferencesBackup = path.join(userData, 'rival-shift.preferences.bak.json');
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async read(): Promise<StoreShape> {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8')) as StoreShape;
      for (const profile of Object.values(data.profiles ?? {})) {
        if (/performing security verification|just a moment/i.test(profile.inGameName)) {
          profile.inGameName = '';
          profile.status = 'linked';
          profile.error = undefined;
          profile.stats = undefined;
        }
      }
      return { ...data, profiles: data.profiles ?? {} };
    }
    catch { return { profiles: {} }; }
  }

  private async write(data: StoreShape): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
    await rename(temporary, this.file);
  }

  async profiles(): Promise<Record<string, RivalProfile>> { return (await this.read()).profiles; }
  async favoritePlayers(): Promise<TrackedPlayer[]> { return Object.values((await this.read()).favoritePlayers ?? {}); }
  path(): string { return this.file; }
  async get(steamId64: string): Promise<RivalProfile | undefined> { return (await this.read()).profiles[steamId64]; }
  async save(profile: RivalProfile): Promise<RivalProfile> {
    return this.mutate(async () => {
      const data = await this.read();
      const previous = data.profiles[profile.steamId64];
      const history = [...(previous?.rankHistory ?? profile.rankHistory ?? [])];
      if (profile.stats?.syncedAt && (!history.length || history.at(-1)?.at !== profile.stats.syncedAt)) {
        const point: RankHistoryPoint = {
          at: profile.stats.syncedAt,
          rank: profile.stats.rank,
          rankScore: profile.stats.rankScore,
          rankProgress: profile.stats.rankProgress,
          winRate: profile.stats.winRate,
          wins: profile.stats.wins,
          losses: profile.stats.losses,
          matches: profile.stats.matches,
        };
        const last = history.at(-1);
        if (!last || JSON.stringify({ ...last, at: '' }) !== JSON.stringify({ ...point, at: '' })) history.push(point);
      }
      const saved = { ...profile, rankHistory: history.slice(-120) };
      data.profiles[profile.steamId64] = saved;
      await this.write(data);
      return saved;
    });
  }
  async remove(steamId64: string): Promise<void> {
    return this.mutate(async () => {
      const data = await this.read();
      delete data.profiles[steamId64];
      await this.write(data);
    });
  }
  async saveFavoritePlayer(player: TrackedPlayer): Promise<TrackedPlayer[]> {
    return this.mutate(async () => {
      const data = await this.read();
      data.favoritePlayers = { ...(data.favoritePlayers ?? {}), [player.uid]: { ...player, favorite: true } };
      await this.write(data);
      return Object.values(data.favoritePlayers);
    });
  }
  async removeFavoritePlayer(uid: string): Promise<TrackedPlayer[]> {
    return this.mutate(async () => {
      const data = await this.read();
      data.favoritePlayers = { ...(data.favoritePlayers ?? {}) };
      delete data.favoritePlayers[uid];
      await this.write(data);
      return Object.values(data.favoritePlayers);
    });
  }
  async replaceFavoritePlayers(players: TrackedPlayer[]): Promise<TrackedPlayer[]> {
    return this.mutate(async () => {
      const data = await this.read();
      data.favoritePlayers = Object.fromEntries(players.map((player) => [player.uid, { ...player, favorite: true }]));
      await this.write(data);
      return Object.values(data.favoritePlayers);
    });
  }
  async preferences(): Promise<AppPreferences> {
    return { ...DEFAULT_PREFERENCES, ...(await this.read()).settings?.preferences };
  }
  async savePreferences(preferences: AppPreferences): Promise<AppPreferences> {
    return this.mutate(async () => {
      const data = await this.read();
      const previous = { ...DEFAULT_PREFERENCES, ...data.settings?.preferences };
      await mkdir(path.dirname(this.preferencesBackup), { recursive: true });
      await writeFile(this.preferencesBackup, JSON.stringify({ savedAt: new Date().toISOString(), preferences: previous }, null, 2), 'utf8');
      data.settings = { ...data.settings, preferences };
      await this.write(data);
      return preferences;
    });
  }
  async replaceProfiles(profiles: Record<string, RivalProfile>): Promise<Record<string, RivalProfile>> {
    return this.mutate(async () => {
      const data = await this.read();
      data.profiles = profiles;
      await this.write(data);
      return data.profiles;
    });
  }
}
