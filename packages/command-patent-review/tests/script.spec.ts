/**
 * Evaluate the fixed script the way the engine's worker would: stubbed API globals, real body.
 * The Function constructor is the point of this suite — the worker runs the same script body in a
 * fresh function realm — so the implied-eval rule is disabled for the file, not dodged.
 */

import { describe, expect, it, vi } from 'vitest'
import { REVIEW_SCRIPT } from '../src/script.ts'

interface StubCall { prompt: string; options: { schema: unknown; label: string } }

const DIMENSIONS = [
  {
    key: 'completeness', title: '内容完整性', weight: 0.5,
    guide: { '90-100': '完整', '0-89': '不完整' },
  },
  {
    key: 'novelty', title: '新颖性表述', weight: 0.5,
    guide: { '90-100': '明确区别', '0-89': '区别不足' },
  },
]

/** Evaluate the fixed script the way the engine's worker would: stubbed API globals, real body. */
async function runScript(args: Record<string, unknown>, agent: (prompt: string, options: StubCall['options']) => unknown): Promise<{
  value: unknown
  calls: StubCall[]
  phases: string[]
}> {
  const calls: StubCall[] = []
  const phases: string[] = []
  const agentStub = vi.fn(async (prompt: string, options: StubCall['options']) => {
    calls.push({ prompt, options })
    return agent(prompt, options)
  })
  const parallel = async (thunks: (() => Promise<unknown>)[]): Promise<unknown[]> => Promise.all(thunks.map(thunk => thunk()))
  type ScriptFn = (
    agent: unknown,
    parallel: unknown,
    phase: (title: string) => void,
    log: (line: string) => void,
    args: Record<string, unknown>,
  ) => Promise<unknown>
  const fn = new Function('agent', 'parallel', 'phase', 'log', 'args',
    `"use strict";\nreturn (async () => {\n${REVIEW_SCRIPT}\n})()`) as ScriptFn
  const value = await fn(agentStub, parallel, (title) => { phases.push(title) }, () => {}, args)
  return { value, calls, phases }
}

describe('the fixed patent-review script', () => {
  it('is syntactically valid plain JS (as the worker runs it: an async body)', () => {
    expect(() => new Function(
      'agent', 'parallel', 'phase', 'log', 'args',
      `"use strict";\nreturn (async () => {\n${REVIEW_SCRIPT}\n})()`,
    )).not.toThrow()
  })

  it('runs one schema child per dimension per pass and folds the averages', async () => {
    const { value, calls, phases } = await runScript(
      { fileLabel: 'chapters/03.md', fileContent: '文档内容', dimensions: DIMENSIONS, passes: 2 },
      () => ({ score: 80, evidence: 'e', suggestion: 's' }),
    )
    expect(phases).toEqual(['Patent review: chapters/03.md'])
    expect(calls.length).toBe(4)
    expect(calls.map(call => call.options.label)).toEqual([
      'review:completeness#1', 'review:completeness#2', 'review:novelty#1', 'review:novelty#2',
    ])
    expect(calls[0]!.options.schema).toMatchObject({ required: ['score', 'evidence', 'suggestion'] })
    expect(calls[0]!.prompt).toContain('Dimension: 内容完整性 (completeness), weight 0.5')
    expect(calls[0]!.prompt).toContain('- 90-100: 完整')
    expect(calls[0]!.prompt).toContain('scoring pass 1 of 2')
    expect(calls[1]!.prompt).toContain('scoring pass 2 of 2')
    expect(calls[0]!.prompt).toContain('--- DOCUMENT START ---\n文档内容\n--- DOCUMENT END ---')
    expect(value).toEqual({
      overall: 80,
      dimensions: [
        {
          key: 'completeness', title: '内容完整性', weight: 0.5, scores: [80, 80], average: 80,
          failedPasses: 0, evidence: ['e', 'e'], suggestions: ['s', 's'],
        },
        {
          key: 'novelty', title: '新颖性表述', weight: 0.5, scores: [80, 80], average: 80,
          failedPasses: 0, evidence: ['e', 'e'], suggestions: ['s', 's'],
        },
      ],
    })
  })

  it('folds divergent pass scores into a rounded mean', async () => {
    let call = 0
    const { value } = await runScript(
      { fileLabel: 'brief.md', fileContent: 'x', dimensions: [DIMENSIONS[0]!], passes: 2 },
      () => ({ score: call++ === 0 ? 70 : 81, evidence: 'e', suggestion: 's' }),
    )
    expect(value).toMatchObject({ overall: 76, dimensions: [{ average: 76, scores: [70, 81] }] })
  })

  it('retries a failed pass once and folds the retry score in', async () => {
    const { value } = await runScript(
      { fileLabel: 'brief.md', fileContent: 'x', dimensions: DIMENSIONS, passes: 2 },
      (prompt: string) => prompt.includes('completeness') && prompt.includes('pass 1 of 2')
        ? null
        : { score: 90, evidence: 'e', suggestion: 's' },
    )
    expect(value).toMatchObject({
      overall: 90,
      dimensions: [
        { key: 'completeness', average: 90, failedPasses: 0, scores: [90, 90] },
        { key: 'novelty', average: 90, failedPasses: 0, scores: [90, 90] },
      ],
    })
  })

  it('keeps the failure counted when the retry pass also fails', async () => {
    const { value } = await runScript(
      { fileLabel: 'brief.md', fileContent: 'x', dimensions: DIMENSIONS, passes: 2 },
      (prompt: string) => prompt.includes('completeness') && (prompt.includes('pass 1 of 2') || prompt.includes('pass 3 of 2'))
        ? null
        : { score: 90, evidence: 'e', suggestion: 's' },
    )
    expect(value).toMatchObject({
      overall: 90,
      dimensions: [
        { key: 'completeness', average: 90, failedPasses: 1, scores: [90] },
        { key: 'novelty', average: 90, failedPasses: 0, scores: [90, 90] },
      ],
    })
  })

  it('returns null averages and a null overall when every pass fails', async () => {
    const { value } = await runScript(
      { fileLabel: 'brief.md', fileContent: 'x', dimensions: [DIMENSIONS[0]!], passes: 2 },
      () => null,
    )
    expect(value).toEqual({
      overall: null,
      dimensions: [{
        key: 'completeness', title: '内容完整性', weight: 0.5, scores: [], average: null,
        failedPasses: 2, evidence: [], suggestions: [],
      }],
    })
  })
})

