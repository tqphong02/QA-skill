#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { parseXMindMarkToXMindFile } from 'xmindmark'
import JSZip from 'jszip'

const ICON_RE = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u
const TIMELINE_HORIZONTAL = 'org.xmind.ui.timeline.horizontal'
const LOGIC_RIGHT = 'org.xmind.ui.logic.right'

function fail(message) {
  console.error(message)
  process.exit(1)
}

function clean(value, field = 'content') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().replace(/\.+$/, '')
  if (ICON_RE.test(text)) fail(`${field} must not contain emoji or icons`)
  return text.replace(/^[-*#]+\s*/, '').replace(/[<>]/g, '') || 'Chưa xác định'
}

function add(lines, level, value, field) {
  lines.push(`${'  '.repeat(level)}- ${clean(value, field)}`)
}

function addMarked(lines, level, value, field, markers = []) {
  const suffix = markers.length ? ` ${markers.join('')}` : ''
  lines.push(`${'  '.repeat(level)}- ${clean(value, field)}${suffix}`)
}

function listBranch(lines, level, title, values, field) {
  add(lines, level, title, field)
  const items = Array.isArray(values) ? values : []
  if (!items.length) add(lines, level + 1, 'Chưa xác định', field)
  items.forEach((item, index) => add(lines, level + 1, item, `${field}[${index}]`))
}

function collectFlows(data) {
  const flows = []
  for (const [moduleIndex, module] of (data.modules || []).entries()) {
    for (const [flowIndex, flow] of (module.flows || []).entries()) {
      const id = clean(flow.id || `FLOW-${moduleIndex + 1}-${flowIndex + 1}`, 'flow.id')
      flows.push({ id, module, flow, moduleIndex, flowIndex })
    }
  }
  return flows
}

function normalizeLinks(data, flows) {
  const known = new Set(flows.map(item => item.id))
  const links = Array.isArray(data.flow_links) ? data.flow_links : []
  return links.filter(link => known.has(link.from_flow) && known.has(link.to_flow))
}

function deriveSanityChecks(flow) {
  const checks = []
  for (const step of flow.steps || []) {
    if (step.state_change) checks.push(`${step.action}: ${step.state_change}`)
  }
  for (const outcome of flow.outcomes || []) checks.push(outcome)
  return checks.length ? checks : ['Luồng hoàn tất với đúng trạng thái và dữ liệu mong đợi']
}

function addMarker(markers, key, marker) {
  if (!markers.has(key)) markers.set(key, [])
  markers.get(key).push(marker)
}

function relatedFunctionNames(flowId, flow, links, flowById) {
  const linkedNames = links
    .filter(link => link.from_flow === flowId || link.to_flow === flowId)
    .map(link => {
      const otherId = link.from_flow === flowId ? link.to_flow : link.from_flow
      const other = flowById.get(otherId)
      return other ? `${other.module.name} — ${other.flow.name}` : otherId
    })
  return [...new Set([...(flow.dependencies || []), ...linkedNames])]
}

function addFlowDetails(lines, level, node, links, flowById) {
  const { linked, transitionCondition, checkpoint } = node
  if (transitionCondition) add(lines, level, `Điều kiện chuyển bước: ${transitionCondition}`, 'journey.transition_condition')
  if (checkpoint) add(lines, level, `Điểm kiểm soát nghiệp vụ: ${checkpoint}`, 'journey.checkpoint')
  add(lines, level, `Trạng thái vào: ${linked.flow.entry_state || 'Chưa xác định'}`, 'flow.entry_state')
  add(lines, level, `Trạng thái ra: ${linked.flow.exit_state || 'Chưa xác định'}`, 'flow.exit_state')
  listBranch(lines, level, 'Điều kiện tiên quyết', linked.flow.preconditions, 'flow.preconditions')
  listBranch(lines, level, 'Kết quả cần bảo đảm', linked.flow.sanity_checks || deriveSanityChecks(linked.flow), 'flow.sanity_checks')
  listBranch(lines, level, 'Chức năng liên quan', relatedFunctionNames(linked.id, linked.flow, links, flowById), 'flow.related')
}

function buildUnifiedMark(data, flows, links) {
  const flowById = new Map(flows.map(item => [item.id, item]))
  const markers = new Map()
  const flowOccurrences = new Map()
  const usedFlowIds = new Set()
  const foldTitles = new Set()
  foldTitles.add('Điều kiện chuẩn bị')
  foldTitles.add('Kết quả cuối')
  let relationshipIndex = 0

  const journeys = (data.sanity_journeys || []).map((journey, journeyIndex) => {
    const journeyId = journey.id || `SANITY-${journeyIndex + 1}`
    const prepKey = `${journeyId}:prep`
    const resultKey = `${journeyId}:result`
    const steps = (journey.flow_sequence || []).map((item, stepIndex) => {
      const linked = flowById.get(item.flow_id)
      if (!linked) fail(`Unknown flow in ${journeyId}: ${item.flow_id}`)
      usedFlowIds.add(linked.id)
      const key = `${journeyId}:step:${stepIndex}`
      const title = `${String(stepIndex + 1).padStart(2, '0')} ${linked.module.name} — ${linked.flow.name}`
      const node = {
        key,
        title,
        linked,
        transitionCondition: item.transition_condition || 'Bước trước hoàn tất thành công',
        checkpoint: item.checkpoint || 'Trạng thái và dữ liệu đầu ra đúng',
      }
      if (!flowOccurrences.has(linked.id)) flowOccurrences.set(linked.id, [])
      flowOccurrences.get(linked.id).push(node)
      foldTitles.add(title)
      return node
    })
    const chain = [prepKey, ...steps.map(step => step.key), resultKey]
    if (steps.length) {
      for (let index = 0; index < chain.length - 1; index += 1) {
        relationshipIndex += 1
        const label = index === 0 ? 'Bắt đầu' : index === chain.length - 2 ? 'Hoàn tất' : 'Tiếp theo'
        addMarker(markers, chain[index], `[^${relationshipIndex}](${label})`)
        addMarker(markers, chain[index + 1], `[${relationshipIndex}]`)
      }
    }
    const visibleTitle = `Luồng nghiệp vụ ${String(journeyIndex + 1).padStart(2, '0')} — ${clean(journey.name)}`
    return { journey, journeyId, visibleTitle, prepKey, resultKey, steps }
  })

  const extraFlows = flows
    .filter(item => !usedFlowIds.has(item.id))
    .map((linked, index) => {
      const key = `extra:${linked.id}`
      const title = `${String(index + 1).padStart(2, '0')} ${linked.module.name} — ${linked.flow.name}`
      const node = { key, title, linked }
      flowOccurrences.set(linked.id, [node])
      foldTitles.add(title)
      return node
    })

  links.forEach((link, index) => {
    const source = flowOccurrences.get(link.from_flow)?.[0]
    const target = flowOccurrences.get(link.to_flow)?.[0]
    if (!source || !target) fail(`Cannot place flow link ${link.from_flow} -> ${link.to_flow}`)
    relationshipIndex += 1
    const label = clean(link.label || link.condition || 'Liên kết nghiệp vụ', `flow_links[${index}].label`)
    addMarker(markers, source.key, `[^${relationshipIndex}](${label})`)
    addMarker(markers, target.key, `[${relationshipIndex}]`)
  })

  const lines = [`${clean(data.project, 'project')} — Luồng hệ thống`]
  journeys.forEach(({ journey, visibleTitle, prepKey, resultKey, steps }, journeyIndex) => {
    add(lines, 0, visibleTitle, `sanity_journeys[${journeyIndex}].name`)
    addMarked(lines, 1, 'Điều kiện chuẩn bị', 'journey.preconditions', markers.get(prepKey) || [])
    const preconditions = Array.isArray(journey.preconditions) ? journey.preconditions : []
    if (!preconditions.length) add(lines, 2, 'Chưa xác định', 'journey.preconditions')
    preconditions.forEach((item, index) => add(lines, 2, item, `journey.preconditions[${index}]`))
    steps.forEach(node => {
      addMarked(lines, 1, node.title, 'journey.sequence', markers.get(node.key) || [])
      addFlowDetails(lines, 2, node, links, flowById)
    })
    addMarked(lines, 1, 'Kết quả cuối', 'journey.expected_results', markers.get(resultKey) || [])
    const results = Array.isArray(journey.expected_results) ? journey.expected_results : []
    if (!results.length) add(lines, 2, 'Chưa xác định', 'journey.expected_results')
    results.forEach((item, index) => add(lines, 2, item, `journey.expected_results[${index}]`))
  })

  if (extraFlows.length) {
    add(lines, 0, 'Chức năng bổ sung chưa nằm trong luồng nghiệp vụ chính', 'extra_flows')
    extraFlows.forEach(node => {
      addMarked(lines, 1, node.title, 'extra_flow', markers.get(node.key) || [])
      addFlowDetails(lines, 2, node, links, flowById)
    })
  }

  return {
    mark: `${lines.join('\n')}\n`,
    journeyTitles: journeys.map(item => item.visibleTitle),
    foldTitles,
  }
}

function safeSheetTitle(value, fallback) {
  const title = clean(value).replace(/[\\/?*:[\]]/g, ' ').trim()
  return (title || fallback).slice(0, 31)
}

function walkTopics(topic, callback) {
  callback(topic)
  for (const child of topic.children?.attached || []) walkTopics(child, callback)
}

async function sheetFromMark(mark, title, journeyTitles, foldTitles) {
  const arrayBuffer = await parseXMindMarkToXMindFile(mark)
  const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer))
  const sheets = JSON.parse(await zip.file('content.json').async('string'))
  const sheet = sheets[0]
  sheet.title = safeSheetTitle(title, 'Luồng hệ thống')
  sheet.rootTopic.structureClass = LOGIC_RIGHT
  const journeySet = new Set(journeyTitles)
  walkTopics(sheet.rootTopic, topic => {
    if (journeySet.has(topic.title)) topic.structureClass = TIMELINE_HORIZONTAL
    if (foldTitles.has(String(topic.title || '').trim())) topic.branch = 'folded'
  })
  return sheet
}

