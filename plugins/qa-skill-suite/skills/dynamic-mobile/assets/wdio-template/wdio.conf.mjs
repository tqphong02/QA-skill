import { androidCapabilities, iosCapabilities } from './config/capabilities.mjs'
import { mkdir } from 'node:fs/promises'

const platform = (process.env.MOBILE_PLATFORM ?? 'android').toLowerCase()
const capabilities = platform === 'ios' ? iosCapabilities : androidCapabilities

export const config = {
  runner: 'local',
  specs: ['./test/specs/**/*.e2e.mjs'],
  maxInstances: 1,
  capabilities: [capabilities],
  logLevel: 'info',
  framework: 'mocha',
  reporters: ['spec'],
  services: [['appium', { command: 'appium' }]],
  before: async () => {
    await mkdir('./artifacts', { recursive: true })
  },
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000
  }
}
