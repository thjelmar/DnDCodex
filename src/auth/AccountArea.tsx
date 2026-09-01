import { useEffect, useRef, useState } from 'react'
import { Modal } from '../components/Modal'
import { useAuth } from './AuthProvider'
import { useSync } from './SyncProvider'
import { AvatarCropper } from './AvatarCropper'

/**
 * Sidebar account control. Hidden entirely until a Supabase backend is
 * configured (the app is local-first and works without an account). Once
 * configured, shows a sign-in entry or the signed-in user + sign-out.
 */
export function AccountArea() {
  const { configured, loading, user, profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  if (!configured || loading) return null

  if (user) {
    const meta = user.user_metadata ?? {}
    const name =
      profile?.display_name || meta.name || meta.full_name || meta.user_name || user.email || 'Signed in'
    const avatar = profile?.avatar_url || meta.avatar_url || null
    return (
      <div style={{ padding: '4px 8px' }}>
        <div className="row between" style={{ gap: 8, alignItems: 'center' }}>
          <button
            className="row"
            onClick={() => setEditing(true)}
            title="Edit profile"
            style={{
              gap: 6,
              minWidth: 0,
              alignItems: 'center',
              fontSize: 12.5,
              color: 'var(--text-dim)',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {avatar ? (
              <img src={avatar} alt="" width={18} height={18} style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
            ) : (
              <span aria-hidden>👤</span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            <span aria-hidden style={{ opacity: 0.6 }}>✎</span>
          </button>
          <button className="btn ghost small" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
        <SyncStatusLine />
        {editing && <ProfileModal onClose={() => setEditing(false)} />}
      </div>
    )
  }

  return (
    <>
      <button
        className="nav-link"
        style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
        onClick={() => setOpen(true)}
      >
        <span className="ico">👤</span> Sign in
      </button>
      {open && <SignInModal onClose={() => setOpen(false)} />}
    </>
  )
}

/** Edit-profile modal: change display name and avatar. */
function ProfileModal({ onClose }: { onClose: () => void }) {
  const { user, profile, updateProfile } = useAuth()
  const meta = user?.user_metadata ?? {}
  const [name, setName] = useState(profile?.display_name || meta.name || meta.full_name || '')
  // undefined = unchanged; string = new avatar; null = reset to default.
  const [avatarDraft, setAvatarDraft] = useState<string | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cropFile, setCropFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // The OAuth-provided picture is the default we revert to on "Remove".
  const defaultAvatar = (meta.avatar_url as string) || null
  const currentAvatar = profile?.avatar_url || defaultAvatar
  const shownAvatar = avatarDraft === undefined ? currentAvatar : (avatarDraft ?? defaultAvatar)
  const canRemove = avatarDraft ? true : avatarDraft === null ? false : Boolean(profile?.avatar_url)

  function pickFile(files: FileList | null) {
    const file = files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image.')
      return
    }
    setError('')
    setCropFile(file) // open the crop-and-adjust step
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const patch: { display_name?: string; avatar_url?: string | null } = {}
      const trimmed = name.trim()
      if (trimmed && trimmed !== profile?.display_name) patch.display_name = trimmed
      if (avatarDraft !== undefined) patch.avatar_url = avatarDraft
      if (Object.keys(patch).length) await updateProfile(patch)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.')
      setBusy(false)
    }
  }

  // Crop-and-adjust step, shown after a photo is picked.
  if (cropFile) {
    return (
      <Modal title="Adjust photo" onClose={() => setCropFile(null)}>
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={(url) => {
            setAvatarDraft(url)
            setCropFile(null)
          }}
        />
      </Modal>
    )
  }

  return (
    <Modal
      title="Edit profile"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => pickFile(e.target.files)}
      />
      <div className="row" style={{ gap: 14, alignItems: 'center', marginBottom: 16 }}>
        {shownAvatar ? (
          <img
            src={shownAvatar}
            alt=""
            width={56}
            height={56}
            style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              background: 'var(--bg-elev-2)',
              border: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            👤
          </span>
        )}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn small" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? '…' : shownAvatar ? 'Change photo' : 'Upload photo'}
          </button>
          {canRemove && (
            <button className="btn ghost small" disabled={busy} onClick={() => setAvatarDraft(null)}>
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="field">
        <label>Display name</label>
        <input
          className="input"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
      </div>
      <p className="faint" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
        This is how your DM and party see you in shares and member lists.
      </p>
      {error && <div className="danger-text" style={{ fontSize: 13, marginTop: 10 }}>{error}</div>}
    </Modal>
  )
}

/** A compact "cloud sync" status line shown under the signed-in user. */
function SyncStatusLine() {
  const { status } = useSync()
  // Re-render every 30s so the "last synced" relative time stays fresh.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  let icon = '☁️'
  let text: string
  let color = 'var(--text-dim)'
  if (status.error) {
    icon = '⚠️'
    text = 'Sync error — will retry'
    color = 'var(--danger, #dc2626)'
  } else if (status.syncing) {
    text = 'Syncing…'
  } else if (status.campaigns === 0) {
    text = 'No campaigns synced yet'
  } else {
    const n = status.campaigns
    text = `Synced ${n} campaign${n === 1 ? '' : 's'}${status.lastSyncedAt ? ' • ' + relTime(status.lastSyncedAt) : ''}`
  }

  return (
    <div
      className="row"
      style={{ gap: 6, alignItems: 'center', fontSize: 11.5, color, padding: '2px 2px 0', minWidth: 0 }}
      title={status.error ?? undefined}
    >
      <span aria-hidden>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
    </div>
  )
}

/** Small relative-time formatter ("just now", "3m ago", "2h ago"). */
function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function SignInModal({ onClose }: { onClose: () => void }) {
  const { signIn } = useAuth()
  return (
    <Modal
      title="Sign in"
      onClose={onClose}
      footer={
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
      }
    >
      <p className="faint" style={{ marginTop: 0 }}>
        Sign in to sync your campaigns across devices and share directly with your group. Your local
        notes stay put either way.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          className="btn"
          style={{ background: '#5865F2', color: '#fff', borderColor: '#5865F2' }}
          onClick={() => signIn('discord')}
        >
          Continue with Discord
        </button>
        <button className="btn" onClick={() => signIn('google')}>
          Continue with Google
        </button>
      </div>
    </Modal>
  )
}
