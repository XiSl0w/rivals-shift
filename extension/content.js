const playerParser = globalThis.RivalShiftRivalsDataParser;

async function waitForProfileContent(timeout = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = playerParser.pageState(document);
    if (document.readyState !== 'loading' && ['ready', 'private', 'not-found', 'security'].includes(state)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Rivals Data profile content did not become available in the browser.');
}

function activateControl(control) {
  control.scrollIntoView({ block: 'center', inline: 'center' });
  control.focus({ preventScroll: true });
  control.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  control.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  control.click();
}

function findRefreshControl() {
  return [...document.querySelectorAll('button,a,[role="button"],.updater__refresh')].find((element) => {
    const label = playerParser.clean(`${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''} ${element.textContent || ''}`);
    return /\b(refresh|update|reload)(?:\s+(?:player\s+data|matches))?\b/i.test(label) && !/download|install|app|ad/i.test(label);
  });
}

async function refreshPlayerProfile() {
  const control = findRefreshControl();
  if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true' || /disabled/.test(control.className)) return;
  control.click();
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (Date.now() - started > 2_000 && playerParser.pageState(document) !== 'loading') return;
  }
  throw new Error('Rivals Data did not finish updating the profile in time.');
}

async function selectRivalsDataTab(name) {
  const started = Date.now();
  let attempts = 0;
  while (Date.now() - started < 20_000) {
    const tabs = [...document.querySelectorAll('[role="tab"],button')];
    const tab = tabs.find((element) => playerParser.clean(element.textContent) === name);
    const selected = tab?.getAttribute('aria-selected') === 'true'
      || tab?.matches('[data-selected],.active,[data-state="active"]');
    const visiblePanel = Boolean(tab?.id) && [...document.querySelectorAll('[role="tabpanel"]')]
      .some((panel) => !panel.hidden && panel.getAttribute('aria-labelledby') === tab.id);
    if (tab && (selected || visiblePanel)) return true;
    if (tab) {
      attempts += 1;
      activateControl(tab);
    }
    await new Promise((resolve) => setTimeout(resolve, attempts ? 350 : 150));
  }
  throw new Error(`Could not activate the ${name} tab on Rivals Data.`);
}

async function selectRivalsDataSeason(name) {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    const selector = [...document.querySelectorAll('[role="combobox"]')]
      .find((element) => /^(?:Season\s+\d+(?:\.\d+)?|All Seasons)$/i.test(playerParser.clean(element.textContent)));
    if (selector && playerParser.clean(selector.textContent) === name) return;
    if (selector && selector.getAttribute('aria-expanded') !== 'true') activateControl(selector);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const option = [...document.querySelectorAll('[role="option"],[role="listbox"] button')]
      .find((element) => playerParser.clean(element.textContent) === name);
    if (option) activateControl(option);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Could not select ${name} on Rivals Data.`);
}

async function loadPeakRank() {
  await selectRivalsDataSeason('All Seasons');
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const button = findExactButton('Show Peak');
    if (button && button.getAttribute('aria-pressed') !== 'true') activateControl(button);
    try {
      const peak = playerParser.parseRivalsDataPeakRank(document, location.href);
      if (/^https:\/\//i.test(peak.peakRankIconUrl || '')) {
        peak.peakRankIconUrl = await createImageInliner(96_000, 128_000)(peak.peakRankIconUrl);
      }
      return peak;
    }
    catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
  }
  return playerParser.parseRivalsDataPeakRank(document, location.href);
}

function findExactButton(name) {
  return [...document.querySelectorAll('button')].find((element) => playerParser.clean(element.textContent) === name);
}

async function waitForExactButton(name, timeout = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const button = findExactButton(name);
    if (button) return button;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${name} did not become available again on Rivals Data.`);
}

