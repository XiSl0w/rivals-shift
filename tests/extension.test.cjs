const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseHTML } = require('linkedom');

const root = path.resolve(__dirname, '..');
const rivalsDataParser = require('../extension/parser.js');

test('Rivals Data rank labels normalize Roman divisions and reject navigation text', () => {
  assert.equal(rivalsDataParser.normalizeRank('Celestial III'), 'Celestial 3');
  assert.equal(rivalsDataParser.normalizeRank('Grandmaster I // S8.5'), 'Grandmaster 1');
  assert.equal(rivalsDataParser.normalizeRank('Me Game NEW'), '');
});

test('Rivals Data profile markup parses overview, hero performance, and match history', () => {
  const document = parseHTML(`
    <button aria-label="Refresh player data">Update</button><h2>elsa chadstone</h2>
    <div class="relative size-16"><img src="/avatar.webp"><span>40</span></div>
    <section><div><img src="/assets/ranks/celestial.webp"><span>Celestial 3</span><span>-23 RS</span></div><div><span>51% WR</span><span>20W - 19L</span></div></section>
    <ul><li><img src="/assets/heroes/black-widow.webp" alt="Black Widow"><span>4.37</span><span>26 / 7 / 3</span><span>100% WR</span><span>4W - 0L</span></li></ul>
    <button><div><div>Competitive</div><div>5h ago</div></div><img src="/assets/heroes/venom.webp"><div><span>3</span><span>:</span><span>1</span></div><div><span>Celestial 3</span><span>64 RS</span></div><div><div><span>19</span><span>/</span><span>7</span><span>/</span><span>8</span></div><span>3.86 KDA</span><span>MVP</span></div><div><span>Museum</span><span>Convoy</span></div></button>
  `).document;
  const snapshot = rivalsDataParser.parseProfile(document, { uid: '316383392', pageUrl: 'https://rivalsdata.com/player/316383392' });
  assert.deepEqual({ source: snapshot.source, rank: snapshot.rank, progress: snapshot.rankProgress, level: snapshot.level, wins: snapshot.wins, losses: snapshot.losses, matches: snapshot.matches, winRate: snapshot.winRate },
    { source: 'rivals-data', rank: 'Celestial 3', progress: -23, level: 40, wins: 20, losses: 19, matches: 39, winRate: 51 });
  assert.deepEqual(snapshot.heroStats[0], { name: 'Black Widow', iconUrl: 'https://rivalsdata.com/assets/heroes/black-widow.webp', kda: 4.37, winRate: 100, wins: 4, losses: 0, matches: 4 });
  assert.deepEqual(snapshot.matchHistory[0], { mode: 'Competitive', timeAgo: '5h ago', result: 'win', score: '3:1', hero: 'Venom', heroIconUrl: 'https://rivalsdata.com/assets/heroes/venom.webp', rank: 'Celestial 3', rankProgress: 64, kills: 19, deaths: 7, assists: 8, kda: 3.86, placement: 'MVP', map: 'Museum', mapMode: 'Convoy' });
});

test('Rivals Data proficiency tab parses hero level and tier artwork', () => {
  const document = parseHTML(`<div role="tabpanel"><ul><li><img alt="Elsa Bloodstone" src="/assets/heroes/elsa-bloodstone.webp"><div></div><img title="Captain" src="/assets/proficiency/captain.webp"><span>Level 11</span></li></ul></div>`).document;
  assert.deepEqual(rivalsDataParser.parseRivalsDataProficiency(document, 'https://rivalsdata.com/player/316383392'), [{
    name: 'Elsa Bloodstone', iconUrl: 'https://rivalsdata.com/assets/heroes/elsa-bloodstone.webp', tier: 'Captain', tierIconUrl: 'https://rivalsdata.com/assets/proficiency/captain.webp', level: 11,
  }]);
});

