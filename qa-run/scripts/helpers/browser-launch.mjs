import fs from 'node:fs';

const SYSTEM_CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function chromiumLaunchOptions() {
  const explicit = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  const executablePath = explicit || SYSTEM_CHROME_CANDIDATES.find(candidate => fs.existsSync(candidate));
  return {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...(executablePath ? { executablePath } : {}),
  };
}
