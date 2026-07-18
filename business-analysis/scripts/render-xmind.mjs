#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { parseXMindMarkToXMindFile } from 'xmindmark'

const ICON_RE = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u

function fail(message) {
  console.error(message)
  process.exit(1)
}

function clean(value, field = 'content') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().replace(/\.+$/, '')
  if (ICON_RE.test(text)) fail(`${field} must not contain emoji or icons`)
  return text.replace(/^[-*#]+\s*/, '').replace(/[<>]/g, '') || 'Not defined'
}

function add(lines, level, value, field) {
  lines.push(`${'  '.repeat(level)}- ${clean(value, field)}`)
}

function listBranch(lines, level, title, values, field) {
  add(lines, level, title, field)
  const items = Array.isArray(values) ? values : []
  if (!items.length) add(lines, level + 1, 'Not defined', field)
  items.forEach((item, index) => add(lines, level + 1, item, `${field}[${index}]`))
}

function buildXMindMark(data) {
  const lines = [clean(data.project, 'project')]
  listBranch(lines, 0, 'Scope', [data.scope], 'scope')
  listBranch(lines, 0, 'Source Markdown', data.source_markdown, 'source_markdown')

  add(lines, 0, 'Actors', 'actors')
  for (const [index, actor] of (data.actors || []).entries()) {
    add(lines, 1, `${actor.name} [${actor.status || 'unresolved'}]`, `actors[${index}]`)
    listBranch(lines, 2, 'Responsibilities', actor.responsibilities, `actors[${index}].responsibilities`)
    listBranch(lines, 2, 'Permissions', actor.permissions, `actors[${index}].permissions`)
    add(lines, 2, `Source: ${actor.source_ref || 'Missing from source'}`, `actors[${index}].source_ref`)
  }

  add(lines, 0, 'Business modules', 'modules')
  for (const [moduleIndex, module] of (data.modules || []).entries()) {
    add(lines, 1, `${module.name} [${module.status || 'unresolved'}]`, `modules[${moduleIndex}]`)
    add(lines, 2, `Purpose: ${module.purpose || 'Not defined'}`, `modules[${moduleIndex}].purpose`)
    add(lines, 2, `Source: ${module.source_ref || 'Missing from source'}`, `modules[${moduleIndex}].source_ref`)
    add(lines, 2, 'Flows', `modules[${moduleIndex}].flows`)
    for (const [flowIndex, flow] of (module.flows || []).entries()) {
      add(lines, 3, `${flow.id || `FLOW-${flowIndex + 1}`} ${flow.name} [${flow.status || 'unresolved'}]`, `flow`)
      add(lines, 4, `Actor: ${flow.actor || 'Not defined'}`, 'flow.actor')
      listBranch(lines, 4, 'Preconditions', flow.preconditions, 'flow.preconditions')
      add(lines, 4, `Trigger: ${flow.trigger || 'Not defined'}`, 'flow.trigger')
      add(lines, 4, 'Steps', 'flow.steps')
      for (const [stepIndex, step] of (flow.steps || []).entries()) {
        add(lines, 5, `${step.id || `S${stepIndex + 1}`} ${step.action}`, 'flow.step.action')
        add(lines, 6, `System: ${step.system_response || 'Not defined'}`, 'flow.step.system_response')
        if (step.state_change) add(lines, 6, `State: ${step.state_change}`, 'flow.step.state_change')
        if (step.api_data) add(lines, 6, `API or data: ${step.api_data}`, 'flow.step.api_data')
      }
      listBranch(lines, 4, 'Outcomes', flow.outcomes, 'flow.outcomes')
      listBranch(lines, 4, 'Alternate flows', flow.alternate_flows, 'flow.alternate_flows')
      listBranch(lines, 4, 'Exceptions', flow.exceptions, 'flow.exceptions')
      listBranch(lines, 4, 'Business rules', flow.business_rules, 'flow.business_rules')
      listBranch(lines, 4, 'Dependencies', flow.dependencies, 'flow.dependencies')
      listBranch(lines, 4, 'Unresolved', flow.unresolved, 'flow.unresolved')
    }
  }

  add(lines, 0, 'Cross-cutting concerns', 'cross_cutting')
  for (const [index, item] of (data.cross_cutting || []).entries()) {
    add(lines, 1, `${item.name} [${item.status || 'unresolved'}]`, `cross_cutting[${index}]`)
    listBranch(lines, 2, 'Details', item.details, `cross_cutting[${index}].details`)
  }

  add(lines, 0, 'Review coverage', 'review_coverage')
  for (const item of data.review_coverage || []) {
    add(lines, 1, `${item.area} [${item.status}]`, 'review_coverage')
    if (item.notes) add(lines, 2, item.notes, 'review_coverage.notes')
  }

  add(lines, 0, 'Open Q&A', 'questions')
  const openQuestions = (data.questions || []).filter(item => (item.status || 'Open') !== 'Answered')
  if (!openQuestions.length) add(lines, 1, 'No open question', 'questions')
  openQuestions.forEach((item, index) => {
    add(lines, 1, `${item.id || `QA-${String(index + 1).padStart(3, '0')}`} ${item.question}`, 'question')
    add(lines, 2, `Risk: ${item.risk || 'Not defined'}`, 'question.risk')
    add(lines, 2, `Owner: ${item.owner || 'Unassigned'}`, 'question.owner')
  })
  return `${lines.join('\n')}\n`
}

function checkXMind(filePath) {
  if (!fs.existsSync(filePath)) fail(`XMind file not found: ${filePath}`)
  const content = fs.readFileSync(filePath)
  if (content.length < 200 || content[0] !== 0x50 || content[1] !== 0x4b) {
    fail(`XMind package is invalid: ${filePath}`)
  }
  console.log(`XMIND PASS: ${path.resolve(filePath)}`)
}

const args = process.argv.slice(2)
if (args[0] === '--check') {
  if (!args[1]) fail('Usage: render-xmind.mjs --check <file.xmind>')
  checkXMind(path.resolve(args[1]))
  process.exit(0)
}

if (args.length < 2) fail('Usage: render-xmind.mjs <analysis.json> <output.xmind>')
const inputPath = path.resolve(args[0])
const outputPath = path.resolve(args[1])
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
for (const field of ['project', 'scope', 'source_markdown', 'review_coverage', 'modules', 'questions']) {
  if (data[field] === undefined || data[field] === null) fail(`Missing required field: ${field}`)
}
const xmindmark = buildXMindMark(data)
const arrayBuffer = await parseXMindMarkToXMindFile(xmindmark)
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, Buffer.from(arrayBuffer))
checkXMind(outputPath)
console.log(`XMIND WRITTEN: ${outputPath}`)
