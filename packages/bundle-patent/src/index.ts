/**
 * Patent bundle asset carrier: registers the shipped patent SKILL.md assets as
 * runtime skills so the writing procedures and quality standards reach the
 * model's catalog without any filesystem discovery root. The composition rows
 * live in cordis.patch.yml; this plugin contributes the package's own skills.
 * @module @mtl-academic/dsh-patent
 */

import type { Context } from '@deepseek-ai/cordis'
import { loadBundledSkills } from './skills.ts'

export { SKILLS_DIR, loadBundledSkills, parseSkillFile } from './skills.ts'

export const name = 'patent-assets'
export const inject = ['skills']

/**
 * Register every shipped skill on the skills registry.
 * @param ctx - Cordis context carrying the skills registry.
 */
export function apply(ctx: Context): void {
  for (const skill of loadBundledSkills()) ctx.skills.register(skill)
}
