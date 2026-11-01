const RIVALS_ASSET_HOSTS = new Set(['rivalsdata.com', 'www.rivalsdata.com', 'cdn.rivalsdata.com']);

export function reliableRivalsAssetUrl(value?: string, desktop = typeof window !== 'undefined' && Boolean(window.rivalShift)): string {
  if (!value || !desktop) return value || '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !RIVALS_ASSET_HOSTS.has(url.hostname.toLowerCase()) || !url.pathname.startsWith('/assets/')) return value;
    return `rivals-asset://cache/${encodeURIComponent(url.href)}`;
  } catch { return value; }
}
