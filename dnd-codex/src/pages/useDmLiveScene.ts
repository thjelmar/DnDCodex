import { useEffect, useRef, useState } from 'react'
import { db } from '../db/db'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { enableCampaignSharing, getCampaignMembers, type Member } from '../auth/cloud'
import {
  deleteLiveMap,
  deleteLiveTokens,
  stopLiveScene,
  upsertLiveMap,
  upsertLiveScene,
  upsertLiveTokens,
  useLiveScene,
  type LiveScene,
  type LiveToken,
} from '../auth/liveScene'
import { makeThumbnail } from '../lib/image'
import { useLiveSession } from '../lib/useLiveSession'
import { tokenRevealed } from '../lib/tabletop'
import type { Campaign, Id, Scene, SceneFog, SceneGrid, SceneToken } from '../db/types'

// The DM half of live battle maps. While the edited map is the one being shown
// to players, every (debounced) change is mirrored to the cloud: the scene row,
// the map image when it changes, and a DIFF of the visible tokens (hidden tokens
// are removed from the cloud, never sent). Player moves on their own tokens come
// back over Realtime and are applied to the DM's local draft.

interface Draft {
  sceneId: Id
  name: string
  grid: SceneGrid
  width: number
  height: number
  imageId: Id | null
  tokens: SceneToken[]
  fog: SceneFog | null
}

const PUSH_DELAY = 250
const PORTRAIT_PX = 96

/** A token's color on every screen: its controller's pick, else the DM's. */
function tokenColor(t: SceneToken, members: Member[]): string {
  return (t.controlledBy && members.find((m) => m.userId === t.controlledBy)?.color) || t.color
}

/** Small portrait thumbnail for a token image, memoized in `cache`. */
async function portraitFor(imageId: Id | null | undefined, cache: Map<string, string | null>): Promise<string | null> {
  if (!imageId) return null
  if (cache.has(imageId)) return cache.get(imageId)!
  const img = await db.images.get(imageId)
  const thumb = img ? (await makeThumbnail(img.dataUrl, PORTRAIT_PX)).dataUrl : null
  cache.set(imageId, thumb)
  return thumb
}

/** The tokens players get: visible ones only, in their controller's color.
 *  Under fog, a token standing entirely in covered cells is withheld too, so its
 *  position never leaks (the map is opaque there but tokens draw on top). */
async function toLiveTokens(
  tokens: SceneToken[],
  members: Member[],
  cache: Map<string, string | null>,
  fog: SceneFog | null,
): Promise<LiveToken[]> {
  const revealed = fog?.enabled ? new Set(fog.revealed) : null
  return Promise.all(
    tokens
      .filter((t) => !t.hidden && (!revealed || tokenRevealed(t, revealed)))
      .map(async (t) => ({
        id: t.id,
        label: t.label,
        color: tokenColor(t, members),
        col: t.col,
        row: t.row,
        size: t.size,
        portrait: await portraitFor(t.imageId, cache),
        controlledBy: t.controlledBy ?? null,
      })),
  )
}

async function uploadMap(campaignId: Id, imageId: Id | null) {
  if (!imageId) return
  const img = await db.images.get(imageId)
  if (img) await upsertLiveMap(campaignId, img.id, img.dataUrl, img.width, img.height)
}

function liveSceneOf(campaignId: Id, d: Draft): LiveScene {
  return { campaignId, sceneId: d.sceneId, name: d.name, width: d.width, height: d.height, grid: d.grid, mapImageId: d.imageId, fog: d.fog }
}

/**
 * Show a battle map to players without its editor open (e.g. from Run mode's
 * "Start live session" offer). Replaces whatever map was on show. If the map's
 * editor is opened later, it picks up from the cloud and keeps it in sync.
 */
