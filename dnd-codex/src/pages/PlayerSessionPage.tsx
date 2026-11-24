import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BmIcon } from '../components/battlemap/BmIcon'
import { isDemo } from '../lib/demo'
import { usePanelPlacement, useMapClearRight } from '../lib/usePanelPlacement'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createPlayerNote, updatePlayerNote } from '../db/repo'
import { RichTextEditor } from '../components/RichTextEditor'
import { NotesSaveStatus, type SaveState } from '../components/NotesSaveStatus'
import { getDraft, onDraft, setDraft } from '../lib/noteDrafts'
import { PlayerSessionDock, myActiveRows, useMyTurnAlert, type DockTab } from '../components/PlayerSessionDock'
import { PlayerLiveBoardView } from '../components/PlayerLiveBoard'
import { useLiveScene } from '../auth/liveScene'
import { Icon } from '../components/Icon'
import { JoinVoiceButton } from '../components/JoinVoiceButton'
import { VoiceRoster } from '../components/VoiceRoster'
import { parseDiscordChannelLink } from '../lib/discord'
import { useLiveSession } from '../lib/useLiveSession'
import { useLiveCombat } from '../auth/liveCombat'
import { useAuth } from '../auth/AuthProvider'
import { PlayerTurnStrip } from '../components/PlayerTurnStrip'
import { formatDate } from '../lib/format'
import { DemoLiveControls } from '../components/DemoLiveControls'

/**
 * The player's live-session workspace. Reachable only while the DM has a live
 * session running (Run mode → "Start live session"): shows the handouts the DM
 * is currently sharing, a notes area that writes to a Journal entry for this
 * session (so it also feeds the player's Journal + "Story So Far"), and the
 * DM's live battle map in the Tabletop (see PlayerLiveBoardView); its full
 * screen puts these same session notes beside the map.
 */
