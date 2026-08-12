import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { exportSnapshot, importSnapshot } from '../db/repo'
import { downloadText, readFileAsText } from '../lib/download'
import { sessionsToICS } from '../lib/calendar'
import { todayISODate } from '../lib/format'
import { useConfirm } from '../components/ConfirmDialog'

export function BackupPage() {
  const confirm = useConfirm()
  const [toast, setToast] = useState<string | null>(null)
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('merge')
  const fileRef = useRef<HTMLInputElement>(null)

  const counts = useLiveQuery(async () => {
    const [campaigns, sessions, npcs, locations, items, notes, playerNotes, tables, images] = await Promise.all([
      db.campaigns.count(),
      db.sessions.count(),
      db.npcs.count(),
      db.locations.count(),
      db.items.count(),
      db.notes.count(),
      db.playerNotes.count(),
      db.rollTables.count(),
      db.images.count(),
    ])
    return { campaigns, sessions, npcs, locations, items, notes, playerNotes, tables, images }
  }, [])

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2600)
  }

  async function handleExport() {
    const snapshot = await exportSnapshot()
    downloadText(`dnd-codex-backup-${todayISODate()}.json`, JSON.stringify(snapshot, null, 2))
    flash('Backup downloaded.')
  }

  async function handleImportFile(file: File) {
    try {
      const text = await readFileAsText(file)
      const snapshot = JSON.parse(text)
      if (
        importMode === 'replace' &&
        !(await confirm({
          title: 'Replace all data?',
          message: 'This wipes everything currently stored and loads the backup instead. This cannot be undone.',
          confirmLabel: 'Replace',
          danger: true,
        }))
      ) {
        return
      }
      await importSnapshot(snapshot, importMode)
      flash(`Imported (${importMode}).`)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleCalendarExport() {
    const [sessions, campaigns] = await Promise.all([
      db.sessions.toArray(),
      db.campaigns.toArray(),
    ])
    if (sessions.length === 0) {
      flash('No sessions to export.')
      return
    }
    const byId = new Map(campaigns.map((c) => [c.id, c]))
    const ics = sessionsToICS(sessions, byId, new Date().toISOString())
    downloadText(`dnd-codex-sessions-${todayISODate()}.ics`, ics, 'text/calendar')
    flash('Calendar file downloaded.')
  }

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="mb-0">Backup &amp; Data</h1>
          <div className="subtitle">Your data lives in this browser. Back it up regularly.</div>
        </div>
      </div>

      {counts && (
        <div className="row wrap" style={{ gap: 8, marginBottom: 24 }}>
          <span className="tag">{counts.campaigns} campaigns</span>
          <span className="tag">{counts.sessions} sessions</span>
          <span className="tag">{counts.npcs} NPCs</span>
          <span className="tag">{counts.locations} locations</span>
          <span className="tag">{counts.items} items</span>
          <span className="tag">{counts.notes} world notes</span>
          <span className="tag">{counts.playerNotes} player notes</span>
          <span className="tag">{counts.tables} roll tables</span>
          <span className="tag">{counts.images} images</span>
        </div>
      )}

      <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
        <h3>Export backup</h3>
        <p className="muted">
          Download everything — including uploaded images — as a single JSON file. Keep it safe
          or commit it to your repo. (Images make the file larger.)
        </p>
        <button className="btn primary" onClick={handleExport}>
          💾 Download JSON backup
        </button>
      </div>

      <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
        <h3>Import backup</h3>
        <p className="muted">Restore from a JSON backup file.</p>
        <div className="field" style={{ maxWidth: 320 }}>
          <label>Import mode</label>
          <select className="select" value={importMode} onChange={(e) => setImportMode(e.target.value as 'replace' | 'merge')}>
            <option value="merge">Merge (add / update by id)</option>
            <option value="replace">Replace (wipe, then load)</option>
          </select>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleImportFile(f)
          }}
        />
        <button className="btn" onClick={() => fileRef.current?.click()}>
          📂 Choose backup file…
        </button>
      </div>

      <div className="card" style={{ cursor: 'default', marginBottom: 16 }}>
        <h3>Export sessions to calendar</h3>
        <p className="muted">
          Download an <code>.ics</code> file of all session dates, then import it into Google
          Calendar, Apple Calendar, or Outlook.
        </p>
        <button className="btn" onClick={handleCalendarExport}>
          📅 Download .ics calendar
        </button>
      </div>

      <div className="card" style={{ cursor: 'default', opacity: 0.7 }}>
        <h3>☁️ Google Drive sync <span className="tag">Coming soon</span></h3>
        <p className="muted mb-0">
          A later update will let you sync this backup to Google Drive so your notes follow you
          across devices.
        </p>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
