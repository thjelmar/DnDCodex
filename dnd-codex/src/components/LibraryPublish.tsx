import { useEffect, useId, useState } from 'react'
import { db } from '../db/db'
import type { Scene } from '../db/types'
import {
  OWNER_CREDIT,
  OWNER_LICENSE,
  listManaged,
  publishNew,
  republish,
  updateMeta,
  type ManagedTemplate,
  type TemplateMeta,
} from '../lib/libraryPublish'
import { Modal } from './Modal'

// Publisher-only forms: "Publish to library" (from a battle map) and "Edit details"
// (from the Manage list). Both share the same fields and the credit rules.

interface FormState {
  title: string
  description: string
  tags: string
  madeByMe: boolean
  credit: string
  creditUrl: string
  license: string
}

function initial(meta?: TemplateMeta, fallbackTitle = ''): FormState {
  if (!meta) {
    return {
      title: fallbackTitle,
      description: '',
      tags: '',
      madeByMe: true,
      credit: OWNER_CREDIT,
      creditUrl: '',
      license: OWNER_LICENSE,
    }
  }
  return {
    title: meta.title,
    description: meta.description,
    tags: meta.tags.join(', '),
    madeByMe: meta.credit === OWNER_CREDIT || (!meta.credit && meta.license_note === OWNER_LICENSE),
    credit: meta.credit,
    creditUrl: meta.credit_url ?? '',
    license: meta.license_note,
  }
}

function parseTags(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const t = part.trim().toLowerCase().slice(0, 30)
    if (t) seen.add(t)
  }
  return [...seen].slice(0, 12)
}

