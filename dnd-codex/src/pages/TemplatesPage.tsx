import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { renameTemplate, deleteTemplate } from '../db/repo'
import { useConfirm } from '../components/ConfirmDialog'
import { ALL_BUILTIN_TEMPLATES } from '../data/builtinTemplates'
import type { Template } from '../db/types'

/**
 * Tools → Templates (T-8). Manages the user's own saved entity templates
 * (rename / delete) and lists the read-only built-ins for reference. Templates
 * are global and sync across the account.
 */
export function TemplatesPage() {
  const userTemplates = useLiveQuery(
    () => db.templates.toArray().then((ts) => ts.sort((a, b) => a.label.localeCompare(b.label))),
    [],
  )

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="mb-0">Templates</h1>
          <div className="subtitle">
            Reusable starting points for new sessions, NPCs, and locations. Create one from any entity
            with “Save as template”; they sync across your devices.
          </div>
        </div>
      </div>

      <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
        <h3>Your templates</h3>
        {userTemplates && userTemplates.length === 0 && (
          <p className="muted mb-0">
            You haven't saved any yet. Open a session, NPC, or location, then use{' '}
            <strong>Save as template</strong> to make one.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {userTemplates?.map((t) => (
            <UserTemplateRow key={t.id} template={t} />
          ))}
        </div>
      </div>

      <div className="card" style={{ cursor: 'default' }}>
        <h3>Built-in</h3>
        <p className="muted">
          These ship with the app and can't be edited. Pick them from the “New …” menu on each page.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ALL_BUILTIN_TEMPLATES.map((t) => (
            <div key={t.id} className="list-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <div className="title">
                {t.label} <span className="tag" style={{ marginLeft: 6 }}>{t.kind}</span>
              </div>
              <div className="sub">{t.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function UserTemplateRow({ template }: { template: Template }) {
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(template.label)

  async function commit() {
    const next = label.trim()
    if (next && next !== template.label) await renameTemplate(template.id, next)
    else setLabel(template.label)
    setEditing(false)
  }

  return (
    <div className="list-row" style={{ alignItems: 'center', gap: 8 }}>
      {editing ? (
        <input
          className="input"
          value={label}
          maxLength={60}
          autoFocus
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setLabel(template.label)
              setEditing(false)
            }
          }}
          onBlur={commit}
          style={{ flex: 1 }}
        />
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title">{template.label}</div>
          <div className="sub">{template.kind}</div>
        </div>
      )}
      {!editing && (
        <button className="btn ghost small" onClick={() => setEditing(true)}>
          Rename
        </button>
      )}
      <button
        className="btn danger small"
        onClick={async () => {
          if (
            await confirm({
              title: 'Delete template?',
              message: (
                <>
                  Delete <strong>{template.label}</strong>? This can't be undone.
                </>
              ),
              confirmLabel: 'Delete',
              danger: true,
            })
          ) {
            await deleteTemplate(template.id)
          }
        }}
      >
        Delete
      </button>
    </div>
  )
}
