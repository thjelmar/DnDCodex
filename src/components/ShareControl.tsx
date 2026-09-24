import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { pushEntity, unshareEntity, shareImageToCampaign, unshareImageFromCampaign } from '../auth/cloud'
import { setEntityShared } from '../db/repo'
import { db } from '../db/db'
import { revealEntity, revealHash, entityReveal, SECTIONS, type RevealedEntity, type ShareableKind } from '../lib/reveal'
import { makeThumbnail } from '../lib/image'
import { loadShareDefaults, saveShareDefaults } from '../lib/prefs'
import { Icon } from './Icon'
import type { Id, NPC, Location, Note, Session, Item } from '../db/types'

type Shareable = NPC | Location | Note | Session | Item

const KIND_PLURAL: Record<ShareableKind, string> = {
  npc: 'NPCs', location: 'locations', note: 'notes', session: 'sessions', item: 'items',
}

/**
 * Per-entity share control. Sharing opens a picker so the DM chooses exactly
 * which sections players see; publishing uploads a reveal-safe, spoiler-redacted
 * snapshot of only those sections (the explicit publish step). "Push changes"
 * appears only when the current reveal differs from what was last pushed, and
 * the section subset can be edited later without un-sharing.
 */
export function ShareControl({
  campaignId,
  kind,
  entity,
}: {
  campaignId: string
  kind: ShareableKind
  entity: Shareable
}) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [makeDefault, setMakeDefault] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!picker) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPicker(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setPicker(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [picker])

  if (!user) return null

  const shared = entity.sharedWithPlayers === true
  const currentHash = revealHash(entityReveal(kind, entity))
  const hasPending = shared && entity.sharedPushedHash !== currentHash

  // Portrait is shareable for kinds that carry an image (npc/location/item).
  const imageId = (entity as { imageId?: Id | null }).imageId ?? null
  const portraitId = (entity as { sharedPortraitId?: Id | null }).sharedPortraitId ?? null

  // Embed a small self-contained thumbnail into the portrait section for the
  // push copy only — the hashed reveal stays thumbnail-free (imageId only) so
  // pending detection keys off the image identity, not its bytes.
  async function injectThumb(snap: RevealedEntity): Promise<RevealedEntity> {
    const ps = snap.sections.find((s) => s.key === 'portrait')
    if (!ps?.imageId) return snap
    const img = await db.images.get(ps.imageId)
    if (!img) return snap
    try {
      const thumb = await makeThumbnail(img.dataUrl, 256)
      return {
        ...snap,
        sections: snap.sections.map((s) =>
          s.key === 'portrait'
            ? { ...s, image: { dataUrl: thumb.dataUrl, width: thumb.width, height: thumb.height, alt: snap.title } }
            : s,
        ),
      }
    } catch {
      return snap
    }
  }

  // Keep the player gallery (shared_images) in step with the Portrait section:
  // publish the full image while shared, retract a stale/old copy otherwise.
  // Returns the shared_images row id now in the gallery (or null).
  async function reconcilePortrait(keys: string[], caption: string): Promise<Id | null> {
    const wantPortrait = keys.includes('portrait') && !!imageId
    if (wantPortrait) {
      const img = await db.images.get(imageId!)
      if (img) {
        if (portraitId && portraitId !== imageId) await unshareImageFromCampaign(portraitId)
        await shareImageToCampaign(campaignId, {
          id: imageId!,
          dataUrl: img.dataUrl,
          caption,
          width: img.width,
          height: img.height,
        })
        return imageId
      }
    }
    if (portraitId) await unshareImageFromCampaign(portraitId)
    return null
  }

  // Which sections actually have content right now (for the "(empty)" hint).
  const present = new Set(revealEntity(kind, entity).sections.map((s) => s.key))
  const allSections = SECTIONS[kind]

  function openPicker() {
    setError(null)
    // Preselect: the entity's saved choice, else this kind's default, else all.
    const base =
      (shared && entity.sharedSections) ||
      loadShareDefaults(kind) ||
      allSections.map((s) => s.key)
    setSelected(new Set(base.filter((k) => allSections.some((s) => s.key === k))))
    setMakeDefault(false)
    setPicker(true)
  }

  async function confirm() {
    const keys = allSections.map((s) => s.key).filter((k) => selected.has(k))
    setBusy(true)
    setError(null)
    try {
      const snap = revealEntity(kind, entity, keys)
      const hash = revealHash(snap)
      await pushEntity(campaignId, entity.id, kind, await injectThumb(snap))
      const newPortraitId = await reconcilePortrait(keys, snap.title)
      await setEntityShared(kind, entity.id, {
        sharedWithPlayers: true,
        sharedSections: keys,
        sharedPushedHash: hash,
        sharedPortraitId: newPortraitId,
      })
      if (makeDefault) saveShareDefaults(kind, keys)
      setPicker(false)
    } catch {
      setError(
        shared
          ? 'Couldn’t update — check your connection.'
          : 'Couldn’t share — enable sync or invite players for this campaign first.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function pushChanges() {
    setBusy(true)
    setError(null)
    try {
      const keys = entity.sharedSections ?? allSections.map((s) => s.key)
      const snap = entityReveal(kind, entity)
      const hash = revealHash(snap)
      await pushEntity(campaignId, entity.id, kind, await injectThumb(snap))
      const newPortraitId = await reconcilePortrait(keys, snap.title)
      await setEntityShared(kind, entity.id, { sharedPushedHash: hash, sharedPortraitId: newPortraitId })
    } catch {
      setError('Couldn’t push — check your connection.')
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setBusy(true)
    setError(null)
    try {
      await unshareEntity(entity.id)
      if (portraitId) await unshareImageFromCampaign(portraitId)
      await setEntityShared(kind, entity.id, { sharedWithPlayers: false, sharedPortraitId: null })
    } catch {
      setError('Couldn’t stop sharing — check your connection.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="share-control" ref={ref} style={{ position: 'relative' }}>
      {!shared ? (
        <button className="btn small" disabled={busy} onClick={openPicker}>
          <Icon name="eye" size={14} /> Share with players
        </button>
      ) : (
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="share-on"><Icon name="eye" size={14} /> Shared with players</span>
          {hasPending ? (
            <button className="btn small primary" disabled={busy} onClick={pushChanges} title="Publish your latest changes to players">
              Push changes
            </button>
          ) : (
            <span className="faint" style={{ fontSize: 12 }}>up to date</span>
          )}
          <button className="btn ghost small" disabled={busy} onClick={openPicker} title="Choose which sections players see">
            <Icon name="eye" size={13} /> Sections
          </button>
          <button className="btn ghost small danger" disabled={busy} onClick={stop}>
            Stop sharing
          </button>
        </div>
      )}

      {picker && (
        <div className="pushchanges-pop share-picker">
          <div className="pushchanges-head">
            {shared ? 'Sections players can see' : 'Share with players'}
          </div>
          <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>
            Choose which sections to publish. Spoiler-marked text is always hidden.
          </div>
          <div className="pushchanges-list">
            {allSections.map((s) => (
              <label key={s.key} className="pushchanges-item">
                <input
                  type="checkbox"
                  checked={selected.has(s.key)}
                  onChange={(e) => {
                    const next = new Set(selected)
                    if (e.target.checked) next.add(s.key)
                    else next.delete(s.key)
                    setSelected(next)
                  }}
                />
                <span>{s.label}</span>
                {!present.has(s.key) && <span className="faint" style={{ fontSize: 11 }}>(empty)</span>}
              </label>
            ))}
          </div>
          <label className="pushchanges-item" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
            <span style={{ fontSize: 13 }}>Make these my default for {KIND_PLURAL[kind]}</span>
          </label>
          <div className="row between" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn ghost small" onClick={() => setPicker(false)}>Cancel</button>
            <button className="btn small primary" disabled={busy || selected.size === 0} onClick={confirm}>
              {busy ? 'Sharing…' : shared ? 'Save' : `Share ${selected.size} section${selected.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
      {error && (
        <span style={{ color: 'var(--danger)', fontSize: 12, marginLeft: 8 }}>{error}</span>
      )}
    </div>
  )
}
