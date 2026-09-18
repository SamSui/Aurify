/**
 * The patent-loop state assessor: one deterministic pass over a project
 * directory that names the first incomplete pipeline stage and the directive
 * for finishing it. The loop itself runs in the model's hands — call the
 * tool, execute the stage per its skills, call again — but the completion
 * verdict ("成稿交底书") belongs to this assessor, which reads only disk
 * facts (manifest, brief, chapters, experiment run log, figure files, review
 * reports, the exported docx), never the model's own claim of being done.
 * @module dsh-tool-patent/loop
 */

import { readdir, readFile, stat, access } from 'node:fs/promises'
import { join, resolve, basename } from 'node:path'

/** Pipeline stages in execution order; `done` is the completed verdict. */
export const LOOP_STAGES = ['init', 'align', 'chapters', 'experiments', 'figures', 'review', 'export'] as const

/** One pipeline stage, or `done` when the disclosure is final. */
export type LoopStage = (typeof LOOP_STAGES)[number] | 'done'

/** The eight disclosure chapter files in their canonical order. */
const CHAPTER_FILES = [
  '01-name.md', '02-field.md', '03-background.md', '04-problem.md',
  '05-solution.md', '06-effect.md', '07-key-points.md', '08-drawings.md',
] as const

/** A chapter counts as drafted once its trimmed body reaches this length. */
const CHAPTER_MIN_CHARS = 20

/** One pending requirement found by the assessment pass. */
export interface LoopGap {
  /** The stage whose completion this gap belongs to. */
  stage: LoopStage
  /** Human-readable description of what is missing. */
  detail: string
}

/** The assessor's verdict for one project directory. */
export interface LoopState {
  /** Absolute project directory the assessment ran against. */
  projectRoot: string
  /** Project display name: the manifest `name`, else the directory's basename. */
  projectName: string
  /** Whether a patent project (patent.yml) exists at the root. */
  hasProject: boolean
  /** First incomplete stage in pipeline order; `done` when nothing pends. */
  stage: LoopStage
  /** True only when every pipeline gate passes — the 成稿 verdict. */
  complete: boolean
  /** Every pending requirement in pipeline order (the roadmap, not just the stage). */
  gaps: LoopGap[]
  /** The directive for the current stage: what to do, which skills, which disciplines. */
  directive: string
  /** Skill names to load before executing the current stage. */
  skills: string[]
  /** Whether the current stage may pause for user input (evaluation, interview). */
  mayNeedUser: boolean
}

/** Whether a path exists. */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return false
  }
  return true
}

/** Read a text file, or undefined when missing. */
async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return undefined
  }
}

/** Last modification time, or the epoch when the path is missing. */
async function mtimeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).mtimeMs
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return 0
  }
}

/**
 * Parse the two manifest fields the loop keys on (`name`, `status`) without
 * pulling in a YAML dependency — patent.yml is model-generated with a flat,
 * known shape.
 * @param root - the project directory.
 * @returns the manifest fields, or undefined when the file is missing.
 */
async function readManifest(root: string): Promise<{ name?: string; status?: string } | undefined> {
  const text = await readText(join(root, 'patent.yml'))
  if (text === undefined) return undefined
  const fields: { name?: string; status?: string } = {}
  for (const line of text.split(/\r?\n/)) {
    const match = /^(name|status):\s*(.+?)\s*$/.exec(line)
    const key = match?.[1]
    const value = match?.[2]
    if (key !== undefined && value !== undefined) fields[key as 'name' | 'status'] = value
  }
  return fields
}

/** The five core brief dimensions, their section headings, and Chinese labels. */
const BRIEF_SECTIONS: ReadonlyArray<{ key: string; label: string; headings: string[] }> = [
  { key: 'field', label: '技术领域', headings: ['技术领域'] },
  { key: 'background', label: '背景技术', headings: ['背景技术', '现有技术'] },
  { key: 'problem', label: '技术问题', headings: ['技术问题'] },
  { key: 'solution', label: '发明内容', headings: ['发明内容', '技术方案', '整体方案'] },
  { key: 'effect', label: '有益效果', headings: ['有益效果'] },
]

