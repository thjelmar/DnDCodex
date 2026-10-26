import { useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthProvider'
import { enableCampaignSharing, getCampaignJoinCode, getCampaignMembers, type Member } from './cloud'
import { Icon } from '../components/Icon'
import { relativeTime, formatDate } from '../lib/format'

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
        <Icon name="key" size={14} /> Invite players
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: 272,
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
                  {copied ? <><Icon name="check" size={13} /> Copied</> : <><Icon name="copy" size={13} /> Copy</>}
                </button>
              </div>
              <p className="faint mb-0" style={{ fontSize: 12, marginTop: 8 }}>
                Players enter this under “Join a campaign” to link their account.
              </p>
              <MemberList campaignId={campaign.id} />
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

/**
 * The roster of players who've linked their account to this campaign, newest
 * last, each with when they joined — so the DM can see who's in and chase anyone
 * who was invited but hasn't joined yet. Fetched each time the popover opens, so
 * it reflects the current roster. The DM's own 'dm' membership is left out; this
 * is the players' list.
 */
function MemberList({ campaignId }: { campaignId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCampaignMembers(campaignId)
      .then((m) => !cancelled && setMembers(m))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [campaignId])

  const players = (members ?? [])
    .filter((m) => m.role !== 'dm')
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
      <div className="sidebar-heading" style={{ margin: '0 0 8px' }}>
        Players{players.length ? ` (${players.length})` : ''}
      </div>
      {failed ? (
        <p className="faint mb-0" style={{ fontSize: 12 }}>Couldn’t load the player list.</p>
      ) : members === null ? (
        <p className="faint mb-0" style={{ fontSize: 12 }}>Loading…</p>
      ) : players.length === 0 ? (
        <p className="faint mb-0" style={{ fontSize: 12 }}>No players have joined yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
          {players.map((m) => (
            <div key={m.userId} className="row" style={{ gap: 8, alignItems: 'center', minWidth: 0 }}>
              {m.avatarUrl ? (
                <img
                  src={m.avatarUrl}
                  alt=""
                  width={22}
                  height={22}
                  style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <span aria-hidden style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--text-faint)' }}>
                  <Icon name="user" size={18} />
                </span>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.displayName}
                </div>
                {m.joinedAt && (
                  <div className="faint" style={{ fontSize: 11 }} title={formatDate(m.joinedAt)}>
                    Joined {relativeTime(m.joinedAt)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
