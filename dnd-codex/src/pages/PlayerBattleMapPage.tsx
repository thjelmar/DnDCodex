import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAuth } from '../auth/AuthProvider'
import { getLiveScene, liveTokensForBoard, moveMyToken, useLiveScene } from '../auth/liveScene'
import { getMyColor, setMyColor } from '../auth/cloud'
import { useFullscreen } from '../lib/useFullscreen'
import { TOKEN_COLORS } from '../lib/tabletop'
import { PlayerJournalPanel } from './PlayerJournalPanel'
import { supabase } from '../lib/supabase'
import { Tabletop } from '../components/Tabletop'
import { Icon } from '../components/Icon'

// The player's live battle map: whatever map the DM is showing right now,
// updated live. Players pan/zoom their own view, drag only the token the DM
// assigned them (green dashed ring), pick the color their tokens wear, and can
// go full screen with their own Session Journal beside the map.

export function PlayerBattleMapPage() {
  const { campaignId } = useParams()
  const campaign = useLiveQuery(
    async () => (campaignId ? ((await db.campaigns.get(campaignId)) ?? null) : null),
    [campaignId],
  )
  const { user } = useAuth()
  const linked = campaign?.linkedCampaignId ?? null
  const live = useLiveScene(linked)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fs = useFullscreen()
  const [notesOpen, setNotesOpen] = useState(true)

  // My color (per campaign). Applied to my tokens right away so picking feels
  // instant; the DM's screen re-pushes it to everyone else a moment later.
  const [myColor, setMyColorState] = useState<string | null>(null)
  useEffect(() => {
    if (!linked || !user) return
    let cancelled = false
    getMyColor(linked, user.id).then((c) => {
      if (!cancelled) setMyColorState(c)
    })
    return () => {
      cancelled = true
    }
  }, [linked, user])
  async function pickColor(c: string) {
    if (!linked) return
    const prev = myColor
    setMyColorState(c)
    setError(null)
    try {
      await setMyColor(linked, c)
    } catch (e) {
      setMyColorState(prev)
      setError(e instanceof Error ? e.message : 'Could not save your color.')
    }
  }

  const ownIds = useMemo(
    () => new Set(live.tokens.filter((t) => user && t.controlledBy === user.id).map((t) => t.id)),
    [live.tokens, user],
  )
  const board = useMemo(() => {
    const b = liveTokensForBoard(live.tokens)
    if (!myColor) return b
    return { ...b, tokens: b.tokens.map((t) => (ownIds.has(t.id) ? { ...t, color: myColor } : t)) }
  }, [live.tokens, myColor, ownIds])

  if (campaign === undefined) return <div className="content faint">Loading…</div>
  if (!campaign || !campaign.linkedCampaignId) {
    return (
      <div className="content">
        <div className="empty">
          <div className="big">🗺️</div>
          <p>This campaign isn't linked to a DM yet, so there's no battle map to show.</p>
          <Link className="btn" to={campaignId ? `/player/${campaignId}` : '/'}>← Back</Link>
        </div>
      </div>
    )
  }

  async function move(id: string, col: number, row: number) {
    const prev = live.tokens
    setError(null)
    // Optimistic: move now, roll back if the server refuses.
    live.setTokens((ts) => ts.map((t) => (t.id === id ? { ...t, col, row } : t)))
    try {
      await moveMyToken(id, col, row)
    } catch (e) {
      live.setTokens(prev)
      setError(e instanceof Error ? e.message : 'Could not move that token.')
    }
  }

  const showing = !!user && !live.loading && !!live.scene

  return (
    <div className={`content player-battlemap battlemap-editor${fs.expanded ? ' expanded' : ''}`}>
      <div className="row between" style={{ marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <h1 className="mb-0">
          <span aria-hidden style={{ marginRight: 8 }}>🗺️</span>
          {live.scene ? live.scene.name : 'Battle Map'}
          {live.scene && <span className="battlemap-live-pill"><span className="battlemap-live-dot" aria-hidden /> Live</span>}
        </h1>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {user && (
            <div className="battlemap-mycolor" role="radiogroup" aria-label="Your token color" title="The color your tokens wear on everyone's map">
              <span className="faint">Your color</span>
              {TOKEN_COLORS.map((c) => (
                <button
                  key={c}
                  className={`battlemap-swatch${myColor === c ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => pickColor(c)}
                  aria-label={`Color ${c}`}
                  aria-checked={myColor === c}
                  role="radio"
                />
              ))}
              <input
                type="color"
                className="battlemap-color-custom"
                value={myColor && !TOKEN_COLORS.includes(myColor) ? myColor : '#ffffff'}
                onChange={(e) => pickColor(e.target.value)}
                aria-label="Custom color"
                title="Pick any color"
              />
            </div>
          )}
          {showing && fs.expanded && (
            <button className={`btn small${notesOpen ? ' primary' : ''}`} onClick={() => setNotesOpen((o) => !o)}>
              📓 {notesOpen ? 'Hide journal' : 'Journal'}
            </button>
          )}
          {showing && (
            <button className={`btn small${fs.expanded ? ' primary' : ''}`} onClick={fs.expanded ? fs.exit : fs.enter}>
              <Icon name={fs.expanded ? 'minimize' : 'maximize'} size={14} color={fs.expanded ? 'inherit' : undefined} />{' '}
              {fs.expanded ? 'Exit full screen' : 'Full screen'}
            </button>
          )}
          {!fs.expanded && (
            <Link to={`/player/${campaign.id}`} className="btn ghost small">
              <Icon name="arrow-left" size={14} /> {campaign.name}
            </Link>
          )}
        </div>
      </div>

      {!user ? (
        <p className="faint">Sign in to see your DM's battle map.</p>
      ) : live.loading ? (
        <p className="faint">Loading…</p>
      ) : !live.scene ? (
        <div className="empty">
          <div className="big">🗺️</div>
          <p>Your DM isn't showing a battle map right now. When they do, it appears here live.</p>
        </div>
      ) : (
        <>
          {!fs.expanded && (
            <p className="faint" style={{ fontSize: 13, margin: '0 0 8px' }}>
              {ownIds.size > 0
                ? 'Drag your token (green ring) to move it. Scroll to zoom, drag the map to pan.'
                : 'Scroll to zoom, drag to pan. Your DM moves the tokens.'}
            </p>
          )}
          {error && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</p>}
          <div className={`battlemap-body player${fs.expanded && notesOpen ? ' with-notes' : ''}`}>
            {fs.expanded && notesOpen && <PlayerJournalPanel campaignId={campaign.id} />}
            <Tabletop
              width={live.scene.width}
              height={live.scene.height}
              grid={live.scene.grid}
              tokens={board.tokens}
              mapUrl={live.mapUrl}
              portraits={board.portraits}
              selectedId={selected}
              onSelect={setSelected}
              onMoveToken={move}
              onResizeToken={() => {}}
              onDeleteToken={() => {}}
              onOpenToken={() => {}}
              aligning={false}
              onAlign={() => {}}
              editable={false}
              canMoveToken={(t) => ownIds.has(t.id)}
              ownIds={ownIds}
            />
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Player-home entry point: a card that appears while the DM is showing a map.
 * Watches only the scene row (not tokens or the map image) to stay light.
 */
export function LiveMapLink({ campaignId, linkedCampaignId }: { campaignId: string; linkedCampaignId: string }) {
  const { session } = useAuth()
  const token = session?.access_token ?? null
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase || !token) return
    let cancelled = false
    const load = () =>
      getLiveScene(linkedCampaignId).then((s) => {
        if (!cancelled) setName(s ? s.name || 'Battle Map' : null)
      })
    load()
    const channel = supabase
      .channel(`live-scene-card-${linkedCampaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_scenes', filter: `campaign_id=eq.${linkedCampaignId}` }, load)
      .subscribe()
    return () => {
      cancelled = true
      supabase!.removeChannel(channel)
    }
  }, [linkedCampaignId, token])

  // Only while the DM is showing a map (the player home stays uncluttered).
  if (!name) return null
  return (
    <Link to={`/player/${campaignId}/battlemap`} className="battlemap-card live">
      <span className="battlemap-card-icon" aria-hidden>🗺️</span>
      <span className="battlemap-card-text">
        <strong>Battle Map</strong>
        <span className="faint">Your DM is showing “{name}”, live</span>
      </span>
      <span className="battlemap-live-pill"><span className="battlemap-live-dot" aria-hidden /> Live</span>
    </Link>
  )
}
