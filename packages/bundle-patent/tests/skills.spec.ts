import { readdirSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/index.ts'
import { loadBundledSkills, parseSkillFile } from '../src/skills.ts'

const SHIPPED_SKILL_NAMES = [
  'diagram-design',
  'patent-application',
  'patent-chapters',
  'patent-claims',
  'patent-de-ai',
  'patent-effect-contrast',
  'patent-experiment',
  'patent-figure-design',
  'patent-init',
  'patent-research',
  'patent-review',
  'patent-services',
  'patent-writing-quality',
]

let root: string | undefined

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function skillDir(files: Record<string, string>): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'patent-skills-'))
  const skill = join(root, 'sample')
  await mkdir(skill, { recursive: true })
  for (const [name, body] of Object.entries(files)) await writeFile(join(skill, name), body)
  return join(skill, 'SKILL.md')
}

describe('the patent-assets plugin', () => {
  it('registers every shipped skill on the skills registry', () => {
    const registered: { name: string }[] = []
    const ctx = { skills: { register: vi.fn((skill: { name: string }) => {
      registered.push(skill)
      return () => {}
    }) } }
    apply(ctx as never)
    expect(registered.map(skill => skill.name)).toEqual(SHIPPED_SKILL_NAMES)
  })
})

describe('loadBundledSkills', () => {
  it('loads the thirteen shipped skills in name order with bodies and resource bases', () => {
    const skills = loadBundledSkills()
    expect(skills.map(skill => skill.name)).toEqual(SHIPPED_SKILL_NAMES)
    for (const skill of skills) {
      expect(skill.description.length).toBeGreaterThan(0)
      expect(skill.content.length).toBeGreaterThan(0)
      expect(skill.source).toBe('runtime')
      expect(skill.resourceBase).toEqual({ kind: 'directory', path: skill.path!.replace(/[/\\]SKILL\.md$/, '') })
    }
    expect(skills.find(skill => skill.name === 'patent-init')?.content).toContain('五方对齐')
    expect(skills.find(skill => skill.name === 'patent-experiment')?.content).toContain('run-log.md')
    expect(skills.find(skill => skill.name === 'patent-research')?.content).toContain('prior-art.md')
  })

  it('keeps the effect-contrast skill resources addressable beside the file', () => {
    const skills = loadBundledSkills()
    const effect = skills.find(skill => skill.name === 'patent-effect-contrast')
    expect(effect?.resourceBase).toBeDefined()
  })

  it('keeps the vendored diagram-design skill byte-identical to upstream shape', () => {
    const skills = loadBundledSkills()
    const diagram = skills.find(skill => skill.name === 'diagram-design')
    expect(diagram).toBeDefined()
    /* The vendored SKILL.md routes to references/ by relative path; the
       directory resource base must sit beside it so type-*.md loads resolve. */
    expect(diagram?.content).toContain('references/')
    expect(readdirSync(new URL('../skills/diagram-design/references/', import.meta.url)).length)
      .toBeGreaterThanOrEqual(40)
  })
})

describe('parseSkillFile', () => {
  it('parses frontmatter fields and trims the body', async () => {
    const path = await skillDir({
      'SKILL.md': '---\nname: sample\ndescription: A test skill.\nwhenToUse: Whenever testing.\n---\n\n# Body\n\nText.\n',
    })
    const skill = parseSkillFile(path)
    expect(skill).toMatchObject({ name: 'sample', description: 'A test skill.', whenToUse: 'Whenever testing.' })
    expect(skill.content).toBe('# Body\n\nText.')
  })

  it('maps the invocation flags to the registry controls', async () => {
    const path = await skillDir({
      'SKILL.md': '---\nname: sample\ndescription: d.\ndisable-model-invocation: true\nuser-invocable: false\n---\nbody',
    })
    expect(parseSkillFile(path).invocation).toEqual({ modelInvocable: false, userInvocable: false })
  })

  it('passes non-routing frontmatter through as metadata', async () => {
    const path = await skillDir({ 'SKILL.md': '---\nname: sample\ndescription: d.\nlicense: MIT\n---\nbody' })
    expect(parseSkillFile(path).metadata).toEqual({ license: 'MIT' })
  })

  it.each([
    ['no fence', 'body without frontmatter', /frontmatter must open and close/],
    ['missing name', '---\ndescription: d.\n---\nbody', /non-empty name/],
    ['missing description', '---\nname: sample\n---\nbody', /non-empty description/],
    ['non-boolean flag', '---\nname: s\ndescription: d.\ndisable-model-invocation: yes-please\n---\nbody', /disable-model-invocation must be a boolean/],
    ['non-boolean user-invocable', '---\nname: s\ndescription: d.\nuser-invocable: sometimes\n---\nbody', /user-invocable must be a boolean/],
    ['non-string whenToUse', '---\nname: s\ndescription: d.\nwhenToUse: 42\n---\nbody', /whenToUse must be a string/],
  ])('fails loud: %s', async (_label, body, message) => {
    const path = await skillDir({ 'SKILL.md': body })
    expect(() => parseSkillFile(path)).toThrow(message)
  })

  it('fails loud on invalid YAML', async () => {
    const path = await skillDir({ 'SKILL.md': '---\nname: [unclosed\n---\nbody' })
    expect(() => parseSkillFile(path)).toThrow(/invalid YAML frontmatter/)
  })

  it('accepts empty frontmatter as an empty metadata object', async () => {
    const path = await skillDir({ 'SKILL.md': '---\n---\nbody' })
    expect(() => parseSkillFile(path)).toThrow(/non-empty name/)
  })
})
