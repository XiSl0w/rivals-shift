import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { buildPlayerProfileUrl } from './data-sources';
import type { HeroPerformance, HeroProficiency, LiveMatchSnapshot, MatchSummary, PlayerSkin, RivalProfile, RivalsDataExtensionStatus } from './types';

export const RIVALS_BRIDGE_PORT = 38573;
export const RIVALS_DATA_EXTENSION_VERSION = '0.9.40';

export type RivalsDataPageSnapshot = {
  uid?: string;
  name?: string;
  rank?: string;
  rankScore?: number;
  rankProgress?: number;
  peakRank?: string;
  peakRankScore?: number;
  peakRankIconUrl?: string;
  level?: number;
  winRate?: number;
  wins?: number;
  losses?: number;
  matches?: number;
  kd?: number;
  rankIconUrl?: string;
  rankIconRemoteUrl?: string;
  heroes?: Array<{ name: string; iconUrl?: string }>;
  heroStats?: HeroPerformance[];
  proficiency?: HeroProficiency[];
  skins?: PlayerSkin[];
  matchHistory?: MatchSummary[];
  pageUrl?: string;
};

type Job = {
  id: string;
  uid: string;
  url: string;
  createdAt: number;
  claimedAt?: number;
  resolve: (snapshot: RivalsDataPageSnapshot | LiveMatchSnapshot) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  kind?: 'profile' | 'live-match';
  forceRefresh?: boolean;
};

const MARVEL_RANK_PATTERN = /^(?:(?:Bronze|Silver|Gold|Platinum|Diamond|Grandmaster|Celestial)\s+[123]|Eternity|One Above All)$/i;

