/**
 * The fixed patent-review orchestration script, executed by the workflow
 * engine's worker. Host data: the model never supplies or edits this script,
 * which is what makes a review run deterministic in structure — the same
 * input always produces the same set of scoring children, one per rubric
 * dimension per configured pass, folded into per-dimension averages and a
 * weight-renormalized overall score. A failed child resolves to `null` and
 * lowers that dimension's pass count instead of failing the run.
 *
 * When the caller supplies `consistency` (the application's claims and
 * description texts), a second NLI-style phase runs: per pass one
 * claims→description support child and one terminology-consistency child,
 * aggregated into an overall consistency score with the union of
 * unsupported-claim findings. Absent, the phase is skipped and the outcome
 * carries no consistency section.
 * @module
 */

export const REVIEW_SCRIPT = String.raw`
const { fileLabel, fileContent, dimensions, passes, consistency } = args
phase('Patent review: ' + fileLabel)
const SCORE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score: { type: 'integer', description: '0-100 per the scoring guide' },
    evidence: { type: 'string', description: 'One or two sentences citing the exact text that earned the score' },
    suggestion: { type: 'string', description: 'The single highest-impact improvement' },
  },
  required: ['score', 'evidence', 'suggestion'],
}
function promptFor(dimension, pass) {
  const guide = Object.entries(dimension.guide)
    .map(([band, text]) => '- ' + band + ': ' + text)
    .join('\n')
  return [
    'You are a patent disclosure reviewer. Score the document below against ONE dimension and respond ONLY through the structured output tool.',
    'Dimension: ' + dimension.title + ' (' + dimension.key + '), weight ' + dimension.weight + '.',
    'Scoring guide:',
    guide,
    'Judge this document alone: score the contribution the text makes to the dimension, not what a complete application would contain. When the document legitimately does not cover the dimension (e.g. a background-only chapter has no solution), score the groundwork it provides toward that dimension and let the evidence name the boundary.',
    'This is independent scoring pass ' + (pass + 1) + ' of ' + passes + '; judge the text on its own merits.',
    '--- DOCUMENT START ---',
    fileContent,
    '--- DOCUMENT END ---',
  ].join('\n')
}
// Scoring children fan out in small batches instead of one full parallel:
// every batch hits the LLM gateway at once, and a wide burst (dimensions ×
// passes) trips per-account rate limits whose retries then fail together —
// a failed child costs its dimension a pass, so the burst shape shows up
// later as "all N scoring passes failed" on random dimensions.
async function parallelInBatches(thunks, size) {
  const results = []
  for (let start = 0; start < thunks.length; start += size) {
    results.push(...(await parallel(thunks.slice(start, start + size))))
  }
  return results
}
const tasks = []
for (const dimension of dimensions) {
  for (let pass = 0; pass < passes; pass += 1) {
    tasks.push(async () => ({
      dimension,
      pass,
      result: await agent(promptFor(dimension, pass), { schema: SCORE_SCHEMA, label: 'review:' + dimension.key + '#' + (pass + 1) }),
    }))
  }
}
const CONSISTENCY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score: { type: 'integer', description: '0-100 support/consistency verdict' },
    unsupported: {
      type: 'array',
      description: 'Each unsupported claim or mismatched term with its reason',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          claim: { type: 'string', description: 'The claim number/text or the mismatched term' },
          reason: { type: 'string', description: 'Why it is unsupported or mismatched, citing the description' },
        },
        required: ['claim', 'reason'],
      },
    },
    evidence: { type: 'string', description: 'One or two sentences citing the exact description text that decided the score' },
    suggestion: { type: 'string', description: 'The single highest-impact consistency fix' },
  },
  required: ['score', 'unsupported', 'evidence', 'suggestion'],
}
function consistencyPrompt(kind, pass) {
  const instruction = kind === 'support'
    ? 'For EVERY numbered claim, decide whether the description contains at least one passage a claim could rest on. Score 100 minus 15 per unsupported claim; list each unsupported claim in "unsupported" with the reason.'
    : 'Check terminology and scope consistency between the claims and the description: each claim term must appear verbatim as the description name for that element, and the description must not read a claim on matter the claims never recite. Score accordingly; list each mismatched term or claim-less load-bearing passage in "unsupported" with the reason.'
  return [
    'You are a patent consistency reviewer. Compare the CLAIMS against the DESCRIPTION and respond ONLY through the structured output tool.',
    instruction,
    'This is independent consistency pass ' + (pass + 1) + ' of ' + passes + '.',
    '--- CLAIMS START ---',
    consistency.claims,
    '--- CLAIMS END ---',
    '--- DESCRIPTION START ---',
    consistency.description,
    '--- DESCRIPTION END ---',
  ].join('\n')
}
if (consistency !== undefined) {
  for (let pass = 0; pass < passes; pass += 1) {
    for (const kind of ['support', 'terminology']) {
      tasks.push(async () => ({
        kind,
        result: await agent(consistencyPrompt(kind, pass), { schema: CONSISTENCY_SCHEMA, label: 'consistency:' + kind + '#' + (pass + 1) }),
      }))
    }
  }
}
const scored = await parallelInBatches(tasks, 5)
function fold(items) {
  return dimensions.map((dimension) => {
    const items0 = items.filter((item) => item.dimension === dimension && item.result !== null)
    const scores = items0.map((item) => item.result.score)
    const average = scores.length === 0 ? null : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    return {
      key: dimension.key,
      title: dimension.title,
      weight: dimension.weight,
      scores,
      average,
      failedPasses: passes - scores.length,
      evidence: items0.map((item) => item.result.evidence),
      suggestions: items0.map((item) => item.result.suggestion),
    }
  })
}
let folded = fold(scored)
// One retry round for failed scoring passes: children die in clusters (a
// gateway rate-limit window kills a whole parallel batch), and the same
// prompt usually passes moments later. Capped at two retries per dimension
// so a genuinely unpromptable dimension fails fast instead of looping.
const retryThunks = []
for (const foldedDimension of folded) {
  if (foldedDimension.failedPasses <= 0) continue
  const dimension = dimensions.find((candidate) => candidate.key === foldedDimension.key)
  for (let retryIndex = 0; retryIndex < Math.min(foldedDimension.failedPasses, 2); retryIndex += 1) {
    const pass = passes + retryIndex
    retryThunks.push(async () => ({
      dimension,
      pass,
      result: await agent(promptFor(dimension, pass), { schema: SCORE_SCHEMA, label: 'review:' + dimension.key + '#retry' + (retryIndex + 1) }),
    }))
  }
}
if (retryThunks.length > 0) {
  const retried = scored.concat(await parallelInBatches(retryThunks, 5))
  folded = fold(retried)
}
let consistencyOutcome = null
if (consistency !== undefined) {
  const items = scored.filter((item) => item.kind !== undefined && item.result !== null)
  const scores = items.map((item) => item.result.score)
  const byClaim = new Map()
  for (const item of items) {
    for (const finding of item.result.unsupported) {
      if (!byClaim.has(finding.claim)) byClaim.set(finding.claim, finding.reason)
    }
  }
  consistencyOutcome = {
    score: scores.length === 0 ? null : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    failedPasses: passes * 2 - scores.length,
    unsupportedClaims: [...byClaim].map(([claim, reason]) => ({ claim, reason })),
    evidence: items.map((item) => item.result.evidence),
    suggestions: items.map((item) => item.result.suggestion),
  }
}
const collected = folded.filter((d) => d.average !== null)
const weightSum = collected.reduce((sum, d) => sum + d.weight, 0)
const overall = collected.length === 0
  ? null
  : Math.round(collected.reduce((sum, d) => sum + d.average * d.weight, 0) / weightSum)
const outcome = { overall, dimensions: folded }
if (consistencyOutcome !== null) outcome.consistency = consistencyOutcome
return outcome
`
