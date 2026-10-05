// Atur domain produksi dengan satu perintah (D-020):
//   node tooling/configure-domains.js --web https://leburchat.vercel.app --relay https://blackchat-relay.akun.workers.dev
// - apps/web/vercel.json: host relay di CSP connect-src (wss:// dan https://).
// - apps/relay/wrangler.toml: ALLOWED_ORIGIN produksi (CORS & Origin WebSocket).
// Lalu isi VITE_RELAY_URL di Vercel dengan URL relay yang sama. Tambahkan --dry-run untuk melihat perubahan saja.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Validasi URL: wajib https, tanpa path/query (origin saja). */
export function parseOrigin(raw, name) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name}: bukan URL yang valid: ${raw}`);
  }
  if (url.protocol !== 'https:')
    throw new Error(`${name}: wajib https:// (didapat ${url.protocol})`);
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(`${name}: tulis origin saja, misal https://nama.vercel.app`);
  }
  return url;
}

const CONNECT = /connect-src 'self' wss:\/\/[^\s;]+ https:\/\/[^\s;]+/;

/** Ganti host relay di CSP vercel.json (placeholder RELAY_HOST maupun host sebelumnya). */
export function updateVercelJson(text, relayHost) {
  const config = JSON.parse(text);
  const headers = config.headers?.[0]?.headers ?? [];
  const csp = headers.find((h) => h.key === 'Content-Security-Policy');
  if (!csp || !CONNECT.test(csp.value))
    throw new Error('vercel.json: connect-src relay tidak ditemukan');
  csp.value = csp.value.replace(
    CONNECT,
    `connect-src 'self' wss://${relayHost} https://${relayHost}`,
  );
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** Ganti ALLOWED_ORIGIN di bagian [vars] tingkat atas (bukan [env.test.vars]). */
export function updateWranglerToml(text, webOrigin) {
  const pattern = /(\n\[vars\]\nALLOWED_ORIGIN = )"[^"]*"/;
  if (!pattern.test(text)) throw new Error('wrangler.toml: [vars] ALLOWED_ORIGIN tidak ditemukan');
  return text.replace(pattern, `$1"${webOrigin}"`);
}

function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.set('dry', true);
    else if (argv[i]?.startsWith('--')) args.set(argv[i].slice(2), argv[++i]);
  }
  if (!args.get('web') || !args.get('relay')) {
    console.error(
      'pemakaian: node tooling/configure-domains.js --web https://<web> --relay https://<relay> [--dry-run]',
    );
    process.exit(2);
  }
  const web = parseOrigin(args.get('web'), '--web');
  const relay = parseOrigin(args.get('relay'), '--relay');
  const vercelPath = `${root}apps/web/vercel.json`;
  const wranglerPath = `${root}apps/relay/wrangler.toml`;
  const vercel = updateVercelJson(readFileSync(vercelPath, 'utf8'), relay.host);
  const wrangler = updateWranglerToml(readFileSync(wranglerPath, 'utf8'), web.origin);
  if (args.get('dry')) {
    console.log(vercel);
    console.log(wrangler);
    return;
  }
  writeFileSync(vercelPath, vercel);
  writeFileSync(wranglerPath, wrangler);
  console.log(`vercel.json  : connect-src → wss://${relay.host} https://${relay.host}`);
  console.log(`wrangler.toml: ALLOWED_ORIGIN → ${web.origin}`);
  console.log(`Isi di Vercel (Production): VITE_RELAY_URL=${relay.origin}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main(process.argv.slice(2));
