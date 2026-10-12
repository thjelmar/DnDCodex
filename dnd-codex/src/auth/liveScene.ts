import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'
import { downloadMapObjectUrl } from '../lib/mapStorage'
import type { SceneFog, SceneGrid, SceneTemplate, SceneToken, TemplateShape, TokenCombat } from '../db/types'

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
  /** Storage object path for the map (bucket `battlemaps`), or null. When set,
   *  players load the map from Storage; `mapImageId` is the legacy base64 path. */
  mapPath: string | null
  /** Fog of war, or null for none. Players render covered cells opaque. */
  fog: SceneFog | null
  /** Placed area templates shared with players, or null for none. */
  templates: SceneTemplate[] | null
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
  /** Emoji icon for custom object tokens (null = none). */
  icon: string | null
  /** Outline shape ('circle' default, 'square' for objects). */
  shape: string | null
  controlledBy: string | null
  /** Privacy-filtered combat overlay, or null when not in combat. */
  combat: TokenCombat | null
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
    mapPath: (r.map_path as string) ?? null,
    fog: (r.fog as SceneFog) ?? null,
    templates: (r.templates as SceneTemplate[]) ?? null,
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
    icon: (r.icon as string) ?? null,
    shape: (r.shape as string) ?? null,
    controlledBy: (r.controlled_by as string) ?? null,
    combat: (r.combat as TokenCombat) ?? null,
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
    icon: t.icon,
    shape: t.shape,
    controlled_by: t.controlledBy,
    combat: t.combat,
    updated_at: new Date().toISOString(),
  }
}

/** Board-ready tokens: portraits + combat overlay keyed by token id. */
export function liveTokensForBoard(
  tokens: LiveToken[],
): { tokens: SceneToken[]; portraits: Record<string, string>; combat: Record<string, TokenCombat> } {
  const portraits: Record<string, string> = {}
  const combat: Record<string, TokenCombat> = {}
  const out = tokens.map((t) => {
    if (t.portrait) portraits[t.id] = t.portrait
    if (t.combat) combat[t.id] = t.combat
    return {
      id: t.id,
      label: t.label,
      color: t.color,
      col: t.col,
      row: t.row,
      size: t.size,
      imageId: t.portrait ? t.id : null,
      icon: t.icon,
      shape: (t.shape as SceneToken['shape']) ?? null,
      controlledBy: t.controlledBy,
    }
  })
  return { tokens: out, portraits, combat }
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
      map_path: s.mapPath,
      fog: s.fog,
      templates: s.templates,
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
  const templates = await supabase.from('shared_scene_templates').delete().eq('campaign_id', campaignId)
  check(templates.error)
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

// ── Player spell-area templates (migration 0035) ─────────────────────────────

/** A player-placed spell area, with the member who dropped it (so they — and
 *  the DM — can remove it). */
export interface LivePlayerTemplate extends SceneTemplate {
  createdBy: string | null
}

function playerTemplateFromRow(r: Row): LivePlayerTemplate {
  return {
    id: r.id as string,
    shape: (r.shape as TemplateShape) ?? 'circle',
    col: Number(r.cell_col),
    row: Number(r.cell_row),
    sizeFt: Number(r.size_ft),
    dir: r.dir == null ? undefined : Number(r.dir),
    color: (r.color as string) ?? '#a78bfa',
    label: (r.label as string) ?? undefined,
    createdBy: (r.created_by as string) ?? null,
  }
}

export async function getPlayerTemplates(campaignId: string): Promise<LivePlayerTemplate[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('shared_scene_templates').select('*').eq('campaign_id', campaignId)
  if (error || !data) return []
  return (data as Row[]).map(playerTemplateFromRow)
}

/** Place (or re-position) the caller's own spell area; the server stamps them as
 *  the owner and refuses a campaign they're not in. */
export async function placeMyTemplate(campaignId: string, t: SceneTemplate): Promise<void> {
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase.rpc('place_scene_template', {
    cid: campaignId,
    tid: t.id,
    tshape: t.shape,
    col: t.col,
    trow: t.row,
    tsize_ft: t.sizeFt,
    tdir: t.dir ?? null,
    tcolor: t.color,
    tlabel: t.label ?? null,
  })
  check(error)
}

/** Remove a spell area the caller placed (the DM can remove any). */
export async function removeMyTemplate(id: string): Promise<void> {
  if (!supabase) throw new Error('Not signed in.')
  const { error } = await supabase.rpc('remove_scene_template', { tid: id })
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
  // Dedup key for the current map (its Storage path or legacy id), plus the
  // object URL we made for a Storage map so we can revoke it when it changes.
  const mapKeyRef = useRef<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)

  const revokeObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  const loadMap = useRef<(s: LiveScene | null) => Promise<void>>(async () => {})
  loadMap.current = async (s: LiveScene | null) => {
    // Prefer the Storage object (migration 0021); fall back to legacy base64.
    const key = s?.mapPath ?? s?.mapImageId ?? null
    if (key === mapKeyRef.current) return
    mapKeyRef.current = key
    revokeObjectUrl()
    if (!key) {
      setMapUrl(null)
      return
    }
    if (s?.mapPath) {
      const url = await downloadMapObjectUrl(s.mapPath)
      objectUrlRef.current = url
      setMapUrl(url)
    } else {
      setMapUrl(await getLiveMap(s!.mapImageId!))
    }
  }

  const refresh = useRef(async () => {})
  refresh.current = async () => {
    if (!cloudCampaignId) return
    const [s, t] = await Promise.all([getLiveScene(cloudCampaignId), getLiveTokens(cloudCampaignId)])
    setScene(s)
    setTokens(t)
    await loadMap.current(s)
  }

  useEffect(() => {
    if (!cloudCampaignId || !supabase || !token) {
      setScene(null)
      setTokens([])
      revokeObjectUrl()
      setMapUrl(null)
      mapKeyRef.current = null
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
            loadMap.current(s)
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
      revokeObjectUrl()
      mapKeyRef.current = null
    }
  }, [cloudCampaignId, token])

  return { scene, tokens, setTokens, mapUrl, loading, refresh: () => refresh.current() }
}

