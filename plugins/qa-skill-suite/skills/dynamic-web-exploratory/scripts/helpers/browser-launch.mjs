export function chromiumLaunchOptions({
  env = process.env,
  platform = process.platform,
} = {}) {
  // Do not set executablePath by default. Playwright then selects its matching
  // chromium_headless_shell for headless runs instead of launching the full
  // Google Chrome for Testing.app bundle. On macOS this prevents transient Dock
  // icons and crash-report dialogs when a constrained runtime rejects a launch.
  //
  // PLAYWRIGHT_EXECUTABLE_PATH remains an explicit opt-in escape hatch for a
  // caller that deliberately supplies a compatible custom browser binary.
  const explicit = String(env.PLAYWRIGHT_EXECUTABLE_PATH || '').trim();
  const options = {
    headless: true,
    args: platform === 'linux'
      ? ['--no-sandbox', '--disable-setuid-sandbox']
      : [],
  };
  if (explicit) options.executablePath = explicit;
  return options;
}
