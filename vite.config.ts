import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

/** Rules of ESLint's recommended set, as Oxlint names them. */
const recommended = [
  'constructor-super',
  'for-direction',
  'getter-return',
  'no-async-promise-executor',
  'no-case-declarations',
  'no-class-assign',
  'no-compare-neg-zero',
  'no-cond-assign',
  'no-const-assign',
  'no-constant-binary-expression',
  'no-constant-condition',
  'no-control-regex',
  'no-debugger',
  'no-delete-var',
  'no-dupe-class-members',
  'no-dupe-else-if',
  'no-dupe-keys',
  'no-duplicate-case',
  'no-empty',
  'no-empty-character-class',
  'no-empty-pattern',
  'no-empty-static-block',
  'no-ex-assign',
  'no-extra-boolean-cast',
  'no-fallthrough',
  'no-func-assign',
  'no-global-assign',
  'no-import-assign',
  'no-invalid-regexp',
  'no-irregular-whitespace',
  'no-loss-of-precision',
  'no-misleading-character-class',
  'no-new-native-nonconstructor',
  'no-nonoctal-decimal-escape',
  'no-obj-calls',
  'no-prototype-builtins',
  'no-redeclare',
  'no-regex-spaces',
  'no-self-assign',
  'no-setter-return',
  'no-shadow-restricted-names',
  'no-sparse-arrays',
  'no-this-before-super',
  'no-unassigned-vars',
  'no-unexpected-multiline',
  'no-unreachable',
  'no-unsafe-finally',
  'no-unsafe-negation',
  'no-unsafe-optional-chaining',
  'no-unused-labels',
  'no-unused-private-class-members',
  'no-useless-assignment',
  'no-useless-backreference',
  'no-useless-catch',
  'no-useless-escape',
  'no-with',
  'preserve-caught-error',
  'require-yield',
  'use-isnan',
  'valid-typeof',
  'no-array-constructor',
  'no-unused-expressions',
  'no-useless-constructor',
  'no-var',
  'prefer-const',
  'prefer-rest-params',
  'prefer-spread',
];

/** Rules of typescript-eslint's strict type-checked set that take no options, as Oxlint names them. */
const strictTypeChecked = [
  'await-thenable',
  'no-array-delete',
  'no-base-to-string',
  'no-deprecated',
  'no-duplicate-enum-values',
  'no-duplicate-type-constituents',
  'no-dynamic-delete',
  'no-empty-object-type',
  'no-explicit-any',
  'no-extra-non-null-assertion',
  'no-extraneous-class',
  'no-floating-promises',
  'no-for-in-array',
  'no-generated-empty-object-type',
  'no-implied-eval',
  'no-invalid-void-type',
  'no-meaningless-void-operator',
  'no-misused-new',
  'no-misused-promises',
  'no-misused-spread',
  'no-mixed-enums',
  'no-namespace',
  'no-non-null-asserted-nullish-coalescing',
  'no-non-null-asserted-optional-chain',
  'no-non-null-assertion',
  'no-redundant-type-constituents',
  'no-require-imports',
  'no-this-alias',
  'no-unnecessary-boolean-literal-compare',
  'no-unnecessary-template-expression',
  'no-unnecessary-type-arguments',
  'no-unnecessary-type-assertion',
  'no-unnecessary-type-constraint',
  'no-unnecessary-type-conversion',
  'no-unnecessary-type-parameters',
  'no-unsafe-argument',
  'no-unsafe-assignment',
  'no-unsafe-call',
  'no-unsafe-declaration-merging',
  'no-unsafe-enum-assignment',
  'no-unsafe-enum-comparison',
  'no-unsafe-function-type',
  'no-unsafe-member-access',
  'no-unsafe-return',
  'no-unsafe-unary-minus',
  'no-useless-default-assignment',
  'no-wrapper-object-types',
  'only-throw-error',
  'prefer-as-const',
  'prefer-literal-enum-member',
  'prefer-namespace-keyword',
  'prefer-promise-reject-errors',
  'prefer-reduce-type-parameter',
  'prefer-return-this-type',
  'related-getter-setter-pairs',
  'require-await',
  'triple-slash-reference',
  'unbound-method',
  'unified-signatures',
  'use-unknown-in-catch-callback-variable',
  'consistent-type-imports',
];