/**
 * Player-placed spell-area templates for a campaign, live. Reused on the player
 * board (which also lets them place/clear their own) and the DM board (read-only
 * overlay, so the DM sees what players conjured). Separate from the DM's own
 * templates, which ride shared_scenes.templates.
 */
export function usePlayerTemplates(cloudCampaignId: string | null | undefined) {
  const { session } = useAuth()
  const token = session?.access_token ?? null
  const [templates, setTemplates] = useState<LivePlayerTemplate[]>([])

  const refresh = useRef(async () => {})
  refresh.current = async () => {
    setTemplates(cloudCampaignId ? await getPlayerTemplates(cloudCampaignId) : [])
  }

  useEffect(() => {
    if (!cloudCampaignId || !supabase || !token) {
      setTemplates([])
      return
    }
    refresh.current()
    const channel = supabase
      .channel(`live-templates-${cloudCampaignId}-${crypto.randomUUID().slice(0, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_scene_templates', filter: `campaign_id=eq.${cloudCampaignId}` },
        (p) => {
          if (p.eventType === 'DELETE') {
            const id = (p.old as Row).id as string
            setTemplates((ts) => ts.filter((t) => t.id !== id))
          } else {
            const t = playerTemplateFromRow(p.new as Row)
            setTemplates((ts) => (ts.some((x) => x.id === t.id) ? ts.map((x) => (x.id === t.id ? t : x)) : [...ts, t]))
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') refresh.current()
      })
    return () => {
      supabase!.removeChannel(channel)
    }
  }, [cloudCampaignId, token])

  return { templates, setTemplates, refresh: () => refresh.current() }
}
