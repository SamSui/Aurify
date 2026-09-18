/**
 * Host-side review types and rendering: validation of the worker's returned
 * value (a worker boundary — validated, not trusted) and the pure markdown
 * report/summary renderers. Same input, same report.
 * @module
 */

/** One rubric dimension's collected pass scores, folded by the script. */
export interface ScoredDimension {
  key: string
  title: string
  weight: number
  /** Each successful pass's 0-100 score, in pass order. */
  scores: number[]
  /** Rounded mean of {@link scores}; null when every pass failed. */
  average: number | null
  /** Passes whose scoring child failed. */
  failedPasses: number
  evidence: string[]
  suggestions: string[]
}

/** The script's materialized return value. */
export interface ReviewOutcome {
  /** Weight-renormalized mean over dimensions with collected scores; null when none. */
  overall: number | null
  dimensions: ScoredDimension[]
  /** The claims↔description NLI phase; absent when the target carried no application set. */
  consistency?: ConsistencyOutcome | null
}

/** One aggregated finding of the claims↔description consistency phase. */
export interface ConsistencyFinding {
  /** The claim number/text or the mismatched term the finding names. */
  claim: string
  /** Why it is unsupported or mismatched, citing the description. */
  reason: string
}

/** The NLI-style consistency phase's aggregated outcome. */
export interface ConsistencyOutcome {
  /** Rounded mean over the phase's child scores; null when every child failed. */
  score: number | null
  /** Children that failed (of `passes × 2`). */
  failedPasses: number
  /** Union of unsupported-claim/term findings across passes, first reason per claim. */
  unsupportedClaims: ConsistencyFinding[]
  evidence: string[]
  suggestions: string[]
}

/**
 * Runtime guard for the worker→host boundary.
 * @param value - the script's materialized return value.
 * @returns whether the value carries the expected review structure.
 */
export function isReviewOutcome(value: unknown): value is ReviewOutcome {
  if (typeof value !== 'object' || value === null) return false
  const { overall, dimensions, consistency } = value as Record<string, unknown>
  if (overall !== null && typeof overall !== 'number') return false
  if (!Array.isArray(dimensions)) return false
  const dimensionsOk = dimensions.every((dimension): boolean => {
    if (typeof dimension !== 'object' || dimension === null) return false
    const record = dimension as Record<string, unknown>
    return typeof record.key === 'string'
      && typeof record.title === 'string'
      && typeof record.weight === 'number'
      && Array.isArray(record.scores) && record.scores.every(score => typeof score === 'number')
      && (record.average === null || typeof record.average === 'number')
      && typeof record.failedPasses === 'number'
      && Array.isArray(record.evidence) && record.evidence.every(item => typeof item === 'string')
      && Array.isArray(record.suggestions) && record.suggestions.every(item => typeof item === 'string')
  })
  if (!dimensionsOk) return false
  if (consistency === undefined || consistency === null) return true
  if (typeof consistency !== 'object') return false
  const phase = consistency as Record<string, unknown>
  return (phase.score === null || typeof phase.score === 'number')
    && typeof phase.failedPasses === 'number'
    && Array.isArray(phase.unsupportedClaims) && phase.unsupportedClaims.every((finding): boolean => {
    if (typeof finding !== 'object' || finding === null) return false
    const record = finding as Record<string, unknown>
    return typeof record.claim === 'string' && typeof record.reason === 'string'
  })
    && Array.isArray(phase.evidence) && phase.evidence.every(item => typeof item === 'string')
    && Array.isArray(phase.suggestions) && phase.suggestions.every(item => typeof item === 'string')
}

const SCORE_TIER = (score: number): string => score >= 90 ? '优秀' : score >= 70 ? '良好' : score >= 50 ? '需改进' : '不合格'

/**
 * Render the deterministic markdown report for one review run.
 * @param outcome - the validated script result.
 * @param fileLabel - the reviewed path, as the caller addressed it.
 * @returns the report body (no trailing newline; the writer adds one).
 */
