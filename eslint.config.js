import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  /**
   * A fixture repo is a repo an extractor reads, not code this repo ships, so it is held exactly
   * as the extractor must find it: JavaScript that predates modules, an import of a package
   * nothing installed, and aliases only its own tsconfig knows.
   */
  {
    ignores: [
      'node_modules/**',
      'types/**',
      'coverage/**',
      'packages/*/fixture/**',
      'packages/*/dist/**',
      'packages/app/src-tauri/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
