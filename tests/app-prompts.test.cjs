const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('close and duplicate-instance decisions use themed in-app prompts', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '..', 'electron', 'main.ts'), 'utf8');
  const app = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'App.tsx'), 'utf8');
  assert.doesNotMatch(main, /showMessageBox/);
  assert.match(main, /showAppPrompt\('close'\)/);
  assert.match(main, /showAppPrompt\('duplicate'\)/);
  assert.match(main, /app-prompt:respond/);
  assert.match(app, /system-prompt-card/);
  assert.match(app, /Remember this choice/);
});
