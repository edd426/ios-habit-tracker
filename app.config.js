/**
 * Dynamic Expo config: everything lives in app.json; this wrapper only stamps
 * the moment the JS bundle was built into `extra.buildDate`. Settings shows it
 * in the About section, so the phone always reveals WHICH build it's running —
 * no manual version bump needed for day-to-day installs. Bump `version` in
 * app.json only for meaningful releases.
 */
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    buildDate: new Date().toISOString(),
  },
});
