// Membuktikan aturan ESLint PRD §12 benar-benar aktif: setiap potongan kode terlarang di bawah
// wajib ditolak dengan aturan yang diharapkan, dan setiap pengecualian yang sah wajib lolos.
// Kode dilint lewat lintText dengan filePath palsu, jadi tidak ada file pelanggar di repo.
import { ESLint } from 'eslint';

const eslint = new ESLint();

/** @type {{name: string, filePath: string, code: string, rule: string | null}[]} */
const cases = [
  {
    name: 'console di relay',
    filePath: 'apps/relay/src/x.ts',
    code: 'console.log(1);\n',
    rule: 'no-console',
  },
  {
    name: 'console di web',
    filePath: 'apps/web/src/lib/x.ts',
    code: 'console.error(1);\n',
    rule: 'no-console',
  },
  {
    name: 'console di crypto',
    filePath: 'packages/crypto/src/x.ts',
    code: 'console.log(1);\n',
    rule: 'no-console',
  },
  {
    name: 'innerHTML',
    filePath: 'apps/web/src/lib/x.ts',
    code: 'export function f(el: HTMLElement): void {\n  el.innerHTML = "<b>x</b>";\n}\n',
    rule: 'no-restricted-syntax',
  },
  {
    name: 'innerHTML lewat indeks',
    filePath: 'apps/web/src/lib/x.ts',
    code: 'export function f(el: HTMLElement): void {\n  el["innerHTML"] = "x";\n}\n',
    rule: 'no-restricted-syntax',
  },
  {
    name: 'outerHTML',
    filePath: 'apps/web/src/lib/x.ts',
    code: 'export function f(el: HTMLElement): string {\n  return el.outerHTML;\n}\n',
    rule: 'no-restricted-syntax',
  },
  {
    name: 'insertAdjacentHTML',
    filePath: 'apps/web/src/lib/x.ts',
    code: 'export function f(el: HTMLElement): void {\n  el.insertAdjacentHTML("beforeend", "x");\n}\n',
    rule: 'no-restricted-syntax',
  },
  {
    name: 'document.write',
    filePath: 'apps/web/src/lib/x.ts',
    code: 'document.write("x");\n',
    rule: 'no-restricted-syntax',
  },
  { name: 'eval', filePath: 'apps/web/src/lib/x.ts', code: 'eval("1");\n', rule: 'no-eval' },
  {
    name: 'new Function',
    filePath: 'apps/relay/src/x.ts',
    code: 'export const f = new Function("return 1");\n',
    rule: 'no-new-func',
  },
  {
    name: '{@html}',
    filePath: 'apps/web/src/X.svelte',
    code: '<script lang="ts">\n  let { t }: { t: string } = $props();\n</script>\n\n{@html t}\n',
    rule: 'svelte/no-at-html-tags',
  },
  {
    name: 'localStorage di luar theme.ts',
    filePath: 'apps/web/src/lib/x.ts',
    code: 'localStorage.clear();\n',
    rule: 'no-restricted-globals',
  },
  {
    name: 'window.localStorage di luar theme.ts',
    filePath: 'apps/web/src/lib/x.ts',
    code: 'window.localStorage.clear();\n',
    rule: 'no-restricted-properties',
  },
  {
    name: 'sessionStorage di luar session.ts',
    filePath: 'apps/web/src/lib/x.ts',
    code: 'sessionStorage.clear();\n',
    rule: 'no-restricted-globals',
  },
  {
    name: 'indexedDB di luar session.ts',
    filePath: 'apps/web/src/lib/x.ts',
    code: 'indexedDB.open("x");\n',
    rule: 'no-restricted-globals',
  },
  {
    name: 'sessionStorage di theme.ts',
    filePath: 'apps/web/src/lib/theme.ts',
    code: 'sessionStorage.clear();\n',
    rule: 'no-restricted-globals',
  },
  {
    name: 'localStorage di session.ts',
    filePath: 'apps/web/src/lib/session.ts',
    code: 'localStorage.clear();\n',
    rule: 'no-restricted-globals',
  },
  {
    name: 'document.cookie',
    filePath: 'apps/web/src/lib/x.ts',
    code: 'export const c = document.cookie;\n',
    rule: 'no-restricted-properties',
  },
  {
    name: 'localStorage di theme.ts (sah)',
    filePath: 'apps/web/src/lib/theme.ts',
    code: 'localStorage.clear();\n',
    rule: null,
  },
  {
    name: 'sessionStorage di session.ts (sah)',
    filePath: 'apps/web/src/lib/session.ts',
    code: 'sessionStorage.clear();\n',
    rule: null,
  },
  {
    name: 'indexedDB di session.ts (sah)',
    filePath: 'apps/web/src/lib/session.ts',
    code: 'indexedDB.open("x");\n',
    rule: null,
  },
  {
    name: 'console di test (sah)',
    filePath: 'packages/crypto/test/x.test.ts',
    code: 'console.log(1);\n',
    rule: null,
  },
];

let failed = 0;
for (const c of cases) {
  const [result] = await eslint.lintText(c.code, { filePath: c.filePath });
  const rules = (result?.messages ?? []).map((m) => m.ruleId ?? `fatal: ${m.message}`);
  const ok = c.rule === null ? rules.length === 0 : rules.includes(c.rule);
  if (!ok) {
    failed += 1;
    console.error(
      `GAGAL  ${c.name} (${c.filePath}): diharapkan ${c.rule ?? 'lolos'}, didapat [${rules.join(', ')}]`,
    );
  }
}

if (failed > 0) {
  console.error(`${failed} dari ${cases.length} kasus aturan lint gagal.`);
  process.exit(1);
}
console.log(`Aturan lint PRD §12: ${cases.length} kasus sesuai harapan.`);
