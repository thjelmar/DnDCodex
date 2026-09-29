import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'
import type { SceneGrid, SceneToken } from '../db/types'

// Live battle maps (migration 0015). The DM shows ONE battle map per campaign to
// players; the scene row, its visible tokens, and its map image are mirrored to
// shared_scenes / shared_scene_tokens / shared_scene_maps. Members read them live
// over Realtime; a player moves only their own token through move_scene_token().
// Hidden tokens are never uploaded.

export interface LiveScene {
  campaignId: string
  sceneId: string
  name: string
  width: number
  height: number
  grid: SceneGrid
  mapImageId: string | null
}

/** A token as players see it (portrait inlined, no DM-only fields). */
export interface LiveToken {
  id: string
  label: string
  color: string
  col: number
  row: number
  size: number
  portrait: string | null
  controlledBy: string | null
}

type Row = Record<string, unknown>

function sceneFromRow(r: Row): LiveScene {
  return {
    campaignId: r.campaign_id as string,
    sceneId: r.scene_id as string,
    name: (r.name as string) ?? '',
    width: Number(r.width),
    height: Number(r.height),
    grid: r.grid as SceneGrid,
    mapImageId: (r.map_image_id as string) ?? null,
  }
}

function tokenFromRow(r: Row): LiveToken {
  return {
    id: r.id as string,
    label: (r.label as string) ?? '',
    color: (r.color as string) ?? '#2563eb',
    col: Number(r.cell_col),
    row: Number(r.cell_row),
    size: Number(r.size) || 1,
    portrait: (r.portrait as string) ?? null,
    controlledBy: (r.controlled_by as string) ?? null,
  }
}

export function tokenToRow(campaignId: string, t: LiveToken): Row {
  return {
    id: t.id,
    campaign_id: campaignId,
    label: t.label,
    color: t.color,
    cell_col: t.col,
    cell_row: t.row,
    size: t.size,
    portrait: t.portrait,
    controlled_by: t.controlledBy,
    updated_at: new Date().toISOString(),
  }
}

/** Board-ready tokens: portraits keyed by token id (Tabletop's `portraits`). */
export function liveTokensForBoard(tokens: LiveToken[]): { tokens: SceneToken[]; portraits: Record<string, string> } {
  const portraits: Record<string, string> = {}
  const out = tokens.map((t) => {
    if (t.portrait) portraits[t.id] = t.portrait
    return {
      id: t.id,
      label: t.label,
      color: t.color,
      col: t.col,
      row: t.row,
      size: t.size,
      imageId: t.portrait ? t.id : null,
      controlledBy: t.controlledBy,
    }
  })
  return { tokens: out, portraits }
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function getLiveScene(campaignId: string): Promise<LiveScene | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('shared_scenes').select('*').eq('campaign_id', campaignId).maybeSingle()
  if (error || !data) return null
  return sceneFromRow(data)
}

export async function getLiveTokens(campaignId: string): Promise<LiveToken[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('shared_scene_tokens').select('*').eq('campaign_id', campaignId)
  if (error || !data) return []
  return data.map(tokenFromRow)
}

export async function getLiveMap(id: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('shared_scene_maps').select('data_url').eq('id', id).maybeSingle()
  if (error || !data) return null
  return data.data_url as string
}

// ── DM writes ──────────────────────────────────────────────────────────────

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export async function upsertLiveScene(s: LiveScene): Promise<void> {
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase.from('shared_scenes').upsert(
    {
      campaign_id: s.campaignId,
      scene_id: s.sceneId,
      name: s.name,
      width: s.width,
      height: s.height,
      grid: s.grid,
      map_image_id: s.mapImageId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'campaign_id' },
  )
  check(error)
}

export async function upsertLiveTokens(campaignId: string, tokens: LiveToken[]): Promise<void> {
  if (!supabase || tokens.length === 0) return
  const { error } = await supabase
    .from('shared_scene_tokens')
    .upsert(tokens.map((t) => tokenToRow(campaignId, t)), { onConflict: 'id' })
  check(error)
}

export async function deleteLiveTokens(ids: string[]): Promise<void> {
  if (!supabase || ids.length === 0) return
  const { error } = await supabase.from('shared_scene_tokens').delete().in('id', ids)
  check(error)
}

