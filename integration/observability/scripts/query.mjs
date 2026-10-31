#!/usr/bin/env node

import { loadLocalEnv } from './env.mjs'

loadLocalEnv()

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const source = process.argv[2]
const baseUrl = source === 'prometheus'
  ? process.env.PROMETHEUS_URL
  : process.env.ELASTICSEARCH_URL

if (!['prometheus', 'elasticsearch'].includes(source) || !baseUrl) {
  console.error('Usage: query.mjs prometheus|elasticsearch [options]')
  console.error('Set PROMETHEUS_URL or ELASTICSEARCH_URL first')
  process.exitCode = 2
} else if (source === 'prometheus') {
  const expr = option('--expr')
  const range = option('--time-range')
  if (!expr) {
    console.error('--expr is required')
    process.exitCode = 2
  } else {
    const endpoint = range ? '/api/v1/query_range' : '/api/v1/query'
    const params = new URLSearchParams({ query: expr })
    if (range) {
      const end = Date.now() / 1000
      const minutes = Number.parseInt(range, 10)
      if (!Number.isFinite(minutes)) {
        console.error('--time-range must start with a number of minutes, for example 30m')
        process.exitCode = 2
      } else {
        params.set('start', String(end - minutes * 60))
        params.set('end', String(end))
        params.set('step', option('--step') || '60')
      }
    }
    if (!process.exitCode) {
      const response = await fetch(new URL(`${endpoint}?${params}`, baseUrl))
      console.log(await response.text())
      process.exitCode = response.ok ? 0 : 1
    }
  }
} else {
  const index = option('--index') || process.env.ELASTICSEARCH_INDEX
  const body = option('--body') || '{"query":{"match_all":{}},"size":20}'
  if (!index) {
    console.error('--index is required or set ELASTICSEARCH_INDEX')
    process.exitCode = 2
  } else {
    let parsed
    try {
      parsed = JSON.parse(body)
    } catch (error) {
      console.error(`--body must be valid JSON: ${error.message}`)
      process.exitCode = 2
    }
    if (parsed) {
      const headers = { 'content-type': 'application/json' }
      if (process.env.ELASTICSEARCH_API_KEY) {
        headers.Authorization = `ApiKey ${process.env.ELASTICSEARCH_API_KEY}`
      }
      const response = await fetch(new URL(`/${encodeURIComponent(index)}/_search`, baseUrl), {
        method: 'POST',
        headers,
        body: JSON.stringify(parsed),
      })
      console.log(await response.text())
      process.exitCode = response.ok ? 0 : 1
    }
  }
}
