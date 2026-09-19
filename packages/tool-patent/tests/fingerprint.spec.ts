import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sourceFingerprint } from '../src/fingerprint.ts'

let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'patent-fingerprint-'))
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

/**
 * The shared cross-language fixture: python/patent-services writes the same
 * bytes and pins the same digest in its test suite. Content is written as
 * UTF-8 bytes with LF newlines on both sides — a text-mode write on Windows
 * would flip the newlines and break the contract.
 */
async function sharedFixture(name: string): Promise<string> {
  const dir = join(root, name)
  await mkdir(join(dir, 'chapters'), { recursive: true })
  await mkdir(join(dir, 'figures', 'source'), { recursive: true })
  await writeFile(join(dir, 'chapters', '01-name.md'), '# 测试发明\n\n一种测试系统。\n', 'utf8')
  await writeFile(join(dir, 'chapters', '08-drawings.md'), '# 附图说明\n\n图1 为测试流程图。\n', 'utf8')
  await writeFile(join(dir, 'brief.md'), '# 技术简报\n\n技术领域：测试。\n', 'utf8')
  await writeFile(join(dir, 'figures', '图1.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.from('test-figure', 'ascii')]))
  await writeFile(join(dir, 'figures', 'source', 'sketch.drawio'), '<mxfile/>', 'utf8')
  return dir
}

describe('sourceFingerprint', () => {
  it('matches the cross-language test vector shared with the python sidecar', async () => {
    const dir = await sharedFixture('vector')
    await expect(sourceFingerprint(dir)).resolves.toBe('c83bc723545b5db4')
  })

  it('ignores mtimes and subdirectories, and moves when the bytes move', async () => {
    const dir = await sharedFixture('stability')
    const before = await sourceFingerprint(dir)
    // A checkout-style touch: rewrite every file with identical bytes and a
    // fresh mtime — the digest must not move.
    await writeFile(join(dir, 'chapters', '01-name.md'), '# 测试发明\n\n一种测试系统。\n', 'utf8')
    expect(await sourceFingerprint(dir)).toBe(before)

    await writeFile(join(dir, 'chapters', '01-name.md'), '# 测试发明\n\n修改后的正文。\n', 'utf8')
    expect(await sourceFingerprint(dir)).not.toBe(before)
  })

  it('tolerates a bare directory (empty-set digest) and missing pieces', async () => {
    const bare = join(root, 'bare')
    await mkdir(bare, { recursive: true })
    const bareDigest = await sourceFingerprint(bare)
    expect(bareDigest).toMatch(/^[0-9a-f]{16}$/)

    const briefOnly = join(root, 'brief-only')
    await mkdir(briefOnly, { recursive: true })
    await writeFile(join(briefOnly, 'brief.md'), '# 技术简报\n\n技术领域：测试。\n', 'utf8')
    expect(await sourceFingerprint(briefOnly)).not.toBe(bareDigest)
  })
})
