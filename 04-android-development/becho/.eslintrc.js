// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: 'expo',
  ignorePatterns: ['/dist/*', '/supabase/functions/**'],
  rules: {
    // Existing effect-based state synchronization is intentional throughout the app.
    'react-hooks/set-state-in-effect': 'off',
  },
};
