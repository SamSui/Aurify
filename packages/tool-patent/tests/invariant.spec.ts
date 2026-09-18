import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as Invariant from '../src/invariant.ts'

describe('tool-patent invariant companion', () => {
  it('registers the package-owned slot with the empty installer', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await expect(ctx.plugin(Invariant).then(() => undefined)).resolves.toBeUndefined()
  })

  it('rejects a second registration for the same package name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    await ctx.plugin(Invariant)
    await expect(ctx.plugin(Invariant).then(() => undefined)).rejects.toThrow(/already registered/)
  })
})
