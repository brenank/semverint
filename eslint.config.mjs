import typescriptEslintPlugin from '@typescript-eslint/eslint-plugin'
import typescriptEslintParser from '@typescript-eslint/parser'
import { defineFlatConfig } from 'eslint-define-config'
import pluginNoNull from 'eslint-plugin-no-null'
import pluginPrettier from 'eslint-plugin-prettier'

export default defineFlatConfig([
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs'],
    languageOptions: {
      parser: typescriptEslintParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      typescript: typescriptEslintPlugin,
      prettier: pluginPrettier,
      no_null: pluginNoNull,
    },
    rules: {
      // TypeScript specific rules
      'typescript/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'typescript/no-explicit-any': 'error',

      // Prettier integration
      'no_null/no-null': 'error',
      'prettier/prettier': 'error',

      // General rules
      'no-console': 'error',
      'prefer-const': 'error',
    },
  },
  {
    ignores: ['dist/'],
  },
])
