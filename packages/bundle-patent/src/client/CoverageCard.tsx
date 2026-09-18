import type { ReactNode } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { CORE_DIMENSIONS, DIMENSION_TITLES, coverageView } from './models.ts'
import css from './CoverageCard.module.css'

type CoverageCardProps = ToolCallViewProps & PropsLocale<'patent'>

/** One core dimension chip: filled when covered, outlined when missing. */
function dimensionChip(key: string, filled: boolean, t: CoverageCardProps['t']): ReactNode {
  const title = DIMENSION_TITLES[key] ?? key
  return (
    <span key={key} className={css.chip} data-filled={filled || undefined} title={filled ? undefined : t('coverage.notReady')}>
      {title}
    </span>
  )
}

/** Readiness and alignment badges for the settled card. */
function badges(view: ReturnType<typeof coverageView>, t: CoverageCardProps['t']): ReactNode {
  if (view.state === 'running') return <span className={css.badge} data-tone="running">{t('coverage.running')}</span>
  if (view.state === 'error') return <span className={css.badge} data-tone="error">{t('coverage.failed')}</span>
  if (view.state === 'stopped') return <span className={css.badge} data-tone="warning">{t('coverage.stopped')}</span>
  const ready = view.meta?.ready === true
  return (
    <>
      <span className={css.badge} data-tone={ready ? 'ok' : 'warning'}>
        {ready ? t('coverage.ready') : t('coverage.notReady')}
      </span>
      <span className={css.badge} data-tone={view.meta?.aligned ? 'ok' : 'error'}>
        {view.meta?.aligned === true ? t('coverage.aligned') : t('coverage.notAligned')}
      </span>
    </>
  )
}

/**
 * Render one `patent_brief_coverage` call as a readiness card: five dimension
 * chips, the three-way point counts, and the verdict. Settled cards prefer the
 * persisted presentation meta; sessions logged without it fall back to the
 * rendered text inside a disclosure.
 * @param props - keyed toolview payload plus the patent locale seat.
 * @returns the coverage card.
 */
export function CoverageCard({ block, t }: CoverageCardProps) {
  const view = coverageView(block)
  const meta = view.meta
  const counts = meta?.alignmentCounts
  return (
    <div className={css.card} data-tool="patent_brief_coverage" data-state={view.state}>
      <div className={css.row}>
        <StateDot state={view.state === 'ok' ? 'done' : view.state === 'running' ? 'ongoing' : view.state === 'stopped' ? 'warning' : 'error'} />
        <span className={css.title}>{t('coverage.title')}</span>
        <span className={css.spacer} aria-hidden />
        {badges(view, t)}
      </div>
      {view.state === 'running' && view.submitted.length > 0 ? (
        <div className={css.chips}>
          {view.submitted.map(key => (
            <span key={key} className={css.chip} data-filled>{DIMENSION_TITLES[key] ?? key}</span>
          ))}
        </div>
      ) : null}
      {meta !== null ? (
        <>
          <div className={css.chips}>
            {CORE_DIMENSIONS.map(key => dimensionChip(key, !meta.missing.includes(key), t))}
          </div>
          <div className={css.alignment}>
            <span className={css.alignmentLabel}>{t('coverage.alignment')}</span>
            <span className={css.counts}>
              <span className={css.count} data-zero={counts?.background === 0 || undefined}>{counts?.background ?? 0}</span>
              /
              <span className={css.count} data-zero={counts?.problem === 0 || undefined}>{counts?.problem ?? 0}</span>
              /
              <span className={css.count} data-zero={counts?.effect === 0 || undefined}>{counts?.effect ?? 0}</span>
            </span>
          </div>
        </>
      ) : null}
      {view.text !== null ? (
        <details className={css.raw}>
          <summary>{t('coverage.raw')}</summary>
          <pre>{view.text}</pre>
        </details>
      ) : null}
    </div>
  )
}
