// Memastikan kode khusus test (D-006) tidak ada di bundle produksi relay.
// Jalankan setelah `pnpm --filter @blackchat/relay build`.
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('pemakaian: node tooling/check-relay-bundle.js <bundle.js>');
  process.exit(2);
}
const bundle = readFileSync(file, 'utf8');
// Blok `if (false)` kosong sisa define boleh ada; yang dilarang adalah logika dan route test-nya.
const forbidden = ['/__test/', 'advanceClock', 'resetClock', '__BC_TEST__'];
const found = forbidden.filter((needle) => bundle.includes(needle));
if (found.length > 0) {
  console.error(`Bundle produksi relay mengandung kode test: ${found.join(', ')}`);
  process.exit(1);
}
console.log(`Bundle produksi relay bersih dari kode test (${forbidden.length} pola diperiksa).`);
