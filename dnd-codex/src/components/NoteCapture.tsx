import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NOTE_CARD_LABEL, type NoteCardType } from '../editor/NoteCard'

// Quick capture for the live session Notes tab (T-124): one line that adds a typed,
// labeled card to the top of the session note. A leading character picks the type
// (@ NPC, # place, ! loot, + quest lead, ? ask the DM); the chips pick it too.
// The card goes through the editor, so it saves with the note like any typed text.

const PREFIX: Record<string, NoteCardType> = { '@': 'npc', '#': 'place', '!': 'loot', '+': 'quest', '?': 'ask' }
const CHIPS: { type: NoteCardType; label: string }[] = [
  { type: 'npc', label: '＋ NPC' },
  { type: 'place', label: '＋ Place' },
  { type: 'loot', label: '＋ Loot' },
  { type: 'quest', label: '＋ Quest lead' },
  { type: 'ask', label: '？ Ask DM' },
]

/** Split "!frost-rune key" into its type and text; a chip's type is the fallback. */
export function parseCapture(raw: string, chip: NoteCardType | null): { type: NoteCardType; text: string } {
  const t = raw.trim()
  const byPrefix = PREFIX[t.charAt(0)]
  if (byPrefix) return { type: byPrefix, text: t.slice(1).trim() }
  return { type: chip ?? 'note', text: t }
}

export function NoteCapture({ editor, round }: { editor: Editor | null; round?: number | null }) {
  const [text, setText] = useState('')
  const [chip, setChip] = useState<NoteCardType | null>(null)
  const { type, text: body } = parseCapture(text, chip)
  const canAdd = !!editor && !editor.isDestroyed && body.length > 0

  function add() {
    if (!canAdd || !editor) return
    editor
      .chain()
      .insertContentAt(0, {
        type: 'noteCard',
        attrs: { type, round: round ?? null },
        content: [{ type: 'text', text: body }],
      })
      .run()
    setText('')
  }

  return (
    <div className="note-capture" data-testid="note-capture">
      <div className="nc-row">
        <input
          className="input nc-input"
          data-testid="capture-input"
          value={text}
          disabled={!editor}
          placeholder="Jot a note, or start with @ # ! + ?"
          aria-label="Quick note"
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button type="button" className="btn primary small" data-testid="capture-add" disabled={!canAdd} onClick={add}>
          Add
        </button>
      </div>
      <div className="nc-chips" role="group" aria-label="Note type">
        {CHIPS.map((c) => (
          <button
            key={c.type}
            type="button"
            className={`nc-chip nc-${c.type}${chip === c.type ? ' on' : ''}`}
            data-testid={`capture-chip-${c.type}`}
            aria-pressed={chip === c.type}
            onClick={() => setChip((cur) => (cur === c.type ? null : c.type))}
          >
            {c.label}
          </button>
        ))}
      </div>
      {body.length > 0 && type !== 'note' && (
        <div className="faint" style={{ fontSize: 12 }}>Adds as {NOTE_CARD_LABEL[type]}{round ? ` · Round ${round}` : ''}</div>
      )}
    </div>
  )
}
