import type { RivalProfile } from './types';

export type ProfileRefreshPhase = 'queued' | 'refreshing' | 'retrying' | 'success' | 'cached' | 'error' | 'cancelled';

export type ProfileRefreshState = {
  phase: ProfileRefreshPhase;
  attempt: number;
  maxAttempts: number;
  message?: string;
  retryInMs?: number;
};

export type ProfileRefreshProgress = {
  completed: number;
  total: number;
  succeeded: number;
  cached: number;
  failed: number;
  cancelled: number;
  retrying: number;
};

export type BulkProfileRefreshSummary = Omit<ProfileRefreshProgress, 'retrying'>;

type RefreshOptions = {
  profiles: RivalProfile[];
  sync: (steamId64: string) => Promise<RivalProfile>;
  onState: (steamId64: string, state: ProfileRefreshState) => void;
  onProfile: (profile: RivalProfile) => void;
  onProgress: (progress: ProfileRefreshProgress) => void;
  concurrency?: number;
  maxAttempts?: number;
  retryDelaysMs?: number[];
  attemptTimeoutMs?: number;
  signal?: AbortSignal;
  wait?: (milliseconds: number) => Promise<void>;
};

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
class RefreshCancelledError extends Error {}

function settleAttempt<T>(promise: Promise<T>, signal: AbortSignal | undefined, timeoutMs: number): Promise<T> {
  if (signal?.aborted) return Promise.reject(new RefreshCancelledError('Refresh stopped.'));
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (callback: (value: any) => void, value: unknown) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, new RefreshCancelledError('Refresh stopped.'));
    if (timeoutMs > 0) timer = setTimeout(() => finish(reject, new Error(`Refresh attempt timed out after ${Math.ceil(timeoutMs / 1_000)} seconds.`)), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then((value) => finish(resolve, value), (error) => finish(reject, error));
  });
}

export function isRetryableProfileRefreshError(message = ''): boolean {
  if (/(?:valid Marvel Rivals UID|save the player identity|profile was not found|player was not found|verification was closed or timed out|finish both Cloudflare verification steps)/i.test(message)) return false;
  const httpStatus = message.match(/HTTP\s+(\d{3})/i)?.[1];
  return !httpStatus || Number(httpStatus) < 400 || Number(httpStatus) >= 500 || [408, 425, 429].includes(Number(httpStatus));
}

export async function runBulkProfileRefresh({
  profiles,
  sync,
  onState,
  onProfile,
  onProgress,
  concurrency = 2,
  maxAttempts = 3,
  retryDelaysMs = [1_500, 4_000],
  attemptTimeoutMs = 35_000,
  signal,
  wait = sleep,
}: RefreshOptions): Promise<BulkProfileRefreshSummary> {
  const total = profiles.length;
  const progress: ProfileRefreshProgress = { completed: 0, total, succeeded: 0, cached: 0, failed: 0, cancelled: 0, retrying: 0 };
  const publishProgress = () => onProgress({ ...progress });
  const publishState = (steamId64: string, state: ProfileRefreshState) => onState(steamId64, state);
  const finished = new Set<string>();

  profiles.forEach((profile) => publishState(profile.steamId64, { phase: 'queued', attempt: 0, maxAttempts }));
  publishProgress();
  if (!total) return progress;

  let cursor = 0;
  const refreshOne = async (profile: RivalProfile) => {
    let lastMessage = 'Player lookup failed.';
    let outcome: 'success' | 'cached' | 'error' | 'cancelled' = 'error';
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (signal?.aborted) {
        outcome = 'cancelled';
        publishState(profile.steamId64, { phase: 'cancelled', attempt: attempt - 1, maxAttempts, message: 'Refresh stopped.' });
        break;
      }
      publishState(profile.steamId64, { phase: 'refreshing', attempt, maxAttempts });
      try {
        const refreshed = await settleAttempt(sync(profile.steamId64), signal, attemptTimeoutMs);
        onProfile(refreshed);
        if (refreshed.refreshNotice === 'cached') {
          lastMessage = refreshed.refreshMessage || 'Fresh player data was unavailable; cached stats were kept.';
          if (attempt >= maxAttempts || !isRetryableProfileRefreshError(lastMessage)) {
            outcome = 'cached';
            publishState(profile.steamId64, { phase: 'cached', attempt, maxAttempts, message: lastMessage });
            break;
          }
        } else if (refreshed.status !== 'error') {
          outcome = 'success';
          publishState(profile.steamId64, { phase: 'success', attempt, maxAttempts });
          break;
        } else {
          lastMessage = refreshed.error || lastMessage;
        }
      } catch (error) {
        if (error instanceof RefreshCancelledError) {
          outcome = 'cancelled';
          publishState(profile.steamId64, { phase: 'cancelled', attempt, maxAttempts, message: error.message });
          break;
        }
        lastMessage = error instanceof Error ? error.message : lastMessage;
      }

      if (attempt >= maxAttempts || !isRetryableProfileRefreshError(lastMessage)) {
        outcome = 'error';
        publishState(profile.steamId64, { phase: 'error', attempt, maxAttempts, message: lastMessage });
        break;
      }

      const retryInMs = retryDelaysMs[Math.min(attempt - 1, retryDelaysMs.length - 1)] ?? 0;
      progress.retrying += 1;
      publishProgress();
      publishState(profile.steamId64, { phase: 'retrying', attempt, maxAttempts, message: lastMessage, retryInMs });
      try {
        await settleAttempt(wait(retryInMs), signal, 0);
      } catch (error) {
        if (!(error instanceof RefreshCancelledError)) throw error;
        outcome = 'cancelled';
        publishState(profile.steamId64, { phase: 'cancelled', attempt, maxAttempts, message: error.message });
        break;
      } finally {
        progress.retrying -= 1;
        publishProgress();
      }
    }
    if (outcome === 'success') progress.succeeded += 1;
    else if (outcome === 'cached') progress.cached += 1;
    else if (outcome === 'cancelled') progress.cancelled += 1;
    else progress.failed += 1;
    finished.add(profile.steamId64);
    progress.completed += 1;
    publishProgress();
  };

  const worker = async () => {
    while (cursor < total && !signal?.aborted) {
      const profile = profiles[cursor];
      cursor += 1;
      await refreshOne(profile);
    }
  };
  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), total));
  await Promise.all(Array.from({ length: workerCount }, worker));
  if (signal?.aborted) {
    profiles.filter((profile) => !finished.has(profile.steamId64)).forEach((profile) => {
      publishState(profile.steamId64, { phase: 'cancelled', attempt: 0, maxAttempts, message: 'Refresh stopped.' });
      progress.cancelled += 1;
      progress.completed += 1;
    });
    publishProgress();
  }
  return { completed: progress.completed, total, succeeded: progress.succeeded, cached: progress.cached, failed: progress.failed, cancelled: progress.cancelled };
}
