const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVdf, stringifyVdf, readValue } = require('../dist-electron/vdf.js');
const { buildSteamLaunchArgs, clearSteamLoginSelection, disableSteamAccountChooser, selectLoginUser } = require('../dist-electron/steam.js');

const sample = `"users"
{
  "76561198000000100"
  {
    "AccountName" "first_user"
    "PersonaName" "First"
    "Timestamp" "1720000000"
    "MostRecent" "1"
    "AutoLogin" "1"
    "RememberPassword" "1"
    "CustomField" "preserve me"
  }
  "76561198000000200"
  {
    "AccountName" "second_user"
    "PersonaName" "Second"
    "Timestamp" "1730000000"
    "MostRecent" "0"
    "AutoLogin" "0"
    "RememberPassword" "0"
  }
}`;

test('VDF parser and serializer round-trip Steam login users', () => {
  const document = parseVdf(sample);
  const reparsed = parseVdf(stringifyVdf(document));
  assert.deepEqual(reparsed, document);
});

test('selectLoginUser changes active markers without signing out other remembered accounts', () => {
  const document = parseVdf(sample);
  assert.equal(selectLoginUser(document, '76561198000000200'), 'second_user');
  const users = document.users;
  assert.equal(readValue(users['76561198000000100'], 'MostRecent'), '0');
  assert.equal(readValue(users['76561198000000100'], 'AutoLogin'), '0');
  assert.equal(readValue(users['76561198000000100'], 'RememberPassword'), '1');
  assert.equal(readValue(users['76561198000000100'], 'CustomField'), 'preserve me');
  assert.equal(readValue(users['76561198000000200'], 'MostRecent'), '1');
  assert.equal(readValue(users['76561198000000200'], 'AutoLogin'), '1');
  assert.equal(readValue(users['76561198000000200'], 'RememberPassword'), '1');
});

test('quick launch disables Steam account chooser without disturbing config fields', () => {
  const config = `"Store"
  {
    "Software"
    {
      "Valve"
      {
        "Steam"
        {
          "AlwaysShowUserChooser" "1"
          "Language" "english"
        }
      }
    }
  }`;
  const updated = disableSteamAccountChooser(config);
  assert.match(updated, /"AlwaysShowUserChooser" "0"/);
  assert.match(updated, /"Language" "english"/);
  assert.equal(disableSteamAccountChooser(updated), updated);
});

test('invalid or unknown accounts fail closed', () => {
  assert.throws(() => selectLoginUser(parseVdf(sample), '76561198000000999'), /no longer present/i);
});

test('Steam starts silently only when Marvel Rivals is launched', () => {
  assert.deepEqual(buildSteamLaunchArgs(true), ['-silent', '-applaunch', '2767030']);
  assert.deepEqual(buildSteamLaunchArgs(true, true), ['-silent', '-applaunch', '2767030']);
  assert.deepEqual(buildSteamLaunchArgs(false), []);
});

test('adding an account clears every remembered login so Steam opens its chooser', () => {
  const document = clearSteamLoginSelection(parseVdf(sample));
  for (const user of Object.values(document.users)) {
    assert.equal(readValue(user, 'MostRecent'), '0');
    assert.equal(readValue(user, 'AutoLogin'), '0');
    assert.equal(readValue(user, 'RememberPassword'), '0');
  }
});
