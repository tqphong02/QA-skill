#!/usr/bin/env node

import { loadLocalEnv } from './env.mjs'

loadLocalEnv()

const sources = [
  { name: 'prometheus', url: process.env.PROMETHEUS_URL, path: '/-/ready', headers: {} },
  {
    name: 'grafana',
    url: process.env.GRAFANA_URL,
    path: '/api/health',
    headers: process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN
      ? { Authorization: `Bearer ${process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN}` }
      : {},
  },
  {
    name: 'elasticsearch',
    url: process.env.ELASTICSEARCH_URL,
    path: '/',
    headers: process.env.ELASTICSEARCH_API_KEY
      ? { Authorization: `ApiKey ${process.env.ELASTICSEARCH_API_KEY}` }
      : {},
  },
  {
    name: 'kibana',
    url: process.env.KIBANA_URL,
    path: '/api/status',
    headers: process.env.KIBANA_API_KEY
      ? { Authorization: `ApiKey ${process.env.KIBANA_API_KEY}` }
      : {},
  },
]

let failed = false

for (const source of sources) {
  if (!source.url) {
    console.log(`${source.name}: not_configured`)
    continue
  }

  try {
    const target = new URL(source.path, source.url)
    const response = await fetch(target, {
      headers: { Accept: 'application/json', ...source.headers },
      signal: AbortSignal.timeout(10000),
    })
    if (response.ok) {
      console.log(`${source.name}: ready (${response.status})`)
    } else if (response.status === 401 || response.status === 403) {
      console.log(`${source.name}: auth_required (${response.status})`)
      failed = true
    } else {
      console.log(`${source.name}: unavailable (${response.status})`)
      failed = true
    }
  } catch (error) {
    console.log(`${source.name}: target_unreachable (${error.message})`)
    failed = true
  }
}

process.exitCode = failed ? 1 : 0
