/**
 * Model-facing deterministic patent tools: the five-party alignment coverage
 * scorer that gates the Init dialogue, and the claims-and-abstract linter for
 * application drafting. Both are pure functions of their arguments. Named
 * exports preserve loader injection metadata.
 * @module @deepseek-ai/dsh-tool-patent
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ALL_DIMENSIONS, ALIGN_TOLERANCE, computeCoverage, DIMENSION_TITLES, type DimensionOutline } from './coverage.ts'
import { ABSTRACT_MAX_CHARS, lintClaims } from './claims-lint.ts'

export { computeCoverage } from './coverage.ts'
export type { Coverage, DimensionOutline } from './coverage.ts'
export { lintClaims, parseClaims, countAbstractChars, ABSTRACT_MAX_CHARS } from './claims-lint.ts'
export type { ClaimsLintResult, ParsedClaim, ClaimViolation } from './claims-lint.ts'

export const name = 'tool-patent'
export const inject = ['tools']

const DIMENSION_DESCRIPTIONS: Readonly<Record<(typeof ALL_DIMENSIONS)[number], string>> = {
  name: 'Proposed invention name (invention name).',
  field: 'Technical field (technical field).',
  background: 'Prior-art shortcomings (shortcomings of the prior art); enumeration improves the alignment estimate.',
  problem: 'Technical problems to solve (technical problems), one per prior-art shortcoming.',
  solution: 'Technical solution (technical solution): architecture, components, and how each solves a stated problem.',
  effect: 'Beneficial effects (beneficial effects), ideally quantified and tied to solution components.',
  key_points: 'Key points and protection scope (key points and protection scope).',
  drawings: 'Figures (figures).',
}

/**
 * Compose the model-facing result text: coverage progress, the named gaps with
 * their Chinese chapter titles, and the alignment verdict.
 * @param value - the canonical coverage result.
 * @returns the render text blocks.
 */
function renderCoverage(value: ReturnType<typeof computeCoverage>): { type: 'text'; text: string }[] {
  const gapText = value.missing.length === 0
    ? 'all five core dimensions covered'
    : `missing: ${value.missing.map(key => `${DIMENSION_TITLES[key as keyof typeof DIMENSION_TITLES]} (${key})`).join(', ')}`
  const counts = value.alignmentCounts
  const alignText = value.aligned
    ? `aligned within tolerance ${ALIGN_TOLERANCE}`
    : `NOT aligned (spread ${Math.max(...Object.values(counts)) - Math.min(...Object.values(counts))} exceeds tolerance ${ALIGN_TOLERANCE})`
  const verdict = value.ready
    ? 'READY: write brief.md and the chapter files, then start drafting.'
    : 'NOT ready: keep asking for the missing dimensions before drafting.'
  return [{
    type: 'text',
    text: `Brief coverage ${value.coreFilled.done}/${value.coreFilled.total} (${gapText}). `
      + `Alignment counts background/problem/effect = ${counts.background}/${counts.problem}/${counts.effect}, ${alignText}. ${verdict}`,
  }]
}

/**
 * Compose the model-facing result text for the claims lint: the claim count
 * split, the violation list, and the verdict.
 * @param value - the canonical lint projection (summary + violations).
 * @returns the render text blocks.
 */
function renderClaimsLint(value: { summary: ReturnType<typeof lintClaims>['summary']; violations: ReturnType<typeof lintClaims>['violations'] }): { type: 'text'; text: string }[] {
  const { summary } = value
  const head = `Claims ${summary.total} (${summary.independent} independent, ${summary.dependent} dependent), `
    + `${summary.errors} errors, ${summary.warnings} warnings.`
  const list = value.violations.length === 0
    ? 'all format rules pass'
    : value.violations.map(violation => `[${violation.rule}]${violation.claim === undefined ? '' : ` claim ${violation.claim}`} ${violation.message}`).join(' | ')
  const verdict = summary.errors === 0
    ? 'PASS: no format errors (warnings are drafting hints, not blockers).'
    : 'FAIL: fix the C/A-rule errors before export.'
  return [{ type: 'text', text: `${head} ${list} ${verdict}` }]
}

