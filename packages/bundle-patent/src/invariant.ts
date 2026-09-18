/**
 * Package-owned invariant companion for `@mtl-academic/dsh-patent`.
 * @module @mtl-academic/dsh-patent/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@mtl-academic/dsh-patent'

/** Cordis companion plugin name. */
export const name = 'patent-bundle-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

// No runtime invariant: the package is a static patch-list carrier plus a
// runtime-skill registration of shipped Markdown assets; it mounts no service,
// emits no events, and owns no mutable relationship to check.
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
