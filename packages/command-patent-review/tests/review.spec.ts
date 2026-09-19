import { describe, expect, it } from 'vitest'
import { isReviewOutcome, renderReport, summarize, type ReviewOutcome } from '../src/review.ts'

const OUTCOME: ReviewOutcome = {
  overall: 81,
  dimensions: [
    {
      key: 'completeness', title: '内容完整性', weight: 0.25, average: 82, failedPasses: 0,
      scores: [80, 84], evidence: ['章节齐全。', '信息充分。'], suggestions: ['补充分级说明。', '补充样例。'],
    },
    {
      key: 'novelty', title: '新颖性表述', weight: 0.2, average: null, failedPasses: 2,
      scores: [], evidence: [], suggestions: [],
    },
  ],
}

describe('isReviewOutcome', () => {
  it('accepts a well-formed outcome', () => {
    expect(isReviewOutcome(OUTCOME)).toBe(true)
    expect(isReviewOutcome({ overall: null, dimensions: [] })).toBe(true)
  })

  it.each([
    ['null value', null],
    ['non-object', 42],
    ['string overall', { overall: '81', dimensions: [] }],
    ['missing dimensions', { overall: 1 }],
    ['non-array dimensions', { overall: 1, dimensions: {} }],
    ['malformed dimension', { overall: 1, dimensions: [{ key: 1 }] }],
    ['non-object dimension', { overall: 1, dimensions: [42] }],
    ['non-numeric scores', { overall: 1, dimensions: [{ key: 'k', title: 't', weight: 1, scores: ['x'], average: 1, failedPasses: 0, evidence: [], suggestions: [] }] }],
    ['non-string evidence', { overall: 1, dimensions: [{ key: 'k', title: 't', weight: 1, scores: [1], average: 1, failedPasses: 0, evidence: [2], suggestions: [] }] }],
  ])('rejects: %s', (_label, value) => {
    expect(isReviewOutcome(value)).toBe(false)
  })
})

describe('renderReport', () => {
  it('renders the same markdown for the same input', () => {
    expect(renderReport(OUTCOME, 'chapters/03-background.md')).toBe(renderReport(OUTCOME, 'chapters/03-background.md'))
  })

  it('renders the header, the score table, and per-pass details', () => {
    const report = renderReport(OUTCOME, 'chapters/03-background.md')
    expect(report).toContain('# 交底书审查：chapters/03-background.md')
    expect(report).toContain('**总分**：81 / 100')
    expect(report).toContain('| 内容完整性 (completeness) | 0.25 | 82 | 80 / 84 | 0 |')
    expect(report).toContain('| 新颖性表述 (novelty) | 0.2 | — | — | 2 |')
    expect(report).toContain('均分 82（良好），权重 0.25。')
    expect(report).toContain('### 评分 2：84')
    expect(report).toContain('建议：补充样例。')
    expect(report).toContain('全部 2 次评分子代理未能完成，本维度无结论。')
    expect(report.endsWith('\n')).toBe(false)
  })

  it('stamps the source digest under the scope line when given, and stays stamp-free without one', () => {
    const stamped = renderReport(OUTCOME, '.', 'project', 'c83bc723545b5db4')
    expect(stamped).toContain('> 审查范围：整项（项目根）')
    expect(stamped).toContain('> 源指纹：c83bc723545b5db4')
    expect(stamped.indexOf('源指纹')).toBeGreaterThan(stamped.indexOf('审查范围'))
    expect(renderReport(OUTCOME, '.')).not.toContain('源指纹')
  })

  it('renders a null overall when no dimension collected scores', () => {
    const report = renderReport({ overall: null, dimensions: [{ ...OUTCOME.dimensions[1]! }] }, 'brief.md')
    expect(report).toContain('**总分**：无（所有维度评分失败）')
  })

  it.each([
    [95, '优秀'],
    [82, '良好'],
    [65, '需改进'],
    [30, '不合格'],
  ])('tiers an average of %i as %s', (average, tier) => {
    const report = renderReport({
      overall: average,
      dimensions: [{ key: 'k', title: '维度', weight: 1, scores: [average], average, failedPasses: 0, evidence: [], suggestions: [] }],
    }, 'brief.md')
    expect(report).toContain(`均分 ${average}（${tier}），权重 1。`)
  })
})

describe('summarize', () => {
  it('states the overall score and the report path', () => {
    const text = summarize(OUTCOME, 'review/target.review.md')
    expect(text).toContain('总分 81 / 100')
    expect(text).toContain('review/target.review.md')
  })

  it('warns about failed passes per dimension', () => {
    const text = summarize(OUTCOME, 'review/target.review.md')
    expect(text).toContain('新颖性表述 失败 2 次')
  })

  it('states the no-score case plainly', () => {
    const text = summarize({ overall: null, dimensions: [] }, 'review/target.review.md')
    expect(text).toContain('没有任何维度收集到评分')
  })
})

describe('the consistency section', () => {
  const WITH_PHASE = {
    ...OUTCOME,
    consistency: {
      score: 74,
      failedPasses: 1,
      unsupportedClaims: [
        { claim: '3', reason: '说明书发明内容段未复述权项3的闭环特征。' },
        { claim: '术语：调光通道', reason: '说明书使用"调光单元"指称同一构件。' },
      ],
      evidence: ['说明书第12段。'],
      suggestions: ['在发明内容段逐权项补支持表述。'],
    },
  }

  it('isReviewOutcome accepts the phase and rejects a malformed one', () => {
    expect(isReviewOutcome(WITH_PHASE)).toBe(true)
    expect(isReviewOutcome({ ...WITH_PHASE, consistency: { score: 74, failedPasses: 1 } })).toBe(false)
    expect(isReviewOutcome({ ...OUTCOME, consistency: null })).toBe(true)
  })

  it('renders the findings and score tier in the report', () => {
    const report = renderReport(WITH_PHASE, 'application/claims.md')
    expect(report).toContain('## 一致性检查（claims ↔ 说明书）')
    expect(report).toContain('一致性 74 / 100（良好），失败 1 次。')
    expect(report).toContain('- **3**：说明书发明内容段未复述权项3的闭环特征。')
    expect(report).toContain('- **术语：调光通道**')
  })

  it('summarize counts the unsupported findings', () => {
    const text = summarize(WITH_PHASE, 'review/x.review.md')
    expect(text).toContain('一致性检查发现 2 项未支持/不一致')
  })

  it('renders the all-failed phase plainly', () => {
    const report = renderReport({ ...OUTCOME, consistency: { score: null, failedPasses: 2, unsupportedClaims: [], evidence: [], suggestions: [] } }, 'application/claims.md')
    expect(report).toContain('全部 2 次一致性检查失败，本节无结论。')
  })

  it('renders the clean phase without findings', () => {
    const report = renderReport({ ...OUTCOME, consistency: { score: 95, failedPasses: 0, unsupportedClaims: [], evidence: [], suggestions: [] } }, 'application/claims.md')
    expect(report).toContain('未发现无支持权项或术语不一致。')
  })
})
