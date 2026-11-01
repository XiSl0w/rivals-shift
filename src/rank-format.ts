const SHORT_RANKS: Record<string, string> = {
  Bronze: 'B',
  Silver: 'S',
  Gold: 'G',
  Platinum: 'P',
  Diamond: 'D',
  Grandmaster: 'GM',
  Celestial: 'C',
  Eternity: 'E',
  'One Above All': 'OAA',
};

export function shortRankName(rank?: string): string {
  const normalized = rank?.trim().replace(/\s+/g, ' ') ?? '';
  if (!normalized) return '';
  for (const [name, short] of Object.entries(SHORT_RANKS)) {
    if (normalized === name) return short;
    if (normalized.startsWith(`${name} `)) return `${short}${normalized.slice(name.length + 1)}`;
  }
  return normalized;
}

export function peakRankLabel(rank?: string, score?: number): string {
  const short = shortRankName(rank);
  if (!short) return '';
  if (score == null) return short;
  return /^(?:E|OAA)$/.test(short) ? `${short} ${score} RS` : `${short} ${Math.floor(score)}/100`;
}
