import { describe, expect, it } from 'vitest'
import { ALIGN_TOLERANCE, computeCoverage, countPoints } from '../src/coverage.ts'

describe('countPoints', () => {
  it('counts blank content as zero points', () => {
    expect(countPoints(undefined)).toBe(0)
    expect(countPoints('')).toBe(0)
    expect(countPoints('   ')).toBe(0)
  })

  it('counts unstructured prose as one point', () => {
    expect(countPoints('现有方案在动态场景下过于静态。')).toBe(1)
  })

  it('counts circled and arabic enumeration markers', () => {
    expect(countPoints('① 提高命中率；② 改善一致性')).toBe(2)
    expect(countPoints('1. 第一点\n2. 第二点\n3. 第三点')).toBe(3)
    expect(countPoints('(1) 甲 (2) 乙')).toBe(2)
    expect(countPoints('一、概述；二、细节')).toBeGreaterThanOrEqual(2)
  })

  it('counts semicolon and newline separated points', () => {
    expect(countPoints('降低延迟；降低成本；提升扩展性')).toBe(3)
    expect(countPoints('降低延迟\n降低成本')).toBe(2)
  })

  it('takes the larger of the two split strategies', () => {
    // Two numbered points, but the sentence content also splits on one
    // semicolon into three prose fragments — the larger count wins.
    expect(countPoints('① 提高命中；从而降低抖动；并改善一致性')).toBe(3)
  })
})

describe('computeCoverage', () => {
  it('reports an empty outline as fully missing and vacuously aligned', () => {
    const coverage = computeCoverage({})
    expect(coverage.covered).toEqual([])
    expect(coverage.missing).toEqual(['field', 'background', 'problem', 'solution', 'effect'])
    expect(coverage.ready).toBe(false)
    expect(coverage.coreFilled).toEqual({ done: 0, total: 5 })
    expect(coverage.aligned).toBe(true)
    expect(coverage.alignmentCounts).toEqual({ background: 0, problem: 0, effect: 0 })
  })

  it('ignores blank-whitespace-only content', () => {
    const coverage = computeCoverage({ field: '  \n  ', solution: '方案' })
    expect(coverage.covered).toEqual(['solution'])
    expect(coverage.missing).toEqual(['field', 'background', 'problem', 'effect'])
  })

  it('is not ready while any core dimension is missing', () => {
    const coverage = computeCoverage({
      field: '数据存储领域',
      background: '现有方案过慢',
      problem: '① 提速',
      solution: '新索引结构',
      // effect missing
    })
    expect(coverage.coreFilled).toEqual({ done: 4, total: 5 })
    expect(coverage.missing).toEqual(['effect'])
    expect(coverage.ready).toBe(false)
  })

  it('is ready when all core dimensions are covered and aligned', () => {
    const coverage = computeCoverage({
      field: '数据存储领域',
      background: '① 现有方案过慢；② 空间浪费',
      problem: '① 提速；② 省空间',
      solution: '新索引结构，组件 A 对应问题①，组件 B 对应问题②',
      effect: '① 命中率提升；② 空间减半',
    })
    expect(coverage.ready).toBe(true)
    expect(coverage.aligned).toBe(true)
    expect(coverage.alignmentCounts).toEqual({ background: 2, problem: 2, effect: 2 })
  })

  it('rejects readiness when the alignment spread exceeds the tolerance', () => {
    const coverage = computeCoverage({
      field: '领域',
      background: '① 缺点一；② 缺点二；③ 缺点三；④ 缺点四',
      problem: '① 问题一',
      solution: '方案',
      effect: '① 效果一',
    })
    expect(coverage.aligned).toBe(false)
    expect(coverage.ready).toBe(false)
    expect(coverage.covered.length).toBe(5)
  })

  it('skips the alignment verdict while an alignment dimension is uncollected', () => {
    const coverage = computeCoverage({
      field: '领域',
      background: '① 缺点一；② 缺点二；③ 缺点三；④ 缺点四',
      problem: '① 问题一',
      solution: '方案',
      // effect uncollected: spread is meaningless yet
    })
    expect(coverage.aligned).toBe(true)
    expect(coverage.ready).toBe(false)
    expect(ALIGN_TOLERANCE).toBe(1)
  })

  it('accepts an edge dimension without affecting readiness', () => {
    const coverage = computeCoverage({
      name: '一种存储装置',
      field: '领域', background: '缺点', problem: '问题', solution: '方案', effect: '效果',
      drawings: '图1：总览',
    })
    expect(coverage.ready).toBe(true)
  })
})
