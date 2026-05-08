import { db } from './db'
import type { ScannedJarMod } from './jarScanner'

export interface ConflictSubject {
  modrinth_id?: string | null
  slug?: string | null
  jar_mod_id?: string | null
  name?: string | null
  version_number?: string | null
  source?: 'db' | 'jar' | 'selection' | string
}

export interface ConflictDetail {
  type: 'modrinth' | 'custom-rule'
  severity: 'warning' | 'blocker'
  a: ConflictSubject
  b: ConflictSubject
  reason: string
  source: string
}

interface RuleRow {
  left_key: string
  right_key: string
  severity: 'warning' | 'blocker'
  reason: string
  source: string
  game_versions: string | null
  loaders: string | null
}

export function getCustomRuleConflicts(
  subjects: ConflictSubject[],
  opts: { gameVersion?: string; loader?: string } = {}
): ConflictDetail[] {
  const rules = db.prepare(`
    SELECT left_key, right_key, severity, reason, source, game_versions, loaders
    FROM conflict_rules
  `).all() as RuleRow[]

  const results: ConflictDetail[] = []
  const seen = new Set<string>()

  for (const rule of rules) {
    if (!ruleApplies(rule, opts)) continue

    const left = findByKey(subjects, rule.left_key)
    const right = findByKey(subjects, rule.right_key)
    if (!left || !right || left === right) continue

    const key = [normalizeKey(labelFor(left)), normalizeKey(labelFor(right)), rule.reason].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)

    results.push({
      type: 'custom-rule',
      severity: rule.severity,
      a: left,
      b: right,
      reason: rule.reason,
      source: rule.source,
    })
  }

  return results
}

export function dbRowsToConflictSubjects(rows: any[], source: ConflictSubject['source'] = 'db'): ConflictSubject[] {
  return rows.map((row) => ({
    modrinth_id: row.modrinth_id,
    slug: row.slug,
    name: row.name,
    version_number: row.version_number,
    source,
  }))
}

export function jarModsToConflictSubjects(rows: ScannedJarMod[]): ConflictSubject[] {
  return rows.map((row) => ({
    jar_mod_id: row.jar_mod_id,
    name: row.name,
    version_number: row.version_number,
    source: 'jar',
  }))
}

export function labelFor(subject: ConflictSubject): string {
  return subject.name ?? subject.slug ?? subject.jar_mod_id ?? subject.modrinth_id ?? '알 수 없는 모드'
}

function findByKey(subjects: ConflictSubject[], key: string): ConflictSubject | null {
  const normalized = normalizeKey(key)
  return subjects.find((subject) => identityKeys(subject).has(normalized)) ?? null
}

function identityKeys(subject: ConflictSubject): Set<string> {
  const keys = new Set<string>()
  for (const value of [subject.modrinth_id, subject.slug, subject.jar_mod_id, subject.name]) {
    const normalized = normalizeKey(value)
    if (normalized) keys.add(normalized)
  }
  return keys
}

function normalizeKey(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/^modrinth:/, '')
    .replace(/^slug:/, '')
    .replace(/^jar:/, '')
    .replace(/^name:/, '')
    .replace(/[^a-z0-9_-]+/g, '')
    .trim()
}

function ruleApplies(rule: RuleRow, opts: { gameVersion?: string; loader?: string }): boolean {
  if (rule.game_versions && opts.gameVersion) {
    const versions = parseJsonArray(rule.game_versions)
    if (versions.length && !versions.includes(opts.gameVersion)) return false
  }

  if (rule.loaders && opts.loader) {
    const loaders = parseJsonArray(rule.loaders).map((loader) => loader.toLowerCase())
    if (loaders.length && !loaders.includes(opts.loader.toLowerCase())) return false
  }

  return true
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}
