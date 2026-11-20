import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EditTemplateModal } from '../components/LibraryPublish'
import { Modal } from '../components/Modal'
import { useConfirm } from '../components/ConfirmDialog'
import { libraryAvailable, libraryObjectUrl } from '../lib/battleLibrary'
import { deleteTemplate, listManaged, setStatus, usePublisher, type LibraryStatus, type ManagedTemplate } from '../lib/libraryPublish'
import { formatBytes } from '../lib/image'

/** Tools → Battle map library → Manage: publishers edit, publish, archive and delete. */
export function BattleLibraryManagePage() {
  const publisher = usePublisher()
  const confirm = useConfirm()
  const [rows, setRows] = useState<ManagedTemplate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [edit, setEdit] = useState<ManagedTemplate | null>(null)
  const [preview, setPreview] = useState<ManagedTemplate | null>(null)

  const reload = useCallback(() => {
    listManaged().then(setRows).catch((e) => setError(e instanceof Error ? e.message : 'Could not load.'))
  }, [])
  useEffect(() => {
    if (publisher) reload()
  }, [publisher, reload])

  async function run(fn: () => Promise<void>) {
    setError(null)
    try {
      await fn()
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
    }
  }

  async function remove(t: ManagedTemplate) {
    const ok = await confirm({
      title: 'Delete this map?',
      message: `“${t.title}” and its images are removed from the library. Campaigns that already copied it keep their copy.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) run(() => deleteTemplate(t))
  }

  if (!libraryAvailable() || !publisher) {
    return (
      <div className="content">
        <div className="empty" data-testid="library-manage-denied">
          <div className="big">🗺️</div>
          <p>Only the site owner can manage the battle map library.</p>
          <Link to="/tools/battlemaps">Back to the library</Link>
        </div>
      </div>
    )
  }

  const statusBtn = (t: ManagedTemplate, status: LibraryStatus, label: string, primary = false) => (
    <button className={`btn small${primary ? ' primary' : ''}`} onClick={() => run(() => setStatus(t, status))}>
      {label}
    </button>
  )

  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="mb-0">Manage battle map library</h1>
          <div className="subtitle">
            Drafts are visible only to you. To add a map, open it on the Battle Map tab and choose{' '}
            <strong>Publish to library</strong>. Use the same action to add a new version of an existing map.
          </div>
        </div>
        <Link className="btn" to="/tools/battlemaps">View library</Link>
      </div>
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
      {rows === null && !error && <p className="faint">Loading…</p>}
      {rows?.length === 0 && <p className="faint">Nothing here yet.</p>}
      {rows?.map((t) => (
        <div key={t.id} className="library-manage-row" data-testid="manage-row">
          <img src={libraryObjectUrl(t.thumb_path)} alt="" loading="lazy" />
          <div className="library-manage-info">
            <strong>{t.title}</strong>
            <span className={`library-status ${t.status}`} data-testid="manage-status">{t.status}</span>
            <span className="faint" style={{ fontSize: 12 }}>
              v{t.version} · {t.cols} × {t.rows} squares · {formatBytes(t.bytes)}
            </span>
          </div>
          <div className="library-manage-actions">
            <button className="btn small" onClick={() => setPreview(t)}>Preview</button>
            <button className="btn small" onClick={() => setEdit(t)}>Edit</button>
            {t.status !== 'published' && statusBtn(t, 'published', 'Publish', true)}
            {t.status === 'published' && statusBtn(t, 'draft', 'Unpublish')}
            {t.status !== 'archived' && statusBtn(t, 'archived', 'Archive')}
            <button className="btn small destructive" onClick={() => remove(t)}>Delete</button>
          </div>
        </div>
      ))}
      {edit && (
        <EditTemplateModal
          template={edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null)
            reload()
          }}
        />
      )}
      {preview && (
        <Modal title={preview.title} onClose={() => setPreview(null)}>
          <div className="library-preview">
            <img src={libraryObjectUrl(preview.map_path)} alt={`Full size ${preview.title}`} />
            <p>{preview.description}</p>
            <p className="faint" style={{ fontSize: 13 }}>
              {preview.credit && <>Art: {preview.credit}. </>}
              {preview.license_note}
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
