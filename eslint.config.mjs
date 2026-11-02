import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/dist/', '**/.next/', '**/coverage/', '**/generated/', '**/next-env.d.ts']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['apps/web/**'],
    extends: [nextVitals],
    settings: { next: { rootDir: 'apps/web' } },
  },
  {
    files: ['apps/web/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@center9/database', '@prisma/*'], message: 'apps/web must call the API, not access the database directly.' }] },
      ],
    },
  },
]);
