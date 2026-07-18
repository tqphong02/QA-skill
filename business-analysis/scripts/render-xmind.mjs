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
  return text.replace(/^[-*#]+\s*/, '').replace(/[<>]/g, '') || 'Chưa xác định'
}

const STATUS_VI = {
  verified: 'Đã xác nhận', inferred: 'Suy luận', unresolved: 'Chưa làm rõ',
  checked: 'Đã review', blocked: 'Bị chặn', not_applicable: 'Không áp dụng',
  Open: 'Mở', Answered: 'Đã trả lời', Blocked: 'Bị chặn', Cancelled: 'Đã huỷ',
}

const AREA_VI = {
  'Scope and actors': 'Phạm vi và vai trò',
  'Entry and preconditions': 'Điểm vào và điều kiện tiên quyết',
  'Happy flow': 'Luồng chính',
  'Alternate and exception flow': 'Luồng thay thế và ngoại lệ',
  'Business rules': 'Quy tắc nghiệp vụ',
  'States and transitions': 'Trạng thái và chuyển trạng thái',
  'Roles and permissions': 'Vai trò và phân quyền',
  'Input and validation': 'Dữ liệu đầu vào và kiểm tra hợp lệ',
  'Data lifecycle and persistence': 'Vòng đời và lưu trữ dữ liệu',
  'API and integration': 'API và tích hợp',
  'Error handling and recovery': 'Xử lý lỗi và khôi phục',
  'Concurrency and idempotency': 'Đồng thời và chống xử lý lặp',
  'Security and privacy': 'Bảo mật và quyền riêng tư',
  'Performance and capacity': 'Hiệu năng và tải',
  'UI UX and accessibility': 'UI UX và khả năng tiếp cận',
  'Audit logging and observability': 'Nhật ký kiểm toán và khả năng theo dõi',
  'Compatibility and migration': 'Tương thích và chuyển đổi dữ liệu',
  'Testability and acceptance criteria': 'Khả năng kiểm thử và tiêu chí chấp nhận',
}

function viStatus(value) {
  return STATUS_VI[value] || clean(value)
}

function add(lines, level, value, field) {
  lines.push(`${'  '.repeat(level)}- ${clean(value, field)}`)
}

function listBranch(lines, level, title, values, field) {
  add(lines, level, title, field)
  const items = Array.isArray(values) ? values : []
  if (!items.length) add(lines, level + 1, 'Chưa xác định', field)
  items.forEach((item, index) => add(lines, level + 1, item, `${field}[${index}]`))
}

function buildXMindMark(data) {
  const lines = [clean(data.project, 'project')]
  listBranch(lines, 0, 'Phạm vi', [data.scope], 'scope')

  add(lines, 0, 'Vai trò', 'actors')
  for (const [index, actor] of (data.actors || []).entries()) {
    add(lines, 1, `${actor.name} [${viStatus(actor.status || 'unresolved')}]`, `actors[${index}]`)
    listBranch(lines, 2, 'Trách nhiệm', actor.responsibilities, `actors[${index}].responsibilities`)
    listBranch(lines, 2, 'Quyền hạn', actor.permissions, `actors[${index}].permissions`)
  }

  add(lines, 0, 'Module nghiệp vụ', 'modules')
  for (const [moduleIndex, module] of (data.modules || []).entries()) {
    add(lines, 1, `${module.name} [${viStatus(module.status || 'unresolved')}]`, `modules[${moduleIndex}]`)
    add(lines, 2, `Mục đích: ${module.purpose || 'Chưa xác định'}`, `modules[${moduleIndex}].purpose`)
    add(lines, 2, 'Luồng nghiệp vụ', `modules[${moduleIndex}].flows`)
    for (const [flowIndex, flow] of (module.flows || []).entries()) {
      add(lines, 3, `${flow.id || `FLOW-${flowIndex + 1}`} ${flow.name} [${viStatus(flow.status || 'unresolved')}]`, `flow`)
      add(lines, 4, `Vai trò: ${flow.actor || 'Chưa xác định'}`, 'flow.actor')
      listBranch(lines, 4, 'Điều kiện tiên quyết', flow.preconditions, 'flow.preconditions')
      add(lines, 4, `Kích hoạt: ${flow.trigger || 'Chưa xác định'}`, 'flow.trigger')
      add(lines, 4, 'Các bước', 'flow.steps')
      for (const [stepIndex, step] of (flow.steps || []).entries()) {
        add(lines, 5, `${step.id || `S${stepIndex + 1}`} ${step.action}`, 'flow.step.action')
        add(lines, 6, `Hệ thống: ${step.system_response || 'Chưa xác định'}`, 'flow.step.system_response')
        if (step.state_change) add(lines, 6, `Trạng thái: ${step.state_change}`, 'flow.step.state_change')
        if (step.api_data) add(lines, 6, `API hoặc dữ liệu: ${step.api_data}`, 'flow.step.api_data')
      }
      listBranch(lines, 4, 'Kết quả', flow.outcomes, 'flow.outcomes')
      listBranch(lines, 4, 'Luồng thay thế', flow.alternate_flows, 'flow.alternate_flows')
      listBranch(lines, 4, 'Ngoại lệ', flow.exceptions, 'flow.exceptions')
      listBranch(lines, 4, 'Quy tắc nghiệp vụ', flow.business_rules, 'flow.business_rules')
      listBranch(lines, 4, 'Phụ thuộc', flow.dependencies, 'flow.dependencies')
      listBranch(lines, 4, 'Chưa làm rõ', flow.unresolved, 'flow.unresolved')
    }
  }

  add(lines, 0, 'Vấn đề xuyên suốt', 'cross_cutting')
  for (const [index, item] of (data.cross_cutting || []).entries()) {
    add(lines, 1, `${item.name} [${viStatus(item.status || 'unresolved')}]`, `cross_cutting[${index}]`)
    listBranch(lines, 2, 'Chi tiết', item.details, `cross_cutting[${index}].details`)
  }

  add(lines, 0, 'Phạm vi review', 'review_coverage')
  for (const item of data.review_coverage || []) {
    add(lines, 1, `${AREA_VI[item.area] || item.area} [${viStatus(item.status)}]`, 'review_coverage')
    if (item.notes) add(lines, 2, item.notes, 'review_coverage.notes')
  }

  add(lines, 0, 'Câu hỏi đang mở', 'questions')
  const openQuestions = (data.questions || []).filter(item => (item.status || 'Open') !== 'Answered')
  if (!openQuestions.length) add(lines, 1, 'Không có câu hỏi đang mở', 'questions')
  openQuestions.forEach((item, index) => {
    add(lines, 1, `${item.id || `QA-${String(index + 1).padStart(3, '0')}`} ${item.question}`, 'question')
    add(lines, 2, `Rủi ro: ${item.risk || 'Chưa xác định'}`, 'question.risk')
    add(lines, 2, `Người trả lời: ${item.owner || 'Chưa phân công'}`, 'question.owner')
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
