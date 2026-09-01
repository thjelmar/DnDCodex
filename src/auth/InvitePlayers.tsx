import { useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import { enableCampaignSharing, getCampaignJoinCode } from './cloud'

/**
 * DM-side, on the campaign overview: register the campaign for sharing and show
 * the join code to hand out. Only appears when signed in (sharing needs
 * accounts). Nothing here syncs campaign content yet — just the invite link.
 */
export function InvitePlayers({ campaign }: { campaign: { id: string; name: string } }) {
  const { configured, user } = useAuth()
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  // If this campaign is already registered, show its code straight away.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getCampaignJoinCode(campaign.id)
      .then((c) => !cancelled && setCode(c))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [campaign.id, user])

  if (!configured || !user) return null

  async function invite() {
    setBusy(true)
    setError('')
    try {
      setCode(await enableCampaignSharing(campaign, user!.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not enable sharing.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div className="sidebar-heading" style={{ margin: '0 0 8px' }}>Players</div>
      {code ? (
        <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
          <span className="faint" style={{ fontSize: 13 }}>Join code:</span>
          <code
            style={{
              fontSize: 18,
              letterSpacing: 3,
              fontFamily: 'monospace',
              background: 'var(--bg-elev-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 12px',
            }}
          >
            {code}
          </code>
          <button className="btn ghost small" onClick={copy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <span className="faint" style={{ fontSize: 12 }}>
            Share this with your players — they enter it under “Join a campaign”.
          </span>
        </div>
      ) : (
        <div className="row" style={{ gap: 10, alignItems: 'center' }}>
          <button className="btn small" disabled={busy} onClick={invite}>
            {busy ? 'Enabling…' : '📣 Invite players'}
          </button>
          <span className="faint" style={{ fontSize: 12 }}>
            Generates a join code so players can link their accounts to this campaign.
          </span>
        </div>
      )}
      {error && <div className="danger-text" style={{ fontSize: 13, marginTop: 6 }}>{error}</div>}
    </div>
  )
}