test('Rivals Data skins tab parses inventory artwork and value', () => {
  const document = parseHTML(`<div role="tabpanel"><ul><li><img alt="Vengeance" src="/assets/skins/vengeance.webp"><strong>Vengeance</strong><small>Psylocke</small><span>Legendary</span><span>2,200 Units</span></li></ul></div>`).document;
  assert.deepEqual(rivalsDataParser.parseRivalsDataSkins(document, 'https://rivalsdata.com/player/1'), [{
    name: 'Vengeance', hero: 'Psylocke', iconUrl: 'https://rivalsdata.com/assets/skins/vengeance.webp', rarity: 'Legendary', category: 'Legendary', value: 2200,
  }]);
});

test('Rivals Data all-season peak rows choose the highest rank and highest top-tier points', () => {
  const document = parseHTML(`
    <button type="button" aria-pressed="true">Show Peak</button>
    <ul>
      <li><span>S9.5</span><img src="/assets/ranks/eternity-alt.webp"><span>E</span><span>106 RS</span><span>100W</span></li>
      <li><span>S9</span><img src="/assets/ranks/one-above-all-alt.webp"><span>OAA</span><span>84 RS</span><span>272W</span></li>
      <li><span>S8.5</span><img src="/assets/ranks/one-above-all-alt.webp"><span>OAA</span><span>147 RS</span><span>153W</span></li>
      <li><span>S8</span><img src="/assets/ranks/celestial-alt.webp"><span>C1</span><span>84 RS</span><span>110W</span></li>
    </ul>
  `).document;
  assert.deepEqual(rivalsDataParser.parseRivalsDataPeakRank(document), { peakRank: 'One Above All', peakRankScore: 147, peakRankIconUrl: 'https://rivalsdata.com/assets/ranks/one-above-all-alt.webp' });
});

test('Rivals Data overall peak uses the highest rank across every season', () => {
  const document = parseHTML(`
    <button type="button" aria-pressed="false" class="hidden">Show Peak</button>
    <button type="button" aria-pressed="true">Show Peak</button>
    <ul>
      <li><span>S10.5</span><span><span><img src="/assets/ranks/grandmaster-alt.webp"><span>GM1</span> <span>51 RS</span></span></span><span>52W</span></li>
      <li><span>S7.5</span><span><span><img src="/assets/ranks/grandmaster-alt.webp"><span>GM2</span> <span>94 RS</span></span></span><span>34W</span></li>
      <li><span>S2.5</span><span><span><img src="/assets/ranks/celestial-alt.webp"><span>C3</span> <span>63 RS</span></span></span><span>49W</span></li>
      <li><span>S1.5</span><span><span><img src="/assets/ranks/celestial-alt.webp"><span>C3</span> <span>20 RS</span></span></span><span>52W</span></li>
    </ul>
  `).document;
  assert.deepEqual(rivalsDataParser.parseRivalsDataPeakRank(document), {
    peakRank: 'Celestial 3', peakRankScore: 63, peakRankIconUrl: 'https://rivalsdata.com/assets/ranks/celestial-alt.webp',
  });
});

