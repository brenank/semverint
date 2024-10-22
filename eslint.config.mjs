import typescriptEslintPlugin from '@typescript-eslint/eslint-plugin'
import typescriptEslintParser from '@typescript-eslint/parser'
import { defineFlatConfig } from 'eslint-define-config'
import eslintPluginPrettier from 'eslint-plugin-prettier'

export default defineFlatConfig([
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptEslintParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
      prettier: eslintPluginPrettier,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',

      // Prettier integration
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