function validRank(value?: string): string | undefined {
  const rank = value?.trim();
  return rank && MARVEL_RANK_PATTERN.test(rank) ? rank : undefined;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  if (chunks.reduce((total, chunk) => total + chunk.length, 0) > 12_000_000) throw new Error('Payload is too large.');
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

export function mergeRivalsDataSnapshot(profile: RivalProfile, snapshot: RivalsDataPageSnapshot): RivalProfile {
  const heroes = (snapshot.heroes ?? []).filter((hero) => hero.name.trim());
  const heroStats = (snapshot.heroStats ?? []).filter((hero) => hero.name.trim());
  const proficiency = (snapshot.proficiency ?? []).filter((hero) => hero.name.trim());
  const skins = (snapshot.skins ?? []).filter((skin) => skin.name.trim());
  const matchHistory = (snapshot.matchHistory ?? []).filter((match) => match.mode.trim());
  const rank = validRank(snapshot.rank);
  const peakRank = validRank(snapshot.peakRank);
  const rankAssetUrl = rank ? `https://rivalsdata.com/assets/ranks/${rank.replace(/\s+[123]$/, '').toLowerCase().replace(/\s+/g, '-')}.webp` : undefined;
  const rankProgress = snapshot.rankProgress == null ? undefined : Math.max(-30, Math.min(100, Math.floor(snapshot.rankProgress)));
  const heroIcons = { ...(profile.stats?.heroIcons ?? {}) };
  for (const hero of heroes) if (hero.iconUrl) heroIcons[hero.name.trim()] = hero.iconUrl;
  for (const hero of heroStats) if (hero.iconUrl) heroIcons[hero.name.trim()] = hero.iconUrl;
  for (const hero of proficiency) if (hero.iconUrl) heroIcons[hero.name.trim()] = hero.iconUrl;
  return {
    ...profile,
    // The UID and in-game name were explicitly linked by the user. Page
    // headings can temporarily contain placeholders such as "Loading Profile".
    uid: profile.uid,
    inGameName: profile.inGameName,
    updatedAt: new Date().toISOString(),
    status: 'synced',
    error: undefined,
    stats: {
      ...profile.stats,
      ...(rank ? { rank } : {}),
      ...(snapshot.rankScore != null ? { rankScore: snapshot.rankScore } : {}),
      ...(rankProgress != null ? { rankProgress, rankProgressMax: 100 } : {}),
      ...(peakRank ? { peakRank } : {}),
      ...(peakRank && snapshot.peakRankScore != null ? { peakRankScore: snapshot.peakRankScore } : {}),
      ...(peakRank ? { peakRankIconUrl: snapshot.peakRankIconUrl || `https://rivalsdata.com/assets/ranks/${peakRank.replace(/\s+[123]$/, '').toLowerCase().replace(/\s+/g, '-')}.webp` } : {}),
      ...(snapshot.level != null ? { level: snapshot.level } : {}),
      ...(snapshot.winRate != null ? { winRate: snapshot.winRate } : {}),
      ...(snapshot.wins != null ? { wins: snapshot.wins } : {}),
      ...(snapshot.losses != null ? { losses: snapshot.losses } : {}),
      ...(snapshot.matches != null ? { matches: snapshot.matches } : {}),
      ...(snapshot.kd != null ? { kd: snapshot.kd } : {}),
      ...(heroes.length ? { heroes: heroes.map((hero) => hero.name.trim()) } : {}),
      ...(Object.keys(heroIcons).length ? { heroIcons } : {}),
      ...(heroStats.length ? { heroStats } : {}),
      ...(proficiency.length ? { proficiency } : {}),
      ...(skins.length ? { skins } : {}),
      ...(matchHistory.length ? { matchHistory } : {}),
      ...(rank ? { rankIconUrl: snapshot.rankIconUrl || rankAssetUrl } : {}),
      ...(rank ? { rankIconRemoteUrl: snapshot.rankIconRemoteUrl || rankAssetUrl } : {}),
      syncedAt: new Date().toISOString(),
      source: 'Rivals Data via browser extension',
    },
  };
}

export class RivalsDataBridge {
  private server?: Server;
  private lastSeenAt = 0;
  private lastExtensionVersion = '';
  private lastJobError = '';
  private readonly jobs = new Map<string, Job>();
  private readonly cancellations = new Map<string, number>();

  constructor(
    private readonly extensionPath: string,
    private readonly listenPort = RIVALS_BRIDGE_PORT,
  ) {}

  async start(): Promise<void> {
    if (this.server) return;
    this.server = createServer((request, response) => { void this.route(request, response); });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.listenPort, '127.0.0.1', () => {
        this.server!.off('error', reject);
        resolve();
      });
    });
  }

  port(): number {
    const address = this.server?.address();
    return typeof address === 'object' && address ? address.port : this.listenPort;
  }

  status(): RivalsDataExtensionStatus {
    const recentlySeen = Date.now() - this.lastSeenAt < 12_000;
    const connected = recentlySeen && this.lastExtensionVersion === RIVALS_DATA_EXTENSION_VERSION;
    return {
      connected,
      lastSeen: this.lastSeenAt ? new Date(this.lastSeenAt).toISOString() : null,
      extensionPath: this.extensionPath,
      pendingJobs: this.jobs.size,
      version: this.lastExtensionVersion || null,
      message: recentlySeen && !connected
        ? `Your browser is running extension v${this.lastExtensionVersion || 'an older release'}. Reload it to activate v${RIVALS_DATA_EXTENSION_VERSION}.`
        : connected
        ? (this.lastJobError ? `Extension connected. Last refresh failed: ${this.lastJobError}` : 'Rivals Data browser extension connected and ready.')
        : 'Load the Rival Shift Rivals Data extension in a supported browser, then keep Rival Shift open.',
    };
  }

  async refresh(profile: RivalProfile): Promise<RivalsDataPageSnapshot> {
    const profileUrl = buildPlayerProfileUrl(profile.uid);
    const extension = this.status();
    if (!extension.connected) throw new Error(extension.message);
    const id = randomUUID();
    return new Promise<RivalsDataPageSnapshot>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.jobs.delete(id);
        this.lastJobError = `Rivals Data did not finish loading ${profile.inGameName || profile.uid} within two minutes.`;
        reject(new Error(this.lastJobError));
      }, 120_000);
      this.jobs.set(id, {
        id,
        uid: profile.uid.trim(),
        url: profileUrl,
        createdAt: Date.now(),
        resolve: resolve as (snapshot: RivalsDataPageSnapshot | LiveMatchSnapshot) => void,
        reject,
        timer,
      });
    });
  }

  async liveMatch(profile: RivalProfile, forceRefresh = false, restart = false): Promise<LiveMatchSnapshot> {
    if (!profile.uid.trim()) throw new Error('Add a Marvel Rivals UID before checking the live match.');
    const extension = this.status();
    if (!extension.connected) throw new Error(extension.message);
    if (restart) this.cancelLiveMatchJobs(profile.uid.trim());
    const id = randomUUID();
    return new Promise<LiveMatchSnapshot>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.jobs.delete(id);
        this.lastJobError = `Rivals Data did not finish checking the live match and peak ranks for ${profile.inGameName || profile.uid} within two minutes.`;
        reject(new Error(this.lastJobError));
      }, 120_000);
      this.jobs.set(id, {
        id,
        uid: profile.uid.trim(),
        url: buildPlayerProfileUrl(profile.uid),
        createdAt: Date.now(),
        resolve: resolve as (snapshot: RivalsDataPageSnapshot | LiveMatchSnapshot) => void,
        reject,
        timer,
        kind: 'live-match',
        forceRefresh,
      });
    });
  }

  private cancelLiveMatchJobs(uid: string): void {
    for (const job of [...this.jobs.values()]) {
      if (job.kind !== 'live-match' || job.uid !== uid) continue;
      clearTimeout(job.timer);
      this.jobs.delete(job.id);
      this.cancellations.set(job.id, Date.now());
      job.reject(new Error('Live-match check restarted from the beginning.'));
    }
  }

  close(): void {
    for (const job of this.jobs.values()) {
      clearTimeout(job.timer);
      job.reject(new Error('Rival Shift closed before the player-data refresh completed.'));
    }
    this.jobs.clear();
    this.cancellations.clear();
    this.server?.close();
    this.server = undefined;
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method === 'OPTIONS') return sendJson(response, 204, {});
    const url = new URL(request.url ?? '/', `http://127.0.0.1:${this.port()}`);
    const extensionVersion = url.searchParams.get('version') ?? '';
    if (url.pathname === '/v1/health' && request.method === 'GET') return sendJson(response, 200, { ok: true, ...this.status() });
    if (url.pathname === '/v1/status' && request.method === 'GET') {
      this.lastSeenAt = Date.now();
      this.lastExtensionVersion = extensionVersion;
      return sendJson(response, 200, { ok: true, ...this.status() });
    }
    if (url.pathname === '/v1/jobs/cancelled' && request.method === 'GET') {
      this.lastSeenAt = Date.now();
      this.lastExtensionVersion = extensionVersion;
      if (extensionVersion !== RIVALS_DATA_EXTENSION_VERSION) return sendJson(response, 409, { error: this.status().message });
      const cutoff = Date.now() - 60_000;
      for (const [id, at] of this.cancellations) if (at < cutoff) this.cancellations.delete(id);
      return sendJson(response, 200, [...this.cancellations.keys()]);
    }
    if (url.pathname === '/v1/jobs' && request.method === 'GET') {
      this.lastSeenAt = Date.now();
      this.lastExtensionVersion = extensionVersion;
      if (extensionVersion !== RIVALS_DATA_EXTENSION_VERSION) return sendJson(response, 409, { error: this.status().message });
      const available = [...this.jobs.values()].filter((job) => !job.claimedAt || Date.now() - job.claimedAt > 30_000);
      for (const job of available) job.claimedAt = Date.now();
      return sendJson(response, 200, available.map(({ id, uid, url: profileUrl, kind, forceRefresh }) => ({ id, uid, url: profileUrl, kind, forceRefresh })));
    }
    const complete = url.pathname.match(/^\/v1\/jobs\/([^/]+)\/(complete|fail)$/);
    if (complete && request.method === 'POST') {
      this.lastSeenAt = Date.now();
      this.lastExtensionVersion = extensionVersion;
      const job = this.jobs.get(complete[1]);
      if (!job) return sendJson(response, 404, { error: 'Refresh job was not found or already expired.' });
      try {
        const body = await readJson(request);
        clearTimeout(job.timer);
        this.jobs.delete(job.id);
        if (complete[2] === 'fail') {
          this.lastJobError = String(body.error || 'Player-data refresh failed.');
          job.reject(new Error(this.lastJobError));
        } else {
          this.lastJobError = '';
          job.resolve(body as RivalsDataPageSnapshot);
        }
        return sendJson(response, 200, { ok: true });
      } catch (error) {
        return sendJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid payload.' });
      }
    }
    return sendJson(response, 404, { error: 'Not found.' });
  }
}
