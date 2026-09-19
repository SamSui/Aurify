import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { assessLoopState } from '../src/loop.ts'
import * as ToolPatent from '../src/index.ts'

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'patent-loop-'))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Create an empty project scratch directory. */
async function scratch(name: string): Promise<string> {
  const dir = join(root, name)
  await mkdir(dir, { recursive: true })
  return dir
}

const MANIFEST = 'formatVersion: 1\nname: 测试存储装置\nstatus: drafting\n'

const FULL_BRIEF = [
  '# 五方对齐摘要',
  '## 点子评估', '建议写，对比文件 CN101 语义无关。', '## 技术领域', '数据存储领域。',
  '## 背景技术', '① 现有方案过慢；② 空间浪费', '## 技术问题', '① 提速；② 省空间',
  '## 发明内容', '新索引结构', '## 有益效果', '① 命中率提升；② 空间减半',
].join('\n\n')

const BODY = '正文内容超过二十个字符的占位段落，用于通过成稿长度门槛的检查逻辑。'

/** Scaffold a project with a manifest, a full brief, and all eight drafted chapters. */
async function fullProject(name: string): Promise<string> {
  const dir = await scratch(name)
  await writeFile(join(dir, 'patent.yml'), MANIFEST, 'utf8')
  await writeFile(join(dir, 'brief.md'), FULL_BRIEF, 'utf8')
  await mkdir(join(dir, 'chapters'), { recursive: true })
  for (const file of ['01-name.md', '02-field.md', '03-background.md', '04-problem.md', '05-solution.md', '06-effect.md', '07-key-points.md', '08-drawings.md']) {
    await writeFile(join(dir, 'chapters', file), `# ${file}\n\n${BODY}`, 'utf8')
  }
  return dir
}