const errors = (names: string[], prefix = ''): Record<string, 'error'> =>
  Object.fromEntries(names.map((name) => [`${prefix}${name}`, 'error']));

const off = (names: string[]): Record<string, 'off'> =>
  Object.fromEntries(names.map((name) => [`typescript/${name}`, 'off']));

/**
 * Layer boundaries. Each layer may import only the layers listed for it; tests/architecture.test.ts checks the
 * same matrix against resolved paths.
 */
const restrict = (layers: string[], message: string, node: 'noNode' | 'node' = 'noNode') => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        ...layers.map((layer) => ({ group: [`**/${layer}/**`, `**/${layer}`], message })),
        ...(node === 'noNode'
          ? [{ group: ['node:*', 'fs', 'path'], message: 'This layer must not use Node APIs.' }]
          : []),
      ],
    },
  ] satisfies [string, object] as ['error', { patterns: { group: string[]; message: string }[] }],
});

const generated = [
  'node_modules/',
  'dist/',
  '.data/',
  'src/gdr/generated/',
  'src/web/globe/',
  'test-results/',
  'playwright-report/',
];

export default defineConfig(() => ({
  // Relative asset URLs, so the build works under the GitHub Pages project path /game-v5-impl-web/.
  base: './',
  plugins: [react()],
  server: { port: 5175, strictPort: true },
  preview: { port: 5176, strictPort: true },
  build: { outDir: 'dist', target: 'es2023' },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
  },
  fmt: {
    printWidth: 110,
    singleQuote: true,
    trailingComma: 'all',
    sortPackageJson: false,
    ignorePatterns: [...generated, 'content/', 'package-lock.json'],
  },
  lint: {
    plugins: ['oxc', 'typescript', 'unicorn'],
    // Only the rules listed below run, the same set as before the move from ESLint.
    categories: { correctness: 'off' },
    // Type-aware rules run here; `npm run typecheck` checks the types of each layer under its own tsconfig.
    options: { typeAware: true, typeCheck: false },
    env: { builtin: true },
    ignorePatterns: generated,
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: {
      ...errors(recommended),
      ...errors(strictTypeChecked, 'typescript/'),
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'typescript/ban-ts-comment': ['error', { minimumDescriptionLength: 10 }],
      'typescript/restrict-plus-operands': [
        'error',
        {
          allowAny: false,
          allowBoolean: false,
          allowNullish: false,
          allowNumberAndString: false,
          allowRegExp: false,
        },
      ],
      'typescript/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: false },
      ],
      'typescript/return-await': ['error', 'error-handling-correctness-only'],
      'vite-plus/prefer-vite-plus-imports': 'error',
    },
    overrides: [
      {
        files: ['src/kernel/**'],
        rules: restrict(['gdr', 'engine', 'ai', 'cli', 'web'], 'kernel imports nothing outside kernel.'),
      },
      { files: ['src/gdr/**'], rules: restrict(['engine', 'ai', 'cli', 'web'], 'gdr imports only kernel.') },
      {
        files: ['src/engine/**'],
        rules: restrict(['ai', 'cli', 'web'], 'engine imports only kernel and gdr.'),
      },
      {
        files: ['src/ai/**'],
        rules: restrict(['cli', 'web', 'gdr'], 'ai imports only the Player API types of the engine.'),
      },
      { files: ['src/cli/**'], rules: restrict(['web'], 'cli must not import web.', 'node') },
      {
        files: ['src/web/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                { group: ['**/cli/**', 'node:*'], message: 'web must not import cli or Node APIs.' },
              ],
            },
          ],
        },
      },
      {
        files: ['tests/**', 'e2e/**', 'scripts/**', '*.config.ts'],
        rules: off([
          'no-non-null-assertion',
          'no-unsafe-assignment',
          'no-unsafe-member-access',
          'no-unsafe-argument',
          'no-unsafe-call',
          'no-unsafe-return',
          'no-explicit-any',
          'require-await',
          'no-meaningless-void-operator',
          'no-dynamic-delete',
          'restrict-template-expressions',
          'no-unnecessary-type-assertion',
        ]),
      },
    ],
  },
}));
