const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DISCORD_APPLICATION_ID, RIVAL_SHIFT_WEBSITE_URL, DiscordPresence, buildDiscordActivity, discordPresenceStartedAt, discordRankIconUrl } = require('../dist-electron/discord.js');

test('Discord presence uses the built-in application ID', () => {
  const presence = new DiscordPresence(() => {});
  const status = presence.getStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.clientId, '1535197736289439786');
  assert.equal(status.clientId, DISCORD_APPLICATION_ID);
});

test('Discord presence can be turned off without changing its application ID', async () => {
  const presence = new DiscordPresence(() => {});
  const status = await presence.setEnabled(false);
  assert.equal(status.enabled, false);
  assert.equal(status.state, 'disabled');
  assert.equal(status.clientId, DISCORD_APPLICATION_ID);
  assert.equal(status.message, 'Rich Presence is turned off.');
});

test('Discord activity shows the viewed account, rank, and public rank badge', () => {
  const activity = buildDiscordActivity(4, 'need flirty gf', new Date('2026-08-07T00:00:00Z'), 'Celestial 2', 'https://assets.example/ranks/celestial.webp');
  assert.equal(activity.details, 'Active player · need flirty gf');
  assert.equal(activity.state, 'Celestial 2 · 4 accounts ready');
  assert.equal(activity.smallImageKey, 'https://rivalsdata.com/assets/ranks/celestial.webp');
  assert.equal(activity.smallImageText, 'Celestial 2 · Competitive');
  assert.equal(activity.largeImageText, 'Rival Shift · Marvel Rivals command center');
  assert.equal(activity.largeImageKey, undefined);
  assert.deepEqual(activity.buttons, [{ label: 'Get Rivalshift', url: 'https://rivalshift.xislow.dev' }]);
  assert.equal(activity.buttons[0].url, RIVAL_SHIFT_WEBSITE_URL);
  assert.equal(buildDiscordActivity(4, 'name', new Date(), 'Diamond 1', 'data:image/webp;base64,rank').smallImageKey, 'https://rivalsdata.com/assets/ranks/diamond.webp');
  assert.equal(buildDiscordActivity(4, '', new Date()).details, 'Marvel Rivals command center');
  assert.equal(buildDiscordActivity(4, '', new Date()).state, '4 accounts ready to shift');
});

test('Discord rank badges cover every competitive tier and reject local fallback images', () => {
  assert.match(discordRankIconUrl('Bronze 3'), /bronze\.webp$/);
  assert.match(discordRankIconUrl('One Above All'), /one-above-all\.webp$/);
  assert.equal(discordRankIconUrl('Unknown', 'data:image/webp;base64,rank'), undefined);
  assert.equal(discordRankIconUrl('Unknown', 'https://assets.example/custom.png'), 'https://assets.example/custom.png');
});

test('Discord presence tracks live-game state only when live context is supplied', () => {
  const startedAt = new Date('2026-08-07T00:00:00Z');
  const checking = buildDiscordActivity(4, 'Elsa', startedAt, 'Celestial 3', '', { status: 'checking', playerName: 'Elsa' });
  assert.equal(checking.details, 'Scanning for Elsa');
  assert.equal(checking.state, 'Searching for a live match…');

  const active = buildDiscordActivity(4, 'Elsa', startedAt, 'Celestial 3', '', { status: 'in-game', playerName: 'Elsa', mode: 'Competitive', elapsed: '06:31', checkedAt: '2026-08-07T00:10:00Z' });
  assert.equal(active.details, 'Live match · Elsa');
  assert.equal(active.state, 'Competitive · Celestial 3');
  assert.equal(active.startTimestamp.toISOString(), '2026-08-07T00:03:29.000Z');

  const offline = buildDiscordActivity(4, 'Elsa', startedAt, 'Celestial 3', '', { status: 'offline', playerName: 'Elsa' });
  assert.equal(offline.state, 'No active match · Standing by');
  assert.equal(buildDiscordActivity(4, 'Elsa', startedAt, 'Celestial 3').details, 'Active player · Elsa');
  assert.equal(discordPresenceStartedAt(startedAt, { status: 'in-game', elapsed: 'bad', checkedAt: '2026-08-07T00:10:00Z' }), startedAt);
});

test('Discord reconnects automatically when the desktop client is reopened', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'electron', 'discord.ts'), 'utf8');
  assert.match(source, /scheduleReconnect\(\)/);
  assert.match(source, /15_000/);
  assert.match(source, /Discord is closed\. Rival Shift will reconnect automatically\./);
  assert.match(source, /start\(enabled = true\): void/);
});
