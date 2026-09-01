import { useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthProvider'
import { enableCampaignSharing, getCampaignJoinCode } from './cloud'

/**
 * DM-side control for the campaign header: a compact "Invite players" button that
 * opens a small popover to generate / show / copy the join code. Only appears
 * when signed in (sharing needs accounts).
 */
export function InvitePlayers({ campaign }: { campaign: { id: string; name: string } }) {
  const { configured, user } = useAuth()
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // If this campaign is already registered, know its code straight away.
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

  // Close the popover on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        className="btn small"
        onClick={() => setOpen((o) => !o)}
        title="Generate a join code so players can link their accounts to this campaign."
      >
        {code ? '🔑' : '📣'} Invite players
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 250,
            zIndex: 50,
            padding: 12,
            cursor: 'default',
            textAlign: 'left',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <div className="sidebar-heading" style={{ margin: '0 0 8px' }}>
            Invite players
          </div>
          {code ? (
            <>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
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
              </div>
              <p className="faint mb-0" style={{ fontSize: 12, marginTop: 8 }}>
                Players enter this under “Join a campaign” to link their account.
              </p>
            </>
          ) : (
            <>
              <p className="faint" style={{ fontSize: 12, marginTop: 0, marginBottom: 10 }}>
                Generate a join code so players can link their accounts to this campaign.
              </p>
              <button className="btn small primary" disabled={busy} onClick={invite}>
                {busy ? 'Generating…' : 'Generate join code'}
              </button>
            </>
          )}
          {error && (
            <div className="danger-text" style={{ fontSize: 12, marginTop: 8 }}>
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
