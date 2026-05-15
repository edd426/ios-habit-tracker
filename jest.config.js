module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.expo/',
    '/ios/',
    '/android/',
  ],
  transformIgnorePatterns: [
    // Allow transforming Expo modules + RN community + react-native-svg/chart-kit,
    // since the published packages ship ESM/TypeScript that bare Jest cannot parse.
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|expo-[^/]+|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-chart-kit)/)',
  ],
};