export function renderReport(outcome: ReviewOutcome, fileLabel: string): string {
  const lines: string[] = [
    `# 交底书审查：${fileLabel}`,
    '',
    `**总分**：${outcome.overall === null ? '无（所有维度评分失败）' : `${outcome.overall} / 100`}`,
    '',
    '| 维度 | 权重 | 均分 | 各次评分 | 失败次数 |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const dimension of outcome.dimensions) {
    const average = dimension.average === null ? '—' : String(dimension.average)
    const scores = dimension.scores.length === 0 ? '—' : dimension.scores.join(' / ')
    lines.push(`| ${dimension.title} (${dimension.key}) | ${dimension.weight} | ${average} | ${scores} | ${dimension.failedPasses} |`)
  }
  for (const dimension of outcome.dimensions) {
    lines.push('', `## ${dimension.title}（${dimension.key}）`, '')
    if (dimension.average === null) {
      lines.push(`全部 ${dimension.failedPasses} 次评分子代理未能完成，本维度无结论。常见原因是模型网关限流（429）或结构化输出未通过校验——评分请求会以小批量分批执行并对失败补跑一轮，但极端情况下仍可能整批失败；重跑一次 patent_review 通常可恢复本维度的评分。`)
      continue
    }
    lines.push(`均分 ${dimension.average}（${SCORE_TIER(dimension.average)}），权重 ${dimension.weight}。`
      + (dimension.failedPasses > 0
        ? `（另有 ${dimension.failedPasses} 次评分子代理未完成——常见于网关限流，已计入补跑结果）`
        : ''))
    dimension.scores.forEach((score, index) => {
      lines.push('', `### 评分 ${index + 1}：${score}`, '', dimension.evidence[index] ?? '（无证据说明）', '', `建议：${dimension.suggestions[index] ?? '（无建议）'}`)
    })
  }
  const phase = outcome.consistency
  if (phase !== undefined && phase !== null) {
    lines.push('', '## 一致性检查（claims ↔ 说明书）', '')
    if (phase.score === null) {
      lines.push(`全部 ${phase.failedPasses} 次一致性检查失败，本节无结论。`)
    } else {
      lines.push(`一致性 ${phase.score} / 100（${SCORE_TIER(phase.score)}），失败 ${phase.failedPasses} 次。`)
      if (phase.unsupportedClaims.length === 0) {
        lines.push('', '未发现无支持权项或术语不一致。')
      } else {
        lines.push('', '未支持/不一致项：')
        for (const finding of phase.unsupportedClaims) {
          lines.push(`- **${finding.claim}**：${finding.reason}`)
        }
      }
      phase.suggestions.forEach((suggestion, index) => {
        lines.push('', `建议 ${index + 1}：${suggestion}`)
      })
    }
  }
  return lines.join('\n')
}

/**
 * Render the UI-only command summary.
 * @param outcome - the validated script result.
 * @param reportPath - where the report was written, relative to the working directory.
 * @returns the summary text.
 */
export function summarize(outcome: ReviewOutcome, reportPath: string): string {
  const failed = outcome.dimensions.filter(dimension => dimension.failedPasses > 0)
  const head = outcome.overall === null
    ? '审查完成，但没有任何维度收集到评分。'
    : `审查完成，总分 ${outcome.overall} / 100。`
  const phase = outcome.consistency
  const consistencyNote = phase !== undefined && phase !== null && phase.unsupportedClaims.length > 0
    ? `\n注意：一致性检查发现 ${phase.unsupportedClaims.length} 项未支持/不一致（详见报告）。`
    : ''
  const notes = failed.length === 0
    ? ''
    : `\n注意：${failed.map(dimension => `${dimension.title} 失败 ${dimension.failedPasses} 次`).join('；')}，相应维度均分基于剩余通过次数。`
  return `${head}${consistencyNote}\n报告已写入 ${reportPath}${notes}`
}
