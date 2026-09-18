/**
 * View models for the two patent tool cards, derived solely from the durable
 * call slice (args, result content, presentation meta) so live and replay
 * renders stay identical. The structured `meta` path is authoritative; the
 * render-text parsers are the fallback for sessions logged on cores that
 * predate the presentation channel, kept aligned with the renderers in
 * `packages/patent/tool-patent/src/index.ts`.
 * @module
 */

/** Canonical coverage payload projected by `patent_brief_coverage`. */
export interface CoverageMeta {
  covered: string[]
  missing: string[]
  ready: boolean
  coreFilled: { done: number; total: number }
  aligned: boolean
  alignmentCounts: { background: number; problem: number; effect: number }
}

/** Canonical claims-lint payload projected by `patent_claims_lint`. */
export interface LintMeta {
  summary: { total: number; independent: number; dependent: number; errors: number; warnings: number }
  violations: { claim?: number; rule: string; severity: 'error' | 'warning'; message: string }[]
}

/** Minimal structural face of the toolview block the models read. */
export interface ToolBlockLike {
  callId: string
  /** Present marks the settled result node; a running call carries only args. */
  kind?: string
  argsRaw?: string
  call?: { name: string; argsRaw: string } | null
  content?: readonly { type: string; text?: string }[]
  isError?: boolean
  error?: { code?: string } | null
  meta?: unknown
}

/** Card lifecycle, mirroring the shared tool-row states. */
export type CardState = 'running' | 'ok' | 'error' | 'stopped'

/** Chinese title per dimension key, matching the tool's chapter structure. */
export const DIMENSION_TITLES: Readonly<Record<string, string>> = {
  name: '名称',
  field: '所属技术领域',
  background: '背景技术',
  problem: '技术问题',
  solution: '发明内容',
  effect: '有益效果',
  key_points: '关键点与保护范围',
  drawings: '附图',
}

/** Core dimension keys in scoring order. */
export const CORE_DIMENSIONS = ['field', 'background', 'problem', 'solution', 'effect'] as const

/**
 * Flatten durable result blocks under the generic Tool-row text contract.
 * @param block - the settled or running call slice.
 * @returns the joined text, or null when the call has no visible output.
 */
export function resultText(block: ToolBlockLike): string | null {
  const parts: string[] = []
  for (const item of block.content ?? []) {
    parts.push(item.type === 'text' ? (item.text ?? '') : JSON.stringify(item, null, 2))
  }
  if (parts.length === 0 && block.error !== undefined && block.error !== null) {
    const code = block.error.code ?? ''
    parts.push(code === '' ? JSON.stringify(block.error) : code)
  }
  return parts.join('\n') || null
}

/**
 * Card state from the settled/failed/interrupted slice, shared by both cards.
 * @param block - the frozen call slice.
 * @returns the display state.
 */
export function cardState(block: ToolBlockLike): CardState {
  if (!('kind' in block)) return 'running'
  if (block.error?.code === 'interrupted') return 'stopped'
  return block.isError === true ? 'error' : 'ok'
}

/** Narrow the persisted presentation meta to the coverage payload; null when absent or shaped otherwise. */
function asCoverageMeta(block: ToolBlockLike): CoverageMeta | null {
  const meta = block.meta
  if (typeof meta !== 'object' || meta === null) return null
  const candidate = meta as { coreFilled?: { total?: number } }
  return typeof candidate.coreFilled?.total === 'number' ? (meta as CoverageMeta) : null
}

/** Narrow the persisted presentation meta to the lint payload; null when absent or shaped otherwise. */
function asLintMeta(block: ToolBlockLike): LintMeta | null {
  const meta = block.meta
  if (typeof meta !== 'object' || meta === null) return null
  const candidate = meta as { summary?: { total?: number } }
  return typeof candidate.summary?.total === 'number' ? (meta as LintMeta) : null
}

/** The render-text fallback head: `Brief coverage d/t (gap). Alignment counts ... = b/p/e, alignment.` */
const COVERAGE_TEXT_HEAD = new RegExp(
  '^Brief coverage (?<done>\\d+)/(?<total>\\d+) \\((?<gap>.*)\\)\\. '
  + 'Alignment counts background/problem/effect = '
  + '(?<background>\\d+)/(?<problem>\\d+)/(?<effect>\\d+), '
  + '(?<alignment>.*)\\. (?:NOT ready|READY)',
  'u',
)

/**
 * Parse the render-text fallback into a coverage payload; null when it drifts.
 * @param text - the model-visible result text.
 * @returns the coverage fields the text carries, minus the covered list.
 */
export function parseCoverageText(text: string): Omit<CoverageMeta, 'covered'> | null {
  const head = COVERAGE_TEXT_HEAD.exec(text)
  if (head?.groups === undefined) return null
  const { done = '', total = '', gap = '', background = '', problem = '', effect = '', alignment = '' } = head.groups
  const missing = gap.startsWith('missing:')
    ? [...gap.matchAll(/\((\w+)\)/gu)].map(match => match[1] ?? '')
    : []
  const spreadMatch = /spread (\d+) exceeds tolerance (\d+)/u.exec(alignment)
  const counts = {
    background: Number(background),
    problem: Number(problem),
    effect: Number(effect),
  }
  return {
    missing,
    ready: text.includes('READY:') || text.includes('READY.'),
    coreFilled: { done: Number(done), total: Number(total) },
    aligned: spreadMatch === null,
    alignmentCounts: counts,
  }
}

