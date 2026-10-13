import { createRequire } from 'node:module';
const require = createRequire(new URL('./frontend/package.json', import.meta.url));
const js = require('@eslint/js');
const ts = require('typescript-eslint');

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/dist-native/**', '**/.expo/**', '**/test-results/**'] },
  {
    files: ['backend/**/*.{js,mjs,ts}', 'frontend/{app,src,tests}/**/*.{ts,tsx}'],
    languageOptions: {
      parser: ts.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: Object.fromEntries([
        'console', 'process', 'Buffer', 'URL', 'URLSearchParams', 'fetch', 'Headers', 'Response',
        'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'AbortController', 'AbortSignal',
        'window', 'document', 'sessionStorage', 'TextEncoder', 'structuredClone',
      ].map(name => [name, 'readonly'])),
    },
    plugins: { '@typescript-eslint': ts.plugin },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true }],
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: { 'no-undef': 'off', 'no-redeclare': 'off' },
  },
];
