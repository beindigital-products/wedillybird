import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // CDK build artifacts (Lambda bundles, CloudFormation templates).
    'infra/cdk.out/**',
    'infra/node_modules/**',
    // Convex codegen (auto-regenerated, not maintained by hand).
    'convex/_generated/**',
    // Espace de travail local (gitignored) : prototypes design, scripts jetables.
    '.context/**',
    // Documents et outillage hors build (plans de lancement, scripts de capture).
    'docs/**',
  ]),
  // Verrouille l'invariant « 0 any » sur le code de production (métier
  // intégralement typé). Les tests conservent `any` pour les doublures de type.
  {
    files: [
      'app/**/*.{ts,tsx}',
      'components/**/*.{ts,tsx}',
      'lib/**/*.{ts,tsx}',
      'convex/**/*.ts',
      'stores/**/*.{ts,tsx}',
      'hooks/**/*.{ts,tsx}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
]);

export default eslintConfig;
