/**
 * Loader for the patent bundle's shipped SKILL.md assets: one directory under
 * `skills/` per skill, frontmatter carries the routing metadata, the body is
 * the instruction content. Registered as runtime skills at plugin load, so the
 * assets ship with the package and need no filesystem discovery root.
 * @module
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import type { SkillInvocationPolicy, SkillRegistration } from '@deepseek-ai/dsh-skill'

/** The package's shipped skill directories, resolved at runtime. */
export const SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url))

/**
 * Load every shipped skill directory.
 * @param dir - the directory whose immediate subdirectories each hold a SKILL.md.
 * @returns one registration per skill directory, sorted by name for a
 * prefix-stable catalog order.
 */
export function loadBundledSkills(dir: string = SKILLS_DIR): SkillRegistration[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => parseSkillFile(join(dir, entry.name, 'SKILL.md')))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Parse one SKILL.md into a runtime skill registration.
 * @param filePath - absolute path of the SKILL.md file.
 * @returns the registration, with a directory resource base so relative
 * references (e.g. `references/*.md`) resolve beside the file.
 */
export function parseSkillFile(filePath: string): SkillRegistration {
  const raw = readFileSync(filePath, 'utf8')
  const fence = /^---\r?\n([\s\S]*?)\r?\n?---(?:\r?\n|$)/.exec(raw)
  if (fence === null) throw new Error(`patent bundle skill ${filePath}: frontmatter must open and close with ---`)
  let frontmatter: Record<string, unknown>
  try {
    /* v8 ignore next -- the capture group always participates in a matched fence */
    frontmatter = (parseYaml(fence[1] ?? '') ?? {}) as Record<string, unknown>
  } catch (cause) {
    throw new Error(`patent bundle skill ${filePath}: invalid YAML frontmatter`, { cause })
  }
  const { name, description, whenToUse, 'disable-model-invocation': disableModel, 'user-invocable': userInvocable, ...metadata } = frontmatter
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error(`patent bundle skill ${filePath}: frontmatter needs a non-empty name`)
  }
  if (typeof description !== 'string' || description.trim().length === 0) {
    throw new Error(`patent bundle skill ${filePath}: frontmatter needs a non-empty description`)
  }
  if (whenToUse !== undefined && typeof whenToUse !== 'string') {
    throw new Error(`patent bundle skill ${filePath}: whenToUse must be a string`)
  }
  const invocation = invocationPolicy(filePath, disableModel, userInvocable)
  return {
    name,
    description,
    source: 'runtime',
    content: raw.slice(fence[0].length).trim(),
    path: filePath,
    resourceBase: { kind: 'directory', path: dirname(filePath) },
    ...(whenToUse === undefined ? {} : { whenToUse }),
    ...(Object.keys(metadata).length === 0 ? {} : { metadata }),
    ...(invocation === undefined ? {} : { invocation }),
  }
}

/**
 * Map the optional SKILL.md invocation flags to the registry's controls.
 * @returns undefined when neither flag is present (both surfaces permitted).
 */
function invocationPolicy(
  filePath: string,
  disableModel: unknown,
  userInvocable: unknown,
): SkillInvocationPolicy | undefined {
  if (disableModel === undefined && userInvocable === undefined) return undefined
  if (disableModel !== undefined && typeof disableModel !== 'boolean') {
    throw new Error(`patent bundle skill ${filePath}: disable-model-invocation must be a boolean`)
  }
  if (userInvocable !== undefined && typeof userInvocable !== 'boolean') {
    throw new Error(`patent bundle skill ${filePath}: user-invocable must be a boolean`)
  }
  return {
    modelInvocable: disableModel !== true,
    userInvocable: userInvocable !== false,
  }
}
