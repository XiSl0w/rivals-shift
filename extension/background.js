const BRIDGE = 'http://127.0.0.1:38573/v1';
const RUNTIME_VERSION = chrome.runtime.getManifest().version;
const activeJobs = new Map();
const cancelledJobs = new Set();

async function bridge(path, init) {
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${BRIDGE}${path}${separator}version=${encodeURIComponent(RUNTIME_VERSION)}`, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!response.ok) throw new Error(`Rival Shift bridge returned ${response.status}`);
  return response.json();
}

async function sendToProfile(tabId, job) {
  let lastError;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { return await chrome.tabs.sendMessage(tabId, { type: 'rival-shift:refresh', job }); }
    catch (error) {
      if (cancelledJobs.has(job.id)) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError || new Error('Rival Shift helper did not load in the profile tab.');
}

async function loadPeakRank(job, uid) {
  let tab;
  try {
    if (cancelledJobs.has(job.id)) return null;
    tab = await chrome.tabs.create({ url: `https://rivalsdata.com/player/${encodeURIComponent(uid)}`, active: false });
    activeJobs.get(job.id)?.add(tab.id);
    const result = await sendToProfile(tab.id, { ...job, kind: 'peak-rank', uid, forceRefresh: false });
    return result?.ok ? result.snapshot : null;
  } catch {
    return null;
  } finally {
    if (tab?.id) {
      await chrome.tabs.remove(tab.id).catch(() => undefined);
      activeJobs.get(job.id)?.delete(tab.id);
    }
  }
}

async function runJob(job) {
  if (activeJobs.has(job.id)) return;
  activeJobs.set(job.id, new Set());
  let tab;
  try {
    tab = await chrome.tabs.create({ url: job.url, active: false });
    activeJobs.get(job.id).add(tab.id);
    let result;
    try {
      result = await sendToProfile(tab.id, job);
    } catch (error) {
      if (cancelledJobs.has(job.id)) throw error;
      // Some providers complete an update with a full navigation,
      // which closes the original message channel. Wait for the new page and
      // scrape it without clicking the refresh control a second time.
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      result = await sendToProfile(tab.id, { ...job, scrapeOnly: true });
    }
    if (!result?.ok) throw new Error(result?.error || 'Could not read the Rivals Data profile.');
    if (job.kind !== 'live-match') {
      const peak = await loadPeakRank(job, job.uid);
      if (peak?.peakRank) Object.assign(result.snapshot, peak);
    }
    await bridge(`/jobs/${encodeURIComponent(job.id)}/complete`, { method: 'POST', body: JSON.stringify(result.snapshot) });
  } catch (error) {
    await bridge(`/jobs/${encodeURIComponent(job.id)}/fail`, {
      method: 'POST',
      body: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
    }).catch(() => undefined);
  } finally {
    const tabIds = [...(activeJobs.get(job.id) || [])];
    await Promise.all(tabIds.map((tabId) => chrome.tabs.remove(tabId).catch(() => undefined)));
    activeJobs.delete(job.id);
    cancelledJobs.delete(job.id);
  }
}

async function closeCancelledJobs() {
  const cancelled = await bridge('/jobs/cancelled');
  await Promise.all(cancelled.map(async (jobId) => {
    cancelledJobs.add(jobId);
    const tabIds = [...(activeJobs.get(jobId) || [])];
    await Promise.all(tabIds.map((tabId) => chrome.tabs.remove(tabId).catch(() => undefined)));
  }));
}

async function poll() {
  try {
    await bridge('/status');
    await closeCancelledJobs();
    const jobs = await bridge('/jobs');
    await Promise.all(jobs.map(runJob));
  } catch {
    // Rival Shift is not open yet. The next alarm retries quietly.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('rival-shift-poll', { periodInMinutes: 0.1 });
  void poll();
});
chrome.runtime.onStartup.addListener(() => void poll());
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === 'rival-shift-poll') void poll(); });
setInterval(() => void poll(), 4_000);
void poll();
