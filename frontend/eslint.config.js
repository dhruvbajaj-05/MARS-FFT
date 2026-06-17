// ESLint flat config (ESLint 9) using Expo's official ruleset.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'babel.config.js', 'eslint.config.js'],
  },
  {
    rules: {
      // axios's default export legitimately exposes `create`/`isAxiosError`; this
      // rule is a known false-positive for axios's import style.
      'import/no-named-as-default-member': 'off',
    },
  },
];