/** One settled or running coverage card's view. */
export interface CoverageView {
  state: CardState
  meta: CoverageMeta | null
  /** Core dimensions submitted with the call while still running (keys). */
  submitted: string[]
  text: string | null
}

/**
 * Derive the coverage card view without consulting anything but the block.
 * @param block - the frozen call slice.
 * @returns the coverage card view.
 */
export function coverageView(block: ToolBlockLike): CoverageView {
  const state = cardState(block)
  if (state === 'running') {
    const submitted: string[] = []
    try {
      const parsed = JSON.parse(block.call?.argsRaw ?? block.argsRaw ?? '{}') as Record<string, unknown>
      for (const key of CORE_DIMENSIONS) {
        const value = parsed[key]
        if (typeof value === 'string' && value.trim() !== '') submitted.push(key)
      }
    } catch {
      // Streaming exposes truncated JSON prefixes; the running card shows no preview.
    }
    return { state, meta: null, submitted, text: null }
  }
  const text = resultText(block)
  const meta = asCoverageMeta(block)
  if (meta !== null) return { state, meta, submitted: [], text }
  const parsed = text === null ? null : parseCoverageText(text)
  return {
    state,
    meta: parsed === null
      ? null
      : {
        ...parsed,
        covered: CORE_DIMENSIONS.filter(key => !parsed.missing.includes(key)),
        alignmentCounts: parsed.alignmentCounts,
      },
    submitted: [],
    text,
  }
}

/**
 * Parse the render-text fallback into a lint payload; null when it drifts.
 * @param text - the model-visible result text.
 * @returns the lint summary with the violations the text carries.
 */
export function parseLintText(text: string): Omit<LintMeta, 'violations'> & { violations: LintMeta['violations'] } | null {
  const head = /^Claims (\d+) \((\d+) independent, (\d+) dependent\), (\d+) errors, (\d+) warnings\./u.exec(text)
  if (head === null) return null
  const [, total, independent, dependent, errors, warnings] = head as unknown as [string, string, string, string, string, string]
  const body = text.slice(head[0].length)
  const verdict = /\b(PASS|FAIL):/u.exec(body)
  const listEnd = verdict?.index ?? body.length
  const violations: LintMeta['violations'] = []
  const list = body.slice(0, listEnd).trim()
  if (list !== '' && !list.startsWith('all format rules pass')) {
    for (const entry of list.split(' | ')) {
      const match = /^\[([A-Z]\d+)\](?: claim (\d+))? (.*)$/u.exec(entry.trim())
      if (match === null) continue
      // exactOptionalPropertyTypes: claim is absent (not undefined) when the
      // violation is not attached to one claim, matching the canonical shape.
      const claim = match[2] === undefined ? undefined : Number(match[2])
      violations.push(claim === undefined
        ? { rule: match[1] ?? '', severity: 'error', message: match[3] ?? '' }
        : { rule: match[1] ?? '', claim, severity: 'error', message: match[3] ?? '' })
    }
  }
  return {
    summary: {
      total: Number(total),
      independent: Number(independent),
      dependent: Number(dependent),
      errors: Number(errors),
      warnings: Number(warnings),
    },
    violations,
  }
}

/** One settled or running claims-lint card's view. */
export interface LintView {
  state: CardState
  meta: LintMeta | null
  text: string | null
}

/**
 * Derive the claims-lint card view without consulting anything but the block.
 * @param block - the frozen call slice.
 * @returns the claims-lint card view.
 */
export function lintView(block: ToolBlockLike): LintView {
  const state = cardState(block)
  if (state === 'running') return { state, meta: null, text: null }
  const text = resultText(block)
  const meta = asLintMeta(block)
  if (meta !== null) return { state, meta, text }
  const parsed = text === null ? null : parseLintText(text)
  return { state, meta: parsed, text }
}

/** Canonical review payload projected by `patent_review`. */
export interface ReviewMeta {
  kind: 'success' | 'error'
  summary: string
  report: string
  overall?: number
  dimensions?: { key: string; title: string; weight: number; average: number | null; failedPasses: number }[]
}

/** Narrow the persisted presentation meta to the review payload; null when absent or shaped otherwise. */
function asReviewMeta(block: ToolBlockLike): ReviewMeta | null {
  const meta = block.meta
  if (typeof meta !== 'object' || meta === null) return null
  const candidate = meta as { summary?: unknown; report?: unknown }
  return typeof candidate.summary === 'string' && typeof candidate.report === 'string' ? (meta as ReviewMeta) : null
}

/** One settled or running review card's view. */
export interface ReviewView {
  state: CardState
  meta: ReviewMeta | null
  /** The target argument while still running. */
  target: string | null
  text: string | null
}

/**
 * Derive the review card view without consulting anything but the block. The
 * render-text fallback carries only the summary line (the report path), so a
 * session logged without the presentation channel shows the summary in the
 * disclosure; the dimension bars need the meta.
 * @param block - the frozen call slice.
 * @returns the review card view.
 */
export function reviewView(block: ToolBlockLike): ReviewView {
  const state = cardState(block)
  if (state === 'running') {
    let target: string | null = null
    try {
      const parsed = JSON.parse(block.call?.argsRaw ?? block.argsRaw ?? '{}') as Record<string, unknown>
      target = typeof parsed.target === 'string' ? parsed.target : null
    } catch {
      // Streaming exposes truncated JSON prefixes; the running card shows no target.
    }
    return { state, meta: null, target, text: null }
  }
  return { state, meta: asReviewMeta(block), target: null, text: resultText(block) }
}
