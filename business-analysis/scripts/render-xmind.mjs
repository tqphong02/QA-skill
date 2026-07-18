#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { parseXMindMarkToXMindFile } from 'xmindmark'
import JSZip from 'jszip'

const ICON_RE = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u

function fail(message) {
  console.error(message)
  process.exit(1)
}

function clean(value, field = 'content') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().replace(/\.+$/, '')
  if (ICON_RE.test(text)) fail(`${field} must not contain emoji or icons`)
  return text.replace(/^[-*#]+\s*/, '').replace(/[<>]/g, '') || 'Chưa xác định'
}

const STATUS_VI = {
  verified: 'Đã xác nhận', inferred: 'Suy luận', unresolved: 'Chưa làm rõ',
  checked: 'Đã review', blocked: 'Bị chặn', not_applicable: 'Không áp dụng',
  Open: 'Mở', Answered: 'Đã trả lời', Blocked: 'Bị chặn', Cancelled: 'Đã huỷ',
}

function viStatus(value) {
  return STATUS_VI[value] || clean(value)
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
  const valid = links.filter(link => known.has(link.from_flow) && known.has(link.to_flow))
  if (valid.length || flows.length < 2) return valid
  return flows.slice(0, -1).map((item, index) => ({
    from_flow: item.id,
    to_flow: flows[index + 1].id,
    label: 'Chuyển sang luồng tiếp theo',
    condition: 'Luồng trước hoàn tất thành công',
    data_handoff: 'Trạng thái và dữ liệu nghiệp vụ liên quan',
    sanity_impact: 'Luồng sau nhận đúng dữ liệu và có thể tiếp tục',
  }))
}

function relationshipMarkers(links) {
  const sources = new Map()
  const targets = new Map()
  links.forEach((link, index) => {
    const marker = String(index + 1)
    const label = clean(link.label || link.condition || 'Liên kết nghiệp vụ', `flow_links[${index}].label`)
    if (!sources.has(link.from_flow)) sources.set(link.from_flow, [])
    if (!targets.has(link.to_flow)) targets.set(link.to_flow, [])
    sources.get(link.from_flow).push(`[^${marker}](${label})`)
    targets.get(link.to_flow).push(`[${marker}]`)
  })
  return { sources, targets }
}

function deriveSanityChecks(flow) {
  const checks = []
  for (const step of flow.steps || []) {
    if (step.state_change) checks.push(`${step.action}: ${step.state_change}`)
  }
  for (const outcome of flow.outcomes || []) checks.push(outcome)
  return checks.length ? checks : ['Luồng hoàn tất với đúng trạng thái và dữ liệu mong đợi']
}

function buildXMindMark(data) {
  const flows = collectFlows(data)
  const flowById = new Map(flows.map(item => [item.id, item]))
  const links = normalizeLinks(data, flows)
  const { sources, targets } = relationshipMarkers(links)
  const lines = [`${clean(data.project, 'project')} — Bản đồ Sanity`]
  listBranch(lines, 0, 'Phạm vi', [data.scope], 'scope')

  add(lines, 0, 'Kịch bản sanity end-to-end', 'sanity_journeys')
  for (const [journeyIndex, journey] of (data.sanity_journeys || []).entries()) {
    add(lines, 1, `${journey.id || `SANITY-${journeyIndex + 1}`} ${journey.name}`, `sanity_journeys[${journeyIndex}]`)
    listBranch(lines, 2, 'Điều kiện chuẩn bị', journey.preconditions, 'sanity_journey.preconditions')
    add(lines, 2, 'Thứ tự thực hiện', 'sanity_journey.flow_sequence')
    for (const [sequenceIndex, sequence] of (journey.flow_sequence || []).entries()) {
      const linkedFlow = flowById.get(sequence.flow_id)
      const flowName = linkedFlow
        ? `${linkedFlow.module.name} — ${linkedFlow.flow.name}`
        : sequence.flow_id
      add(lines, 3, `${String(sequenceIndex + 1).padStart(2, '0')} ${flowName}`, 'sanity_journey.sequence')
      add(lines, 4, `Điều kiện chuyển bước: ${sequence.transition_condition || 'Bước trước hoàn tất thành công'}`, 'sanity_journey.transition_condition')
      add(lines, 4, `Điểm cần kiểm tra: ${sequence.checkpoint || 'Trạng thái và dữ liệu đầu ra đúng'}`, 'sanity_journey.checkpoint')
    }
    listBranch(lines, 2, 'Kết quả cuối', journey.expected_results, 'sanity_journey.expected_results')
  }

  add(lines, 0, 'Chi tiết và liên kết chức năng', 'system_flow')
  for (const [index, item] of flows.entries()) {
    const { id, module, flow } = item
    const markers = [...(targets.get(id) || []), ...(sources.get(id) || [])]
    addMarked(
      lines,
      1,
      `${String(index + 1).padStart(2, '0')} ${module.name} — ${flow.name} [${viStatus(flow.status || 'unresolved')}]`,
      `flows[${index}]`,
      markers,
    )
    add(lines, 2, `Vai trò thực hiện: ${flow.actor || 'Chưa xác định'}`, 'flow.actor')
    add(lines, 2, `Trạng thái vào: ${flow.entry_state || 'Chưa xác định'}`, 'flow.entry_state')
    listBranch(lines, 2, 'Điều kiện tiên quyết', flow.preconditions, 'flow.preconditions')
    add(lines, 2, `Điểm bắt đầu: ${flow.trigger || 'Chưa xác định'}`, 'flow.trigger')
    add(lines, 2, 'Trình tự hệ thống', 'flow.steps')
    for (const [stepIndex, step] of (flow.steps || []).entries()) {
      add(lines, 3, `${String(stepIndex + 1).padStart(2, '0')} ${step.action}`, 'flow.step.action')
      add(lines, 4, `Hệ thống xử lý: ${step.system_response || 'Chưa xác định'}`, 'flow.step.system_response')
      if (step.state_change) add(lines, 4, `Chuyển trạng thái: ${step.state_change}`, 'flow.step.state_change')
    }
    add(lines, 2, `Trạng thái ra: ${flow.exit_state || 'Chưa xác định'}`, 'flow.exit_state')
    listBranch(lines, 2, 'Kết quả phải đạt', flow.outcomes, 'flow.outcomes')
    listBranch(lines, 2, 'Sanity bắt buộc', flow.sanity_checks || deriveSanityChecks(flow), 'flow.sanity_checks')
    const linkedNames = links
      .filter(link => link.from_flow === id || link.to_flow === id)
      .map(link => {
        const otherId = link.from_flow === id ? link.to_flow : link.from_flow
        const other = flowById.get(otherId)
        return other ? `${other.module.name} — ${other.flow.name}` : otherId
      })
    listBranch(lines, 2, 'Chức năng liên quan', [...new Set([...(flow.dependencies || []), ...linkedNames])], 'flow.related')
    listBranch(lines, 2, 'Điểm chưa rõ ảnh hưởng test', flow.unresolved, 'flow.unresolved')
  }

  add(lines, 0, 'Liên kết giữa các chức năng', 'flow_links')
  for (const [index, link] of links.entries()) {
    const from = flowById.get(link.from_flow)
    const to = flowById.get(link.to_flow)
    const fromName = from ? `${from.module.name} — ${from.flow.name}` : link.from_flow
    const toName = to ? `${to.module.name} — ${to.flow.name}` : link.to_flow
    add(lines, 1, `${fromName} → ${toName}`, `flow_links[${index}]`)
    add(lines, 2, `Điều kiện chuyển tiếp: ${link.condition || 'Luồng trước hoàn tất thành công'}`, 'flow_link.condition')
    add(lines, 2, `Dữ liệu bàn giao: ${link.data_handoff || 'Trạng thái và dữ liệu nghiệp vụ liên quan'}`, 'flow_link.data_handoff')
    add(lines, 2, `Cần sanity: ${link.sanity_impact || 'Luồng sau nhận đúng dữ liệu và có thể tiếp tục'}`, 'flow_link.sanity_impact')
  }

  add(lines, 0, 'Điều kiện dùng chung', 'cross_cutting')
  for (const [index, item] of (data.cross_cutting || []).entries()) {
    add(lines, 1, item.name, `cross_cutting[${index}]`)
    listBranch(lines, 2, 'Điều kiện cần kiểm tra', item.details, `cross_cutting[${index}].details`)
  }

  add(lines, 0, 'Vai trò tham gia sanity', 'actors')
  for (const [index, actor] of (data.actors || []).entries()) {
    add(lines, 1, actor.name, `actors[${index}]`)
    listBranch(lines, 2, 'Trách nhiệm chính', actor.responsibilities, `actors[${index}].responsibilities`)
    listBranch(lines, 2, 'Quyền cần kiểm tra', actor.permissions, `actors[${index}].permissions`)
  }
  return `${lines.join('\n')}\n`
}

async function checkXMind(filePath, analysisPath) {
  if (!fs.existsSync(filePath)) fail(`XMind file not found: ${filePath}`)
  const content = fs.readFileSync(filePath)
  if (content.length < 200 || content[0] !== 0x50 || content[1] !== 0x4b) {
    fail(`XMind package is invalid: ${filePath}`)
  }
  const zip = await JSZip.loadAsync(content)
  const contentFile = zip.file('content.json')
  if (!contentFile) fail(`XMind content.json is missing: ${filePath}`)
  const sheets = JSON.parse(await contentFile.async('string'))
  const sheet = sheets[0]
  const topTopics = sheet?.rootTopic?.children?.attached || []
  const topTitles = new Set(topTopics.map(topic => topic.title))
  for (const required of ['Kịch bản sanity end-to-end', 'Chi tiết và liên kết chức năng', 'Liên kết giữa các chức năng']) {
    if (!topTitles.has(required)) fail(`XMind is missing required branch: ${required}`)
  }
  if (analysisPath) {
    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'))
    const expectedLinks = (analysis.flow_links || []).length
    const expectedJourneys = (analysis.sanity_journeys || []).length
    const actualLinks = (sheet.relationships || []).length
    const journeyBranch = topTopics.find(topic => topic.title === 'Kịch bản sanity end-to-end')
    const actualJourneys = journeyBranch?.children?.attached?.length || 0
    if (actualLinks !== expectedLinks) {
      fail(`XMind relationship mismatch: expected=${expectedLinks}; actual=${actualLinks}`)
    }
    if (actualJourneys !== expectedJourneys) {
      fail(`XMind sanity journey mismatch: expected=${expectedJourneys}; actual=${actualJourneys}`)
    }
  }
  console.log(`XMIND PASS: ${path.resolve(filePath)}`)
}

const args = process.argv.slice(2)
if (args[0] === '--check') {
  if (!args[1]) fail('Usage: render-xmind.mjs --check <file.xmind>')
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
const xmindmark = buildXMindMark(data)
const arrayBuffer = await parseXMindMarkToXMindFile(xmindmark)
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, Buffer.from(arrayBuffer))
await checkXMind(outputPath, inputPath)
console.log(`XMIND WRITTEN: ${outputPath}`)
