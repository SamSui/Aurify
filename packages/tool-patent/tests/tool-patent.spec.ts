import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ALL_DIMENSIONS } from '../src/coverage.ts'
import * as ToolPatent from '../src/index.ts'

async function mount(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(ToolPatent)
  return ctx
}

let seq = 0
function call(ctx: Context, args: Record<string, string>) {
  return ctx.tools.execute({
    signal: new AbortController().signal,
    callId: `c-${++seq}` as never,
    name: 'patent_brief_coverage',
    arguments: args,
  })
}

const READY_BRIEF = {
  field: '数据存储领域',
  background: '① 现有方案过慢；② 空间浪费',
  problem: '① 提速；② 省空间',
  solution: '新索引结构',
  effect: '① 命中率提升；② 空间减半',
}

describe('patent_brief_coverage registration', () => {
  it('exposes exactly the eight dimension parameters', async () => {
    const ctx = await mount()
    const tool = ctx.tools.get('patent_brief_coverage')
    expect(tool).toBeDefined()
    const parameters = tool?.parameters as { properties: Record<string, unknown> }
    expect(Object.keys(parameters.properties).sort()).toEqual([...ALL_DIMENSIONS].sort())
  })

  it('renders a generic call card carrying the draft dimensions', async () => {
    const ctx = await mount()
    const card = ctx.tools.get('patent_brief_coverage')?.presentCall?.({ field: '领域' })
    expect(card).toMatchObject({ card: 'generic', title: 'Score brief coverage' })
  })
})

describe('patent_claims_lint registration', () => {
  it('exposes the claims and abstract parameters', async () => {
    const ctx = await mount()
    const tool = ctx.tools.get('patent_claims_lint')
    expect(tool).toBeDefined()
    const parameters = tool?.parameters as { properties: Record<string, unknown> }
    expect(Object.keys(parameters.properties).sort()).toEqual(['abstract', 'claims'])
  })

  it('renders a generic call card without echoing the full claims text', async () => {
    const ctx = await mount()
    const card = ctx.tools.get('patent_claims_lint')?.presentCall?.({ claims: '1. 长文本'.repeat(50) })
    expect(card).toMatchObject({ card: 'generic', title: 'Lint claims' })
  })
})

describe('patent_claims_lint execution', () => {
  it('returns only the summary and violations projection for a draft with errors', async () => {
    const ctx = await mount()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: `c-${++seq}` as never,
      name: 'patent_claims_lint',
      arguments: { claims: '1. 一种方法。\n2. 根据权利要求4所述的方法，其特征在于X。', abstract: '长'.repeat(301) },
    })
    expect(result.value).toMatchObject({
      summary: { total: 2, independent: 1, dependent: 1, errors: 2, warnings: 1 },
    })
    expect(Object.keys(result.value as object).sort()).toEqual(['summary', 'violations'])
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
    expect(text).toContain('FAIL')
    expect(text).toContain('[C1] claim 2')
    expect(text).toContain('[A1]')
  })

  it('passes a clean draft with the verdict text', async () => {
    const ctx = await mount()
    const result = await ctx.tools.execute({
      signal: new AbortController().signal,
      callId: `c-${++seq}` as never,
      name: 'patent_claims_lint',
      arguments: { claims: '1. 一种方法，其特征在于X。' },
    })
    expect(result.value).toMatchObject({ summary: { errors: 0, warnings: 0 } })
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
    expect(text).toContain('PASS')
  })
})

describe('patent_brief_coverage execution', () => {
  it('returns a ready verdict with the alignment detail for a complete brief', async () => {
    const ctx = await mount()
    const result = await call(ctx, READY_BRIEF)
    expect(result.value).toMatchObject({
      covered: ['field', 'background', 'problem', 'solution', 'effect'],
      missing: [],
      ready: true,
      aligned: true,
      coreFilled: { done: 5, total: 5 },
    })
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
    expect(text).toContain('READY')
    expect(text).toContain('aligned within tolerance 1')
  })

  it('names the missing dimensions with their Chinese chapter titles', async () => {
    const ctx = await mount()
    const result = await call(ctx, { field: '领域', solution: '方案' })
    expect(result.value).toMatchObject({ coreFilled: { done: 2, total: 5 }, ready: false })
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
    expect(text).toContain('NOT ready')
    expect(text).toContain('背景技术 (background)')
    expect(text).toContain('有益效果 (effect)')
  })

  it('rejects readiness when the three-way alignment spread exceeds the tolerance', async () => {
    const ctx = await mount()
    const result = await call(ctx, {
      ...READY_BRIEF,
      background: '① 一；② 二；③ 三；④ 四',
    })
    expect(result.value).toMatchObject({ aligned: false, ready: false })
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
    expect(text).toContain('NOT aligned')
  })
})