export function PlayerSessionPage() {
  const { campaignId = '' } = useParams()
  // `?? null` so a missing campaign reads as "not found", not "still loading".
  const campaign = useLiveQuery(async () => (await db.campaigns.get(campaignId)) ?? null, [campaignId])
  const live = useLiveSession(campaign?.linkedCampaignId)
  const sessionRef = live ? live.sessionId ?? 'live' : null
  // While the Tabletop is full screen, its notes panel owns the notes editor.
  const [mapFull, setMapFull] = useState(false)
  // The DM's live battle map (one subscription for the page, so the board can
  // move between columns without re-subscribing).
  const liveMap = useLiveScene(campaign?.linkedCampaignId)
  const mapLive = !!liveMap.scene
  // The shared initiative order and the player's own characters in it (T-100).
  const liveCombat = useLiveCombat(campaign?.linkedCampaignId)
  const { user } = useAuth()
  // The docked panel opens on Initiative (it has its own empty state), until the player picks.
  const [pickedTab, setPickedTab] = useState<DockTab | null>(null)
  const myTurnRows = myActiveRows(liveCombat.combat, user?.id ?? null)
  useMyTurnAlert(myTurnRows)
  // Where the panel sits (docked, floating, own window, closed), shared by the page and full screen (T-112).
  const place = usePanelPlacement()
  const mapRef = useRef<HTMLElement>(null)
  useMapClearRight(mapRef, place.mode === 'float')

  // Find the Journal entry for this live session (by sessionRef), if any.
  const noteId = useLiveQuery(async () => {
    if (!sessionRef) return null
    const n = await db.playerNotes
      .where('campaignId')
      .equals(campaignId)
      .filter((x) => x.section === 'journal' && x.sessionRef === sessionRef)
      .first()
    return n?.id ?? null
  }, [campaignId, sessionRef])

  // No note is created just for joining — the session note is created lazily the
  // moment the player actually writes something (see SessionNotes), so joining a
  // session never leaves an empty "Session" journal entry behind.

  if (campaign === undefined) return <div className="content faint">Loading…</div>
  if (!campaign) {
    return (
      <div className="content">
        <SessionEmpty campaignId={campaignId} message="That campaign doesn’t exist in this browser." />
      </div>
    )
  }

  if (!campaign.linkedCampaignId) {
    return (
      <div className="content">
        <SessionEmpty campaignId={campaignId} message="This campaign isn’t linked to a shared world, so there’s no live session to join." />
      </div>
    )
  }

  if (!live) {
    return (
      <div className="content">
        <SessionEmpty campaignId={campaignId} message="Your DM hasn’t started a live session right now. When they do, you’ll be able to join from your campaign home." />
      </div>
    )
  }

  const linkedId = campaign.linkedCampaignId
  // Title a new note after the session (the DM's session title, else its date) —
  // never the bare word "Session".
  const noteTitle = live.title || (live.sessionDate ? formatDate(live.sessionDate) : 'Session notes')
  const notesEditor =
    noteId === undefined ? (
      <p className="faint" style={{ fontSize: 13 }}>Preparing your notes…</p>
    ) : (
      <SessionNotes
        key={sessionRef ?? 'none'}
        initialNoteId={noteId}
        campaignId={campaignId}
        sessionRef={sessionRef!}
        defaultTitle={noteTitle}
        date={live.sessionDate || undefined}
      />
    )
  const notesCard = (
    <>
      <div className="run-col-heading"><Icon name="pencil" size={15} /> My session notes</div>
      {notesEditor}
      <p className="faint" style={{ fontSize: 12, marginTop: 8 }}>Saved to your Journal and the “Story So Far” recap.</p>
    </>
  )
  // The same player UI the page shows, built once so full screen can host it too.
  const stripEl = (
    <PlayerTurnStrip combat={liveCombat.combat} cloudCampaignId={linkedId} localCampaignId={campaignId} userId={user?.id ?? null} />
  )
  const dockEl = (
    <PlayerSessionDock
      tab={pickedTab ?? 'initiative'}
      onTab={setPickedTab}
      combat={liveCombat.combat}
      cloudCampaignId={linkedId}
      localCampaignId={campaignId}
      userId={user?.id ?? null}
      notes={notesCard}
      place={place}
    />
  )
  const board = (compact: boolean) => (
    <PlayerLiveBoardView
      live={liveMap}
      linkedCampaignId={linkedId}
      compact={compact}
      rail={!compact}
      onExpandedChange={setMapFull}
      fsExtras={{ strip: stripEl, demo: <DemoLiveControls />, panel: dockEl, place }}
      pagePanel={{ open: place.visible, onToggle: place.toggle }}
      empty={
        <div className="session-vtt-slot">
          <Icon name="map" size={28} strokeWidth={1.3} />
          <p className="faint" style={{ fontSize: 13, margin: '8px 0 0' }}>Your DM’s battle map appears here when they show one.</p>
        </div>
      }
    />
  )

  // The DM's voice channel, forwarded on the live session as "guildId/channelId".
  const voice = parseDiscordChannelLink(live.discordVoice ?? '')

  return (
    <div className="session-page">
      <div className="session-header">
        <Link
          to={isDemo() ? '/' : `/player/${campaignId}`}
          className="bm-btn bm-sq"
          aria-label="Leave the session"
          title={isDemo() ? 'Leave the session and go back to Home' : 'Leave the session and go back to the campaign'}
          data-testid="session-back"
        >
          <BmIcon name="back" />
        </Link>
        <span aria-hidden className="run-dot" style={{ background: campaign.color }} />
        <h1 className="mb-0 run-title">{live.title || 'Session'}</h1>
        <span className="run-live-on"><span className="run-live-dot" /> Live</span>
        {live.sessionDate && <span className="faint" style={{ fontSize: 13 }}>{formatDate(live.sessionDate)}</span>}
        {liveCombat.combat?.phase === 'active' && (
          <span className="pl-round" data-testid="top-round"><span className="pl-pulse" aria-hidden /> Round {liveCombat.combat.round}</span>
        )}
        <div style={{ flex: 1 }} />
        <JoinVoiceButton channel={voice} />
        {!mapFull && <DemoLiveControls />}
      </div>

      <VoiceRoster channelId={voice?.channelId} />

      <div className={`session-grid${mapLive ? ' map-live' : ''}${place.mode === 'docked' ? '' : ' no-dock'}`}>
        <section className="session-map" ref={mapRef}>
          {mapLive ? (
            <div className="card run-card session-vtt"><div className="pl-map-wrap">{board(false)}{!mapFull && stripEl}</div></div>
          ) : (
            <div className="card run-card session-vtt">
              <div className="run-col-heading"><Icon name="map" size={15} /> Tabletop</div>
              <div className="pl-map-wrap">{board(true)}{!mapFull && stripEl}</div>
            </div>
          )}
          {!mapFull && place.mode !== 'docked' && dockEl}
        </section>

        {!mapFull && place.mode === 'docked' && dockEl}
      </div>
    </div>
  )
}

/** True if rich-text HTML holds anything real (text or an image), not just
 *  empty paragraphs — so we never create/keep a blank session note. */
function hasContent(html: string): boolean {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0 || /<img/i.test(html)
}