async function expandLivePlayerDetails() {
  for (let pass = 0; pass < 2; pass += 1) {
    const toggles = [...document.querySelectorAll('button[aria-label^="Toggle details for"]')]
      .filter((toggle) => toggle.getAttribute('aria-expanded') !== 'true');
    if (!toggles.length) return;
    for (const toggle of toggles) toggle.click();
    // React replaces some row nodes as disclosures open. Re-query once so every
    // public player gets a chance; unavailable/private disclosures stay closed.
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
}

async function captureLiveMatch() {
  const snapshot = playerParser.parseRivalsDataLiveMatch(document, location.href);
  if (snapshot.status !== 'in-game') return snapshot;
  await expandLivePlayerDetails();
  return playerParser.parseRivalsDataLiveMatch(document, location.href);
}

async function loadLiveMatch(forceRefresh) {
  await selectRivalsDataTab('Live Game');
  if (forceRefresh) {
    const refreshStarted = Date.now();
    let refresh;
    while (Date.now() - refreshStarted < 10_000) {
      refresh = findExactButton('Refresh');
      if (refresh) break;
      try {
        const current = playerParser.parseRivalsDataLiveMatch(document, location.href);
        // In-game lobbies have no site Refresh button. This browser tab was
        // opened specifically for the new check, so its lobby is already fresh.
        if (current.status === 'in-game') return captureLiveMatch();
      } catch { /* Rivals Data is still loading the tab panel. */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (refresh) {
      refresh.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await waitForExactButton('Refresh', 22_000);
    }
  }
  const started = Date.now();
  while (Date.now() - started < 25_000) {
    try { return await captureLiveMatch(); }
    catch { await new Promise((resolve) => setTimeout(resolve, 350)); }
  }
  return captureLiveMatch();
}

async function loadSkins() {
  await selectRivalsDataTab('Skins');
  const started = Date.now();
  while (Date.now() - started < 25_000) {
    const skins = playerParser.parseRivalsDataSkins(document, location.href);
    const loading = document.querySelector('[aria-label="Loading skins"]');
    if (skins.length || !loading) {
      const showAll = [...document.querySelectorAll('button')]
        .find((button) => /^Show all\s+\d+/i.test(playerParser.clean(button.textContent)));
      if (showAll) {
        activateControl(showAll);
        await new Promise((resolve) => setTimeout(resolve, 350));
        return playerParser.parseRivalsDataSkins(document, location.href);
      }
      return skins;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return playerParser.parseRivalsDataSkins(document, location.href);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read image asset.'));
    reader.readAsDataURL(blob);
  });
}

function createImageInliner(maxBlobSize, maxEncodedBytes) {
  const cache = new Map();
  let encodedBytes = 0;
  return async function inline(url) {
    if (!url || url.startsWith('data:')) return url;
    if (cache.has(url)) return cache.get(url);
    try {
      const response = await fetch(url, { credentials: 'include', cache: 'force-cache' });
      if (!response.ok) return url;
      const blob = await response.blob();
      if (blob.size > maxBlobSize || encodedBytes + Math.ceil(blob.size * 4 / 3) > maxEncodedBytes) return url;
      const dataUrl = await blobToDataUrl(blob);
      encodedBytes += dataUrl.length;
      cache.set(url, dataUrl);
      return dataUrl;
    } catch { return url; }
  };
}

async function inlineRivalsDataImages(snapshot) {
  const inline = createImageInliner(96_000, 720_000);
  if (/^https:\/\//i.test(snapshot.rankIconUrl || '')) snapshot.rankIconRemoteUrl = snapshot.rankIconUrl;
  snapshot.rankIconUrl = await inline(snapshot.rankIconUrl);
  for (const hero of snapshot.heroes || []) hero.iconUrl = await inline(hero.iconUrl);
  for (const hero of snapshot.heroStats || []) hero.iconUrl = await inline(hero.iconUrl);
  for (const hero of snapshot.proficiency || []) {
    hero.iconUrl = await inline(hero.iconUrl);
    hero.tierIconUrl = await inline(hero.tierIconUrl);
  }
  for (const skin of snapshot.skins || []) skin.iconUrl = await inline(skin.iconUrl);
  for (const match of snapshot.matchHistory || []) match.heroIconUrl = await inline(match.heroIconUrl);
  return snapshot;
}

async function inlineRivalsDataLiveImages(snapshot) {
  const inline = createImageInliner(128_000, 2_400_000);
  for (const team of snapshot.teams || []) {
    for (const player of team.players || []) {
      player.avatarUrl = await inline(player.avatarUrl);
      player.rankIconUrl = await inline(player.rankIconUrl);
      for (const hero of player.heroes || []) hero.iconUrl = await inline(hero.iconUrl);
      for (const hero of player.heroStats || []) hero.iconUrl = await inline(hero.iconUrl);
      for (const hero of player.proficiency || []) hero.iconUrl = await inline(hero.iconUrl);
      for (const match of player.recentResults || []) match.iconUrl = await inline(match.iconUrl);
    }
  }
  return snapshot;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'rival-shift:refresh') return undefined;
  (async () => {
    try {
      if (message.job?.kind === 'peak-rank') {
        await waitForProfileContent(20_000);
        sendResponse({ ok: true, snapshot: await loadPeakRank() });
        return;
      }
      if (message.job?.kind === 'live-match') {
        let snapshot = await loadLiveMatch(Boolean(message.job.forceRefresh));
        snapshot = await inlineRivalsDataLiveImages(snapshot);
        sendResponse({ ok: true, snapshot });
        return;
      }
      await waitForProfileContent();
      if (!message.job?.scrapeOnly) await refreshPlayerProfile();
      await waitForProfileContent();
      await selectRivalsDataTab('Match History');
      let snapshot = playerParser.parseProfile(document, { uid: message.job.uid, pageUrl: location.href });
      await selectRivalsDataTab('Proficiency');
      snapshot.proficiency = playerParser.parseRivalsDataProficiency(document, location.href);
      try {
        snapshot.skins = await loadSkins();
      } catch {
        // Older Rivals Data profiles may not expose the inventory tab yet.
      }
      snapshot = await inlineRivalsDataImages(snapshot);
      sendResponse({ ok: true, snapshot });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();
  return true;
});