test('Rivals Data live game parses both teams and every visible player field', () => {
  const document = parseHTML(`
    <h2>MACE</h2><span>In game (Competitive) - 10:08</span>
    <section><div><span>Team 1</span><span>Avg: 5125 RS (-14)</span></div><ul>
      <li><div><img src="/assets/icons/31060001.webp"><a href="/player/561870101">1vø7</a><span><img src="/assets/ranks/celestial.webp">C1<small>95 RS</small></span><div><span>38W - 36L</span><span>51%</span></div><div><img src="/assets/heroes/the-hood.webp"><img src="/assets/heroes/thor.webp"></div><button aria-label="Toggle details for 1vø7" aria-expanded="true"></button></div><div>
        <section><div><span>Heroes</span><button><span>Season 9.5</span></button></div><div><ul><li><img src="/assets/heroes/the-hood.webp"><span>The Hood</span><span>4</span><span>75%</span></li></ul></div></section>
        <section><div><span>Proficiency</span></div><div><ul><li><img src="/assets/heroes/magneto.webp" title="Magneto"><span>Lv 22</span></li></ul></div></section>
        <section><div><span>Match history</span></div><div><ul><li><img src="/assets/heroes/thor.webp"><span>W</span><span>+24</span></li><li><img src="/assets/heroes/the-hood.webp"><span>L</span><span>-18</span></li></ul></div></section>
      </div></li>
    </ul></section>
    <section><div><span>Team 2</span><span>Avg: 5139 RS (+14)</span></div><ul>
      <li><div><img src="/assets/icons/31060002.webp"><a href="/player/2">Daes</a><span><img src="/assets/ranks/one-above-all.webp">OAA<small>175 RS</small></span><div><span>5W - 3L</span><span>63%</span></div><div><img src="/assets/heroes/magneto.webp"></div></div></li>
    </ul></section>
  `).document;
  const snapshot = rivalsDataParser.parseRivalsDataLiveMatch(document, 'https://rivalsdata.com/player/1602282958');
  assert.equal(snapshot.status, 'in-game');
  assert.equal(snapshot.mode, 'Competitive');
  assert.equal(snapshot.elapsed, '10:08');
  assert.deepEqual({ average: snapshot.teams[0].averageRankScore, change: snapshot.teams[0].projectedChange }, { average: 5125, change: -14 });
  assert.deepEqual({ uid: snapshot.teams[0].players[0].uid, name: snapshot.teams[0].players[0].name, rank: snapshot.teams[0].players[0].rank, score: snapshot.teams[0].players[0].rankScore, wins: snapshot.teams[0].players[0].wins, losses: snapshot.teams[0].players[0].losses, winRate: snapshot.teams[0].players[0].winRate },
    { uid: '561870101', name: '1vø7', rank: 'Celestial 1', score: 95, wins: 38, losses: 36, winRate: 51 });
  assert.deepEqual(snapshot.teams[0].players[0].heroes.map((hero) => hero.name), ['The Hood', 'Thor']);
  assert.equal(snapshot.teams[0].players.length, 1, 'expanded detail list items must not become lobby players');
  assert.equal(snapshot.teams[0].players[0].detailSeason, 'Season 9.5');
  assert.deepEqual(snapshot.teams[0].players[0].heroStats[0], { name: 'The Hood', iconUrl: 'https://rivalsdata.com/assets/heroes/the-hood.webp', matches: 4, winRate: 75 });
  assert.deepEqual(snapshot.teams[0].players[0].proficiency[0], { name: 'Magneto', iconUrl: 'https://rivalsdata.com/assets/heroes/magneto.webp', level: 22 });
  assert.deepEqual(snapshot.teams[0].players[0].recentResults.map(({ result, rankChange }) => ({ result, rankChange })), [{ result: 'win', rankChange: 24 }, { result: 'loss', rankChange: -18 }]);
});

test('Rivals Data live game returns a clean offline state', () => {
  const document = parseHTML('<div><p>Player is not currently in game</p><button>Refresh</button></div>').document;
  assert.deepEqual(rivalsDataParser.parseRivalsDataLiveMatch(document).status, 'offline');
});

test('Rivals Data live game keeps a numeric rank division out of the adjacent record', () => {
  const document = parseHTML(`
    <h2>Player</h2><span>In game (Competitive) - 03:12</span>
    <section><div><span>Team 1</span><span>Avg: 5100 RS</span></div><ul>
      <li><div><img src="/assets/icons/1.webp"><a href="/player/1">Alpha</a><span><img src="/assets/ranks/celestial.webp">C3</span><div><span>24W - 24L</span><span>50%</span></div><div></div></div></li>
    </ul></section>
    <section><div><span>Team 2</span><span>Avg: 5100 RS</span></div><ul>
      <li><div><img src="/assets/icons/2.webp"><a href="/player/2">Bravo</a><span><img src="/assets/ranks/celestial.webp">C3</span><div><span>10W - 10L</span><span>50%</span></div><div></div></div></li>
    </ul></section>
  `).document;
  const snapshot = rivalsDataParser.parseRivalsDataLiveMatch(document);
  assert.deepEqual({ wins: snapshot.teams[0].players[0].wins, losses: snapshot.teams[0].players[0].losses }, { wins: 24, losses: 24 });
});

