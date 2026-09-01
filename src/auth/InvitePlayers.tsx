import { useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import { enableCampaignSharing, getCampaignJoinCode } from './cloud'

/**
 * DM-side, compact control for the campaign header: register the campaign for
 * sharing and show the join code to hand out. Only appears when signed in
 * (sharing needs accounts).
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
    <span className="row" style={{ gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
      {code ? (
        <>
          <code
            title="Players enter this under “Join a campaign” to link their account."
            style={{
              fontSize: 14,
              letterSpacing: 2,
              fontFamily: 'monospace',
              background: 'var(--bg-elev-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 8px',
            }}
          >
            🔑 {code}
          </code>
          <button className="btn ghost small" onClick={copy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </>
      ) : (
        <button
          className="btn small"
          disabled={busy}
          onClick={invite}
          title="Generates a join code so players can link their accounts to this campaign."
        >
          {busy ? 'Enabling…' : '📣 Invite players'}
        </button>
      )}
      {error && (
        <span className="danger-text" title={error} aria-label={error}>
          ⚠️
        </span>
      )}
    </span>
  )
}
