(function exposeRivalsDataParser(root) {
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  // textContent does not insert whitespace between sibling elements. Rivals Data
  // renders stats in adjacent spans, so "Celestial 3" + "36 RS" otherwise
  // becomes "Celestial 336 RS" (and "C3" + "24W" becomes "C324W").
  const spacedText = (node) => {
    if (!node) return '';
    if (node.nodeType === 3) return clean(node.textContent);
    return clean([...(node.childNodes || [])].map((child) => spacedText(child)).filter(Boolean).join(' '));
  };
  const number = (value) => {
    const parsed = Number.parseFloat(clean(value).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  function normalizeRank(value) {
    const raw = clean(value).replace(/\s*\/\/.*$/, '');
    const match = raw.match(/^(Bronze|Silver|Gold|Platinum|Diamond|Grandmaster|Celestial)\s+(I{1,3}|[123])$/i);
    if (match) {
      const division = { I: '1', II: '2', III: '3' }[match[2].toUpperCase()] || match[2];
      return `${match[1]} ${division}`;
    }
    return /^(Eternity|One Above All)$/i.test(raw) ? raw : '';
  }

  const pageText = (document) => clean(document.body?.innerText || document.body?.textContent);

  function pageState(document) {
    const page = pageText(document);
    if (/performing security verification|just a moment|checking your browser|enable javascript and cookies to continue/i.test(page)) return 'security';
    if (/profile\s+(?:is\s+)?private|private\s+profile|career profile.+private/i.test(page)) return 'private';
    if (/player\s+(?:was\s+)?not found|profile\s+(?:was\s+)?not found|profile unavailable|could(?:n['â€™]t| not) find|we could not find/i.test(page)) return 'not-found';
    if (/loading profile|compiling profile data|loading player/i.test(page)) return 'loading';
    if (document.querySelector('button[aria-label="Refresh player data"]') && document.querySelector('h2')) return 'ready';
    return 'unknown';
  }

  function stateError(state) {
    if (state === 'security') return 'Rivals Data is showing a security verification page in the browser.';
    if (state === 'private') return 'This Rivals Data profile is private. Set Career Profile visibility to Everyone in Marvel Rivals.';
    if (state === 'not-found') return 'Rivals Data could not find this player profile.';
    if (state === 'loading') return 'Rivals Data profile is still loading. Please try again.';
    return '';
  }

  function absoluteImage(img, pageUrl) {
    if (!img) return '';
    const source = img.currentSrc || img.src || img.getAttribute('data-src') || '';
    try { return source ? new URL(source, pageUrl).href : ''; } catch { return ''; }
  }

  function imageRows(document, pageUrl) {
    return [...document.querySelectorAll('img')].map((img) => ({
      img,
      url: absoluteImage(img, pageUrl),
      alt: clean(img.alt || img.getAttribute('aria-label')),
    })).filter((item) => item.url);
  }

  function ownTextElements(document) {
    return [...document.querySelectorAll('h1,h2,h3,h4,span,p,div,strong,b')].filter((element) => {
      const text = clean(element.textContent);
      return text && text.length <= 60 && [...element.children].every((child) => !clean(child.textContent));
    });
  }

  function smallestStatContainer(element) {
    let current = element;
    for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
      const text = clean(current.textContent);
      if (text.length <= 260 && (/\b\d[\d,]*(?:\.\d+)?\s*RS(?![A-Za-z])/i.test(text) || /\d+\s*W\s*[-/]?\s*\d+\s*L/i.test(text))) return current;
    }
    return element.parentElement;
  }

  function parseWinsLosses(value) {
    const match = clean(value).match(/(\d[\d,]*)\s*W\s*[-/]?\s*(\d[\d,]*)\s*L/i);
    return match ? { wins: number(match[1]), losses: number(match[2]) } : {};
  }

  function heroNameFromUrl(value) {
    const match = String(value || '').match(/\/assets\/heroes\/([^/?#.]+)\.[a-z0-9]+/i);
    if (!match) return '';
    return match[1].split('-').map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '').join(' ')
      .replace(/\bAnd\b/g, '&');
  }

  function rivalsDataHeroStats(document, pageUrl) {
    const rows = [];
    for (const row of document.querySelectorAll('li')) {
      const image = row.querySelector('img[alt][src*="/assets/heroes/"]');
      const text = spacedText(row);
      if (!image || !/%\s*WR/i.test(text) || !/\d+\s*W\s*-\s*\d+\s*L/i.test(text)) continue;
      const name = clean(image.alt || image.title) || heroNameFromUrl(image.src);
      if (!name || rows.some((hero) => hero.name === name)) continue;
      const record = parseWinsLosses(text);
      const kda = [...row.querySelectorAll('span')].map((node) => clean(node.textContent)).find((value) => /^\d+(?:\.\d+)?$/.test(value));
      const winRate = [...row.querySelectorAll('span')].map((node) => clean(node.textContent)).find((value) => /%\s*WR/i.test(value));
      rows.push({
        name,
        iconUrl: absoluteImage(image, pageUrl),
        kda: number(kda),
        winRate: number(winRate),
        wins: record.wins,
        losses: record.losses,
        matches: record.wins != null && record.losses != null ? record.wins + record.losses : undefined,
      });
      if (rows.length === 8) break;
    }
    return rows;
  }

  function rivalsDataMatchHistory(document, pageUrl) {
    const matches = [];
    for (const row of document.querySelectorAll('button')) {
      const children = [...row.children];
      const heroImage = children[1]?.matches?.('img[src*="/assets/heroes/"]') ? children[1] : null;
      const text = clean(row.textContent);
      if (!heroImage || children.length < 6 || !/\d+(?:\.\d+)?\s*KDA/i.test(text)) continue;
      const modeParts = [...children[0].querySelectorAll('div')].map((node) => clean(node.textContent)).filter(Boolean);
      const scoreParts = [...children[2].querySelectorAll('span')].map((node) => clean(node.textContent)).filter((value) => /^\d+$/.test(value)).slice(0, 2);
      const scoreLeft = number(scoreParts[0]);
      const scoreRight = number(scoreParts[1]);
      const rank = [...children[3].querySelectorAll('span,div')].map((node) => normalizeRank(node.textContent)).find(Boolean) || '';
      const rankProgressText = [...children[3].querySelectorAll('span,div')].map((node) => clean(node.textContent)).find((value) => /^[+-]?[\d,]+(?:\.\d+)?\s*RS$/i.test(value));
      const combatNumbers = [...children[4].querySelectorAll('span')].map((node) => clean(node.textContent)).filter((value) => /^\d+$/.test(value)).slice(0, 3);
      const kdaText = [...children[4].querySelectorAll('span,div')].map((node) => clean(node.textContent)).find((value) => /^\d+(?:\.\d+)?\s*KDA$/i.test(value));
      const placement = [...children[4].querySelectorAll('span')].map((node) => clean(node.textContent))
        .find((value) => /^(?:MVP|SVP|\d+(?:st|nd|rd|th))$/i.test(value));
      const mapParts = [...children[5].querySelectorAll('span')].map((node) => clean(node.textContent)).filter(Boolean);
      matches.push({
        mode: modeParts[0] || '',
        timeAgo: modeParts[1] || '',
        result: scoreLeft == null || scoreRight == null ? undefined : scoreLeft > scoreRight ? 'win' : scoreLeft < scoreRight ? 'loss' : 'draw',
        score: scoreParts.length === 2 ? `${scoreParts[0]}:${scoreParts[1]}` : '',
        hero: clean(heroImage.alt) || heroNameFromUrl(heroImage.src),
        heroIconUrl: absoluteImage(heroImage, pageUrl),
        rank,
        rankProgress: number(rankProgressText),
        kills: number(combatNumbers[0]),
        deaths: number(combatNumbers[1]),
        assists: number(combatNumbers[2]),
        kda: number(kdaText),
        placement,
        map: mapParts[0] || '',
        mapMode: mapParts[1] || '',
      });
      if (matches.length === 12) break;
    }
    return matches;
  }

  function parseRivalsDataProficiency(document, pageUrl) {
    const proficiency = [];
    for (const row of document.querySelectorAll('[role="tabpanel"] li, li')) {
      const heroImage = row.querySelector('img[alt][src*="/assets/heroes/"]');
      const tierImage = row.querySelector('img[src*="/assets/proficiency/"]');
      const level = clean(row.textContent).match(/Level\s+(\d+)/i);
      if (!heroImage || !tierImage || !level) continue;
      const name = clean(heroImage.alt || heroImage.title) || heroNameFromUrl(heroImage.src);
      if (!name || proficiency.some((hero) => hero.name === name)) continue;
      proficiency.push({
        name,
        iconUrl: absoluteImage(heroImage, pageUrl),
        tier: clean(tierImage.title || tierImage.alt),
        tierIconUrl: absoluteImage(tierImage, pageUrl),
        level: number(level[1]),
      });
      if (proficiency.length === 12) break;
    }
    return proficiency;
  }

  function parseRivalsDataSkins(document, pageUrl) {
    const skins = [];
    const images = document.querySelectorAll('[role="tabpanel"] img, main img');
    for (const image of images) {
      const source = absoluteImage(image, pageUrl);
      if (!/\/(?:skins?|costumes?)\//i.test(source)) continue;
      let card = image;
      for (let depth = 0; card && depth < 6; depth += 1, card = card.parentElement) {
        if (card.matches?.('li,article,[role="listitem"],button')) break;
      }
      const cardText = spacedText(card || image.parentElement);
      const label = [...(card?.querySelectorAll?.('h2,h3,h4,strong,b,span') || [])]
        .map((node) => clean(node.textContent))
        .find((value) => value && !/^Equipped$/i.test(value) && !/^[\d,]+(?:\s*\/\s*\w+)?$/.test(value));
      const name = clean(image.alt || image.title)
        || label
        || source.split('/').pop()?.replace(/\.[^.]+$/, '').split('-').map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '').join(' ');
      if (!name || skins.some((skin) => skin.name === name && skin.iconUrl === source)) continue;
      const hero = clean(card?.querySelector?.('[data-hero],small')?.textContent).replace(/^(?:Hero|For)\s*:?\s*/i, '');
      const rarity = cardText.match(/\b(Common|Rare|Epic|Legendary|Mythic|Deluxe|Event|Battle Pass|Shop)\b/i)?.[1];
      const value = number(cardText.match(/([\d,]+)(?:\s*(?:Units?|Lattice|Value)|\s*\/)/i)?.[1]);
      const id = source.match(/\/assets\/skins\/icon\/(\d+)\./i)?.[1];
      const equipped = Boolean(card?.querySelector?.('[aria-label="Equipped"]'));
      skins.push({ ...(id ? { id } : {}), name, ...(hero && hero !== name ? { hero } : {}), iconUrl: source, ...(rarity ? { rarity, category: rarity } : {}), ...(value != null ? { value } : {}), ...(equipped ? { equipped: true } : {}) });
    }
    return skins;
  }

  function rivalsDataSnapshot(document, uid, pageUrl) {
    const images = imageRows(document, pageUrl);
    const rankImage = images.find((item) => /\/assets\/ranks\//i.test(item.url));
    let overview = rankImage?.img;
    for (let depth = 0; overview && depth < 6 && !/\d+\s*W\s*-\s*\d+\s*L/i.test(spacedText(overview)); depth += 1) overview = overview.parentElement;
    const overviewText = spacedText(overview);
    const rank = [...(overview?.querySelectorAll('span,div') ?? [])].map((node) => normalizeRank(node.textContent)).find(Boolean) || '';
    const rankMetric = overviewText.match(/([+-]?[\d,]+(?:\.\d+)?)\s*RS/i);
    const winRate = overviewText.match(/(\d+(?:\.\d+)?)\s*%\s*WR/i);
    const record = parseWinsLosses(overviewText);
    const heroStats = rivalsDataHeroStats(document, pageUrl);
    return {
      uid: decodeURIComponent(uid),
      rank,
      rankScore: /^(?:Eternity|One Above All)$/i.test(rank) ? number(rankMetric?.[1]) : undefined,
      rankProgress: /^(?:Eternity|One Above All)$/i.test(rank) ? undefined : number(rankMetric?.[1]),
      level: number(document.querySelector('div.relative.size-16 span, div.relative.size-24 span')?.textContent),
      winRate: number(winRate?.[1]) ?? (record.wins != null && record.losses != null && record.wins + record.losses ? Math.round((record.wins / (record.wins + record.losses)) * 1000) / 10 : undefined),
      wins: record.wins,
      losses: record.losses,
      matches: record.wins != null && record.losses != null ? record.wins + record.losses : undefined,
      rankIconUrl: rankImage?.url || '',
      heroes: heroStats.map(({ name, iconUrl }) => ({ name, iconUrl })),
      heroStats,
      matchHistory: rivalsDataMatchHistory(document, pageUrl),
      pageUrl,
    };
  }

  function parseProfile(document, { uid = '', pageUrl = 'https://rivalsdata.com/' } = {}) {
    const error = stateError(pageState(document));
    if (error) throw new Error(error);
    const snapshot = rivalsDataSnapshot(document, uid, pageUrl);
    if (!snapshot.rank && snapshot.level == null && snapshot.matches == null && !snapshot.heroes.length) {
      throw new Error('Rivals Data loaded, but no profile statistics were found on the page.');
    }
    return { ...snapshot, source: 'rivals-data' };
  }

  function parseLivePlayerDetails(row, pageUrl) {
    const detail = row.firstElementChild?.nextElementSibling;
    if (!detail) return {};
    const sections = [...detail.querySelectorAll('section')];
    const namedSection = (name) => sections.find((section) => clean(section.firstElementChild?.textContent).toLowerCase().startsWith(name));
    const heroesSection = namedSection('heroes');
    const proficiencySection = namedSection('proficiency');
    const historySection = namedSection('match history');
    const season = [...(heroesSection?.querySelectorAll('button,span') ?? [])]
      .map((node) => clean(node.textContent)).find((value) => /^Season\s+\d+(?:\.\d+)?$/i.test(value));
    const heroStats = [...(heroesSection?.querySelectorAll('li') ?? [])].map((item) => {
      const image = item.querySelector('img[src*="/assets/heroes/"]');
      const values = [...item.querySelectorAll('span')].map((node) => clean(node.textContent)).filter(Boolean);
      const name = values.find((value) => !/^\d+(?:\.\d+)?%?$/.test(value)) || heroNameFromUrl(image?.src || '');
      return {
        name,
        iconUrl: absoluteImage(image, pageUrl),
        matches: number(values.find((value) => /^\d+$/.test(value))),
        winRate: number(values.find((value) => /^\d+(?:\.\d+)?%$/.test(value))),
      };
    }).filter((hero) => hero.name);
    const proficiency = [...(proficiencySection?.querySelectorAll('li') ?? [])].map((item) => {
      const image = item.querySelector('img[src*="/assets/heroes/"]');
      return {
        name: clean(image?.getAttribute('title') || image?.getAttribute('aria-label') || image?.getAttribute('alt')) || heroNameFromUrl(image?.src || ''),
        iconUrl: absoluteImage(image, pageUrl),
        level: number([...item.querySelectorAll('span')].map((node) => clean(node.textContent)).find((value) => /^Lv\s*\d+$/i.test(value))),
      };
    }).filter((hero) => hero.name);
    const recentResults = [...(historySection?.querySelectorAll('li') ?? [])].map((item) => {
      const image = item.querySelector('img[src*="/assets/heroes/"]');
      const values = [...item.querySelectorAll('span')].map((node) => clean(node.textContent)).filter(Boolean);
      const resultCode = values.find((value) => /^[WLD]$/i.test(value))?.toUpperCase();
      if (!resultCode) return null;
      return {
        name: clean(image?.getAttribute('title') || image?.getAttribute('aria-label') || image?.getAttribute('alt')) || heroNameFromUrl(image?.src || ''),
        iconUrl: absoluteImage(image, pageUrl),
        result: resultCode === 'W' ? 'win' : resultCode === 'L' ? 'loss' : 'draw',
        rankChange: number(values.find((value) => /^[+-]?\d+$/.test(value))),
      };
    }).filter(Boolean);
    return {
      ...(season ? { detailSeason: season } : {}),
      ...(heroStats.length ? { heroStats } : {}),
      ...(proficiency.length ? { proficiency } : {}),
      ...(recentResults.length ? { recentResults } : {}),
    };
  }

  function rankOrder(rank) {
    const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Grandmaster', 'Celestial', 'Eternity', 'One Above All'];
    const normalized = clean(rank);
    const tierIndex = tiers.findIndex((tier) => normalized === tier || normalized.startsWith(`${tier} `));
    if (tierIndex < 0) return -1;
    const division = number(normalized.match(/\s+([123])$/)?.[1]);
    return (tierIndex + 1) * 100 + (division != null ? 4 - division : 0);
  }

  function expandShortRank(value) {
    const shorthand = clean(value).toUpperCase().match(/^(B|S|G|P|D|GM|C)([123])$/);
    const names = { B: 'Bronze', S: 'Silver', G: 'Gold', P: 'Platinum', D: 'Diamond', GM: 'Grandmaster', C: 'Celestial', E: 'Eternity', OAA: 'One Above All' };
    return shorthand ? `${names[shorthand[1]]} ${shorthand[2]}` : names[clean(value).toUpperCase()] || normalizeRank(value);
  }

  function parseRivalsDataPeakRank(document, pageUrl = 'https://rivalsdata.com/') {
    const peakButton = [...document.querySelectorAll('button')].find((button) => clean(button.textContent) === 'Show Peak');
    if (!peakButton || peakButton.getAttribute('aria-pressed') !== 'true') throw new Error('Rivals Data peak ranks are not active yet.');
    const rows = [...document.querySelectorAll('li')].flatMap((row) => {
      const text = spacedText(row);
      const values = [...row.querySelectorAll('span')].map((node) => clean(node.textContent)).filter(Boolean);
      if (!values.some((value) => /^S(?:eason\s*)?\d+(?:\.\d+)?$/i.test(value))) return [];
      const rank = expandShortRank(values.find((value) => /^(?:OAA|GM[123]|[BSGPDCE][123]?)$/i.test(value)));
      if (!rank) return [];
      const score = number(values.find((value) => /^[+-]?[\d,]+\s*RS$/i.test(value))) ?? number(text.match(/([+-]?[\d,]+)\s*RS/i)?.[1]);
      const icon = row.querySelector('img[src*="/assets/ranks/"]');
      return [{ peakRank: rank, peakRankScore: score, peakRankIconUrl: absoluteImage(icon, pageUrl) }];
    });
    if (!rows.length) throw new Error('Rivals Data did not expose any all-season peak ranks.');
    rows.sort((a, b) => rankOrder(b.peakRank) - rankOrder(a.peakRank) || (b.peakRankScore ?? -Infinity) - (a.peakRankScore ?? -Infinity));
    return rows[0];
  }

  function parseRivalsDataLiveMatch(document, pageUrl = 'https://rivalsdata.com/') {
    const offline = ownTextElements(document).some((element) => clean(element.textContent) === 'Player is not currently in game');
    if (offline) return { status: 'offline', checkedAt: new Date().toISOString(), teams: [] };
    const ownTexts = ownTextElements(document).map((element) => clean(element.textContent));
    const inGameText = ownTexts.find((value) => /^In game(?:\s*\([^)]+\))?$/i.test(value))
      || ownTexts.find((value) => /^In game(?:\s*\(([^)]+)\))?\s*-\s*/i.test(value));
    const elapsedText = ownTexts.find((value) => /^-\s*\d{1,2}:\d{2}$/.test(value));
    const statusText = inGameText && /\s-\s/.test(inGameText) ? inGameText : clean(`${inGameText || ''} ${elapsedText || ''}`);
    const teamLabels = ownTextElements(document).filter((element) => /^Team\s+\d+$/i.test(clean(element.textContent)));
    if (!statusText || teamLabels.length < 2) throw new Error('Rivals Data did not expose live-match details yet.');
    const teams = teamLabels.slice(0, 2).map((label) => {
      const header = label.parentElement;
      const section = header?.parentElement;
      const headerText = spacedText(header);
      const average = headerText.match(/Avg:\s*([\d,]+)\s*RS(?:\s*\(([+-]?\d+)\))?/i);
      const roster = [...(section?.children ?? [])].find((child) => child.tagName === 'UL') || section?.querySelector('ul');
      const players = [...(roster?.children ?? [])].filter((row) => row.tagName === 'LI').map((row) => {
        const cells = [...(row.firstElementChild?.children ?? [])];
        const link = row.querySelector('a[href^="/player/"]');
        const nameCell = cells[1];
        const playerName = clean(link?.textContent || nameCell?.querySelector('span')?.textContent || nameCell?.textContent);
        if (!playerName) return null;
        const text = spacedText(row);
        const record = parseWinsLosses(text);
        const rankCell = cells[2]?.querySelector('img[src*="/assets/ranks/"]') ? cells[2] : [...row.querySelectorAll('span')].find((node) => node.querySelector('img[src*="/assets/ranks/"]'));
        const rankText = clean([...(rankCell?.childNodes ?? [])].filter((node) => node.nodeType === 3).map((node) => node.textContent).join(' '));
        const rank = expandShortRank(rankText) || rankText;
        const winRateText = [...row.querySelectorAll('span')].map((node) => clean(node.textContent)).find((value) => /^\d+(?:\.\d+)?%$/.test(value));
        const images = [...(row.firstElementChild?.querySelectorAll('img') ?? [])];
        const heroImages = [...(cells[4]?.querySelectorAll('img[src*="/assets/heroes/"]') ?? [])];
        return {
          uid: link?.getAttribute('href')?.match(/\/player\/(\d+)/)?.[1] || '',
          name: playerName,
          avatarUrl: absoluteImage(images.find((image) => /\/assets\/icons\//i.test(image.src)), pageUrl),
          rank,
          rankScore: number([...(rankCell?.querySelectorAll('small,span') ?? [])].map((node) => clean(node.textContent)).find((value) => /^[+-]?[\d,]+\s*RS$/i.test(value))),
          rankIconUrl: absoluteImage(images.find((image) => /\/assets\/ranks\//i.test(image.src)), pageUrl),
          wins: record.wins,
          losses: record.losses,
          winRate: number(winRateText),
          inParty: Boolean(row.querySelector('[aria-label="In a party"],[title="In a party"]')),
          heroes: heroImages.filter((image) => !image.closest('button')).slice(0, 4).map((image) => ({ name: clean(image.getAttribute('aria-label')) || heroNameFromUrl(image.src), iconUrl: absoluteImage(image, pageUrl) })),
          ...parseLivePlayerDetails(row, pageUrl),
        };
      }).filter(Boolean).slice(0, 6);
      return {
        name: clean(label.textContent),
        averageRankScore: number(average?.[1]),
        projectedChange: number(average?.[2]),
        players,
      };
    });
    const status = statusText.match(/^In game(?:\s*\(([^)]+)\))?\s*-\s*(.+)$/i);
    return {
      status: 'in-game',
      checkedAt: new Date().toISOString(),
      mode: clean(status?.[1]),
      elapsed: clean(status?.[2]),
      teams,
    };
  }

  const parser = { clean, number, normalizeRank, pageState, stateError, parseProfile, parseRivalsDataProficiency, parseRivalsDataSkins, parseRivalsDataPeakRank, parseRivalsDataLiveMatch };
  root.RivalShiftRivalsDataParser = parser;
  if (typeof module !== 'undefined' && module.exports) module.exports = parser;
}(globalThis));