test('Rivals Data live game waits for the current split status and keeps masked lobby players', () => {
  const document = parseHTML(`
    <h2>Def not Xi</h2><span>In game (Quick Play)</span><span>- 02:06</span>
    <section><div><span>Team 1</span><span>Avg: 3755 RS</span><span>(-3)</span></div><ul>
      <li><div><img src="/assets/icons/30000245.webp"><div><span>*****10</span></div><span><img src="/assets/ranks/grandmaster.webp">GM1<span>-779 RS</span></span><div><span>30W - 25L</span><span>55%</span></div><div></div></div></li>
    </ul></section>
    <section><div><span>Team 2</span><span>Avg: 3758 RS</span><span>(+3)</span></div><ul>
      <li><div><img src="/assets/icons/31058208.webp"><div><a href="/player/465836196">SWEXGAWD</a></div><span><img src="/assets/ranks/platinum.webp">P1<span>-296 RS</span></span><span>-</span><div><img src="/assets/heroes/doctor-strange.webp"></div></div></li>
    </ul></section>
  `).document;
  const snapshot = rivalsDataParser.parseRivalsDataLiveMatch(document, 'https://rivalsdata.com/player/1487699139');
  assert.equal(snapshot.mode, 'Quick Play');
  assert.equal(snapshot.elapsed, '02:06');
  assert.deepEqual({ name: snapshot.teams[0].players[0].name, uid: snapshot.teams[0].players[0].uid, rank: snapshot.teams[0].players[0].rank, score: snapshot.teams[0].players[0].rankScore },
    { name: '*****10', uid: '', rank: 'Grandmaster 1', score: -779 });
  assert.equal(snapshot.teams[1].players[0].name, 'SWEXGAWD');
});

test('Rivals Data content script attaches before a slow page reaches complete', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
  const rivalsDataScript = manifest.content_scripts.find((script) => script.matches.includes('https://rivalsdata.com/player/*'));
  assert.ok(rivalsDataScript);
  assert.equal(rivalsDataScript.run_at, 'document_start');
});

test('extension manifest grants and injects only Rivals Data', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(Number(manifest.minimum_chrome_version) >= 102);
  assert.deepEqual(manifest.host_permissions, ['https://rivalsdata.com/*', 'http://127.0.0.1:38573/*']);
  assert.deepEqual(manifest.content_scripts.flatMap((script) => script.matches), ['https://rivalsdata.com/player/*']);
});

test('background worker messages the content script without waiting for tab complete', () => {
  const source = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
  assert.doesNotMatch(source, /await\s+waitForTab/);
  assert.match(source, /attempt\s*<\s*120/);
  assert.match(source, /\/jobs\/cancelled/);
  assert.match(source, /chrome\.tabs\.remove\(tabId\)/);
});

