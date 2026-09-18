// @vitest-environment jsdom

/** Component tests for the two patent tool cards, in meta and text-fallback forms. */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { ClaimsLintCard } from '../src/client/ClaimsLintCard.tsx'
import { CoverageCard } from '../src/client/CoverageCard.tsx'
import { zh } from '../src/client/locales.ts'
import type { LintMeta, CoverageMeta } from '../src/client/models.ts'

const t = makeTranslate(zh, commonZh)

afterEach(cleanup)

function resultNode(content: string, meta?: unknown): ToolResultNode {
  return {
    kind: 'tool-result',
    seq: 3,
    time: 3_000,
    callId: 'call-patent',
    call: { name: 'x', argsRaw: '{}' },
    callTime: 2_000,
    content: [{ type: 'text', text: content }],
    isError: false,
    subCalls: [],
    meta,
  }
}

/** The composed slot props the components receive, asserted narrow per call. */
function viewProps(block: ToolResultNode): Parameters<typeof CoverageCard>[0] {
  return {
    callId: block.callId,
    toolName: 'patent_brief_coverage',
    block,
    openFile: () => {},
    t,
  } as unknown as Parameters<typeof CoverageCard>[0]
}

const coverageMeta: CoverageMeta = {
  covered: ['field', 'background', 'problem', 'solution', 'effect'],
  missing: [],
  ready: true,
  coreFilled: { done: 5, total: 5 },
  aligned: true,
  alignmentCounts: { background: 2, problem: 2, effect: 2 },
}

const lintMeta: LintMeta = {
  summary: { total: 5, independent: 2, dependent: 3, errors: 1, warnings: 1 },
  violations: [
    { rule: 'C1', claim: 3, severity: 'error', message: '编号不连续' },
    { rule: 'C5', severity: 'warning', message: '缺少其特征在于' },
  ],
}

const READY_TEXT = 'Brief coverage 5/5 (all five core dimensions covered). '
  + 'Alignment counts background/problem/effect = 2/2/2, aligned within tolerance 1. '
  + 'READY: write brief.md and the chapter files, then start drafting.'

const LINT_TEXT = 'Claims 5 (2 independent, 3 dependent), 1 errors, 1 warnings. '
  + '[C1] claim 3 编号不连续 FAIL: fix the C/A-rule errors before export.'

describe('CoverageCard', () => {
  it('renders the structured readiness card from presentation meta', () => {
    const view = render(<CoverageCard {...viewProps(resultNode(READY_TEXT, coverageMeta))} />)
    expect(view.container.querySelector('[data-tool="patent_brief_coverage"]')).not.toBeNull()
    expect(screen.getByText('就绪，可以动笔')).not.toBeNull()
    expect(screen.getByText('对齐')).not.toBeNull()
    for (const title of ['所属技术领域', '背景技术', '技术问题', '发明内容', '有益效果']) {
      const chip = screen.getByText(title)
      expect(chip.getAttribute('data-filled')).not.toBeNull()
    }
  })

  it('marks missing dimensions and the not-ready verdict from text fallback', () => {
    const view = render(<CoverageCard {...viewProps(resultNode(READY_TEXT.replace('5/5 (all five core dimensions covered)', '3/5 (missing: 背景技术 (background))').replace('2/2/2, aligned within tolerance 1', '2/1/2, aligned within tolerance 1').replace('READY', 'NOT ready')))} />)
    const chip = screen.getByText('背景技术')
    expect(chip.getAttribute('data-filled')).toBeNull()
    expect(screen.getByText('未就绪，继续访谈')).not.toBeNull()
    expect(view.container.querySelector('[data-tone="warning"]')).not.toBeNull()
  })
})

describe('ClaimsLintCard', () => {
  it('renders the violation list and fail verdict from presentation meta', () => {
    render(<ClaimsLintCard {...viewProps(resultNode(LINT_TEXT, lintMeta))} />)
    expect(screen.getByText('需修改')).not.toBeNull()
    expect(screen.getByText('C1')).not.toBeNull()
    expect(screen.getByText('#3')).not.toBeNull()
    expect(screen.getByText('编号不连续')).not.toBeNull()
  })

  it('renders the pass verdict from the text fallback', () => {
    render(<ClaimsLintCard {...viewProps(resultNode('Claims 4 (1 independent, 3 dependent), 0 errors, 0 warnings. all format rules pass PASS: no format errors (warnings are drafting hints, not blockers).'))} />)
    expect(screen.getByText('通过')).not.toBeNull()
  })
})