/**
 * Whether brief.md carries a non-empty section for every core dimension. The
 * brief is free prose, so this is a presence heuristic — an empty heading
 * counts as missing, a thin one still counts (thickness is the interview's
 * job, judged by `patent_brief_coverage`).
 * @param brief - the brief.md text.
 * @returns one gap detail per core dimension missing a non-empty section.
 */
function missingBriefSections(brief: string): string[] {
  return BRIEF_SECTIONS.filter(({ headings }) => {
    const pattern = new RegExp(`^#{1,4}.*(?:${headings.join('|')})`, 'm')
    const index = brief.search(pattern)
    if (index < 0) return true
    const rest = brief.slice(index).replace(pattern, '')
    const nextHeading = rest.search(/^#{1,4}\s/m)
    return (nextHeading < 0 ? rest : rest.slice(0, nextHeading)).trim().length === 0
  }).map(({ label }) => `brief.md 缺少核心维度章节：${label}`)
}

/**
 * Collect the chapter gaps: any of the eight files missing or thinner than
 * the drafted threshold.
 * @param root - the project directory.
 * @returns gap details for the chapter stage, empty when all eight drafted.
 */
async function chapterGaps(root: string): Promise<string[]> {
  const details: string[] = []
  for (const name of CHAPTER_FILES) {
    const body = await readText(join(root, 'chapters', name))
    if (body === undefined) {
      details.push(`缺章节文件 chapters/${name}`)
    } else if (body.trim().length < CHAPTER_MIN_CHARS) {
      details.push(`chapters/${name} 为占位/空白`)
    }
  }
  return details
}

/** A figure declaration line in 08-drawings.md: `图N 为……`. */
const FIGURE_DECLARATION = /图(\d+)\s*[为是]/g

/** A final figure file name at the figures root: `图N.png` or `图N-名称.png`. */
const FIGURE_FILE = /^图(\d+)(?:-.+)?\.png$/i

/** A chapter body counts as quantitative when it carries a number+unit claim. */
const QUANTITATIVE = /[0-9]+(?:\.[0-9]+)?\s*(%|倍|个|次|条|毫秒|ms|s|KB|MB|GB)/

/**
 * Compare the 08-drawings declarations against the figure files that actually
 * sit at the figures root (same naming contract the exporter collects by).
 * @param root - the project directory.
 * @returns missing figure numbers, surplus figure numbers, and whether the
 * drawings chapter plans any figure at all.
 */
async function figureGaps(root: string): Promise<{ missing: number[]; surplus: number[]; planned: boolean }> {
  const drawings = await readText(join(root, 'chapters', '08-drawings.md'))
  const declared = new Set<number>()
  if (drawings !== undefined) {
    for (const match of drawings.matchAll(FIGURE_DECLARATION)) declared.add(Number(match[1]))
  }
  const present = new Set<number>()
  const figuresDir = join(root, 'figures')
  if (await exists(figuresDir)) {
    for (const entry of await readdir(figuresDir, { withFileTypes: true })) {
      const match = FIGURE_FILE.exec(entry.name)
      if (entry.isFile() && match !== null) present.add(Number(match[1]))
    }
  }
  const missing = [...declared].filter(number => !present.has(number)).sort((a, b) => a - b)
  const surplus = [...present].filter(number => !declared.has(number)).sort((a, b) => a - b)
  return { missing, surplus, planned: declared.size > 0 }
}

/**
 * Whether the experiments stage is satisfied: a run log exists under any
 * experiment directory (official numbers recorded), or the project declared
 * experiments not applicable via `experiments/README.md`.
 * @param root - the project directory.
 * @returns the unmet experiments requirement, or undefined when satisfied.
 */
async function experimentsGap(root: string): Promise<string | undefined> {
  const experimentsDir = join(root, 'experiments')
  if (await exists(experimentsDir)) {
    for (const entry of await readdir(experimentsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && await exists(join(experimentsDir, entry.name, 'results', 'run-log.md'))) return undefined
    }
  }
  const readme = await readText(join(experimentsDir, 'README.md'))
  if (readme !== undefined && /无需实验|不适用/.test(readme)) return undefined
  return 'experiments/ 下既无任何 results/run-log.md（正式运行记录）也无"无需实验"声明'
}

/**
 * Whether the review stage is satisfied: at least one rubric report file in
 * review/.
 * @param root - the project directory.
 * @returns the unmet review requirement, or undefined when satisfied.
 */
async function reviewGap(root: string): Promise<string | undefined> {
  const reviewDir = join(root, 'review')
  if (!await exists(reviewDir)) return 'review/ 不存在——还没跑过确定性审查'
  const reports = (await readdir(reviewDir)).filter(name => name.endsWith('.review.md'))
  return reports.length === 0 ? 'review/ 下没有任何 *.review.md 审查报告' : undefined
}

/**
 * Whether the export stage is satisfied: a disclosure docx exists in exports/
 * and is not older than any source it projects (brief, chapters, figures).
 * @param root - the project directory.
 * @returns the unmet export requirement, or undefined when satisfied.
 */
async function exportGap(root: string): Promise<string | undefined> {
  const exportsDir = join(root, 'exports')
  if (!await exists(exportsDir)) return 'exports/ 不存在——交底书从未导出'
  const exported = (await readdir(exportsDir)).filter(name => name.endsWith('-交底书.docx'))
  if (exported.length === 0) return 'exports/ 下没有 *-交底书.docx'
  let newestSource = 0
  for (const dir of ['chapters', 'figures']) {
    const dirPath = join(root, dir)
    if (!await exists(dirPath)) continue
    for (const entry of await readdir(dirPath, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      newestSource = Math.max(newestSource, await mtimeOf(join(dirPath, entry.name)))
    }
  }
  newestSource = Math.max(newestSource, await mtimeOf(join(root, 'brief.md')))
  const latest = exported[exported.length - 1]
  if (latest === undefined) return 'exports/ 下没有 *-交底书.docx'
  const exportPath = join(exportsDir, latest)
  const exportTime = await mtimeOf(exportPath)
  if (exportTime < newestSource) return `导出物 ${latest} 早于源文件的最新修改（需要重新导出）`
  return undefined
}

/** Per-stage directive: what to do, which skills, and the hard disciplines. */
const STAGE_DIRECTIVES: Readonly<Record<Exclude<LoopStage, 'done'>, { directive: string; skills: string[]; mayNeedUser: boolean }>> = {
  init: {
    directive: '这是一个新项目起点。加载 patent-init 技能：先按其点子评估程序拆 2~3 个核心技术特征，用 search_cn_patents 检索现有专利并用 web_fetch 读最接近几篇的明细，形成三档结论（建议写/收窄后写/不建议写，附公开号证据）与用户对话定方向；用户确认后按建档约定建立 patent.yml + brief.md（开头是评估节）。'
      + '评估结论需要用户拍板——把判断和证据摆到桌面并直接提问，不要替用户决定。',
    skills: ['patent-init', 'patent-research'],
    mayNeedUser: true,
  },
  align: {
    directive: '五方对齐摘要未就绪。加载 patent-init 技能的访谈程序：一次聚焦一两个维度、用具体封闭的问题逐轮向用户提问；每轮把已收集内容传 patent_brief_coverage 检查，缺点维度按 patent-research 滚动查新校准。'
      + '访谈答案必须来自用户——把问题抛给用户并等待回答，禁止编造；ready=true 后向用户复述五方内容确认，再写定 brief.md。',
    skills: ['patent-init', 'patent-research'],
    mayNeedUser: true,
  },
  chapters: {
    directive: '章节未齐。加载 patent-chapters 技能，按 brief.md 撰写缺失章节；正文应用 patent-de-ai 与 patent-writing-quality，有益效果章应用 patent-effect-contrast；章节只保留正文，起草注释进会话或 review/。',
    skills: ['patent-chapters', 'patent-de-ai', 'patent-writing-quality', 'patent-effect-contrast'],
    mayNeedUser: false,
  },
  experiments: {
    directive: '有益效果章含量化数据，但 experiments/ 缺少正式运行记录。加载 patent-experiment 技能：公开数据集优先、无公开集按真实场景标定仿真；正式出数一律 run_experiment 工具（docker），进正文的结果数据必须配结果图（出图脚本入实验目录，黑白、中文标注、subagent 验收）。'
      + '确认本项目无需实验时，在 experiments/README.md 写明「无需实验：<理由>」后继续。',
    skills: ['patent-experiment'],
    mayNeedUser: false,
  },
  figures: {
    directive: '附图未齐。加载 patent-figure-design 技能：黑白极简、总图先行、图类形态互不混淆、图内无图号；源文件进 figures/source/，渲染后成品落 figures/ 根。'
      + '每张图渲染后必须派 subagent 用 read_image 按检查单验收（线不交叉不重叠不贴框、箭头正确、不压字），不合格改源重渲，通过才保留——自查不算验收。实验结果图经 patent-experiment 出图后定稿复制进 figures/ 根。',
    skills: ['patent-figure-design'],
    mayNeedUser: false,
  },
  review: {
    directive: '还没有审查报告。确认审查目标（项目目录用 "."）后直接调用 patent_review 工具跑确定性七维审查，报告写入 review/；自己不评分、不手写审查文件。按报告中必须修改项修订源文件后进入导出。',
    skills: ['patent-review'],
    mayNeedUser: false,
  },
  export: {
    directive: '交底书导出物缺失或已落后于源文件。加载 patent-services 技能：调 export_disclosure 重新导出（更新内容一律改源后重导，不手改 docx），核对返回的「内嵌附图 N 张」与 08 章声明条数一致；顺带把 patent.yml 的 status 推进到对应阶段（review）。',
    skills: ['patent-services'],
    mayNeedUser: false,
  },
}

/** The completed-stage directive: deliver, and stop looping. */
const DONE_DIRECTIVE = '项目已成稿：交底书导出物存在且不落后于源文件、附图齐全、审查报告在 review/。向用户交付导出物路径与要点摘要，结束循环；用户明确要求推进申请文件时才走 patent-claims 与 patent-application。'

/**
 * Run one assessment pass over a project directory and produce the loop
 * state: the first incomplete stage, the full pending roadmap, and the
 * current stage's directive. Every verdict is a disk fact — a stage the
 * model believes finished but whose artifacts are missing stays pending.
 * @param projectDir - the project directory (resolved against the caller).
 * @returns the loop state; `complete` is true only when every gate passes.
 */
export async function assessLoopState(projectDir: string): Promise<LoopState> {
  const root = resolve(projectDir)
  const manifest = await readManifest(root)
  const gaps: LoopGap[] = []
  const projectName = manifest?.name ?? basename(root)

  if (manifest === undefined) {
    gaps.push({ stage: 'init', detail: '无 patent.yml——项目未建档' })
  } else {
    const brief = await readText(join(root, 'brief.md'))
    if (brief === undefined) {
      gaps.push({ stage: 'align', detail: '缺 brief.md——五方对齐摘要未建档' })
    } else {
      for (const detail of missingBriefSections(brief)) gaps.push({ stage: 'align', detail })
    }
    for (const detail of await chapterGaps(root)) gaps.push({ stage: 'chapters', detail })
    const effect = await readText(join(root, 'chapters', '06-effect.md'))
    if (effect !== undefined && QUANTITATIVE.test(effect)) {
      const experiments = await experimentsGap(root)
      if (experiments !== undefined) gaps.push({ stage: 'experiments', detail: experiments })
    }
    const figures = await figureGaps(root)
    if (!figures.planned) {
      gaps.push({ stage: 'figures', detail: '08-drawings.md 未声明任何「图N 为…」——附图尚未规划' })
    }
    if (figures.missing.length > 0) {
      gaps.push({ stage: 'figures', detail: `声明了附图但 figures/ 根缺成品：图${figures.missing.join('、图')}（文件须命名 图N.png 或 图N-名称.png）` })
    }
    if (figures.surplus.length > 0) {
      gaps.push({ stage: 'figures', detail: `figures/ 根有未在 08 章声明的成品：图${figures.surplus.join('、图')}（补声明或移除）` })
    }
    const review = await reviewGap(root)
    if (review !== undefined) gaps.push({ stage: 'review', detail: review })
    const disclosure = await exportGap(root)
    if (disclosure !== undefined) gaps.push({ stage: 'export', detail: disclosure })
  }

  const stage: LoopStage = gaps[0]?.stage ?? 'done'
  const current = stage === 'done'
    ? { directive: DONE_DIRECTIVE, skills: [] as string[], mayNeedUser: false }
    : STAGE_DIRECTIVES[stage]
  return {
    projectRoot: root,
    projectName,
    hasProject: manifest !== undefined,
    stage,
    complete: stage === 'done',
    gaps,
    directive: current.directive,
    skills: current.skills,
    mayNeedUser: current.mayNeedUser,
  }
}
