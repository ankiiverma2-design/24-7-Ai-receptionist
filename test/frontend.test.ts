import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('console frontend assets exist', () => {
  const html = resolve(process.cwd(), 'public/index.html');
  const css = resolve(process.cwd(), 'public/styles.css');
  const js = resolve(process.cwd(), 'public/app.js');
  assert.equal(existsSync(html), true);
  assert.equal(existsSync(css), true);
  assert.equal(existsSync(js), true);
  const page = readFileSync(html, 'utf8');
  assert.match(page, /styles\.css/);
  assert.match(page, /app\.js/);
  assert.match(page, /Create workspace/);
  assert.match(readFileSync(js, 'utf8'), /\/api\/auth\/login/);
});