/**
 * Register the `patent_brief_coverage` and `patent_claims_lint` tools on
 * `ctx.tools`.
 * @param ctx - registrant context carrying the tool registry.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'patent_brief_coverage',
    description: 'Score a patent disclosure brief against the five-party alignment readiness criteria '
      + '(technical field, prior-art shortcomings, technical problems, solution, beneficial effects). '
      + 'Send the draft content collected so far for each dimension (omit uncollected ones) and use the '
      + 'readiness verdict to decide whether to keep asking questions or to start drafting. Core dimensions: '
      + 'field, background, problem, solution, effect; the background/problem/effect point counts must stay '
      + `within tolerance ${ALIGN_TOLERANCE} of each other.`,
    parameters: Object.fromEntries(ALL_DIMENSIONS.map(key => [
      key,
      { type: 'string' as const, description: DIMENSION_DESCRIPTIONS[key] },
    ])),
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          covered: { type: 'array', required: true, items: { type: 'string' } },
          missing: { type: 'array', required: true, items: { type: 'string' } },
          ready: { type: 'boolean', required: true },
          coreFilled: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              done: { type: 'integer', required: true },
              total: { type: 'integer', required: true },
            },
          },
          aligned: { type: 'boolean', required: true },
          alignmentCounts: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              background: { type: 'integer', required: true },
              problem: { type: 'integer', required: true },
              effect: { type: 'integer', required: true },
            },
          },
        },
      },
      render: (_args, value) => renderCoverage(value),
      // The canonical value IS the UI payload: the shipped web card renders
      // it directly and falls back to the rendered text on cores that predate
      // the presentation channel.
      presentationMeta: (_args, value) => value,
    },
    execute(args) {
      const outline: DimensionOutline = args
      return Promise.resolve(computeCoverage(outline))
    },
    presentCall: args => ({ card: 'generic', title: 'Score brief coverage', kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'patent_claims_lint',
    description: 'Lint a drafted Chinese patent application claims section (and optional abstract) '
      + 'against the CNIPA format minimums: consecutive numbering (C1), dependent claims citing only '
      + 'earlier claims (C2), citation form (C3), the multiple-dependent base restriction (C4), the '
      + 'two-part form hint for independent claims (C5), and the abstract length cap (A1, '
      + `${ABSTRACT_MAX_CHARS} characters). Send the claims text (and the abstract when drafting it); `
      + 'use the error/warning split to decide what must be fixed before export.',
    parameters: {
      claims: {
        type: 'string',
        required: true,
        description: 'The claims section text (权利要求书), numbered claims "1." through "N.".',
      },
      abstract: {
        type: 'string',
        description: 'The abstract text (说明书摘要); the A1 length rule runs only when supplied.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              total: { type: 'integer', required: true },
              independent: { type: 'integer', required: true },
              dependent: { type: 'integer', required: true },
              errors: { type: 'integer', required: true },
              warnings: { type: 'integer', required: true },
            },
          },
          violations: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                claim: { type: 'integer' },
                rule: { type: 'string', required: true },
                severity: { type: 'string', required: true, enum: ['error', 'warning'] },
                message: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => renderClaimsLint(value),
      presentationMeta: (_args, value) => value,
    },
    execute(args) {
      // The parsed claims stay out of the model-visible value: the model just
      // supplied them, so echoing every claim back spends tokens for nothing.
      const { summary, violations } = lintClaims(args.claims, args.abstract)
      return Promise.resolve({ summary, violations })
    },
    presentCall: args => ({ card: 'generic', title: 'Lint claims', kind: 'other', rawInput: { claims: '…', abstract: args.abstract } }),
  }))
}
