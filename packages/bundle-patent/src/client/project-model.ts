/**
 * The patent project overview's view model: raw workspace listings and the
 * patent.yml first page become the sections the dashboard tab draws. Pure
 * and synchronous — the body performs the reads, this derives the display.
 * @module
 */

import type { DirectoryListing } from './patent-face.ts'

/** One file entry as the overview lists it. */
export interface ProjectFile {
  readonly name: string
  readonly size?: number
}

/** The whole dashboard's display state. */
export interface ProjectView {
  /** The workspace holds a patent project (patent.yml or the chapter layout present). */
  readonly isProject: boolean
  /** patent.yml's `name` field, best-effort. */
  readonly projectName: string | null
  /** patent.yml's `status` field, best-effort. */
  readonly projectStatus: string | null
  /** brief.md exists at the root. */
  readonly brief: boolean
  /** The eight chapter files, in chapter order, present and non-empty. */
  readonly chapters: readonly ProjectFile[]
  /** draftedCount: present chapters with content; total: the fixed eight. */
  readonly drafted: number
  readonly total: 8
  /** Application documents present under application/. */
  readonly application: { readonly claims: boolean; readonly description: boolean; readonly abstract: boolean }
  /** Review reports (.md) under review/, by name. */
  readonly review: readonly string[]
  /** Final figure images (.png) at the figures/ root, in name order, each with its 08-drawings caption when one matches. */
  readonly figures: readonly { readonly name: string; readonly caption: string | null }[]
}

const CHAPTER_TOTAL = 8

/** One 附图说明 caption line: `图1 为本发明所述方法的流程总览图；` */
const FIGURE_CAPTION = /图(\d+)\s*[为是][:：]?\s*([^；。\n]+)/gu

/**
 * Pair each final figure png with its caption from the 08-drawings chapter.
 * @param figures - the figures/ listing; null when absent.
 * @param drawingsText - chapters/08-drawings.md's first page; null when unread.
 * @returns png entries in name order with captions where one matches.
 */
function buildFigures(figures: DirectoryListing | null, drawingsText: string | null): { name: string; caption: string | null }[] {
  const captions = new Map<string, string>()
  if (drawingsText !== null) {
    for (const match of drawingsText.matchAll(FIGURE_CAPTION)) {
      const name = `图${match[1]}.png`
      if (!captions.has(name)) captions.set(name, (match[2] ?? '').trim())
    }
  }
  return fileNames(figures, '.png').map(name => ({ name, caption: captions.get(name) ?? null }))
}

/** Entries of one listing: files only, by name. */
function fileNames(listing: DirectoryListing | null, suffix = ''): string[] {
  if (listing === null) return []
  return listing.entries
    .filter(entry => entry.type === 'file' && entry.name.toLowerCase().endsWith(suffix))
    .map(entry => entry.name)
}

/**
 * Derive the dashboard sections from the workspace listings and patent.yml's first page.
 * @param root - the workspace root listing; null when it could not be read.
 * @param chapters - the chapters/ listing; null when the directory is absent.
 * @param review - the review/ listing; null when absent.
 * @param figures - the figures/ listing; null when absent.
 * @param application - the application/ listing; null when absent.
 * @param patentYml - patent.yml's first page text; null when the file is absent.
 * @param drawingsText - chapters/08-drawings.md's first page, for figure captions; null when absent.
 * @returns the display state.
 */
export function buildProjectView(
  root: DirectoryListing | null,
  chapters: DirectoryListing | null,
  review: DirectoryListing | null,
  figures: DirectoryListing | null,
  application: DirectoryListing | null,
  patentYml: string | null,
  drawingsText: string | null = null,
): ProjectView {
  const rootNames = new Set((root?.entries ?? []).map(entry => entry.name))
  const isProject = rootNames.has('patent.yml') || rootNames.has('chapters')
  const chapterFiles = (chapters?.entries ?? [])
    .filter(entry => entry.type === 'file' && entry.name.toLowerCase().endsWith('.md'))
    .map(entry => (entry.size === undefined ? { name: entry.name } : { name: entry.name, size: entry.size }))
    .slice(0, CHAPTER_TOTAL)
  const drafted = chapterFiles.filter(file => (file.size ?? 0) > 0).length
  const applicationNames = new Set(fileNames(application, '.md'))
  const statusMatch = patentYml === null ? null : /^status:\s*["']?([\w-]+)["']?\s*$/mu.exec(patentYml)
  const nameMatch = patentYml === null ? null : /^name:\s*["']?(.+?)["']?\s*$/mu.exec(patentYml)
  return {
    isProject,
    projectName: nameMatch?.[1] ?? null,
    projectStatus: statusMatch?.[1] ?? null,
    brief: rootNames.has('brief.md'),
    chapters: chapterFiles,
    drafted,
    total: CHAPTER_TOTAL,
    application: {
      claims: applicationNames.has('claims.md'),
      description: applicationNames.has('description.md'),
      abstract: applicationNames.has('abstract.md'),
    },
    review: fileNames(review, '.md'),
    figures: buildFigures(figures, drawingsText),
  }
}
