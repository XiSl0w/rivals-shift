import { createHash } from 'node:crypto';
import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';

const ALLOWED_HOSTS = new Set(['rivalsdata.com', 'www.rivalsdata.com', 'cdn.rivalsdata.com']);
const MAX_ASSET_BYTES = 5 * 1024 * 1024;

export function rivalsAssetCandidates(value: string): string[] {
  let url: URL;
  try { url = new URL(value); } catch { return []; }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || !url.pathname.startsWith('/assets/')) return [];
  const candidates = [url.href];
  if (url.hostname === 'cdn.rivalsdata.com') {
    const fallback = new URL(url.href); fallback.hostname = 'rivalsdata.com'; candidates.push(fallback.href);
  } else if (/^\/assets\/(?:icons|heroes|skins)\//i.test(url.pathname)) {
    const fallback = new URL(url.href); fallback.hostname = 'cdn.rivalsdata.com'; candidates.push(fallback.href);
  }
  return [...new Set(candidates)];
}

export function originalRivalsAssetUrl(requestUrl: string): string | undefined {
  try {
    const request = new URL(requestUrl);
    if (request.protocol !== 'rivals-asset:' || request.hostname !== 'cache') return undefined;
    const original = decodeURIComponent(request.pathname.replace(/^\//, ''));
    return rivalsAssetCandidates(original).length ? original : undefined;
  } catch { return undefined; }
}

function mimeType(url: string): string {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  return ({ '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif' } as Record<string, string>)[extension] || 'application/octet-stream';
}

export class RivalsAssetCache {
  private readonly pending = new Map<string, Promise<Response>>();

  constructor(private readonly directory: string, private readonly fetcher: typeof fetch = fetch) {}

  async handle(requestUrl: string): Promise<Response> {
    const original = originalRivalsAssetUrl(requestUrl);
    if (!original) return new Response('Invalid Rivals Data asset URL.', { status: 400 });
    const active = this.pending.get(original);
    if (active) return active.then((response) => response.clone());
    const task = this.load(original).finally(() => this.pending.delete(original));
    this.pending.set(original, task);
    return task;
  }

  private async load(original: string): Promise<Response> {
    await mkdir(this.directory, { recursive: true });
    const cachePath = path.join(this.directory, `${createHash('sha256').update(original).digest('hex')}.asset`);
    try {
      const cached = await readFile(cachePath);
      return new Response(new Uint8Array(cached), { headers: { 'Content-Type': mimeType(original), 'Cache-Control': 'public, max-age=31536000, immutable' } });
    } catch { /* Cache miss. */ }

    let lastStatus = 502;
    for (const candidate of rivalsAssetCandidates(original)) {
      try {
        const response = await this.fetcher(candidate, {
          headers: { Accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5', Referer: 'https://rivalsdata.com/' },
          signal: AbortSignal.timeout(12_000),
        });
        lastStatus = response.status;
        const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
        if (!response.ok || !contentType.startsWith('image/')) continue;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length || bytes.length > MAX_ASSET_BYTES) continue;
        const temporary = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(temporary, bytes);
        await rename(temporary, cachePath).catch(async () => { await writeFile(cachePath, bytes); });
        return new Response(bytes, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' } });
      } catch { /* Try the alternate Rivals Data asset host. */ }
    }
    return new Response('Rivals Data image unavailable.', { status: lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502 });
  }
}
