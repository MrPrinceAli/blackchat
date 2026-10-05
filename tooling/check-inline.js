// CSP ketat (PRD §11.1): HTML hasil build tidak boleh memuat script/style inline, atribut style,
// atau handler event inline. Jalankan setelah build web: node tooling/check-inline.js apps/web/dist
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'apps/web/dist';
const htmlFiles = [];
const walk = (path) => {
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.html')) htmlFiles.push(full);
  }
};
walk(dir);
if (htmlFiles.length === 0) {
  console.error(`Tidak ada file HTML di ${dir}. Jalankan build web dulu.`);
  process.exit(1);
}

const rules = [
  { name: 'script inline', test: (html) => /<script(?![^>]*\ssrc=)[^>]*>/i.test(html) },
  { name: 'tag <style>', test: (html) => /<style[\s>]/i.test(html) },
  { name: 'atribut style', test: (html) => /\sstyle\s*=/i.test(html) },
  { name: 'handler event inline', test: (html) => /\son[a-z]+\s*=/i.test(html) },
  { name: 'URL javascript:', test: (html) => /javascript:/i.test(html) },
];

let failed = 0;
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  for (const rule of rules) {
    if (rule.test(html)) {
      failed += 1;
      console.error(`${file}: ${rule.name}`);
    }
  }
}
if (failed > 0) process.exit(1);
console.log(`check:inline: ${htmlFiles.length} file HTML bersih dari script/style inline.`);
