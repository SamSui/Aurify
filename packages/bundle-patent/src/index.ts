/**
 * Patent bundle asset carrier: registers the shipped patent SKILL.md assets as
 * runtime skills so the writing procedures and quality standards reach the
 * model's catalog without any filesystem discovery root, and pins the
 * discussion-stage sampling temperature on the profile's top-level sessions.
 * The composition rows live in cordis.patch.yml; this plugin contributes the
 * package's own skills and sampling default.
 * @module @mtl-academic/dsh-patent
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: brings the scoped agent/request event into this program's Events.
import type {} from '@deepseek-ai/dsh-agent'
import { DISCUSSION_TEMPERATURE } from './sampling.ts'
import { loadBundledSkills } from './skills.ts'

export { SKILLS_DIR, loadBundledSkills, parseSkillFile } from './skills.ts'
export { DISCUSSION_TEMPERATURE } from './sampling.ts'

export const name = 'patent-assets'
export const inject = ['skills']

/**
 * Register every shipped skill on the skills registry and pin the
 * discussion-stage sampling temperature on top-level sessions.
 * @param ctx - Cordis context carrying the skills registry and event dispatch.
 */
export function apply(ctx: Context): void {
  for (const skill of loadBundledSkills()) ctx.skills.register(skill)
  ctx.on('agent/request', async (payload, next) => {
    // Delegated children carry the durable subagent origin — the review
    // chain's scoring children pin their own lower temperature through the
    // workflow — so top-level sessions (idea evaluation, the alignment
    // interview, drafting) are the only requests this touches. A core whose
    // dispatch does not inject the subject into the payload is never guessed
    // at: the override simply stays off there.
    const candidate = payload as { agent?: { session?: { header?: { origin?: string } } } }
    const origin = candidate.agent?.session?.header?.origin
    if (origin === 'subagent' || candidate.agent === undefined) return next()
    const resolved = await next()
    return resolved.temperature === DISCUSSION_TEMPERATURE
      ? resolved
      : { ...resolved, temperature: DISCUSSION_TEMPERATURE }
  })
}