test('content script handles Rivals Data tabs and never sends a heading as identity', () => {
  const source = fs.readFileSync(path.join(root, 'extension', 'content.js'), 'utf8');
  const parserSource = fs.readFileSync(path.join(root, 'extension', 'parser.js'), 'utf8');
  assert.match(parserSource, /loading profile\|compiling profile data\|loading player/i);
  assert.doesNotMatch(source, /name:\s*heading/);
  assert.match(source, /\.updater__refresh/);
  assert.match(source, /waitForExactButton\('Refresh', 22_000\)/);
  assert.match(source, /current\.status === 'in-game'/);
  assert.match(source, /kind === 'live-match'/);
  assert.match(source, /aria-selected/);
  assert.match(source, /new MouseEvent\('mousedown'/);
  assert.match(source, /button\[aria-label\^="Toggle details for"\]/);
  assert.match(source, /selectRivalsDataSeason\('All Seasons'\)/);
  assert.match(source, /findExactButtons\('Show Peak'\)/);
  assert.match(source, /getClientRects\(\)\.length/);
  assert.match(source, /kind === 'peak-rank'/);
  assert.match(source, /inlineRivalsDataLiveImages/);
  assert.match(source, /Could not activate the \$\{name\} tab/);
  assert.ok(source.indexOf("kind === 'live-match'") < source.indexOf('await waitForProfileContent()'), 'live-match tab activation must run before profile parsing');
});

test('live-game background returns the lobby without opening every player profile', () => {
  const source = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
  assert.doesNotMatch(source, /addLivePeakRanks/);
  assert.match(source, /kind:\s*'peak-rank'/);
  assert.match(source, /rivalsdata\.com\/player\/\$\{encodeURIComponent\(uid\)\}/);
  assert.match(source, /job\.kind !== 'live-match'/);
  assert.match(source, /Object\.assign\(result\.snapshot, peak\)/);
});

test('background identifies its live runtime version on every bridge request', () => {
  const source = fs.readFileSync(path.join(root, 'extension', 'background.js'), 'utf8');
  assert.match(source, /chrome\.runtime\.getManifest\(\)\.version/);
  assert.match(source, /version=\$\{encodeURIComponent\(RUNTIME_VERSION\)\}/);
});

test('live-game search stops after finding a match while hidden names refresh until revealed', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  assert.match(source, /result\.status === 'in-game'[\s\S]*setLiveSearchActive\(false\)/);
  assert.match(source, /setTimeout\(\(\) => void checkLiveMatch\('refresh'\), 5_000\)/);
  assert.match(source, /resolvingHiddenLiveNames[\s\S]*setTimeout\(\(\) => void checkLiveMatch\('refresh'\), 15_000\)/);
  assert.match(source, /hasMaskedLivePlayerNames\(liveMatch\)/);
  assert.doesNotMatch(source, /if \(!liveMatch && currentProfile\?\.uid/);
  assert.match(source, /NAME REVEAL LOCKED/);
  assert.match(source, /mandatory refresh again in 15 seconds/);
  assert.match(source, /STOP SEARCHING/);
  assert.match(source, /CHECK NEXT MATCH/);
  assert.match(source, /onRecheck/);
  assert.match(source, /LOBBY SNAPSHOT/);
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.ts'), 'utf8');
  assert.match(preload, /restartLiveMatch:[\s\S]*forceRefresh: true, restart: true/);
});

test('player search offers a protected three-second auto-refresh loop', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  assert.match(source, /\[playerAutoRefresh, setPlayerAutoRefresh\] = useState\(false\)/);
  assert.match(source, /setInterval\(\(\) => void searchPlayers\(\), 3_000\)/);
  assert.match(source, /playerSearchInFlight\.current/);
  assert.match(source, /Stop auto search/);
  assert.match(source, /Searching every 3 seconds/);
  assert.match(source, /activeTab !== 'players'\) setPlayerAutoRefresh\(false\)/);
  assert.match(source, /setQuery\(event\.target\.value\); if \(autoRefresh\) onToggleAutoRefresh\(\)/);
});

