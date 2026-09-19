/**
 * The source-set digest stamped into review reports and export sidecars:
 * a content hash over exactly the file set the loop's freshness gates measure
 * (top-level files of `chapters/` and `figures/`, plus `brief.md`). Unlike
 * mtimes, the digest survives git checkouts and directory syncs — a review is
 * stale exactly when the bytes it reviewed changed, not when something touched
 * the files on the way.
 *
 * Cross-language contract: `python/patent-services/src/patent_services/fingerprint.py`
 * computes the same digest for the export sidecar, and both test suites pin
 * one fixture to one hardcoded digest. Change the algorithm in all three
 * places or not at all.
 * @module dsh-tool-patent/fingerprint
 */

import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Digest length kept in report stamps and sidecars (64 bits of sha256). */
export const FINGERPRINT_LENGTH = 16

/** Directories whose top-level files join the digest, beside `brief.md`. */
const SOURCE_DIRS = ['chapters', 'figures'] as const

/**
 * Compute the source fingerprint for one project directory.
 * @param root - the project directory.
 * @returns the first {@link FINGERPRINT_LENGTH} hex chars of the sha256 over
 * `relPath \0 bytes \0` for every set file in sorted relPath order (relPath
 * uses forward slashes; files missing from the set simply do not contribute).
 */
export async function sourceFingerprint(root: string): Promise<string> {
  const paths: string[] = []
  for (const dir of SOURCE_DIRS) {
    let entries
    try {
      entries = await readdir(join(root, dir), { withFileTypes: true })
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      continue
    }
    for (const entry of entries) {
      if (entry.isFile()) paths.push(`${dir}/${entry.name}`)
    }
  }
  let hasBrief = true
  try {
    await stat(join(root, 'brief.md'))
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    hasBrief = false
  }
  if (hasBrief) paths.push('brief.md')
  paths.sort()
  const hash = createHash('sha256')
  for (const path of paths) {
    hash.update(path)
    hash.update('\0')
    hash.update(await readFile(join(root, path)))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, FINGERPRINT_LENGTH)
}
