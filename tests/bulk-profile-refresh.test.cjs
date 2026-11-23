const test = require('node:test');
const assert = require('node:assert/strict');

const profile = (steamId64) => ({
  steamId64, uid: steamId64, inGameName: steamId64, note: '', favorite: false,
  updatedAt: new Date().toISOString(), status: 'linked',
});

test('bulk profile refresh caps concurrency and retries transient failures', async () => {
  const { runBulkProfileRefresh } = await import('../src/bulk-profile-refresh.ts');
  let active = 0;
  let peak = 0;
  const attempts = new Map();
  const states = new Map();
  const summary = await runBulkProfileRefresh({
    profiles: [profile('1'), profile('2'), profile('3'), profile('4')],
    concurrency: 2,
    retryDelaysMs: [0, 0],
    wait: async () => {},
    sync: async (steamId64) => {
      active += 1;
      peak = Math.max(peak, active);
      const attempt = (attempts.get(steamId64) || 0) + 1;
      attempts.set(steamId64, attempt);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      if (steamId64 === '2' && attempt === 1) return { ...profile(steamId64), status: 'error', error: 'HTTP 503' };
      return { ...profile(steamId64), status: 'synced' };
    },
    onState: (steamId64, state) => states.set(steamId64, state),
    onProfile: () => {},
    onProgress: () => {},
  });
  assert.equal(peak, 2);
  assert.equal(attempts.get('2'), 2);
  assert.deepEqual(summary, { completed: 4, total: 4, succeeded: 4, cached: 0, failed: 0, cancelled: 0 });
  assert.equal(states.get('2').phase, 'success');
});

test('bulk profile refresh does not retry permanent identity errors', async () => {
  const { runBulkProfileRefresh } = await import('../src/bulk-profile-refresh.ts');
  let attempts = 0;
  const summary = await runBulkProfileRefresh({
    profiles: [profile('bad')],
    sync: async () => {
      attempts += 1;
      return { ...profile('bad'), status: 'error', error: 'Add a valid Marvel Rivals UID before using the SDK API.' };
    },
    onState: () => {},
    onProfile: () => {},
    onProgress: () => {},
  });
  assert.equal(attempts, 1);
  assert.equal(summary.failed, 1);
});

test('bulk profile refresh does not reopen a verification the user closed', async () => {
  const { runBulkProfileRefresh } = await import('../src/bulk-profile-refresh.ts');
  let attempts = 0;
  await runBulkProfileRefresh({
    profiles: [profile('verification')],
    sync: async () => {
      attempts += 1;
      return { ...profile('verification'), status: 'error', error: 'Rivals Data verification was closed or timed out.' };
    },
    onState: () => {},
    onProfile: () => {},
    onProgress: () => {},
  });
  assert.equal(attempts, 1);
});

test('a hung IPC request times out and cannot hold the queue forever', async () => {
  const { runBulkProfileRefresh } = await import('../src/bulk-profile-refresh.ts');
  const states = new Map();
  const summary = await runBulkProfileRefresh({
    profiles: [profile('hung'), profile('next')],
    concurrency: 1,
    maxAttempts: 1,
    attemptTimeoutMs: 5,
    sync: async (steamId64) => steamId64 === 'hung'
      ? new Promise(() => {})
      : { ...profile(steamId64), status: 'synced' },
    onState: (steamId64, state) => states.set(steamId64, state),
    onProfile: () => {},
    onProgress: () => {},
  });
  assert.deepEqual(summary, { completed: 2, total: 2, succeeded: 1, cached: 0, failed: 1, cancelled: 0 });
  assert.equal(states.get('hung').phase, 'error');
  assert.equal(states.get('next').phase, 'success');
});

test('stopping refresh releases active workers and clears every queued account', async () => {
  const { runBulkProfileRefresh } = await import('../src/bulk-profile-refresh.ts');
  const controller = new AbortController();
  const states = new Map();
  const running = runBulkProfileRefresh({
    profiles: [profile('1'), profile('2'), profile('3')],
    concurrency: 1,
    signal: controller.signal,
    sync: async () => new Promise(() => {}),
    onState: (steamId64, state) => states.set(steamId64, state),
    onProfile: () => {},
    onProgress: () => {},
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  const summary = await running;
  assert.deepEqual(summary, { completed: 3, total: 3, succeeded: 0, cached: 0, failed: 0, cancelled: 3 });
  assert.deepEqual([...states.values()].map((state) => state.phase), ['cancelled', 'cancelled', 'cancelled']);
});

test('cached fallback retries before becoming a healthy terminal state', async () => {
  const { runBulkProfileRefresh } = await import('../src/bulk-profile-refresh.ts');
  const states = new Map();
  let attempts = 0;
  const summary = await runBulkProfileRefresh({
    profiles: [profile('cached')],
    maxAttempts: 2,
    retryDelaysMs: [0],
    wait: async () => {},
    sync: async () => {
      attempts += 1;
      return { ...profile('cached'), status: 'synced', refreshNotice: 'cached', refreshMessage: 'HTTP 503: API unavailable' };
    },
    onState: (steamId64, state) => states.set(steamId64, state),
    onProfile: () => {},
    onProgress: () => {},
  });
  assert.equal(attempts, 2);
  assert.deepEqual(summary, { completed: 1, total: 1, succeeded: 0, cached: 1, failed: 0, cancelled: 0 });
  assert.equal(states.get('cached').phase, 'cached');
});

test('cached fallback is replaced when the automatic retry gets fresh data', async () => {
  const { runBulkProfileRefresh } = await import('../src/bulk-profile-refresh.ts');
  const states = new Map();
  let attempts = 0;
  const summary = await runBulkProfileRefresh({
    profiles: [profile('stale')],
    maxAttempts: 2,
    retryDelaysMs: [0],
    wait: async () => {},
    sync: async () => {
      attempts += 1;
      return attempts === 1
        ? { ...profile('stale'), status: 'synced', refreshNotice: 'cached', refreshMessage: 'HTTP 503: temporary failure' }
        : { ...profile('stale'), status: 'synced', stats: { rank: 'Grandmaster 2' } };
    },
    onState: (steamId64, state) => states.set(steamId64, state),
    onProfile: () => {},
    onProgress: () => {},
  });
  assert.equal(attempts, 2);
  assert.deepEqual(summary, { completed: 1, total: 1, succeeded: 1, cached: 0, failed: 0, cancelled: 0 });
  assert.equal(states.get('stale').phase, 'success');
});