test('expanded live-game players grow the board into the outer scroll surface', () => {
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  assert.match(styles, /\.live-game-board\s*\{\s*height:\s*auto;[\s\S]*?overflow:\s*visible;/);
  assert.match(styles, /\.live-teams\s*\{[\s\S]*?overflow:\s*visible;/);
  assert.match(styles, /\.live-team\s*\{\s*overflow:\s*visible;/);
});

test('live-game dashboard exposes fast lobby facts and an immediate refresh control', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  assert.match(app, /className="live-match-facts"/);
  assert.match(app, />TEAM GAP</);
  assert.match(app, />DETAILS</);
  assert.match(app, /className="live-refresh-now"/);
  assert.match(app, /tracked=\{player\.uid === profile\?\.uid\}/);
  assert.match(styles, /v0\.9\.51 reliable Rivals Data verification and API deadlines/);
});

test('player search and the compact two-column connection selector are present', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  assert.match(app, /activeTab === 'players'/);
  assert.match(app, /searchRivalsDataPlayers/);
  assert.match(app, /Refresh favorites/);
  assert.match(app, /connection-mode-grid/);
  assert.match(styles, /\.connection-mode-grid[^}]*grid-template-columns:\s*repeat\(2/);
});

test('custom setup embeds and displays the Rival Shift icon', () => {
  const installer = fs.readFileSync(path.join(root, 'build', 'CustomInstaller.cs'), 'utf8');
  const builder = fs.readFileSync(path.join(root, 'builders', 'build-installer.mjs'), 'utf8');
  assert.match(installer, /Icon = setupIcon/);
  assert.match(installer, /LoadLogoImage\(\)/);
  assert.match(builder, /RivalShiftSetupIcon/);
});

test('installer switches to an unmistakable ready-to-launch screen', () => {
  const installer = fs.readFileSync(path.join(root, 'build', 'CustomInstaller.cs'), 'utf8');
  assert.match(installer, /ShowInstalledState\(\)/);
  assert.match(installer, /INSTALLATION COMPLETE/);
  assert.match(installer, /Rival Shift is ready\./);
  assert.match(installer, /Launch Rival Shift/);
  assert.match(installer, /finishPanel\.Visible = true/);
  assert.match(installer, /class SuccessBadge/);
  assert.match(installer, /class CompletionCard/);
  assert.match(installer, /rival-shift\.before-install\.json/);
});

test('the guide and removed launch modifiers stay out while scroll surfaces share a theme', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');
  const installer = fs.readFileSync(path.join(root, 'build', 'CustomInstaller.cs'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
  assert.doesNotMatch(app, /GuidePage|Getting started|skipIntroVideos|stretchedResolution/);
  assert.doesNotMatch(main, /intro-skip|stretched-resolution|skipIntroVideos|stretchedResolution|show-guide-on-first-launch/);
  assert.doesNotMatch(installer, /show-guide-on-first-launch/);
  assert.match(styles, /One consistent, visible scrollbar treatment/);
  assert.match(styles, /\*::\-webkit-scrollbar-thumb:hover/);
});

test('the current Steam session can launch Marvel Rivals when the game is closed', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.ts'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');
  const steam = fs.readFileSync(path.join(root, 'electron', 'steam.ts'), 'utf8');
  assert.match(app, /gameRunning \? 'Active' : 'Launch'/);
  assert.match(app, /api\.launchCurrentGame\(\)/);
  assert.match(preload, /game:launch-current/);
  assert.match(main, /ipcMain\.handle\('game:launch-current'/);
  assert.match(main, /if \(launcherSkip\) await setLauncherSkip\(true\)/);
  assert.doesNotMatch(steam, /'\-PSOCompileMode=1'/);
});

test('account cards expose one-click launch and automatic updates remain user controlled', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'electron', 'preload.ts'), 'utf8');
  const main = fs.readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');
  const buildInstaller = fs.readFileSync(path.join(root, 'builders', 'build-installer.mjs'), 'utf8');

  assert.match(app, /account-quick-launch/);
  assert.match(app, /quickLaunchAccount/);
  assert.match(app, /Download updates automatically/);
  assert.match(preload, /updates:check/);
  assert.match(preload, /updates:install/);
  assert.match(main, /autoUpdater\.checkForUpdates/);
  assert.match(main, /autoUpdates/);
  assert.match(buildInstaller, /RIVAL_SHIFT_UPDATE_URL/);
  assert.match(buildInstaller, /latest\.yml/);
});
