// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Layer boundaries. Each layer may import only the layers listed for it; tests/architecture.test.ts checks the
 * same matrix against resolved paths.
 */
const restrict = (/** @type {string[]} */ layers, /** @type {string} */ message) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        ...layers.map((layer) => ({ group: [`**/${layer}/**`, `**/${layer}`], message })),
        { group: ['node:*', 'fs', 'path'], message: 'This layer must not use Node APIs.' },
      ],
    },
  ],
});

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'dist/',
      '.data/',
      'src/gdr/generated/',
      'src/web/globe/',
      'test-results/',
      'playwright-report/',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: false },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/kernel/**'],
    rules: restrict(['gdr', 'engine', 'ai', 'cli', 'web'], 'kernel imports nothing outside kernel.'),
  },
  {
    files: ['src/gdr/**'],
    rules: restrict(['engine', 'ai', 'cli', 'web'], 'gdr imports only kernel.'),
  },
  {
    files: ['src/engine/**'],
    rules: restrict(['ai', 'cli', 'web'], 'engine imports only kernel and gdr.'),
  },
  {
    files: ['src/ai/**'],
    rules: restrict(['cli', 'web', 'gdr'], 'ai imports only the Player API types of the engine.'),
  },
  {
    files: ['src/cli/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/web/**'], message: 'cli must not import web.' }] },
      ],
    },
  },
  {
    files: ['src/web/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/cli/**', 'node:*'], message: 'web must not import cli or Node APIs.' }] },
      ],
    },
  },
  {
    files: ['tests/**', 'e2e/**', 'scripts/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-meaningless-void-operator': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