/** Returns the metadata to save, or a message saying what is missing. */
function validate(f: FormState): { meta: TemplateMeta } | { error: string } {
  const title = f.title.trim()
  if (!title) return { error: 'Add a title.' }
  if (title.length > 80) return { error: 'Keep the title to 80 characters.' }
  if (f.description.length > 600) return { error: 'Keep the description to 600 characters.' }
  const credit = f.credit.trim()
  const license = f.license.trim()
  if (!f.madeByMe && (!credit || !license)) {
    return { error: 'For art you did not make, add a credit line and a licence note.' }
  }
  const url = f.creditUrl.trim()
  if (url && !/^https?:\/\//i.test(url)) return { error: 'The credit link must start with http:// or https://.' }
  return {
    meta: {
      title,
      description: f.description.trim(),
      tags: parseTags(f.tags),
      credit,
      credit_url: url || null,
      license_note: license,
    },
  }
}

function Fields({ f, set }: { f: FormState; set: (patch: Partial<FormState>) => void }) {
  const uid = useId()
  return (
    <>
      <div className="field">
        <label htmlFor={`${uid}-title`}>Title</label>
        <input id={`${uid}-title`} className="input" value={f.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-desc`}>Description</label>
        <textarea id={`${uid}-desc`} className="textarea"
          rows={3}
          maxLength={600}
          value={f.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-tags`}>Tags (comma separated)</label>
        <input id={`${uid}-tags`} className="input" value={f.tags} placeholder="cave, dungeon, indoor" onChange={(e) => set({ tags: e.target.value })} />
      </div>
      <label className="library-check">
        <input
          type="checkbox"
          checked={f.madeByMe}
          onChange={(e) => {
            const on = e.target.checked
            // Fill the owner defaults when switching on; clear them when switching off,
            // so third-party art always starts with an empty credit and licence.
            set(
              on
                ? {
                    madeByMe: true,
                    credit: f.credit.trim() ? f.credit : OWNER_CREDIT,
                    license: f.license.trim() ? f.license : OWNER_LICENSE,
                  }
                : {
                    madeByMe: false,
                    credit: f.credit === OWNER_CREDIT ? '' : f.credit,
                    license: f.license === OWNER_LICENSE ? '' : f.license,
                  },
            )
          }}
        />
        <span>I made this map myself</span>
      </label>
      <div className="field">
        <label htmlFor={`${uid}-credit`}>Credit line {f.madeByMe ? '(optional)' : '(required)'}</label>
        <input id={`${uid}-credit`} className="input"
          value={f.credit}
          maxLength={200}
          placeholder={f.madeByMe ? '' : 'Artist or pack name'}
          onChange={(e) => set({ credit: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-url`}>Credit link (optional)</label>
        <input id={`${uid}-url`} className="input" value={f.creditUrl} placeholder="https://" onChange={(e) => set({ creditUrl: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-license`}>Licence note {f.madeByMe ? '' : '(required)'}</label>
        <input id={`${uid}-license`} className="input"
          value={f.license}
          maxLength={300}
          placeholder={f.madeByMe ? '' : 'For example: CC BY 4.0, or used with the artist’s permission'}
          onChange={(e) => set({ license: e.target.value })}
        />
      </div>
    </>
  )
}

/** Publish the open battle map as a new template or a new version, saved as a draft. */
export function PublishToLibraryModal({
  scene,
  onClose,
  onDone,
}: {
  scene: Scene
  onClose: () => void
  onDone: (t: ManagedTemplate, wasNewVersion: boolean) => void
}) {
  const [f, setF] = useState<FormState>(() => initial(undefined, scene.name))
  const [rights, setRights] = useState(false)
  const [existing, setExisting] = useState<ManagedTemplate[]>([])
  // '' = new template; otherwise the id to add a new version to.
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<FormState>) => setF((p) => ({ ...p, ...patch }))

  useEffect(() => {
    listManaged().then(setExisting).catch(() => setExisting([]))
  }, [])

  function pickTarget(id: string) {
    setTarget(id)
    const t = existing.find((x) => x.id === id)
    setF(initial(t ? t : undefined, scene.name))
  }

  async function submit() {
    setError(null)
    if (!rights) return setError('Confirm that you own this map or have permission to share its art.')
    const v = validate(f)
    if ('error' in v) return setError(v.error)
    setBusy(true)
    try {
      const img = scene.imageId ? await db.images.get(scene.imageId) : undefined
      if (!img?.dataUrl) throw new Error('This map has no image on this device yet. Open it once and try again.')
      const geo = { width: scene.width, height: scene.height, grid: scene.grid }
      const prev = existing.find((x) => x.id === target)
      const t = prev ? await republish(prev, geo, img.dataUrl, v.meta) : await publishNew(geo, img.dataUrl, v.meta)
      onDone(t, !!prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish this map.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Publish to library"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy} data-testid="publish-submit">
            {busy ? 'Uploading…' : target ? 'Save new version' : 'Save as draft'}
          </button>
        </>
      }
    >
      <p className="faint" style={{ fontSize: 13, marginTop: 0 }}>
        This saves a <strong>draft</strong>, visible only to you. Publish it from{' '}
        <strong>Manage</strong> when you're ready. The grid comes from this map's current settings.
      </p>
      {existing.length > 0 && (
        <div className="field">
        <label htmlFor="publish-target">Save as</label>
          <select id="publish-target" className="select" value={target} onChange={(e) => pickTarget(e.target.value)} data-testid="publish-target">
            <option value="">A new template</option>
            {existing.map((t) => (
              <option key={t.id} value={t.id}>New version of: {t.title} (v{t.version})</option>
            ))}
          </select>
      </div>
      )}
      <Fields f={f} set={set} />
      <label className="library-check">
        <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} data-testid="publish-rights" />
        <span>I own this map or have permission to share its art.</span>
      </label>
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
    </Modal>
  )
}

/** Edit a template's text details (not its image). */
export function EditTemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template: ManagedTemplate
  onClose: () => void
  onSaved: () => void
}) {
  const [f, setF] = useState<FormState>(() => initial(template))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<FormState>) => setF((p) => ({ ...p, ...patch }))

  async function save() {
    setError(null)
    const v = validate(f)
    if ('error' in v) return setError(v.error)
    setBusy(true)
    try {
      await updateMeta(template.id, v.meta)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Edit details"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <Fields f={f} set={set} />
      {error && <p role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
    </Modal>
  )
}
