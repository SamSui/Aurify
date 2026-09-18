/**
 * Stage one of the dashboard's registration: what the `patent-overview` tab
 * type is. The type is a page over the session workspace: it claims no
 * address, the body lists the project layout through the injected face.
 * @module
 */

import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'

/** This implementation's identity in the tab system, and the key its body registers under. */
export const PATENT_TAB_ID = '@mtl-academic/dsh-patent'

/**
 * The patent overview's registry definition.
 * @param t - namespace-bound translate, read fresh on every label call.
 * @returns the definition to register.
 */
export function patentTabDefinition(t: TranslateNS<'patent'>): SidebarRightTabDefinition {
  return {
    id: PATENT_TAB_ID,
    kind: 'patent-overview',
    priority: 'builtin',
    title: () => t('panel.title'),
    guide: [{
      id: 'project',
      order: 10,
      title: () => t('panel.title'),
      description: () => t('panel.guide'),
    }],
  }
}
