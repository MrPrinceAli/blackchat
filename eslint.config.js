// Aturan wajib PRD §12 ditegakkan di sini. tooling/check-lint-rules.js membuktikan setiap aturan aktif.
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import svelteConfig from './apps/web/svelte.config.js';

const HTML_SINK = 'Dilarang menulis HTML mentah (PRD §12 aturan 2). Render sebagai text node.';

/** PRD §12 aturan 2: innerHTML, outerHTML, insertAdjacentHTML, document.write. */
const forbiddenSyntax = [
  {
    selector: 'MemberExpression > Identifier.property[name=/^(innerHTML|outerHTML)$/]',
    message: HTML_SINK,
  },
  {
    selector: 'MemberExpression > Literal.property[value=/^(innerHTML|outerHTML)$/]',
    message: HTML_SINK,
  },
  {
    selector:
      'CallExpression > MemberExpression.callee > Identifier.property[name="insertAdjacentHTML"]',
    message: HTML_SINK,
  },
  {
    selector:
      'CallExpression > MemberExpression.callee[object.name="document"] > Identifier.property[name=/^(write|writeln)$/]',
    message: HTML_SINK,
  },
];

/** PRD §12 aturan 6: storage browser hanya di theme.ts (localStorage) dan session.ts (sessionStorage, IndexedDB). */
const storageGlobals = {
  localStorage: 'localStorage hanya boleh dipakai di apps/web/src/lib/theme.ts (PRD §12 aturan 6).',
  sessionStorage:
    'sessionStorage hanya boleh dipakai di apps/web/src/lib/session.ts (PRD §12 aturan 6).',
  indexedDB: 'IndexedDB hanya boleh dipakai di apps/web/src/lib/session.ts (PRD §12 aturan 6).',
};

/** @param {string[]} allowed */
function storageRules(allowed) {
  const names = Object.keys(storageGlobals).filter((name) => !allowed.includes(name));
  return {
    'no-restricted-globals': [
      'error',
      ...names.map((name) => ({ name, message: storageGlobals[name] })),
    ],
    'no-restricted-properties': [
      'error',
      ...names.flatMap((name) =>
        ['window', 'globalThis', 'self'].map((object) => ({
          object,
          property: name,
          message: storageGlobals[name],
        })),
      ),
      {
        object: 'document',
        property: 'cookie',
        message: 'Cookie tidak diizinkan (PRD §12 aturan 6).',
      },
    ],
  };
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.wrangler/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-console': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-syntax': ['error', ...forbiddenSyntax],
      'svelte/no-at-html-tags': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        projectService: false,
        extraFileExtensions: ['.svelte'],
        parser: tseslint.parser,
        svelteConfig,
      },
    },
  },
  {
    files: ['apps/web/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/web/src/**'],
    rules: storageRules([]),
  },
  {
    files: ['apps/web/src/lib/theme.ts'],
    rules: storageRules(['localStorage']),
  },
  {
    files: ['apps/web/src/lib/session.ts'],
    rules: storageRules(['sessionStorage', 'indexedDB']),
  },
  {
    files: ['apps/relay/**'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ['**/*.test.ts', '**/test/**', 'e2e/**', 'tooling/**', '**/*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
);
