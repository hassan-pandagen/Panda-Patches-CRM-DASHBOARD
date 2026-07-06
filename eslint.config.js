import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Pragmatic config: the recommended rule sets, but the noisy legacy items (explicit `any`,
// unused vars, empty blocks) are `warn` not `error` so `npm run lint` is an informational
// signal, not a wall of red on a large existing codebase. Tighten to `error` over time.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src/assets', 'coverage', '**/*.test.ts', '**/*.test.tsx'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
      'prefer-const': 'warn',
    },
  },
);
