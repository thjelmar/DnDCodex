import { useCallback, useEffect, useState } from 'react'
import { createScene } from '../db/repo'
import type { Scene } from '../db/types'
import { isDemo } from './demo'
import { importMapImage } from './mapImport'
import { isSupabaseConfigured, supabase } from './supabase'

// Battle map library: owner-published map templates anyone can browse and copy
// into a campaign (migration 0042). The library is READ-ONLY here; publishing is
// a separate, publisher-only surface.
//
// Demo mode must never touch Supabase, so every entry point checks
// `libraryAvailable()` first, and the demo simply hides the library.

export const LIBRARY_BUCKET = 'battlemap-library'
const CACHE_KEY = 'codex.battleLibrary.v1'

export interface LibraryTemplate {
  id: string
  title: string
  description: string
  tags: string[]
  credit: string
  credit_url: string | null
  license_note: string
  version: number
  map_path: string
  thumb_path: string
  width: number
  height: number
  bytes: number
  grid: { cellPx: number; offsetX: number; offsetY: number }
  cols: number
  rows: number
}

// Never select anything not listed here.
const COLUMNS =
  'id,title,description,tags,credit,credit_url,license_note,version,map_path,thumb_path,width,height,bytes,grid,cols,rows'

/** True when the library can be used: a backend is configured and this is not the demo. */
export function libraryAvailable(): boolean {
  return isSupabaseConfigured && !!supabase && !isDemo()
}

export function libraryObjectUrl(path: string): string {
  if (!supabase) return ''
  return supabase.storage.from(LIBRARY_BUCKET).getPublicUrl(path).data.publicUrl
}

function readCache(): LibraryTemplate[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as LibraryTemplate[]) : null
  } catch {
    return null
  }
}

function writeCache(rows: LibraryTemplate[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rows))
  } catch {
    /* quota or private mode: the cache is optional */
  }
}

/** Fetches every published template (a small catalogue; filtering is client-side). */
export async function fetchCatalogue(): Promise<LibraryTemplate[]> {
  if (!libraryAvailable() || !supabase) return []
  const { data, error } = await supabase
    .from('battle_map_templates')
    .select(COLUMNS)
    .eq('status', 'published')
    .order('sort_order', { ascending: true })
    .order('published_at', { ascending: false })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as LibraryTemplate[]
  writeCache(rows)
  return rows
}

export type LibraryState =
  | { status: 'unavailable' }
  | { status: 'loading'; cached: LibraryTemplate[] | null }
  | { status: 'ready'; templates: LibraryTemplate[] }
  // Network or table error: show the last catalogue if we have one.
  | { status: 'offline'; cached: LibraryTemplate[] | null }

export function useLibrary(): LibraryState & { reload: () => void } {
  const [state, setState] = useState<LibraryState>(() =>
    libraryAvailable() ? { status: 'loading', cached: readCache() } : { status: 'unavailable' },
  )
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!libraryAvailable()) return
    let cancelled = false
    fetchCatalogue()
      .then((templates) => !cancelled && setState({ status: 'ready', templates }))
      .catch(() => !cancelled && setState({ status: 'offline', cached: readCache() }))
    return () => {
      cancelled = true
    }
  }, [tick])

  return { ...state, reload }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Could not read the map image.'))
    r.readAsDataURL(blob)
  })
}

/**
 * Copies a template into a campaign as an ordinary local image + scene. Nothing is
 * created if the download fails. The copy never reads the library again.
 */
export async function useTemplateInCampaign(t: LibraryTemplate, campaignId: string): Promise<Scene> {
  if (!libraryAvailable()) throw new Error('The library is not available here.')
  const res = await fetch(libraryObjectUrl(t.map_path))
  if (!res.ok) throw new Error('Could not download that map. Check your connection and try again.')
  const blob = await res.blob()
  const dataUrl = await blobToDataUrl(blob)
  const img = await importMapImage(campaignId, {
    name: `${t.title}.webp`,
    mime: blob.type || 'image/webp',
    dataUrl,
    width: t.width,
    height: t.height,
    bytes: blob.size,
  })
  return createScene(campaignId, {
    name: t.title,
    imageId: img.id,
    width: t.width,
    height: t.height,
    grid: {
      cellPx: t.grid.cellPx,
      offsetX: t.grid.offsetX,
      offsetY: t.grid.offsetY,
      show: true,
      color: '#000000',
    },
    tokens: [],
    source: {
      libraryId: t.id,
      version: t.version,
      title: t.title,
      credit: t.credit,
      creditUrl: t.credit_url,
    },
  })
}
