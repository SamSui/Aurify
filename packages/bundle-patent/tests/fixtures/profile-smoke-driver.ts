#!/usr/bin/env node
/** Patent-profile smoke driver: boot the shipped patent profile keylessly and
 * report the settled loader entry states as one JSON line on stdout. */

import { resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { bootProductionProfile } from '../../../../test-support/loader-smoke/tests/fixtures/production-profile.ts'

const NAME = 'patent-profile-smoke-driver'
/** The patent rows whose activation the whole bundle contract rides on. */
const REQUIRED_ACTIVE = ['tool-patent', 'patent-assets', 'command-patent-review', 'workflow-ptc'] as const
const FIBER_ACTIVE = 2 as const

const configPath = process.argv[2]
if (configPath === undefined) throw new Error(`${NAME}: expected a config path`)

const ctx = await bootProductionProfile({
  binName: NAME,
  profile: 'headless',
  overlayPaths: [resolveConfigPath(configPath, undefined)],
})
try {
  const byId = new Map<string, number | string>()
  for (const entry of ctx.loader.entries()) {
    byId.set(entry.options.id, entry.fiber === undefined ? 'unimported' : entry.fiber.state)
  }
  // Only the required rows must have activated — awaiting every web row
  // would couple the smoke to rows that legitimately idle without a browser.
  for (const id of REQUIRED_ACTIVE) {
    const entry = [...ctx.loader.entries()].find(candidate => candidate.options.id === id)
    if (entry === undefined) throw new Error(`${NAME}: required entry missing: ${id}`)
    if (entry.fiber === undefined) throw new Error(`${NAME}: required entry never imported: ${id}`)
    await entry.fiber.await()
    byId.set(id, entry.fiber.state)
  }
  const entries: Record<string, number | string> = {}
  for (const [id, state] of byId) entries[id] = state
  const inactive = REQUIRED_ACTIVE.filter(id => entries[id] !== FIBER_ACTIVE)
  if (inactive.length > 0) throw new Error(`${NAME}: required entries did not activate: ${inactive.join(', ')}`)
  process.stdout.write(`${JSON.stringify({ entries })}\n`)
} finally {
  await ctx.fiber.dispose()
}
