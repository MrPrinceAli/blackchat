// Header keamanan dari vercel.json (PRD §11.1), dengan RELAY_HOST diganti sesuai relay yang dipakai.
// Dipakai server preview Vite agar smoke/E2E berjalan di bawah CSP yang sama dengan produksi (D-014).
import { readFileSync } from 'node:fs';

const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
// Bagian relay di connect-src: placeholder RELAY_HOST atau host produksi hasil tooling/configure-domains.js.
const RELAY_SOURCES = /wss:\/\/[^\s;]+ https:\/\/[^\s;]+/;

/** @param {string} relayUrl contoh: http://localhost:8787 atau https://relay.example */
export function securityHeaders(relayUrl) {
  const relay = new URL(relayUrl);
  const secure = relay.protocol === 'https:';
  const connect = `${secure ? 'wss' : 'ws'}://${relay.host} ${relay.protocol}//${relay.host}`;
  /** @type {Record<string, string>} */
  const headers = {};
  for (const { key, value } of vercel.headers[0].headers) {
    if (key === 'Strict-Transport-Security' && !secure) continue;
    let v = value;
    if (key === 'Content-Security-Policy') {
      if (!RELAY_SOURCES.test(v))
        throw new Error('CSP di vercel.json tidak memuat sumber relay di connect-src');
      v = v.replace(RELAY_SOURCES, connect);
      // Server lokal http tidak bisa di-upgrade ke https.
      if (!secure) v = v.replace('; upgrade-insecure-requests', '');
    }
    headers[key] = v;
  }
  return headers;
}
