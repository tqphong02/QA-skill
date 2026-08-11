import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function loadSkillRegistry(root = ROOT) {
  const file = path.join(root, 'config', 'skill-registry.json')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function publicSkillEntries(root = ROOT) {
  return loadSkillRegistry(root).skills
}

export function resolveSkillEntry(input, root = ROOT) {
  const registry = loadSkillRegistry(root)
  return registry.skills.find((entry) => entry.id === input || entry.legacy_aliases.includes(input)) || null
}

export function skillRepoPath(input, root = ROOT) {
  const entry = typeof input === 'string' ? resolveSkillEntry(input, root) : input
  if (!entry) return null
  return path.join(root, entry.path)
}

export function skillById(id, root = ROOT) {
  return loadSkillRegistry(root).skills.find((entry) => entry.id === id) || null
}

export { ROOT }
