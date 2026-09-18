/**
 * Patent bundle browser half: the two deterministic patent tools render as
 * structured cards (readiness chips, violation list) instead of generic text
 * rows, and a right-sidebar tab lists the open workspace's project overview.
 * Card bodies derive from the persisted presentation meta with a render-text
 * fallback, so live and replay renders stay identical.
 * @module @mtl-academic/dsh-patent/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import { ClaimsLintCard } from './ClaimsLintCard.tsx'
import { CoverageCard } from './CoverageCard.tsx'
import { ReviewCard } from './ReviewCard.tsx'
import { createProjectFace } from './patent-face.ts'
import { PATENT_TAB_ID, patentTabDefinition } from './patent-tab.tsx'
import { PatentBody } from './PatentBody.tsx'
import { en, NS, zh } from './locales.ts'

/** Required services: the slot and locale registries, the right-sidebar tab registry, and the workspace-files Remote. */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles']

/**
 * Register the two keyed tool views, the dictionaries, and the project
 * dashboard tab.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-patent: dictionaries')
  ctx.effect(() => ctx.sidebarRightTabs.register(patentTabDefinition(t)), 'dsh-patent: tab type')
  ctx.slots.inject('tool.call.toolview', () => [
    ctx.slots.register({ name: 'tool.call.toolview', key: 'patent_brief_coverage', locale: NS }, CoverageCard),
    ctx.slots.register({ name: 'tool.call.toolview', key: 'patent_claims_lint', locale: NS }, ClaimsLintCard),
    ctx.slots.register({ name: 'tool.call.toolview', key: 'patent_review', locale: NS }, ReviewCard),
  ])
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: PATENT_TAB_ID, locale: NS, inject: createProjectFace(ctx.remote) },
    PatentBody,
  ))
}
