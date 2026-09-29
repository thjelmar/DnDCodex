import { useEffect, useRef, useState } from 'react'
import { db } from '../db/db'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { enableCampaignSharing, getCampaignMembers, type Member } from '../auth/cloud'
import {
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
import type { Campaign, Id, SceneGrid, SceneToken } from '../db/types'

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
}

const PUSH_DELAY = 250
const PORTRAIT_PX = 96

export function useDmLiveScene(
  campaign: Campaign,
  draft: Draft,
  applyRemoteMoves: (moves: { id: string; col: number; row: number }[]) => void,
) {
  const { user } = useAuth()
  const available = !!supabase && !!user
  const live = useLiveScene(available ? campaign.id : null)
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
      .channel(`members-${campaign.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_members', filter: `campaign_id=eq.${campaign.id}` }, load)
      .subscribe()
    return () => {
      cancelled = true
      supabase!.removeChannel(channel)
    }
  }, [available, campaign.id, user?.id, token])

  /** A token's color on every screen: its controller's pick, else the DM's. */
  const colorFor = (t: SceneToken): string =>
    (t.controlledBy && members.find((m) => m.userId === t.controlledBy)?.color) || t.color

  async function portraitFor(imageId: Id | null | undefined): Promise<string | null> {
    if (!imageId) return null
    if (thumbs.current.has(imageId)) return thumbs.current.get(imageId)!
    const img = await db.images.get(imageId)
    const thumb = img ? (await makeThumbnail(img.dataUrl, PORTRAIT_PX)).dataUrl : null
    thumbs.current.set(imageId, thumb)
    return thumb
  }

  async function liveTokens(tokens: SceneToken[]): Promise<LiveToken[]> {
    const visible = tokens.filter((t) => !t.hidden)
    return Promise.all(
      visible.map(async (t) => ({
        id: t.id,
        label: t.label,
        color: colorFor(t),
        col: t.col,
        row: t.row,
        size: t.size,
        portrait: await portraitFor(t.imageId),
        controlledBy: t.controlledBy ?? null,
      })),
    )
  }

  const same = (a: LiveToken, b: LiveToken) =>
    a.label === b.label && a.color === b.color && a.col === b.col && a.row === b.row &&
    a.size === b.size && a.portrait === b.portrait && a.controlledBy === b.controlledBy

  /** Mirror the draft to the cloud, sending only what changed. */
  const push = useRef(async (_d: Draft) => {})
  push.current = async (d: Draft) => {
    if (d.imageId !== pushedMapId.current) {
      if (d.imageId) {
        const img = await db.images.get(d.imageId)
        if (img) await upsertLiveMap(campaign.id, img.id, img.dataUrl, img.width, img.height)
      }
      pushedMapId.current = d.imageId
    }
    const scene: LiveScene = {
      campaignId: campaign.id,
      sceneId: d.sceneId,
      name: d.name,
      width: d.width,
      height: d.height,
      grid: d.grid,
      mapImageId: d.imageId,
    }
    const sceneKey = JSON.stringify(scene)
    if (sceneKey !== pushedScene.current) {
      await upsertLiveScene(scene)
      pushedScene.current = sceneKey
    }
    const next = await liveTokens(d.tokens)
    const changed = next.filter((t) => {
      const prev = pushedTokens.current.get(t.id)
      return !prev || !same(prev, t)
    })
    const gone = [...pushedTokens.current.keys()].filter((id) => !next.some((t) => t.id === id))
    await upsertLiveTokens(campaign.id, changed)
    await deleteLiveTokens(gone)
    for (const t of changed) pushedTokens.current.set(t.id, t)
    for (const id of gone) pushedTokens.current.delete(id)
  }

  // Debounced mirror while this map is the one on show.
  const { sceneId, name, grid, width, height, imageId, tokens } = draft
  useEffect(() => {
    if (!isShowing || !seeded) return
    const t = setTimeout(() => {
      push.current({ sceneId, name, grid, width, height, imageId, tokens }).catch((e) =>
        setError(e instanceof Error ? e.message : 'Could not update the players’ map.'),
      )
    }, PUSH_DELAY)
    return () => clearTimeout(t)
  }, [isShowing, seeded, sceneId, name, grid, width, height, imageId, tokens, members])

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
      await push.current(draft)
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

  return { available, isShowing, otherShowing, otherName: live.scene?.name ?? '', busy, error, members, colorFor, show, stop }
}
