/**
 * The patent dashboard tab's asynchronous half: workspace listings and the
 * small reads the overview needs, bound to the shipped `workspaceFiles`
 * Remote. A Remote call does not reject — the result carries the failure.
 * @module
 */

import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** The `workspaceFiles` namespace methods the dashboard calls. */
export type PatentFilesRemote = {
  readonly workspaceFiles: Pick<ClientRemote['workspaceFiles'], 'list' | 'read'>
}

/** The Client Remote as the dashboard sees it. */
export interface PatentRemote {
  readonly workspaceFiles: PatentFilesRemote['workspaceFiles']
}

/** One workspace directory listing as the dashboard consumes it. */
export interface DirectoryListing {
  readonly entries: readonly { readonly name: string; readonly type: 'file' | 'directory' | 'other'; readonly size?: number }[]
}

/**
 * List one directory of the session workspace; failures surface as null.
 * @param remote - the Client Remote face carrying the `workspaceFiles` namespace.
 * @param sessionId - the open session's identity.
 * @param path - workspace path, relative to the workspace root.
 * @param signal - caller cancellation.
 * @returns the listing, or null when the Host refused the read.
 */
export async function listDirectory(
  remote: PatentRemote,
  sessionId: SessionId,
  path: string,
  signal: AbortSignal,
): Promise<DirectoryListing | null> {
  const result = await remote.workspaceFiles.list(sessionId, path, signal)
  if (!result.ok) return null
  return { entries: result.value.entries }
}

/**
 * Read one small text file (first page); null on failure or non-text.
 * @param remote - the Client Remote face carrying the `workspaceFiles` namespace.
 * @param sessionId - the open session's identity.
 * @param path - workspace path, relative to the workspace root.
 * @param signal - caller cancellation.
 * @returns the file's first page text, or null when the Host refused the read.
 */
export async function readSmallText(
  remote: PatentRemote,
  sessionId: SessionId,
  path: string,
  signal: AbortSignal,
): Promise<string | null> {
  const result = await remote.workspaceFiles.read(sessionId, path, { offset: 0, limit: 60 }, signal)
  if (!result.ok) return null
  return result.value.text
}

/** The business face the tab body receives, bound to one session. */
export interface PatentProjectInjected {
  listDirectory: (path: string, signal: AbortSignal) => Promise<DirectoryListing | null>
  readProjectFile: (path: string, signal: AbortSignal) => Promise<string | null>
}

/**
 * Bind the dashboard face to one Remote face. The session-scoped slot calls
 * the factory with the open session's identity, so the body never threads it.
 * @param remote - the Client Remote face carrying the `workspaceFiles` namespace.
 * @returns the per-session face factory.
 */
export function createProjectFace(remote: PatentRemote): (sessionId: SessionId) => PatentProjectInjected {
  return sessionId => ({
    listDirectory: (path, signal) => listDirectory(remote, sessionId, path, signal),
    readProjectFile: (path, signal) => readSmallText(remote, sessionId, path, signal),
  })
}