async function buildWorkbook(data) {
  const flows = collectFlows(data)
  const links = normalizeLinks(data, flows)
  const unified = buildUnifiedMark(data, flows, links)
  const sheet = await sheetFromMark(unified.mark, 'Luồng hệ thống', unified.journeyTitles, unified.foldTitles)
  const sheets = [sheet]

  const output = new JSZip()
  output.file('content.json', JSON.stringify(sheets))
  output.file('manifest.json', JSON.stringify({ 'file-entries': { 'content.json': {}, 'metadata.json': {} } }))
  output.file('metadata.json', JSON.stringify({}))
  return output.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

async function readSheets(filePath) {
  if (!fs.existsSync(filePath)) fail(`XMind file not found: ${filePath}`)
  const content = fs.readFileSync(filePath)
  if (content.length < 200 || content[0] !== 0x50 || content[1] !== 0x4b) {
    fail(`XMind package is invalid: ${filePath}`)
  }
  const zip = await JSZip.loadAsync(content)
  const contentFile = zip.file('content.json')
  if (!contentFile) fail(`XMind content.json is missing: ${filePath}`)
  return JSON.parse(await contentFile.async('string'))
}

async function checkXMind(filePath, analysisPath) {
  const sheets = await readSheets(filePath)
  if (!sheets.length) fail(`XMind has no sheet: ${filePath}`)
  if (sheets.length !== 1) fail(`XMind must contain one unified business flow sheet`)
  if (/sanity/i.test(JSON.stringify(sheets))) fail(`XMind user-facing content must not contain test terminology such as sanity`)
  if (sheets[0]?.rootTopic?.structureClass !== LOGIC_RIGHT) {
    fail(`Unified XMind root must use logic-right layout for horizontal journey lanes`)
  }

  if (analysisPath) {
    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'))
    const expectedJourneys = (analysis.sanity_journeys || []).length
    const topLevelTopics = sheets[0].rootTopic.children?.attached || []
    const journeyTopics = topLevelTopics.slice(0, expectedJourneys)
    if (journeyTopics.length !== expectedJourneys) fail(`XMind business journey count does not match input`)
    for (const [index, topic] of journeyTopics.entries()) {
      if (topic.structureClass !== TIMELINE_HORIZONTAL) fail(`Business journey ${index + 1} is not a horizontal lane`)
    }
    const expectedJourneyRelationships = (analysis.sanity_journeys || [])
      .reduce((total, journey) => total + ((journey.flow_sequence || []).length ? journey.flow_sequence.length + 1 : 0), 0)
    const expectedRelationships = expectedJourneyRelationships + (analysis.flow_links || []).length
    const actualRelationships = (sheets[0].relationships || []).length
    if (actualRelationships !== expectedRelationships) {
      fail(`Unified XMind relationship mismatch: expected=${expectedRelationships}; actual=${actualRelationships}`)
    }
  }
  console.log(`XMIND PASS: ${path.resolve(filePath)} with ${sheets.length} sheets`)
}

const args = process.argv.slice(2)
if (args[0] === '--check') {
  if (!args[1]) fail('Usage: render-xmind.mjs --check <file.xmind> [analysis.json]')
  await checkXMind(path.resolve(args[1]), args[2] ? path.resolve(args[2]) : undefined)
  process.exit(0)
}

if (args.length < 2) fail('Usage: render-xmind.mjs <analysis.json> <output.xmind>')
const inputPath = path.resolve(args[0])
const outputPath = path.resolve(args[1])
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
for (const field of ['project', 'scope', 'source_markdown', 'review_coverage', 'modules', 'questions', 'flow_links', 'sanity_journeys']) {
  if (data[field] === undefined || data[field] === null) fail(`Missing required field: ${field}`)
}
const buffer = await buildWorkbook(data)
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, buffer)
await checkXMind(outputPath, inputPath)
console.log(`XMIND WRITTEN: ${outputPath}`)