describe('assessLoopState stage machine', () => {
  it('names init for a bare directory with no patent.yml', async () => {
    const dir = await scratch('bare')
    const state = await assessLoopState(dir)
    expect(state.hasProject).toBe(false)
    expect(state.stage).toBe('init')
    expect(state.complete).toBe(false)
    expect(state.mayNeedUser).toBe(true)
    expect(state.skills).toContain('patent-init')
  })

  it('names align while brief.md is missing or lacks a core section', async () => {
    const missing = await scratch('no-brief')
    await writeFile(join(missing, 'patent.yml'), MANIFEST, 'utf8')
    expect((await assessLoopState(missing)).stage).toBe('align')

    const partial = await scratch('thin-brief')
    await writeFile(join(partial, 'patent.yml'), MANIFEST, 'utf8')
    await writeFile(join(partial, 'brief.md'), '## 技术领域\n\n存储。\n', 'utf8')
    const state = await assessLoopState(partial)
    expect(state.stage).toBe('align')
    expect(state.gaps.some(gap => gap.detail.includes('背景技术'))).toBe(true)
  })

  it('passes align once the brief carries all five core sections', async () => {
    const dir = await scratch('brief-only')
    await writeFile(join(dir, 'patent.yml'), MANIFEST, 'utf8')
    await writeFile(join(dir, 'brief.md'), FULL_BRIEF, 'utf8')
    const state = await assessLoopState(dir)
    expect(state.stage).toBe('chapters')
    expect(state.skills).toContain('patent-chapters')
  })

  it('names chapters while any of the eight files is missing or a placeholder', async () => {
    const dir = await fullProject('thin-chapters')
    await rm(join(dir, 'chapters', '05-solution.md'))
    await writeFile(join(dir, 'chapters', '06-effect.md'), '# 有益效果\n\n待补。', 'utf8')
    const state = await assessLoopState(dir)
    expect(state.stage).toBe('chapters')
    expect(state.gaps.some(gap => gap.detail.includes('05-solution.md'))).toBe(true)
    expect(state.gaps.some(gap => gap.detail.includes('06-effect.md 为占位'))).toBe(true)
  })

  it('names experiments for quantified effects with no run log, and accepts the not-applicable marker', async () => {
    const dir = await fullProject('no-experiments')
    await writeFile(join(dir, 'chapters', '06-effect.md'), `# 有益效果\n\n丢失从 226 个降至 0，调用减少 22%。${BODY}`, 'utf8')
    expect((await assessLoopState(dir)).stage).toBe('experiments')

    await mkdir(join(dir, 'experiments'), { recursive: true })
    await writeFile(join(dir, 'experiments', 'README.md'), '无需实验：纯界面布局方法，无量化效果主张。\n', 'utf8')
    expect((await assessLoopState(dir)).stage).toBe('figures')
  })

  it('satisfies experiments with a run log anywhere under experiments/', async () => {
    const dir = await fullProject('with-experiments')
    await writeFile(join(dir, 'chapters', '06-effect.md'), `# 有益效果\n\n丢失从 226 个降至 0。${BODY}`, 'utf8')
    await mkdir(join(dir, 'experiments', 'sim', 'results'), { recursive: true })
    await writeFile(join(dir, 'experiments', 'sim', 'results', 'run-log.md'), '| 时间 | 退出码 |\n', 'utf8')
    expect((await assessLoopState(dir)).stage).toBe('figures')
  })

  it('names figures for undeclared, missing, or surplus figure files', async () => {
    const none = await fullProject('figures-unplanned')
    expect((await assessLoopState(none)).gaps.some(gap => gap.detail.includes('未声明任何'))).toBe(true)

    const missing = await fullProject('figures-missing')
    await writeFile(join(missing, 'chapters', '08-drawings.md'), `# 附图说明\n\n图1 为流程总览图；\n图2 为架构图。\n${BODY}`, 'utf8')
    await mkdir(join(missing, 'figures'), { recursive: true })
    await writeFile(join(missing, 'figures', '图1-流程总览.png'), 'png', 'utf8')
    const state = await assessLoopState(missing)
    expect(state.stage).toBe('figures')
    expect(state.gaps.some(gap => gap.detail.includes('图2'))).toBe(true)

    await writeFile(join(missing, 'figures', '图9-多余.png'), 'png', 'utf8')
    expect((await assessLoopState(missing)).gaps.some(gap => gap.detail.includes('图9'))).toBe(true)
  })

  it('names review until a rubric report exists, then export until a fresh disclosure docx exists', async () => {
    const dir = await fullProject('review-and-export')
    await writeFile(join(dir, 'chapters', '08-drawings.md'), `# 附图说明\n\n图1 为流程总览图。\n${BODY}`, 'utf8')
    await mkdir(join(dir, 'figures'), { recursive: true })
    await writeFile(join(dir, 'figures', '图1.png'), 'png', 'utf8')
    expect((await assessLoopState(dir)).stage).toBe('review')

    await mkdir(join(dir, 'review'), { recursive: true })
    await writeFile(join(dir, 'review', 'project.review.md'), '总分 81\n', 'utf8')
    expect((await assessLoopState(dir)).stage).toBe('export')

    // The score gate: a fresh report below the default bar of 80 keeps the loop at review.
    await writeFile(join(dir, 'chapters', '07-key-points.md'), `# 关键点\n\n修订后的内容。${BODY}`, 'utf8')
    await writeFile(join(dir, 'review', 'project.review.md'), '总分 79\n', 'utf8')
    const low = await assessLoopState(dir)
    expect(low.stage).toBe('review')
    expect(low.gaps[0]?.detail).toContain('低于达标线 80')

    // The prior-art degradation marker relaxes the bar by ten points.
    await mkdir(join(dir, 'reference'), { recursive: true })
    await writeFile(join(dir, 'reference', 'prior-art.md'), '查新不可用：代理未开启，待补查\n', 'utf8')
    expect((await assessLoopState(dir)).stage).toBe('export')
    await rm(join(dir, 'reference', 'prior-art.md'))

    // A per-project threshold overrides the default bar.
    await writeFile(join(dir, 'patent.yml'), `${MANIFEST}reviewThreshold: 85\n`, 'utf8')
    await writeFile(join(dir, 'review', 'project.review.md'), '总分 81\n', 'utf8')
    const strict = await assessLoopState(dir)
    expect(strict.stage).toBe('review')
    expect(strict.gaps[0]?.detail).toContain('低于达标线 85')

    // A report older than the sources it reviewed is stale no matter its score.
    await writeFile(join(dir, 'patent.yml'), MANIFEST, 'utf8')
    await writeFile(join(dir, 'review', 'project.review.md'), '总分 95\n', 'utf8')
    const stale = new Date(Date.now() - 60_000)
    await utimes(join(dir, 'review', 'project.review.md'), stale, stale)
    await writeFile(join(dir, 'chapters', '06-effect.md'), `# 有益效果\n\n审查之后的源文件修订。${BODY}`, 'utf8')
    const outdated = await assessLoopState(dir)
    expect(outdated.stage).toBe('review')
    expect(outdated.gaps[0]?.detail).toContain('早于源文件')

    // A report without a parseable total score fails loud instead of passing.
    await writeFile(join(dir, 'review', 'project.review.md'), '没有总分行\n', 'utf8')
    const unparseable = await assessLoopState(dir)
    expect(unparseable.stage).toBe('review')
    expect(unparseable.gaps[0]?.detail).toContain('缺少可解析的总分')

    // A fresh passing report reopens the export gate, and done closes the loop.
    await writeFile(join(dir, 'review', 'project.review.md'), '总分 88\n', 'utf8')
    await mkdir(join(dir, 'exports'), { recursive: true })
    await writeFile(join(dir, 'exports', '测试存储装置-交底书.docx'), 'docx', 'utf8')
    const fresh = await assessLoopState(dir)
    expect(fresh.stage).toBe('done')
    expect(fresh.complete).toBe(true)
  })

  it('rejects a partial-scope report as the whole-project verdict', async () => {
    const dir = await fullProject('partial-scope')
    await writeFile(join(dir, 'chapters', '08-drawings.md'), `# 附图说明\n\n无附图\n${BODY}`, 'utf8')
    await mkdir(join(dir, 'review'), { recursive: true })
    await writeFile(join(dir, 'review', 'chapters.review.md'), '总分 92\n\n> 审查范围：部分（chapters）\n', 'utf8')
    const state = await assessLoopState(dir)
    expect(state.stage).toBe('review')
    expect(state.gaps[0]?.detail).toContain('只覆盖了局部目标')
  })

  it('escalates instead of re-reviewing forever once score gains stall', async () => {
    const dir = await fullProject('stalled')
    await writeFile(join(dir, 'chapters', '08-drawings.md'), `# 附图说明\n\n无附图\n${BODY}`, 'utf8')
    await mkdir(join(dir, 'review'), { recursive: true })
    await writeFile(join(dir, 'review', 'project.review.md'), '总分 73\n', 'utf8')
    await writeFile(
      join(dir, 'review', 'attempts.md'),
      '- t1 总分 70 范围 project 目标 .\n- t2 总分 72 范围 project 目标 .\n- t3 总分 73 范围 project 目标 .\n',
      'utf8',
    )
    const state = await assessLoopState(dir)
    expect(state.stage).toBe('review')
    expect(state.gaps[0]?.detail).toContain('连续 3 次重审未达线')
    expect(state.gaps[0]?.detail).toContain('reviewThreshold')
  })

  it('flags prose references to undeclared figures', async () => {
    const dir = await fullProject('figure-refs')
    await writeFile(join(dir, 'chapters', '08-drawings.md'), `# 附图说明\n\n图1 为流程总览图。\n${BODY}`, 'utf8')
    await writeFile(join(dir, 'chapters', '06-effect.md'), `# 有益效果\n\n静默丢失归零（对比见图9）。${BODY}`, 'utf8')
    const state = await assessLoopState(dir)
    expect(state.gaps.some(gap => gap.detail.includes('正文引用了图9，但 08 章未声明'))).toBe(true)
  })

  it('reopens the export stage when a source file is newer than the exported docx', async () => {
    const dir = await fullProject('stale-export')
    await writeFile(join(dir, 'chapters', '08-drawings.md'), `# 附图说明\n\n图1 为流程总览图。\n${BODY}`, 'utf8')
    await mkdir(join(dir, 'figures'), { recursive: true })
    await writeFile(join(dir, 'figures', '图1.png'), 'png', 'utf8')
    await mkdir(join(dir, 'review'), { recursive: true })
    await writeFile(join(dir, 'review', 'project.review.md'), '总分 81\n', 'utf8')
    await mkdir(join(dir, 'exports'), { recursive: true })
    await writeFile(join(dir, 'exports', '测试存储装置-交底书.docx'), 'docx', 'utf8')
    const stale = new Date(Date.now() - 60_000)
    await utimes(join(dir, 'exports', '测试存储装置-交底书.docx'), stale, stale)
    const state = await assessLoopState(dir)
    expect(state.stage).toBe('export')
    expect(state.gaps[0]?.detail).toContain('早于源文件')
  })
})

