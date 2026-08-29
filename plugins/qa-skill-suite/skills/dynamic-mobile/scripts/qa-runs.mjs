#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh'
const ALLOWED_STATUSES = new Set([
  'RUNNING',
  'PASS',
  'FAILED',
  'BLOCKED',
  'UNTEST',
  'N/A',
  'DONE',
  'DONE_WITH_OPEN_QA',
])

function usage() {
  console.log(`Usage:
  node qa-runs.mjs start --skill <skill-id> [--label <scope>] [--project-root <path>] [--runs-root <path>]
  node qa-runs.mjs finish --run-dir <path> --status <status> [--primary <path>]
  node qa-runs.mjs rebuild [--project-root <path>] [--runs-root <path>]
  node qa-runs.mjs legacy-index [--project-root <path>] [--runs-root <path>]
  node qa-runs.mjs list [--skill <skill-id>] [--json] [--project-root <path>] [--runs-root <path>]

Statuses: RUNNING, PASS, FAILED, BLOCKED, UNTEST, N/A, DONE, DONE_WITH_OPEN_QA`)
}

function parseArgs(argv) {
  const [command, ...rest] = argv
  const options = {}
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (token === '--json') {
      options.json = true
      continue
    }
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`)
    const key = token.slice(2).replaceAll('-', '_')
    const value = rest[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`)
    options[key] = value
    index += 1
  }
  return { command, options }
}

function projectRoot(options = {}) {
  return path.resolve(
    options.project_root
      || process.env.QA_SKILL_PROJECT_ROOT
      || process.env.INIT_CWD
      || process.cwd(),
  )
}

function runsRoot(options = {}) {
  const project = projectRoot(options)
  return path.resolve(options.runs_root || process.env.QA_SKILL_RUNS_ROOT || path.join(project, 'qa-runs'))
}

function relativeInside(parent, child, label) {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} must stay inside ${parent}`)
  }
  return relative
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function portablePath(project, target) {
  const relative = path.relative(project, target)
  if (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    return toPosix(relative || '.')
  }
  return path.resolve(target)
}

function markdownRelative(fromFile, target) {
  return toPosix(path.relative(path.dirname(fromFile), target))
}

function slug(value, fallback) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return normalized || fallback
}

function validateSkill(skill) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill || '')) {
    throw new Error('Skill must be a lowercase canonical ID containing only letters, digits, and hyphens')
  }
  return skill
}

function localStamp(date = new Date(), timezone = process.env.QA_SKILL_TIMEZONE || DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}_${values.hour}-${values.minute}-${values.second}`
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

function uniqueRunDir(root, skill, baseName) {
  const skillRoot = path.join(root, skill)
  let candidate = path.join(skillRoot, baseName)
  let suffix = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(skillRoot, `${baseName}-${String(suffix).padStart(2, '0')}`)
    suffix += 1
  }
  return candidate
}

function manifestFiles(root) {
  if (!fs.existsSync(root)) return []
  const files = []
  for (const skillEntry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!skillEntry.isDirectory()) continue
    const skillRoot = path.join(root, skillEntry.name)
    for (const runEntry of fs.readdirSync(skillRoot, { withFileTypes: true })) {
      if (!runEntry.isDirectory()) continue
      const manifest = path.join(skillRoot, runEntry.name, 'run.json')
      if (fs.existsSync(manifest)) files.push(manifest)
    }
  }
  return files
}

