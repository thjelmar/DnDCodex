import { Node, mergeAttributes } from '@tiptap/core'

// A typed, labeled note card: NPC, Place, Loot, Quest lead, Ask DM, or a plain
// Note, optionally stamped with the combat round it was written in (T-124).
// It is an ordinary block in the note's HTML (`<div data-note-card="loot">`), so
// it saves, syncs and renders through the same path as any other note text.

export const NOTE_CARD_TYPES = ['note', 'npc', 'place', 'loot', 'quest', 'ask'] as const
export type NoteCardType = (typeof NOTE_CARD_TYPES)[number]

export const NOTE_CARD_LABEL: Record<NoteCardType, string> = {
  note: 'Note',
  npc: 'NPC',
  place: 'Place',
  loot: 'Loot',
  quest: 'Quest lead',
  ask: 'Ask DM',
}

export function noteCardLabel(type: string, round?: number | null): string {
  const base = NOTE_CARD_LABEL[type as NoteCardType] ?? 'Note'
  return round ? `${base} · Round ${round}` : base
}

export const NoteCard = Node.create({
  name: 'noteCard',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'note',
        parseHTML: (el) => el.getAttribute('data-note-card') || 'note',
        renderHTML: () => ({}),
      },
      round: {
        default: null,
        parseHTML: (el) => {
          const n = Number(el.getAttribute('data-round'))
          return Number.isFinite(n) && n > 0 ? n : null
        },
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-note-card]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const type = (NOTE_CARD_TYPES as readonly string[]).includes(node.attrs.type) ? node.attrs.type : 'note'
    const round = node.attrs.round as number | null
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-note-card': type,
        ...(round ? { 'data-round': String(round) } : {}),
        'data-label': noteCardLabel(type, round),
        class: `note-card nc-${type}`,
      }),
      0,
    ]
  },
})
