import type { ReactNode } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { lintView } from './models.ts'
import css from './ClaimsLintCard.module.css'

type ClaimsLintCardProps = ToolCallViewProps & PropsLocale<'patent'>

/** Stat chip for one summary number; errors and warnings tint when non-zero. */
function stat(value: number, label: string, tone?: 'error' | 'warning'): ReactNode {
  return (
    <span className={css.stat} data-tone={tone !== undefined && value > 0 ? tone : undefined}>
      <span className={css.statValue}>{value}</span>
      {' '}
      {label}
    </span>
  )
}

/**
 * Render one `patent_claims_lint` call as a format-check card: the claim count
 * split, the violation list with rule chips, and the verdict. Settled cards
 * prefer the persisted presentation meta; sessions logged without it fall
 * back to parsing the rendered text, with the raw text in a disclosure.
 * @param props - keyed toolview payload plus the patent locale seat.
 * @returns the claims-lint card.
 */
export function ClaimsLintCard({ block, t }: ClaimsLintCardProps) {
  const view = lintView(block)
  const meta = view.meta
  const summary = meta?.summary
  return (
    <div className={css.card} data-tool="patent_claims_lint" data-state={view.state}>
      <div className={css.row}>
        <StateDot state={view.state === 'ok' ? (summary?.errors ?? 0) > 0 ? 'error' : 'done' : view.state === 'running' ? 'ongoing' : view.state === 'stopped' ? 'warning' : 'error'} />
        <span className={css.title}>{t('lint.title')}</span>
        <span className={css.spacer} aria-hidden />
        {view.state === 'running' ? <span className={css.badge} data-tone="running">{t('lint.running')}</span>
          : view.state === 'error' ? <span className={css.badge} data-tone="error">{t('lint.failed')}</span>
            : view.state === 'stopped' ? <span className={css.badge} data-tone="warning">{t('lint.stopped')}</span>
              : summary === undefined ? null
                : (
                  <span className={css.badge} data-tone={summary.errors > 0 ? 'error' : 'ok'}>
                    {summary.errors > 0 ? t('lint.fail') : t('lint.pass')}
                  </span>
                )}
      </div>
      {summary !== undefined ? (
        <div className={css.stats}>
          {stat(summary.total, t('lint.total'))}
          {stat(summary.independent, t('lint.independent'))}
          {stat(summary.dependent, t('lint.dependent'))}
          {stat(summary.errors, t('lint.errors'), 'error')}
          {stat(summary.warnings, t('lint.warnings'), 'warning')}
        </div>
      ) : null}
      {meta !== null && meta.violations.length > 0 ? (
        <div className={css.violations}>
          <div className={css.violationsTitle}>{t('lint.violations')}</div>
          <ul className={css.list}>
            {meta.violations.map((violation, index) => (
              <li key={index} className={css.violation} data-severity={violation.severity}>
                <span className={css.rule}>{violation.rule}</span>
                {violation.claim !== undefined ? <span className={css.claim}>#{violation.claim}</span> : null}
                <span className={css.message}>{violation.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.text !== null ? (
        <details className={css.raw}>
          <summary>{t('lint.raw')}</summary>
          <pre>{view.text}</pre>
        </details>
      ) : null}
    </div>
  )
}
