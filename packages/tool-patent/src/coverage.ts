/**
 * Five-party alignment (五方对齐) coverage scorer for patent disclosure briefs.
 *
 * Ported from TianGong's `app/ai/brief_dimensions.py`, the single authority for
 * Init-stage readiness: which dimensions must be collected, how coverage and
 * alignment are computed, and the readiness threshold. The heuristic point
 * count and the tolerance are ported asset semantics, not deployment tunables.
 * @module
 */

/** Core dimensions: a brief is ready only when every one of them has content. */
export const CORE_DIMENSIONS = ['field', 'background', 'problem', 'solution', 'effect'] as const

/** Edge dimensions: displayed for completeness, never gate readiness. */
export const EDGE_DIMENSIONS = ['name', 'drawings', 'key_points'] as const

/** Every dimension key accepted by the scorer, core first. */
export const ALL_DIMENSIONS = [...CORE_DIMENSIONS, ...EDGE_DIMENSIONS] as const

/** Dimension keys whose point counts take part in the alignment check. */
export const ALIGNMENT_DIMENSIONS = ['background', 'problem', 'effect'] as const

/**
 * Largest allowed spread between the three alignment counts. Init-stage
 * information is coarse, so exact equality is too strict; the ported asset
 * allows e.g. two shortcomings against two problems and one effect.
 */
export const ALIGN_TOLERANCE = 1

/** One collected dimension's draft content. */
export type DimensionOutline = Partial<Record<(typeof ALL_DIMENSIONS)[number], string>>

/** Coverage result: what is collected, what is missing, and whether the brief is ready. */
export interface Coverage {
  /** Core dimension keys with non-blank content, in core order. */
  covered: string[]
  /** Core dimension keys still missing, in core order. */
  missing: string[]
  /** Every core dimension covered AND the three-way alignment within tolerance. */
  ready: boolean
  /** Collected core dimensions over the core total. */
  coreFilled: { done: number; total: number }
  /** Whether the background/problem/effect counts stay within tolerance; true while any of them is uncollected. */
  aligned: boolean
  /** Point count per alignment dimension, for display and debugging. */
  alignmentCounts: Record<(typeof ALIGNMENT_DIMENSIONS)[number], number>
}

const NUMBERED_POINT = /[①②③④⑤⑥⑦⑧⑨⑩]|\d+[.、)]|[（(]\d+[)）]|[一二三四五六七八九十]、/

/**
 * Estimate a dimension's point count for the alignment check: split on
 * enumeration markers and on semicolons/newlines, take the larger count, and
 * count any non-blank content as one point. The estimate is deliberately
 * coarse — alignment only needs the three counts to stay close, not exact.
 * @param text - the dimension's collected content.
 * @returns the estimated point count; 0 for blank content.
 */
export function countPoints(text: string | undefined): number {
  const trimmed = (text ?? '').trim()
  if (!trimmed) return 0
  const numbered = trimmed.split(NUMBERED_POINT).filter(part => part.trim().length > 0).length
  const separated = trimmed.split(/[；;\n]/).filter(part => part.trim().length > 0).length
  return Math.max(numbered, separated, 1)
}

/**
 * Score a draft brief's five-party alignment coverage.
 * @param outline - collected content per dimension key; absent or blank means uncollected.
 * @returns the coverage result. `ready` requires all five core dimensions
 * covered and the background/problem/effect counts within {@link ALIGN_TOLERANCE};
 * the alignment check passes vacuously while any of the three is uncollected.
 */
export function computeCoverage(outline: DimensionOutline): Coverage {
  const covered = CORE_DIMENSIONS.filter(key => (outline[key] ?? '').trim().length > 0)
  const missing = CORE_DIMENSIONS.filter(key => !covered.includes(key))
  const alignmentCounts = {
    background: countPoints(outline.background),
    problem: countPoints(outline.problem),
    effect: countPoints(outline.effect),
  }
  const counts = Object.values(alignmentCounts)
  const collected = counts.filter(count => count > 0)
  const aligned = collected.length < counts.length
    || Math.max(...collected) - Math.min(...collected) <= ALIGN_TOLERANCE
  return {
    covered,
    missing,
    ready: missing.length === 0 && aligned,
    coreFilled: { done: covered.length, total: CORE_DIMENSIONS.length },
    aligned,
    alignmentCounts,
  }
}

/** Chinese title per dimension key, from TianGong's disclosure chapter structure. */
export const DIMENSION_TITLES: Readonly<Record<(typeof ALL_DIMENSIONS)[number], string>> = {
  name: '名称',
  field: '所属技术领域',
  background: '背景技术',
  problem: '技术问题',
  solution: '发明内容',
  effect: '有益效果',
  key_points: '关键点与保护范围',
  drawings: '附图',
}
