import { Client } from '@xhayper/discord-rpc';
import type { DiscordLivePresence, DiscordStatus } from './types';

type StatusListener = (status: DiscordStatus) => void;
export const DISCORD_APPLICATION_ID = '1535197736289439786';
export const RIVAL_SHIFT_WEBSITE_URL = 'https://rivalshift.xislow.dev';

const DISCORD_RANK_ICON_URLS: Record<string, string> = {
  bronze: 'https://rivalsdata.com/assets/ranks/bronze.webp',
  silver: 'https://rivalsdata.com/assets/ranks/silver.webp',
  gold: 'https://rivalsdata.com/assets/ranks/gold.webp',
  platinum: 'https://rivalsdata.com/assets/ranks/platinum.webp',
  diamond: 'https://rivalsdata.com/assets/ranks/diamond.webp',
  grandmaster: 'https://rivalsdata.com/assets/ranks/grandmaster.webp',
  celestial: 'https://rivalsdata.com/assets/ranks/celestial.webp',
  eternity: 'https://rivalsdata.com/assets/ranks/eternity.webp',
  'one above all': 'https://rivalsdata.com/assets/ranks/one-above-all.webp',
};

export function discordRankIconUrl(rank: string, fallbackUrl = ''): string | undefined {
  const tier = rank.trim().replace(/\s+[123]$/i, '').toLowerCase();
  return DISCORD_RANK_ICON_URLS[tier] ?? (/^https:\/\//i.test(fallbackUrl) ? fallbackUrl : undefined);
}

export function discordPresenceStartedAt(fallback: Date, liveGame?: DiscordLivePresence): Date {
  if (liveGame?.status !== 'in-game' || !liveGame.elapsed || !liveGame.checkedAt) return fallback;
  const parts = liveGame.elapsed.split(':').map(Number);
  if ((parts.length !== 2 && parts.length !== 3) || parts.some((part) => !Number.isFinite(part) || part < 0)) return fallback;
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  const checkedAt = Date.parse(liveGame.checkedAt);
  return Number.isFinite(checkedAt) ? new Date(checkedAt - seconds * 1000) : fallback;
}

export function buildDiscordActivity(accountCount: number, selectedName: string, startedAt: Date, rank = '', rankIconUrl = '', liveGame?: DiscordLivePresence) {
  const hasPlayerData = Boolean(selectedName && rank);
  const accountLabel = `${accountCount} account${accountCount === 1 ? '' : 's'}`;
  // Browser-scraped source URLs may require session cookies and render as a
  // question mark in Discord. Use public tier artwork for all known ranks.
  const publicRankIconUrl = discordRankIconUrl(rank, rankIconUrl);
  let details = hasPlayerData ? `Active player · ${selectedName}` : 'Marvel Rivals command center';
  let state = hasPlayerData ? `${rank} · ${accountLabel} ready` : `${accountLabel} ready to shift`;
  if (liveGame) {
    const player = liveGame.playerName?.trim() || selectedName || 'current player';
    if (liveGame.status === 'checking') {
      details = `Scanning for ${player}`;
      state = 'Searching for a live match…';
    } else if (liveGame.status === 'in-game') {
      details = `Live match · ${player}`;
      state = [liveGame.mode || 'Match in progress', rank || 'In progress'].join(' · ');
    } else if (liveGame.status === 'offline') {
      details = `Watching ${player}`;
      state = 'No active match · Standing by';
    } else {
      details = 'Live match radar';
      state = `Ready to scan ${player}`;
    }
  }
  return {
    details,
    state,
    startTimestamp: discordPresenceStartedAt(startedAt, liveGame),
    largeImageText: 'Rival Shift · Marvel Rivals command center',
    ...(publicRankIconUrl ? { smallImageKey: publicRankIconUrl, smallImageText: `${rank} · Competitive` } : {}),
    buttons: [{ label: 'Get Rivalshift', url: RIVAL_SHIFT_WEBSITE_URL }],
    instance: false,
  };
}

export class DiscordPresence {
  private client?: Client;
  private retryTimer?: NodeJS.Timeout;
  private connecting?: Promise<DiscordStatus>;
  private stopped = false;
  private enabled = true;
  private status: DiscordStatus = { enabled: true, clientId: DISCORD_APPLICATION_ID, state: 'connecting', message: 'Connecting to Discord…' };
  private accountCount = 0;
  private selectedName = '';
  private rank = '';
  private rankIconUrl = '';
  private liveGame?: DiscordLivePresence;
  private readonly startedAt = new Date();
  constructor(private readonly onStatus: StatusListener) {}

  getStatus(): DiscordStatus { return { ...this.status }; }

  private publish(status: DiscordStatus) {
    this.status = status;
    this.onStatus(this.getStatus());
  }

  start(enabled = true): void {
    this.stopped = false;
    void this.setEnabled(enabled);
  }

  async setEnabled(enabled: boolean): Promise<DiscordStatus> {
    this.enabled = enabled;
    if (!enabled) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
      await this.disconnect();
      this.publish({ enabled: false, clientId: DISCORD_APPLICATION_ID, state: 'disabled', message: 'Rich Presence is turned off.' });
      return this.getStatus();
    }
    if (!this.stopped) {
      const pendingConnection = this.connecting;
      if (pendingConnection) {
        void pendingConnection.then(() => {
          if (this.enabled && !this.stopped && this.status.state === 'disabled') void this.connect();
        });
      } else void this.connect();
    }
    return this.getStatus();
  }

  private scheduleReconnect() {
    if (this.stopped || !this.enabled || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.connect();
    }, 15_000);
  }

  async connect(): Promise<DiscordStatus> {
    if (this.stopped || !this.enabled) return this.getStatus();
    if (this.connecting) return this.connecting;
    this.connecting = this.connectOnce();
    try { return await this.connecting; }
    finally { this.connecting = undefined; }
  }

  private async connectOnce(): Promise<DiscordStatus> {
    await this.disconnect();
    if (this.stopped || !this.enabled) return this.getStatus();
    this.publish({ enabled: true, clientId: DISCORD_APPLICATION_ID, state: 'connecting', message: 'Connecting to Discord…' });
    const client = new Client({ clientId: DISCORD_APPLICATION_ID });
    this.client = client;
    client.on('disconnected', () => {
      if (this.client === client) {
        this.client = undefined;
        this.publish({ enabled: true, clientId: DISCORD_APPLICATION_ID, state: 'error', message: 'Discord is closed. Rival Shift will reconnect automatically.' });
        this.scheduleReconnect();
      }
    });
    try {
      await Promise.race([
        client.login(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Discord connection timed out.')), 6500)),
      ]);
      if (this.client !== client || !this.enabled) return this.getStatus();
      await this.updateActivity();
      this.publish({ enabled: true, clientId: DISCORD_APPLICATION_ID, state: 'connected', message: 'Rich Presence is active.' });
    } catch {
      if (this.client === client) {
        await client.destroy().catch(() => undefined);
        this.client = undefined;
        this.publish({ enabled: true, clientId: DISCORD_APPLICATION_ID, state: 'error', message: 'Discord is closed. Rival Shift will reconnect automatically.' });
        this.scheduleReconnect();
      }
    }
    return this.getStatus();
  }

  async update(accountCount: number, selectedName = '', rank = '', rankIconUrl = '', liveGame?: DiscordLivePresence): Promise<void> {
    this.accountCount = Math.max(0, accountCount);
    this.selectedName = selectedName.trim();
    this.rank = rank.trim();
    this.rankIconUrl = rankIconUrl.trim();
    this.liveGame = liveGame;
    await this.updateActivity();
  }

  private async updateActivity(): Promise<void> {
    if (!this.client?.isConnected || !this.client.user) return;
    await this.client.user.setActivity(buildDiscordActivity(this.accountCount, this.selectedName, this.startedAt, this.rank, this.rankIconUrl, this.liveGame));
  }

  async disconnect(): Promise<void> {
    const active = this.client;
    this.client = undefined;
    if (active) await active.destroy().catch(() => undefined);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    await this.disconnect();
  }
}
