import type { TemplateKind } from '../db/types'

// Built-in templates (T-8, option C). These ship in code — they are NOT stored
// in Dexie and never sync; they just seed a new entity's fields when picked from
// the "New from template" menu, alongside the user's own saved templates. Ids
// are stable strings (prefixed `builtin-`) so they never collide with the uuid
// ids of user templates.

export interface BuiltinTemplate {
  id: string
  kind: TemplateKind
  label: string
  /** One-line hint shown under the label in the menu / manager. */
  description: string
  /** Fields pre-filled into the new entity (same shape as a user template's data). */
  data: Record<string, unknown>
}

// The session `notes` field is rich-text HTML (the WYSIWYG editor's format), so
// these skeletons are authored as HTML headings + lists.
export const BUILTIN_SESSION_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'builtin-session-prep',
    kind: 'session',
    label: 'Session Prep',
    description: 'A running-session skeleton: recap, scenes, encounters, loot, hooks.',
    data: {
      tags: ['prep'],
      notes:
        '<h3>Recap</h3><p>Where we left off…</p>' +
        '<h3>Scenes &amp; Beats</h3><ul><li></li><li></li></ul>' +
        '<h3>Encounters</h3><ul><li></li></ul>' +
        '<h3>NPCs &amp; Locations in play</h3><ul><li></li></ul>' +
        '<h3>Loot &amp; Rewards</h3><ul><li></li></ul>' +
        '<h3>Hooks / Next time</h3><ul><li></li></ul>',
    },
  },
  {
    id: 'builtin-one-shot',
    kind: 'session',
    label: 'One-Shot',
    description: 'A self-contained adventure: pitch, hook, three acts, climax, rewards.',
    data: {
      tags: ['one-shot'],
      notes:
        '<h3>Pitch</h3><p>The one-line premise…</p>' +
        '<h3>Hook</h3><p>How the party gets involved…</p>' +
        '<h3>Act 1 — Setup</h3><ul><li></li></ul>' +
        '<h3>Act 2 — Complication</h3><ul><li></li></ul>' +
        '<h3>Act 3 — Climax</h3><ul><li></li></ul>' +
        '<h3>Rewards</h3><ul><li></li></ul>',
    },
  },
  {
    id: 'builtin-downtime',
    kind: 'session',
    label: 'Downtime',
    description: 'Between-adventures activities, events, shopping, and carousing.',
    data: {
      tags: ['downtime'],
      notes:
        '<h3>Downtime Activities</h3><ul><li></li></ul>' +
        '<h3>Events &amp; Complications</h3><ul><li></li></ul>' +
        '<h3>Shopping &amp; Crafting</h3><ul><li></li></ul>' +
        '<h3>Carousing / Rumors</h3><ul><li></li></ul>',
    },
  },
]
