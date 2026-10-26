import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth, type OAuthProvider } from '../auth/AuthProvider'
import { previewCampaignByCode, joinCampaignByCode, type CampaignPreview } from '../auth/cloud'
import { findOrCreateLinkedPlayerCampaign } from '../db/repo'
import { Icon } from '../components/Icon'
import { PENDING_JOIN_KEY } from '../lib/prefs'

/**
 * Landing page for a shared invite link (dndcodex…/#/join/<CODE>). Signed out,
 * it invites the visitor to sign in (remembering the code across the OAuth
 * round-trip). Signed in, it previews the campaign and DM so they can confirm
 * before linking their account — no join happens until they press the button.
 */
export function JoinLandingPage() {
  const { code = '' } = useParams()
  const navigate = useNavigate()
  const { configured, loading, user, signIn } = useAuth()

  const [preview, setPreview] = useState<CampaignPreview | null>(null)
  const [previewState, setPreviewState] = useState<'loading' | 'ready' | 'invalid' | 'error'>('loading')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  // Once signed in, look up the campaign + DM behind the code to confirm.
  useEffect(() => {
    if (!user || !code) return
    let cancelled = false
    setPreviewState('loading')
    previewCampaignByCode(code)
      .then((p) => {
        if (cancelled) return
        if (!p) setPreviewState('invalid')
        else {
          setPreview(p)
          setPreviewState('ready')
        }
      })
      .catch(() => !cancelled && setPreviewState('error'))
    return () => {
      cancelled = true
    }
  }, [user, code])

  function startSignIn(provider: OAuthProvider) {
    // Remember the invite so we can resume it after the provider round-trip.
    try {
      localStorage.setItem(PENDING_JOIN_KEY, code)
    } catch {
      /* storage blocked — they'll just land on the app root after sign-in */
    }
    signIn(provider)
  }

  async function join() {
    setJoining(true)
    setJoinError('')
    try {
      const { campaignId, name } = await joinCampaignByCode(code)
      const local = await findOrCreateLinkedPlayerCampaign(campaignId, name)
      try {
        localStorage.removeItem(PENDING_JOIN_KEY)
      } catch {
        /* ignore */
      }
      navigate(`/player/${local.id}`)
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Could not join the campaign.')
      setJoining(false)
    }
  }

  const card = (children: React.ReactNode) => (
    <div className="content" style={{ maxWidth: 440 }}>
      <div className="card" style={{ padding: 24, marginTop: 40 }}>
        {children}
      </div>
    </div>
  )

  if (!configured) {
    return card(
      <>
        <h2 style={{ marginTop: 0 }}>Invites aren’t available</h2>
        <p className="faint" style={{ marginBottom: 0 }}>
          This copy of D&amp;D Codex isn’t set up for shared campaigns.
        </p>
      </>,
    )
  }

  if (loading) {
    return card(<p className="faint" style={{ margin: 0 }}>Loading…</p>)
  }

  // Signed out: invite them to sign in, then resume this invite on return.
  if (!user) {
    return card(
      <>
        <div style={{ fontSize: 30, marginBottom: 6 }}>⚔️</div>
        <h2 style={{ marginTop: 0 }}>You’re invited to a campaign</h2>
        <p className="faint">
          Sign in or create an account to join. Your campaign will appear in your Player list, and
          anything your DM shares lands there.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          <button
            className="btn"
            style={{ background: '#5865F2', color: '#fff', borderColor: '#5865F2' }}
            onClick={() => startSignIn('discord')}
          >
            Continue with Discord
          </button>
          <button className="btn" onClick={() => startSignIn('google')}>
            Continue with Google
          </button>
        </div>
      </>,
    )
  }

  // Signed in: preview the campaign + DM and confirm before joining.
  if (previewState === 'loading') {
    return card(<p className="faint" style={{ margin: 0 }}>Looking up the invite…</p>)
  }
  if (previewState === 'invalid') {
    return card(
      <>
        <h2 style={{ marginTop: 0 }}>This invite isn’t valid</h2>
        <p className="faint">
          The link may be mistyped or the DM may have generated a new code. Ask them for a fresh
          invite link.
        </p>
        <Link className="btn" to="/">Go to your campaigns</Link>
      </>,
    )
  }
  if (previewState === 'error') {
    return card(
      <>
        <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
        <p className="faint">Couldn’t look up that invite. Check your connection and try again.</p>
        <Link className="btn" to="/">Go to your campaigns</Link>
      </>,
    )
  }

  return card(
    <>
      <div className="sidebar-heading" style={{ margin: '0 0 6px' }}>Join a campaign</div>
      <h2 style={{ marginTop: 0, marginBottom: 6 }}>{preview?.name}</h2>
      <p className="faint" style={{ marginTop: 0 }}>
        Run by <strong style={{ color: 'var(--text-dim)' }}>{preview?.dmName}</strong>. Make sure
        this is the campaign you meant to join before linking your account.
      </p>
      <div className="row" style={{ gap: 10, marginTop: 18 }}>
        <button className="btn primary" disabled={joining} onClick={join}>
          {joining ? 'Joining…' : <><Icon name="check" size={14} color="inherit" /> Join campaign</>}
        </button>
        <button className="btn ghost" disabled={joining} onClick={() => navigate('/')}>
          Cancel
        </button>
      </div>
      {joinError && <div className="danger-text" style={{ fontSize: 13, marginTop: 10 }}>{joinError}</div>}
    </>,
  )
}