describe('patent_loop tool and patent-loop command registration', () => {
  interface LoopToolShape {
    name: string
    execute: (args: unknown, exec: unknown) => Promise<{
      stage: string
      complete: boolean
      directive: string
      gaps: string[]
    }>
  }

  interface LoopAgentStub {
    session: { header: { cwd?: string } }
    followup: (message: unknown) => void
  }

  type LoopHandler = (invocation: { rawInput: string; agent?: LoopAgentStub }) => Promise<{ kind: string; text?: string }>

  function mount(): {
    tool: LoopToolShape
    handler: LoopHandler
    followups: unknown[]
  } {
    let tool: LoopToolShape | undefined
    let handler!: LoopHandler
    const followups: unknown[] = []
    const drained: unknown[] = []
    const ctx = {
      tools: {
        register: vi.fn((definition: LoopToolShape) => {
          if (definition.name === 'patent_loop') tool = definition
          return () => {}
        }),
      },
      commands: {
        register: vi.fn((definition: { handler: LoopHandler }) => {
          handler = definition.handler
          return () => {}
        }),
      },
      effect: (callback: (() => Generator) | Generator): void => {
        const iterator = typeof callback === 'function' ? (callback as () => Generator)() : callback
        for (const step of iterator) drained.push(step)
      },
    }
    ToolPatent.apply(ctx as never)
    expect(tool).toBeDefined()
    expect(handler).toBeInstanceOf(Function)
    return {
      tool: tool!,
      handler,
      followups,
    }
  }

  it('exposes the assessor tool whose execute projects the loop state', async () => {
    const dir = await scratch('tool-probe')
    const { tool } = mount()
    const value = await tool.execute({ project_dir: dir }, {})
    expect(value.stage).toBe('init')
    expect(value.complete).toBe(false)
    expect(value.directive.length).toBeGreaterThan(0)
    expect(value.gaps.length).toBeGreaterThan(0)
  })

  it('injects the loop prompt through followup and returns a UI-only summary', async () => {
    const dir = await scratch('command-probe')
    await writeFile(join(dir, 'patent.yml'), MANIFEST, 'utf8')
    const { handler, followups } = mount()
    const agent: LoopAgentStub = {
      session: { header: { cwd: root } },
      followup: (message: unknown) => { followups.push(message) },
    }
    const result = await handler({ rawInput: 'command-probe', agent })
    expect(result.kind).toBe('success')
    expect(result.text).toContain('patent-loop 已启动')
    expect(followups).toHaveLength(1)
  })

  it('skips the followup entirely when the project is already complete', async () => {
    const dir = await fullProject('done-project')
    await writeFile(join(dir, 'chapters', '08-drawings.md'), `# 附图说明\n\n图1 为流程总览图。\n${BODY}`, 'utf8')
    await mkdir(join(dir, 'figures'), { recursive: true })
    await writeFile(join(dir, 'figures', '图1.png'), 'png', 'utf8')
    await mkdir(join(dir, 'review'), { recursive: true })
    await writeFile(join(dir, 'review', 'project.review.md'), '总分 81\n', 'utf8')
    await mkdir(join(dir, 'exports'), { recursive: true })
    await writeFile(join(dir, 'exports', '测试存储装置-交底书.docx'), 'docx', 'utf8')
    const { handler, followups } = mount()
    const agent: LoopAgentStub = {
      session: { header: { cwd: root } },
      followup: (message: unknown) => { followups.push(message) },
    }
    const result = await handler({ rawInput: 'done-project', agent })
    expect(result.text).toContain('已成稿')
    expect(followups).toHaveLength(0)
  })
})
