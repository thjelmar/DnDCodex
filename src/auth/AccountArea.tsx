import { useEffect, useState } from 'react'
import { Modal } from '../components/Modal'
import { useAuth } from './AuthProvider'
import { useSync } from './SyncProvider'

/**
 * Sidebar account control. Hidden entirely until a Supabase backend is
 * configured (the app is local-first and works without an account). Once
 * configured, shows a sign-in entry or the signed-in user + sign-out.
 */
export function AccountArea() {
  const { configured, loading, user, profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)

  if (!configured || loading) return null

  if (user) {
    const meta = user.user_metadata ?? {}
    const name =
      profile?.display_name || meta.name || meta.full_name || meta.user_name || user.email || 'Signed in'
    const avatar = profile?.avatar_url || meta.avatar_url || null
    return (
      <div style={{ padding: '4px 8px' }}>
        <div className="row between" style={{ gap: 8, alignItems: 'center' }}>
          <span
            className="row"
            style={{ gap: 6, minWidth: 0, alignItems: 'center', fontSize: 12.5, color: 'var(--text-dim)' }}
            title={name}
          >
            {avatar ? (
              <img src={avatar} alt="" width={18} height={18} style={{ borderRadius: '50%', flexShrink: 0 }} />
            ) : (
              <span aria-hidden>👤</span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          </span>
          <button className="btn ghost small" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
        <SyncStatusLine />
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
