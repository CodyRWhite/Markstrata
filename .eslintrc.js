/*
 * ESLint configuration.
 *
 * The rules themselves come from Microsoft's SPFx profile, which is already a
 * complete rule set - the generator writes all ~90 of them out again by hand,
 * which only creates a second copy to keep in step with the profile. This file
 * extends the profile and states the few things this project decides for
 * itself.
 */
require('@rushstack/eslint-config/patch/modern-module-resolution');

module.exports = {
  extends: ['@microsoft/eslint-config-spfx/lib/profiles/default'],
  parserOptions: { tsconfigRootDir: __dirname },
  ignorePatterns: ['lib/', 'dist/', 'temp/', 'release/', 'demo/dist/', '*.js'],
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2018,
        sourceType: 'module'
      },
      rules: {
        // House style this project follows: undefined for "no value", with
        // null reserved for describing APIs that genuinely return it.
        '@rushstack/no-new-null': 'warn'
      }
    },
    {
      // Declaration files are types only; a few of the source rules make no
      // sense there.
      files: ['*.d.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off'
      }
    }
  ]
};
