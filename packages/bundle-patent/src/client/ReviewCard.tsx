import type { ReactNode } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { reviewView } from './models.ts'
import css from './ReviewCard.module.css'

type ReviewCardProps = ToolCallViewProps & PropsLocale<'patent'>

/** One dimension row: title, weight, the score bar, and the failed-pass marker. */
function dimensionRow(
  dimension: NonNullable<NonNullable<ReturnType<typeof reviewView>['meta']>['dimensions']>[number],
): ReactNode {
  const average = dimension.average
  return (
    <div key={dimension.key} className={css.dimension} data-failed={average === null || undefined}>
      <span className={css.dimensionTitle}>{dimension.title}</span>
      <span className={css.dimensionWeight}>{Math.round(dimension.weight * 100)}%</span>
      <span className={css.bar} aria-hidden>
        <span className={css.fill} style={{ width: `${average ?? 0}%` }} data-tone={average === null ? 'none' : average >= 70 ? 'ok' : average >= 50 ? 'warn' : 'bad'} />
      </span>
      <span className={css.score} data-none={average === null || undefined}>{average ?? '—'}</span>
      {dimension.failedPasses > 0 ? <span className={css.failed}>×{dimension.failedPasses}</span> : null}
    </div>
  )
}

/**
 * Render one `patent_review` call as a rubric card: the overall score, one
 * bar per rubric dimension (with failed-pass markers), and the report path.
 * Settled cards prefer the persisted presentation meta; sessions logged
 * without it fall back to the summary text inside a disclosure.
 * @param props - keyed toolview payload plus the patent locale seat.
 * @returns the review card.
 */
export function ReviewCard({ block, t }: ReviewCardProps) {
  const view = reviewView(block)
  const meta = view.meta
  const overall = meta?.overall
  const dimensions = meta?.dimensions ?? []
  const tone = view.state === 'ok' ? (overall === undefined ? 'warn' : overall >= 70 ? 'ok' : overall >= 50 ? 'warn' : 'bad') : view.state === 'running' ? 'ongoing' : view.state === 'stopped' ? 'warning' : 'error'
  return (
    <div className={css.card} data-tool="patent_review" data-state={view.state}>
      <div className={css.row}>
        <StateDot state={view.state === 'ok' ? 'done' : view.state === 'running' ? 'ongoing' : view.state === 'stopped' ? 'warning' : 'error'} />
        <span className={css.title}>{t('review.title')}</span>
        {view.state === 'running' && view.target !== null ? <span className={css.target}>{view.target}</span> : null}
        <span className={css.spacer} aria-hidden />
        {view.state === 'running' ? <span className={css.badge} data-tone="running">{t('review.running')}</span> : null}
        {overall !== undefined ? <span className={css.overall} data-tone={tone}>{overall}</span> : null}
      </div>
      {dimensions.length > 0 ? (
        <div className={css.dimensions}>
          {dimensions.map(dimension => dimensionRow(dimension))}
        </div>
      ) : null}
      {meta?.report !== undefined && meta.report !== '' ? (
        <div className={css.report}>{t('review.report')}<code>{meta.report}</code></div>
      ) : null}
      {view.text !== null ? (
        <details className={css.raw}>
          <summary>{t('review.raw')}</summary>
          <pre>{view.text}</pre>
        </details>
      ) : null}
    </div>
  )
}
