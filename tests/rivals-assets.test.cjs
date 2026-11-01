const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { RivalsAssetCache, originalRivalsAssetUrl, rivalsAssetCandidates } = require('../dist-electron/rivals-asset-cache.js');

test('Rivals Data assets use the alternate host as a fallback without proxying unrelated URLs', () => {
  assert.deepEqual(rivalsAssetCandidates('https://cdn.rivalsdata.com/assets/icons/123.webp'), [
    'https://cdn.rivalsdata.com/assets/icons/123.webp',
    'https://rivalsdata.com/assets/icons/123.webp',
  ]);
  assert.deepEqual(rivalsAssetCandidates('https://rivalsdata.com/assets/heroes/the-hood.webp'), [
    'https://rivalsdata.com/assets/heroes/the-hood.webp',
    'https://cdn.rivalsdata.com/assets/heroes/the-hood.webp',
  ]);
  assert.deepEqual(rivalsAssetCandidates('https://example.com/assets/icons/123.webp'), []);
});

test('desktop asset URLs decode only approved Rivals Data image paths', () => {
  const original = 'https://cdn.rivalsdata.com/assets/icons/31065203.webp';
  assert.equal(originalRivalsAssetUrl(`rivals-asset://cache/${encodeURIComponent(original)}`), original);
  assert.equal(originalRivalsAssetUrl(`rivals-asset://cache/${encodeURIComponent('https://example.com/private')}`), undefined);
});

test('Rivals Data image cache falls back between hosts and then serves the saved copy', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rival-shift-assets-'));
  let calls = 0;
  const fetcher = async (url) => {
    calls += 1;
    if (String(url).startsWith('https://cdn.')) return new Response('', { status: 503 });
    return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { 'Content-Type': 'image/webp' } });
  };
  try {
    const cache = new RivalsAssetCache(directory, fetcher);
    const original = 'https://cdn.rivalsdata.com/assets/icons/31065203.webp';
    const request = `rivals-asset://cache/${encodeURIComponent(original)}`;
    assert.deepEqual([...new Uint8Array(await (await cache.handle(request)).arrayBuffer())], [82, 73, 70, 70]);
    assert.equal(calls, 2);
    assert.deepEqual([...new Uint8Array(await (await cache.handle(request)).arrayBuffer())], [82, 73, 70, 70]);
    assert.equal(calls, 2, 'the second request must come from disk cache');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('renderer rewrites only Rivals Data assets for the desktop cache protocol', async () => {
  const { reliableRivalsAssetUrl } = await import('../src/rivals-assets.ts');
  const original = 'https://rivalsdata.com/assets/ranks/celestial.webp';
  assert.equal(reliableRivalsAssetUrl(original, true), `rivals-asset://cache/${encodeURIComponent(original)}`);
  assert.equal(reliableRivalsAssetUrl('data:image/webp;base64,abc', true), 'data:image/webp;base64,abc');
  assert.equal(reliableRivalsAssetUrl('https://avatars.fastly.steamstatic.com/a.jpg', true), 'https://avatars.fastly.steamstatic.com/a.jpg');
});