function loadRuns(root) {
  const runs = []
  for (const manifestPath of manifestFiles(root)) {
    try {
      const manifest = readJson(manifestPath)
      runs.push({ ...manifest, _manifest_path: manifestPath })
    } catch (error) {
      runs.push({
        run_id: path.basename(path.dirname(manifestPath)),
        skill: path.basename(path.dirname(path.dirname(manifestPath))),
        status: 'INVALID',
        started_at: '',
        label: 'Unreadable run manifest',
        run_dir: portablePath(path.dirname(root), path.dirname(manifestPath)),
        primary_report: null,
        _manifest_path: manifestPath,
        _error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return runs.sort((left, right) => {
    const timeOrder = String(right.started_at || '').localeCompare(String(left.started_at || ''))
    return timeOrder || String(right.run_id || '').localeCompare(String(left.run_id || ''))
  })
}

function resolveStoredPath(project, stored) {
  if (!stored) return null
  return path.isAbsolute(stored) ? stored : path.resolve(project, stored)
}

function renderIndex(root, project, runs) {
  fs.mkdirSync(root, { recursive: true })
  const indexPath = path.join(root, 'INDEX.md')
  const latestPath = path.join(root, 'LATEST.md')
  const latest = runs[0] || null
  const lines = [
    '# QA run index',
    '',
    latest
      ? `Mới nhất: **${latest.skill} / ${latest.run_id}** — \`${latest.status}\``
      : 'Chưa có lần chạy nào',
    '',
    '| Thời gian | Skill | Trạng thái | Phạm vi | Report | Thư mục run |',
    '|---|---|---|---|---|---|',
  ]
  for (const run of runs) {
    const report = resolveStoredPath(project, run.primary_report)
    const runDir = resolveStoredPath(project, run.run_dir)
    const reportCell = report && fs.existsSync(report)
      ? `[mở report](${toPosix(path.relative(path.dirname(indexPath), report))})`
      : '—'
    const runCell = runDir
      ? `[mở run](${toPosix(path.relative(path.dirname(indexPath), runDir))})`
      : '—'
    const label = String(run.label || '').replaceAll('|', '\\|')
    lines.push(`| ${run.started_local || run.started_at || '—'} | ${run.skill} | ${run.status} | ${label || '—'} | ${reportCell} | ${runCell} |`)
  }
  fs.writeFileSync(indexPath, `${lines.join('\n')}\n`, 'utf8')

  if (!latest) {
    fs.writeFileSync(latestPath, '# Latest QA run\n\nChưa có lần chạy nào\n', 'utf8')
    return
  }
  const latestRunDir = resolveStoredPath(project, latest.run_dir)
  const latestReport = resolveStoredPath(project, latest.primary_report)
  const latestLines = [
    '# Latest QA run',
    '',
    `- Skill: \`${latest.skill}\``,
    `- Run: \`${latest.run_id}\``,
    `- Trạng thái: \`${latest.status}\``,
    `- Bắt đầu: ${latest.started_local || latest.started_at}`,
    `- Phạm vi: ${latest.label || '—'}`,
    `- Report: ${latestReport && fs.existsSync(latestReport) ? `[mở report](${toPosix(path.relative(path.dirname(latestPath), latestReport))})` : '—'}`,
    `- Thư mục run: ${latestRunDir ? `[mở run](${toPosix(path.relative(path.dirname(latestPath), latestRunDir))})` : '—'}`,
    `- Tất cả lịch sử: [INDEX.md](INDEX.md)`,
    '',
  ]
  fs.writeFileSync(latestPath, latestLines.join('\n'), 'utf8')
  writeJson(path.join(root, 'latest.json'), stripInternal(latest))

  const skillRuns = new Map()
  for (const run of runs) {
    if (!skillRuns.has(run.skill)) skillRuns.set(run.skill, run)
  }
  for (const [skill, run] of skillRuns) {
    writeJson(path.join(root, skill, 'latest.json'), stripInternal(run))
  }
}

function stripInternal(run) {
  return Object.fromEntries(Object.entries(run).filter(([key]) => !key.startsWith('_')))
}

function rebuild(options = {}) {
  const project = projectRoot(options)
  const root = runsRoot(options)
  const runs = loadRuns(root)
  renderIndex(root, project, runs)
  return { project_root: project, runs_root: root, count: runs.length, latest: runs[0] ? stripInternal(runs[0]) : null }
}

function start(options) {
  const project = projectRoot(options)
  const root = runsRoot(options)
  const skill = validateSkill(options.skill)
  const label = String(options.label || 'run').trim() || 'run'
  const timezone = process.env.QA_SKILL_TIMEZONE || DEFAULT_TIMEZONE
  const now = new Date()
  const baseName = `${localStamp(now, timezone)}_${slug(label, 'run')}`
  const runDir = uniqueRunDir(root, skill, baseName)
  relativeInside(root, runDir, 'Run directory')
  fs.mkdirSync(runDir, { recursive: true })
  const runId = path.basename(runDir)
  const manifest = {
    schema_version: 1,
    run_id: runId,
    skill,
    label,
    status: 'RUNNING',
    started_at: now.toISOString(),
    started_local: localStamp(now, timezone),
    timezone,
    finished_at: null,
    project_root: project,
    runs_root: root,
    run_dir: portablePath(project, runDir),
    primary_report: null,
    artifact_count: 0,
    artifacts: [],
  }
  writeJson(path.join(runDir, 'run.json'), manifest)
  rebuild({ ...options, project_root: project, runs_root: root })
  return { ...manifest, run_dir_absolute: runDir, manifest_path: path.join(runDir, 'run.json') }
}

function inventory(runDir) {
  const artifacts = []
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile() && absolute !== path.join(runDir, 'run.json')) {
        artifacts.push({
          path: toPosix(path.relative(runDir, absolute)),
          bytes: fs.statSync(absolute).size,
        })
      }
    }
  }
  visit(runDir)
  return artifacts.sort((left, right) => left.path.localeCompare(right.path))
}

function finish(options) {
  if (!options.run_dir) throw new Error('--run-dir is required')
  const runDir = path.resolve(options.run_dir)
  const manifestPath = path.join(runDir, 'run.json')
  if (!fs.existsSync(manifestPath)) throw new Error(`Run manifest not found: ${manifestPath}`)
  const manifest = readJson(manifestPath)
  const status = String(options.status || '').toUpperCase()
  if (!ALLOWED_STATUSES.has(status) || status === 'RUNNING') {
    throw new Error(`Invalid terminal status: ${options.status || '<missing>'}`)
  }
  const project = path.resolve(options.project_root || manifest.project_root || inferProjectRoot(runDir))
  const root = path.resolve(options.runs_root || manifest.runs_root || inferRunsRoot(runDir))
  relativeInside(root, runDir, 'Run directory')

  let primary = null
  if (options.primary) {
    primary = path.isAbsolute(options.primary) ? path.resolve(options.primary) : path.resolve(runDir, options.primary)
    relativeInside(runDir, primary, 'Primary report')
    if (!fs.existsSync(primary) || !fs.statSync(primary).isFile()) throw new Error(`Primary report not found: ${primary}`)
  }
  const artifacts = inventory(runDir)
  const completed = {
    ...manifest,
    status,
    finished_at: new Date().toISOString(),
    primary_report: primary ? portablePath(project, primary) : null,
    artifact_count: artifacts.length,
    artifacts,
  }
  writeJson(manifestPath, completed)
  rebuild({ ...options, project_root: project, runs_root: root })
  return { ...completed, run_dir_absolute: runDir, manifest_path: manifestPath }
}

function inferRunsRoot(runDir) {
  const skillRoot = path.dirname(runDir)
  const root = path.dirname(skillRoot)
  if (path.basename(root) !== 'qa-runs') {
    throw new Error('Cannot infer qa-runs root; pass --runs-root explicitly')
  }
  return root
}

function inferProjectRoot(runDir) {
  return path.dirname(inferRunsRoot(runDir))
}

function list(options) {
  const root = runsRoot(options)
  const selected = options.skill ? validateSkill(options.skill) : null
  const runs = loadRuns(root).filter(run => !selected || run.skill === selected)
  if (options.json) return runs.map(stripInternal)
  if (!runs.length) return 'Chưa có lần chạy nào'
  const rows = ['STARTED\tSTATUS\tSKILL\tRUN\tREPORT']
  for (const run of runs) {
    rows.push([
      run.started_local || run.started_at || '—',
      run.status,
      run.skill,
      run.run_id,
      run.primary_report || '—',
    ].join('\t'))
  }
  return rows.join('\n')
}

function legacyIndex(options) {
  const project = projectRoot(options)
  const root = runsRoot(options)
  const output = path.join(root, 'LEGACY.md')
  const candidates = []
  const ignoredDirectories = new Set(['.git', 'node_modules', 'vendor', 'qa-runs'])
  const commonRoots = ['evidence', 'output', 'artifacts', 'reports']
    .map(name => path.join(project, name))
    .filter(directory => fs.existsSync(directory) && fs.statSync(directory).isDirectory())
  const rootFilePattern = /(report|result|evidence|trace|summary)/i
  const allowedExtensions = new Set(['.md', '.json', '.html', '.xlsx', '.csv', '.xml', '.log'])

  function addFile(file) {
    const stat = fs.statSync(file)
    candidates.push({ file, modified_at: stat.mtime.toISOString(), bytes: stat.size })
  }

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (ignoredDirectories.has(entry.name) || entry.isSymbolicLink()) continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) addFile(absolute)
    }
  }

  for (const directory of commonRoots) visit(directory)
  for (const entry of fs.readdirSync(project, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const extension = path.extname(entry.name).toLowerCase()
    if (rootFilePattern.test(entry.name) && allowedExtensions.has(extension)) addFile(path.join(project, entry.name))
  }
  candidates.sort((left, right) => right.modified_at.localeCompare(left.modified_at) || left.file.localeCompare(right.file))
  fs.mkdirSync(root, { recursive: true })
  const lines = [
    '# Legacy artifact index',
    '',
    'Các file dưới đây chỉ được lập chỉ mục theo thời gian sửa đổi; không file nào bị di chuyển hoặc đổi tên',
    '',
    '| Sửa đổi | Kích thước | File |',
    '|---|---:|---|',
  ]
  for (const item of candidates) {
    lines.push(`| ${item.modified_at} | ${item.bytes} | [${toPosix(path.relative(project, item.file))}](${markdownRelative(output, item.file)}) |`)
  }
  if (!candidates.length) lines.push('| — | — | Không tìm thấy artifact legacy trong các thư mục thông dụng |')
  fs.writeFileSync(output, `${lines.join('\n')}\n`, 'utf8')
  return { project_root: project, legacy_index: output, count: candidates.length }
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2))
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    usage()
    return
  }
  let result
  if (command === 'start') result = start(options)
  else if (command === 'finish') result = finish(options)
  else if (command === 'rebuild') result = rebuild(options)
  else if (command === 'legacy-index') result = legacyIndex(options)
  else if (command === 'list') result = list(options)
  else throw new Error(`Unknown command: ${command}`)
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2))
}

try {
  main()
} catch (error) {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