/**
 * The session notes editor. The Journal note is created LAZILY — only once the
 * player actually writes something — so joining a session never leaves a blank
 * "Session" entry behind. Bound to any existing note (a re-join) via `initialNoteId`.
 */
function SessionNotes({
  initialNoteId,
  campaignId,
  sessionRef,
  defaultTitle,
  date,
}: {
  initialNoteId: string | null
  campaignId: string
  sessionRef: string
  defaultTitle: string
  date?: string
}) {
  // The note we're bound to once it exists (starts from any existing note).
  const draftKey = `player-note:${campaignId}:${sessionRef}`
  // A note an earlier mount just created may not have reached the page's lookup yet.
  const idRef = useRef<string | null>(initialNoteId ?? getDraft<string>(`${draftKey}:id`) ?? null)
  // Text typed before this editor was last unmounted that may not be in the database yet.
  const draftAtMount = useRef(getDraft<string>(draftKey))
  const [body, setBody] = useState(draftAtMount.current ?? '')
  const [status, setStatus] = useState<SaveState>('saved')
  const loaded = useRef(false)
  const saved = useRef(draftAtMount.current === undefined ? '' : '\u0000') // last body persisted (or loaded), to skip no-op saves
  const chain = useRef<Promise<void>>(Promise.resolve())
  const mounted = useRef(true)

  const bodyRef = useRef(body)
  bodyRef.current = body

  // Read an existing note's body once, before the editor mounts. An editor that mounts
  // empty and fills in later would lose the saved text if you start typing in between
  // (a slow database read, a phone). A draft from an earlier mount skips the read.
  const [ready, setReady] = useState(draftAtMount.current !== undefined || !idRef.current)
  useEffect(() => {
    if (ready) return
    let alive = true
    void db.playerNotes.get(idRef.current!).then((n) => {
      if (!alive) return
      saved.current = n?.body ?? ''
      loaded.current = true
      setDraft(draftKey, n?.body ?? '')
      setBody(n?.body ?? '')
      setReady(true)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Create the note on first real content; after that, save what's typed —
  // including an emptied note (WYSIWYG). We don't auto-delete an emptied note:
  // it's the player's own entry, it's hidden from "Story So Far" while empty, and
  // deleting a just-synced record raced the sync layer and the editor's reload.
  // Saves run one after another, so a debounce save and the unmount flush can't
  // both create a note.
  function persist(html: string): Promise<void> {
    chain.current = chain.current.then(async () => {
      if (html === saved.current) return
      try {
        if (idRef.current) {
          await updatePlayerNote(idRef.current, { body: html })
          saved.current = html
        } else if (hasContent(html)) {
          const n = await createPlayerNote(campaignId, { section: 'journal', title: defaultTitle, date })
          await updatePlayerNote(n.id, { sessionRef, body: html })
          idRef.current = n.id
          setDraft(`${draftKey}:id`, n.id)
          loaded.current = true
          saved.current = html
        } else {
          saved.current = html
        }
      } finally {
        if (mounted.current && bodyRef.current === html) setStatus('saved')
      }
    })
    return chain.current
  }

  // The page's panel and the full-screen panel can both be mounted: follow the other one's text.
  useEffect(() => onDraft<string>(draftKey, (v) => { if (v !== bodyRef.current) setBody(v) }), [draftKey])

  // Autosave 500ms after the last keystroke.
  useEffect(() => {
    if (body === saved.current) return
    setDraft(draftKey, body)
    setStatus('saving')
    const t = setTimeout(() => void persist(body), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body])

  // Flush on unmount too (the page moves the editor between columns, tabs and
  // full screen), so a keystroke still inside the debounce isn't lost.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      void persist(bodyRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!ready) return <p className="faint" style={{ fontSize: 13 }}>Loading your notes…</p>

  return (
    <div className="notes-editor">
      <RichTextEditor
        campaignId={campaignId}
        value={body}
        onChange={setBody}
        placeholder="Jot down what happens this session — [[wiki links]] and images work too."
        minHeight={260}
        demoEditable
      />
      <NotesSaveStatus state={status} />
    </div>
  )
}

function SessionEmpty({ campaignId, message }: { campaignId: string; message: string }) {
  return (
    <div className="empty" style={{ marginTop: 24 }}>
      <div className="big"><Icon name="play" size={36} strokeWidth={1.4} /></div>
      <p style={{ maxWidth: 420, margin: '0 auto 14px' }}>{message}</p>
      <Link className="btn small" to={`/player/${campaignId}`}>
        <Icon name="arrow-left" size={13} /> Back to campaign home
      </Link>
    </div>
  )
}
