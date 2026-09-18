import type { ReactNode } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectView } from './project-model.ts'
import css from './PatentBody.module.css'

type PatentBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'patent'>

/** One labelled section of the dashboard. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={css.section}>
      <div className={css.sectionTitle}>{title}</div>
      {children}
    </section>
  )
}

/**
 * Render the project overview: presence of the five-party artifacts, the eight
 * chapters' draft state, the review reports, and the figure sources. All data
 * comes from the session workspace through the injected face.
 * @param props - tab slot props plus the patent locale seat.
 * @returns the overview, or the not-a-project hint.
 */
export function ProjectOverview({ view, t }: { view: ProjectView; t: PatentBodyProps['t'] }): ReactNode {
  return (
    <div className={css.overview}>
      <Section title={t('panel.project')}>
        <div className={css.rows}>
          <div className={css.rowLine}>
            <StateDot state={view.brief ? 'done' : 'idle'} />
            <span>{t('panel.brief')}</span>
          </div>
          <div className={css.rowLine}>
            <StateDot state={view.projectStatus === 'application' ? 'done' : 'idle'} />
            <span>{t('panel.application')}</span>
            {view.application.claims || view.application.description || view.application.abstract ? (
              <span className={css.hint}>
                {[view.application.claims ? t('panel.claims') : null, view.application.description ? t('panel.description') : null, view.application.abstract ? t('panel.abstract') : null].filter(Boolean).join(' · ')}
              </span>
            ) : null}
          </div>
        </div>
      </Section>
      <Section title={`${t('panel.chapters')} ${view.drafted}/${view.total}`}>
        <div className={css.rows}>
          {view.chapters.length === 0 ? <span className={css.empty}>{t('panel.empty')}</span> : view.chapters.map(chapter => (
            <div key={chapter.name} className={css.rowLine}>
              <StateDot state={(chapter.size ?? 0) > 0 ? 'done' : 'idle'} />
              <span>{chapter.name}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title={t('panel.review')}>
        {view.review.length === 0 ? <span className={css.empty}>{t('panel.empty')}</span> : (
          <ul className={css.names}>
            {view.review.map(name => <li key={name}>{name}</li>)}
          </ul>
        )}
      </Section>
      <Section title={t('panel.figures')}>
        {view.figures.length === 0 ? <span className={css.empty}>{t('panel.empty')}</span> : (
          <ul className={css.names}>
            {view.figures.map(figure => (
              <li key={figure.name}>
                {figure.name}
                {figure.caption !== null ? <span className={css.hint}>{figure.caption}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