export async function upsertLiveMap(campaignId: string, id: string, dataUrl: string, width: number, height: number): Promise<void> {
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase
    .from('shared_scene_maps')
    .upsert({ id, campaign_id: campaignId, data_url: dataUrl, width, height }, { onConflict: 'id' })
  check(error)
}

/** Remove one uploaded map image (e.g. one the DM replaced mid-session). */
export async function deleteLiveMap(id: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.from('shared_scene_maps').delete().eq('id', id)
  check(error)
}

/** Stop showing any battle map: players' view goes empty immediately. */
export async function stopLiveScene(campaignId: string): Promise<void> {
  if (!supabase) return
  const tokens = await supabase.from('shared_scene_tokens').delete().eq('campaign_id', campaignId)
  check(tokens.error)
  const maps = await supabase.from('shared_scene_maps').delete().eq('campaign_id', campaignId)
  check(maps.error)
  const scene = await supabase.from('shared_scenes').delete().eq('campaign_id', campaignId)
  check(scene.error)
}

// ── Player write ───────────────────────────────────────────────────────────

/** Move the caller's own token (the server refuses anyone else's). */
export async function moveMyToken(id: string, col: number, row: number): Promise<void> {
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase.rpc('move_scene_token', { tid: id, new_col: col, new_row: row })
  check(error)
}

// ── Live hook ──────────────────────────────────────────────────────────────

/**
 * The campaign's active battle map, live. Token events are applied straight
 * from the Realtime payload (no refetch per move). The channel waits for the
 * auth token so it never joins anonymously (see the SharedEntities fix: an anon
 * join has RLS drop every event, and a later setAuth doesn't re-join).
 */
export function useLiveScene(cloudCampaignId: string | null | undefined) {
  const { session } = useAuth()
  const token = session?.access_token ?? null
  const [scene, setScene] = useState<LiveScene | null>(null)
  const [tokens, setTokens] = useState<LiveToken[]>([])
  const [mapUrl, setMapUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const mapIdRef = useRef<string | null>(null)

  const loadMap = useRef<(id: string | null) => Promise<void>>(async () => {})
  loadMap.current = async (id: string | null) => {
    if (id === mapIdRef.current) return
    mapIdRef.current = id
    setMapUrl(id ? await getLiveMap(id) : null)
  }

  const refresh = useRef(async () => {})
  refresh.current = async () => {
    if (!cloudCampaignId) return
    const [s, t] = await Promise.all([getLiveScene(cloudCampaignId), getLiveTokens(cloudCampaignId)])
    setScene(s)
    setTokens(t)
    await loadMap.current(s?.mapImageId ?? null)
  }

  useEffect(() => {
    if (!cloudCampaignId || !supabase || !token) {
      setScene(null)
      setTokens([])
      setMapUrl(null)
      mapIdRef.current = null
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    refresh.current().finally(() => {
      if (!cancelled) setLoading(false)
    })
    const channel = supabase
      // Unique per subscriber (see useLiveSession: repeated names collide).
      .channel(`live-scene-${cloudCampaignId}-${crypto.randomUUID().slice(0, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_scenes', filter: `campaign_id=eq.${cloudCampaignId}` },
        (p) => {
          if (p.eventType === 'DELETE') {
            setScene(null)
            loadMap.current(null)
          } else {
            const s = sceneFromRow(p.new as Row)
            setScene(s)
            loadMap.current(s.mapImageId)
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_scene_tokens', filter: `campaign_id=eq.${cloudCampaignId}` },
        (p) => {
          if (p.eventType === 'DELETE') {
            const id = (p.old as Row).id as string
            setTokens((ts) => ts.filter((t) => t.id !== id))
          } else {
            const t = tokenFromRow(p.new as Row)
            setTokens((ts) => (ts.some((x) => x.id === t.id) ? ts.map((x) => (x.id === t.id ? t : x)) : [...ts, t]))
          }
        },
      )
      .subscribe((status) => {
        // Catch anything that changed between the first fetch and the join.
        if (status === 'SUBSCRIBED') refresh.current()
      })
    return () => {
      cancelled = true
      supabase!.removeChannel(channel)
    }
  }, [cloudCampaignId, token])

  return { scene, tokens, setTokens, mapUrl, loading, refresh: () => refresh.current() }
}