describe('the consistency phase', () => {
  const CONSISTENCY = { claims: '1. 独权。', description: '# 说明书\n\n支持独权。' }

  it('runs one support and one terminology child per pass and aggregates', async () => {
    const { value, calls } = await runScript(
      { fileLabel: 'application/claims.md', fileContent: 'x', dimensions: DIMENSIONS, passes: 2, consistency: CONSISTENCY },
      (_prompt: string, options: { label: string }) => options.label.startsWith('consistency:')
        ? {
          score: options.label.endsWith('#1') ? 90 : 70,
          unsupported: options.label.startsWith('consistency:terminology')
            ? [{ claim: '2', reason: '说明书未复述权项2' }]
            : [],
          evidence: 'ce', suggestion: 'cs',
        }
        : { score: 80, evidence: 'e', suggestion: 's' },
    )
    expect(calls.filter(call => call.options.label.startsWith('consistency:')).map(call => call.options.label)).toEqual([
      'consistency:support#1', 'consistency:terminology#1', 'consistency:support#2', 'consistency:terminology#2',
    ])
    const supportPrompt = calls.find(call => call.options.label === 'consistency:support#1')!
    expect(supportPrompt.prompt).toContain('--- CLAIMS START ---\n1. 独权。\n--- CLAIMS END ---')
    expect(supportPrompt.prompt).toContain('--- DESCRIPTION START ---')
    expect((value as { consistency: unknown }).consistency).toEqual({
      score: 80,
      failedPasses: 0,
      unsupportedClaims: [{ claim: '2', reason: '说明书未复述权项2' }],
      evidence: ['ce', 'ce', 'ce', 'ce'], suggestions: ['cs', 'cs', 'cs', 'cs'],
    })
  })

  it('keeps the phase scoreable when one child fails', async () => {
    const { value } = await runScript(
      { fileLabel: 'application/claims.md', fileContent: 'x', dimensions: DIMENSIONS, passes: 1, consistency: CONSISTENCY },
      (_prompt: string, options: { label: string }) => {
        if (options.label === 'consistency:support#1') return null
        if (options.label.startsWith('consistency:')) {
          return { score: 60, unsupported: [], evidence: 'e', suggestion: 's' }
        }
        return { score: 80, evidence: 'e', suggestion: 's' }
      },
    )
    expect((value as { consistency: unknown }).consistency).toMatchObject({ score: 60, failedPasses: 1 })
  })

  it('is absent without consistency inputs', async () => {
    const { value } = await runScript(
      { fileLabel: 'brief.md', fileContent: 'x', dimensions: [DIMENSIONS[0]!], passes: 1 },
      () => ({ score: 80, evidence: 'e', suggestion: 's' }),
    )
    expect('consistency' in (value as Record<string, unknown>)).toBe(false)
  })
})
