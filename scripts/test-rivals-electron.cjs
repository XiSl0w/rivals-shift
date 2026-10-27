const { app, session } = require('electron');

function summarize(value, depth = 0) {
  if (depth > 2) return Array.isArray(value) ? `[array:${value.length}]` : typeof value;
  if (Array.isArray(value)) return { kind: 'array', length: value.length, first: value.length ? summarize(value[0], depth + 1) : null };
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, child]) => [key, summarize(child, depth + 1)]));
}

async function main() {
  await app.whenReady();
  const testUid = Number.parseInt(process.env.RIVALS_TEST_UID || '680173547', 10);
  const { RivalsDataClient } = await import('rivalsdata-player-sdk');
  const chromiumSession = session.fromPartition('persist:rival-shift-rivals-data-test');
  const { createChallengeAwareElectronTransport } = require('../dist-electron/rivals-data-api.js');
  const transport = createChallengeAwareElectronTransport(chromiumSession);
  const client = new RivalsDataClient({ transport, timeoutMs: 30_000, cacheTtlMs: 0 });
  if (process.env.RIVALS_TEST_TOP_SNIPER_RAW === '1') {
    const response = await transport({ url: 'https://api.rivalsdata.com/leaderboards?limit=1000&os=1', method: 'GET', headers: { accept: 'application/json' }, signal: new AbortController().signal });
    const players = Array.isArray(response.data?.players) ? response.data.players : [];
    console.log(JSON.stringify(players.filter((player) => player?.status?.state && player.status.state !== 1).slice(0, 20).map((player) => ({ position: player.position, name: player.name, status: player.status })), null, 2));
    app.quit();
    return;
  }
  if (process.env.RIVALS_TEST_TOP_SNIPER === '1') {
    const { RivalsDataApi } = require('../dist-electron/rivals-data-api.js');
    const api = new RivalsDataApi(chromiumSession);
    const players = await api.topSnipers();
    console.log(JSON.stringify({ count: players.length, first: players.slice(0, 10) }, null, 2));
    app.quit();
    return;
  }
  if (process.env.RIVALS_TEST_SKINS === '1') {
    const skins = await client.getPlayerSkins(testUid);
    console.log(JSON.stringify({
      keys: Object.keys(skins || {}),
      skinCount: Array.isArray(skins?.skins) ? skins.skins.length : null,
      eventSkins: skins?.event_skins ?? null,
      unitsValue: skins?.units_value ?? null,
      first: Array.isArray(skins?.skins) ? skins.skins.slice(0, 5) : null,
    }, null, 2));
    app.quit();
    return;
  }
  if (process.env.RIVALS_TEST_REFRESH === '1') {
    const { RivalsDataApi } = require('../dist-electron/rivals-data-api.js');
    const api = new RivalsDataApi(chromiumSession);
    const profile = await api.refresh({ steamId64: 'test', uid: String(testUid), inGameName: '', note: '', favorite: false, updatedAt: null, status: 'linked' });
    console.log(JSON.stringify({
      uid: profile.uid,
      name: profile.inGameName,
      rank: profile.stats?.rank,
      rankScore: profile.stats?.rankScore,
      rankProgress: profile.stats?.rankProgress,
      skins: profile.stats?.skins?.length,
      skinInventoryValue: profile.stats?.skinInventoryValue,
      eventSkinsOwned: profile.stats?.eventSkinsOwned,
      eventSkinsTotal: profile.stats?.eventSkinsTotal,
      firstSkin: profile.stats?.skins?.[0] ? {
        id: profile.stats.skins[0].id,
        name: profile.stats.skins[0].name,
        iconUrl: profile.stats.skins[0].iconUrl,
      } : null,
      matches: profile.stats?.matchHistory?.slice(0, 3).map(({ id, map, result, timeAgo }) => ({ id, map, result, timeAgo })),
      syncedAt: profile.stats?.syncedAt,
      source: profile.stats?.source,
    }, null, 2));
    app.quit();
    return;
  }
  if (process.env.RIVALS_TEST_LIVE_NORMALIZED === '1') {
    const { RivalsDataApi } = require('../dist-electron/rivals-data-api.js');
    const api = new RivalsDataApi(chromiumSession);
    const snapshot = await api.liveMatch({ steamId64: 'test', uid: String(testUid), inGameName: '', note: '', favorite: false, updatedAt: null, status: 'linked' }, true);
    console.log(JSON.stringify({
      status: snapshot.status,
      mode: snapshot.mode,
      teams: snapshot.teams.map((team) => ({
        averageRankScore: team.averageRankScore,
        players: team.players.map(({ uid, name, rank, rankScore, wins, losses, winRate }) => ({ uid, name, rank, rankScore, wins, losses, winRate })),
      })),
    }, null, 2));
    app.quit();
    return;
  }
  if (process.env.RIVALS_TEST_LIVE === '1') {
    const liveProfile = await client.getPlayer(testUid, { preferCache: false });
    const battleId = liveProfile?.status?.battle_id;
    const live = battleId ? await client.getLiveMatch(battleId, { uid: testUid }).catch((error) => ({ error: error.message })) : null;
    console.log(JSON.stringify({ uid: testUid, profile: summarize(liveProfile), status: liveProfile?.status ?? null, live }, null, 2));
    app.quit();
    return;
  }
  const [bundle, searchResults] = await Promise.all([
    client.getAllPlayerData(testUid),
    client.searchPlayers('Veswa'),
  ]);
  const profile = bundle.profile.ok ? bundle.profile.data : null;
  const ranks = profile && typeof profile === 'object' && profile.rank_game_season && typeof profile.rank_game_season === 'object'
    ? Object.entries(profile.rank_game_season).sort(([, left], [, right]) => Number(right.update_time || 0) - Number(left.update_time || 0))
    : [];
  const firstMatch = bundle.matches?.ok && Array.isArray(bundle.matches.data.matches) ? bundle.matches.data.matches[0] : null;
  const matchRows = bundle.matches?.ok && Array.isArray(bundle.matches.data.matches) ? bundle.matches.data.matches : [];
  const matchDetail = firstMatch?.match_uid ? await client.getMatch(firstMatch.match_uid).catch((error) => ({ error: error.message })) : null;
  if (process.env.RIVALS_TEST_COMPACT === '1') {
    console.log(JSON.stringify({
      uid: testUid,
      latestRank: ranks[0] || null,
      punishments: bundle.punishments?.ok ? bundle.punishments.data : bundle.punishments,
      matches: matchRows.map(({ match_uid, timestamp, map_id, game_mode_id, game_play_mode_id }) => ({ match_uid, timestamp, map_id, game_mode_id, game_play_mode_id })),
    }, null, 2));
    app.quit();
    return;
  }
  console.log(JSON.stringify({
    summary: Object.fromEntries(Object.entries(bundle).map(([key, value]) => [key, summarize(value)])),
    searchResults,
    latestRank: ranks[0] || null,
    heroes: bundle.heroes.ok ? bundle.heroes.data : bundle.heroes,
    proficiency: bundle.proficiency.ok ? bundle.proficiency.data : bundle.proficiency,
    punishments: bundle.punishments?.ok ? bundle.punishments.data : bundle.punishments,
    nameHistory: bundle.nameHistory?.ok ? bundle.nameHistory.data : bundle.nameHistory,
    firstMatch: firstMatch || bundle.matches,
    matchDetail,
  }, null, 2));
  app.quit();
}

void main().catch((error) => {
  console.error(error);
  app.exit(1);
});