export async function showSceneToPlayers(campaign: Campaign, scene: Scene, userId: string): Promise<void> {
  await enableCampaignSharing({ id: campaign.id, name: campaign.name }, userId)
  await stopLiveScene(campaign.id)
  const members = await getCampaignMembers(campaign.id)
  const draft: Draft = {
    sceneId: scene.id,
    name: scene.name,
    grid: scene.grid,
    width: scene.width,
    height: scene.height,
    imageId: scene.imageId,
    tokens: scene.tokens,
    fog: scene.fog ?? null,
  }
  await uploadMap(campaign.id, draft.imageId)
  await upsertLiveScene(liveSceneOf(campaign.id, draft))
  await upsertLiveTokens(campaign.id, await toLiveTokens(draft.tokens, members, new Map(), draft.fog))
}

export function useDmLiveScene(
  campaign: Campaign,
  draft: Draft,
  applyRemoteMoves: (moves: { id: string; col: number; row: number }[]) => void,
) {
  const { user } = useAuth()
  const available = !!supabase && !!user
  const live = useLiveScene(available ? campaign.id : null)
  // Players see battle maps only inside a live session (Run mode → Start live
  // session), so showing needs one; ending the session takes the map down.
  const sessionLive = !!useLiveSession(available ? campaign.id : null)
  const isShowing = !!live.scene && live.scene.sceneId === draft.sceneId
  const otherShowing = !!live.scene && !isShowing

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])

  // What the cloud currently holds (as last pushed or received), for diffing.
  const pushedTokens = useRef(new Map<string, LiveToken>())
  const pushedScene = useRef<string | null>(null)
  const pushedMapId = useRef<string | null | undefined>(undefined)
  const thumbs = useRef(new Map<string, string | null>())
  // Whether our diff state reflects the cloud. False after a reload while the
  // map is already on show: adopt the cloud first so we don't push stale
  // positions over moves players made meanwhile.
  const [seeded, setSeeded] = useState(false)

  // Members (for "Controlled by") and their colors, live: a player picking a
  // color repaints their tokens here and on every player's screen.
  const token = useAuth().session?.access_token ?? null
  useEffect(() => {
    if (!available || !supabase || !token) return
    let cancelled = false
    const load = () =>
      getCampaignMembers(campaign.id).then((m) => {
        if (!cancelled) setMembers(m.filter((x) => x.userId !== user?.id))
      })
    load()
    const channel = supabase
      // Unique per subscriber (see useLiveSession: repeated names collide).
      .channel(`members-${campaign.id}-${crypto.randomUUID().slice(0, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_members', filter: `campaign_id=eq.${campaign.id}` }, load)
      .subscribe()
    return () => {
      cancelled = true
      supabase!.removeChannel(channel)
    }
  }, [available, campaign.id, user?.id, token])

  /** A token's color on every screen: its controller's pick, else the DM's. */
  const colorFor = (t: SceneToken): string => tokenColor(t, members)

  const same = (a: LiveToken, b: LiveToken) =>
    a.label === b.label && a.color === b.color && a.col === b.col && a.row === b.row &&
    a.size === b.size && a.portrait === b.portrait && a.controlledBy === b.controlledBy

  /**
   * Mirror the draft to the cloud, sending only what changed. What we send is
   * recorded BEFORE the network call, so our own Realtime echo (which can beat
   * the upsert's response) matches it and isn't mistaken for a player's move.
   * On failure the records are dropped so the next push resends.
   */
  const push = useRef(async (_d: Draft) => {})
  push.current = async (d: Draft) => {
    if (d.imageId !== pushedMapId.current) {
      const previous = pushedMapId.current
      pushedMapId.current = d.imageId
      try {
        await uploadMap(campaign.id, d.imageId)
        // Don't leave replaced map images (up to a few MB each) in the cloud.
        if (previous) await deleteLiveMap(previous)
      } catch (e) {
        pushedMapId.current = previous
        throw e
      }
    }
    const scene = liveSceneOf(campaign.id, d)
    const sceneKey = JSON.stringify(scene)
    if (sceneKey !== pushedScene.current) {
      pushedScene.current = sceneKey
      try {
        await upsertLiveScene(scene)
      } catch (e) {
        pushedScene.current = null
        throw e
      }
    }
    const next = await toLiveTokens(d.tokens, members, thumbs.current, d.fog)
    const changed = next.filter((t) => {
      const prev = pushedTokens.current.get(t.id)
      return !prev || !same(prev, t)
    })
    const gone = [...pushedTokens.current.keys()].filter((id) => !next.some((t) => t.id === id))
    for (const t of changed) pushedTokens.current.set(t.id, t)
    for (const id of gone) pushedTokens.current.delete(id)
    try {
      await upsertLiveTokens(campaign.id, changed)
      await deleteLiveTokens(gone)
    } catch (e) {
      for (const t of changed) pushedTokens.current.delete(t.id)
      throw e
    }
  }

  // Pushes run one at a time, in order: overlapping pushes could land out of
  // order (older position wins) or upload the same map twice.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const enqueuePush = (d: Draft) => {
    queue.current = queue.current
      .then(() => push.current(d))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not update the players’ map.'))
    return queue.current
  }

  // Debounced mirror while this map is the one on show. A push still waiting
  // on the debounce is flushed if the editor unmounts (switching panes/maps).
  const { sceneId, name, grid, width, height, imageId, tokens, fog } = draft
  const pending = useRef<Draft | null>(null)
  useEffect(() => {
    if (!isShowing || !seeded) return
    const d = { sceneId, name, grid, width, height, imageId, tokens, fog }
    pending.current = d
    const t = setTimeout(() => {
      pending.current = null
      enqueuePush(d)
    }, PUSH_DELAY)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShowing, seeded, sceneId, name, grid, width, height, imageId, tokens, fog, members])
  useEffect(
    () => () => {
      if (pending.current) enqueuePush(pending.current)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Player moves: a controlled token whose cloud position differs from what we
  // last pushed was moved by its player. (Only players' RPC moves can do that;
  // the DM's own echoes match what was pushed.)
  useEffect(() => {
    if (!isShowing) {
      if (seeded) setSeeded(false)
      return
    }
    const moves: { id: string; col: number; row: number }[] = []
    if (!seeded) {
      for (const t of live.tokens) {
        pushedTokens.current.set(t.id, t)
        if (t.controlledBy) moves.push({ id: t.id, col: t.col, row: t.row })
      }
      pushedMapId.current = live.scene?.mapImageId ?? null
      pushedScene.current = null
      setSeeded(true)
      if (moves.length) applyRemoteMoves(moves)
      return
    }
    for (const t of live.tokens) {
      const prev = pushedTokens.current.get(t.id)
      if (!prev || !t.controlledBy) continue
      if (prev.col !== t.col || prev.row !== t.row) {
        pushedTokens.current.set(t.id, { ...prev, col: t.col, row: t.row })
        moves.push({ id: t.id, col: t.col, row: t.row })
      }
    }
    if (moves.length) applyRemoteMoves(moves)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShowing, live.tokens])

  async function show() {
    if (!user) return
    if (!sessionLive) {
      setError('Start a live session in Run mode first — players see battle maps during a session.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Registers the campaign for sharing if it isn't yet (idempotent).
      await enableCampaignSharing({ id: campaign.id, name: campaign.name }, user.id)
      // Replace whatever map was on show: clear it, then push this one fresh.
      await stopLiveScene(campaign.id)
      pushedTokens.current.clear()
      pushedScene.current = null
      pushedMapId.current = undefined
      await enqueuePush(draft)
      setSeeded(true)
      await live.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not show the map to players.')
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setBusy(true)
    setError(null)
    try {
      await stopLiveScene(campaign.id)
      pushedTokens.current.clear()
      pushedScene.current = null
      pushedMapId.current = undefined
      await live.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stop showing the map.')
    } finally {
      setBusy(false)
    }
  }

  return { available, sessionLive, isShowing, otherShowing, otherName: live.scene?.name ?? '', busy, error, members, colorFor, show, stop }
}
