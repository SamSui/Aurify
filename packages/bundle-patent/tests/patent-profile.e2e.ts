import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const driver = fileURLToPath(new URL('./fixtures/profile-smoke-driver.ts', import.meta.url))
const configPath = fileURLToPath(new URL('./fixtures/patent-profile.patch.yml', import.meta.url))
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

const FIBER_ACTIVE = 2

describe('the shipped patent profile composition', () => {
  it('boots keylessly with every patent row active and the MCP row opt-in off', async () => {
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'patent profile smoke',
      tempDirPrefix: 'patent-profile-smoke-',
      binScript: driver,
      libBinScript: driver,
      configPath,
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).not.toContain('UNHANDLED')
    const line = stdout.trim().split('\n').filter(candidate => candidate.startsWith('{')).at(-1)
    expect(line, stdout).toBeDefined()
    const { entries } = JSON.parse(line!) as { entries: Record<string, number | string> }
    // The bundle contract: the three patent plugins and the re-enabled
    // workflow engine are live in the composed profile.
    for (const id of ['tool-patent', 'patent-assets', 'command-patent-review', 'workflow-ptc']) {
      expect(entries[id], `${id} state`).toBe(FIBER_ACTIVE)
    }
    // The MCP services row stays opt-in: off with the env unset in the overlay.
    expect(entries['mcp-patent-services'], 'mcp-patent-services state').not.toBe(FIBER_ACTIVE)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
