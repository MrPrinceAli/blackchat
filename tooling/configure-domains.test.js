import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseOrigin, updateVercelJson, updateWranglerToml } from './configure-domains.js';

const vercel = readFileSync(new URL('../apps/web/vercel.json', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../apps/relay/wrangler.toml', import.meta.url), 'utf8');

test('host relay masuk ke connect-src CSP, sisa CSP utuh, bisa diganti berulang', () => {
  const once = updateVercelJson(vercel, 'relay.example.workers.dev');
  assert.match(
    once,
    /connect-src 'self' wss:\/\/relay\.example\.workers\.dev https:\/\/relay\.example\.workers\.dev;/,
  );
  assert.match(once, /frame-ancestors 'none'/);
  assert.doesNotMatch(once, /RELAY_HOST/);
  const twice = updateVercelJson(once, 'lain.workers.dev');
  assert.match(twice, /wss:\/\/lain\.workers\.dev https:\/\/lain\.workers\.dev/);
  assert.doesNotMatch(twice, /relay\.example/);
});

test('ALLOWED_ORIGIN produksi diganti, env.test tidak tersentuh', () => {
  const out = updateWranglerToml(wrangler, 'https://leburchat.vercel.app');
  assert.match(out, /\[vars\]\nALLOWED_ORIGIN = "https:\/\/leburchat\.vercel\.app"/);
  assert.match(out, /\[env\.test\.vars\]\nALLOWED_ORIGIN = "http:\/\/localhost:5173"/);
});

test('hanya menerima origin https tanpa path', () => {
  assert.equal(parseOrigin('https://leburchat.vercel.app', 'x').host, 'leburchat.vercel.app');
  assert.throws(() => parseOrigin('http://leburchat.vercel.app', 'x'), /https/);
  assert.throws(() => parseOrigin('https://leburchat.vercel.app/app', 'x'), /origin saja/);
  assert.throws(() => parseOrigin('bukan url', 'x'), /URL/);
});
