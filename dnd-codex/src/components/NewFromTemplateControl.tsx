import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { Icon } from './Icon'
import type { BuiltinTemplate } from '../data/builtinTemplates'
import type { TemplateKind } from '../db/types'

/**
 * The shared "New …" control (T-8 sessions, T-30 npc/location): a primary button
 * that creates a blank entity, plus a caret opening a menu of built-in and the
 * user's saved templates for this `kind`. Picking one calls `onFromTemplate` with
 * the template's pre-fill data. User templates sync via the global channel.
 */
export function NewFromTemplateControl({
  kind,
  builtins,
  blankLabel,
  onBlank,
  onFromTemplate,
  emptyHint,
}: {
  kind: TemplateKind
  builtins: BuiltinTemplate[]
  /** Label/content for the primary "create blank" button. */
  blankLabel: ReactNode
  onBlank: () => void
  onFromTemplate: (data: Record<string, unknown>) => void | Promise<void>
  /** Shown under "Your templates" when the user has none. */
  emptyHint: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const userTemplates = useLiveQuery(
    () => db.templates.where('kind').equals(kind).sortBy('label'),
    [kind],
  )

  // Close the menu on an outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function pick(data: Record<string, unknown>) {
    setOpen(false)
    await onFromTemplate(data)
  }

  return (
    <div ref={ref} className="new-template-wrap" style={{ marginBottom: 12 }}>
      <div className="row" style={{ gap: 0 }}>
        <button
          className="btn primary"
          style={{ flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
          onClick={onBlank}
        >
          <Icon name="plus" size={15} color="inherit" /> {blankLabel}
        </button>
        <button
          className="btn primary new-template-caret"
          aria-label="New from template"
          title="New from template"
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="chevron-right" size={13} color="inherit" className={`sidebar-caret${open ? ' open' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="new-template-menu">
          <div className="new-template-group">Built-in</div>
          {builtins.map((t) => (
            <button key={t.id} className="new-template-opt" onClick={() => pick(t.data)}>
              <span className="new-template-label">{t.label}</span>
              <span className="new-template-desc">{t.description}</span>
            </button>
          ))}
          <div className="new-template-group">Your templates</div>
          {userTemplates?.length === 0 && <div className="new-template-empty">{emptyHint}</div>}
          {userTemplates?.map((t) => (
            <button key={t.id} className="new-template-opt" onClick={() => pick(t.data)}>
              <span className="new-template-label">{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
