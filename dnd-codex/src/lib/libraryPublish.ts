import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { LIBRARY_BUCKET, libraryAvailable } from './battleLibrary'
import { supabase } from './supabase'

// Publisher-only side of the battle map library (T-77). Every write is checked by
// the database (row-level security + `is_library_publisher()`), so this file only
// decides what to SHOW and how to keep a failed publish from leaving a mess.

export type LibraryStatus = 'draft' | 'published' | 'archived'

/** A row as the publisher sees it (drafts and archived included). */
export interface ManagedTemplate {
  id: string
  title: string
  description: string
  tags: string[]
  credit: string
  credit_url: string | null
  license_note: string
  status: LibraryStatus
  version: number
  map_path: string
  thumb_path: string
  width: number
  height: number
  bytes: number
  grid: { cellPx: number; offsetX: number; offsetY: number }
  cols: number
  rows: number
  updated_at: string
  published_at: string | null
}

export interface TemplateMeta {
  title: string
  description: string
  tags: string[]
  credit: string
  credit_url: string | null
  license_note: string
}

export const OWNER_CREDIT = 'Original map by the D&D Codex owner'
export const OWNER_LICENSE = 'Original work. Free to use in your own campaigns.'

// Limits mirror migration 0042 (the database enforces them too).
export const MAX_MAP_BYTES = 10 * 1024 * 1024
export const MAX_MAP_DIM = 8192
const CACHE_CONTROL = '31536000'

// ---- publisher check ------------------------------------------------------

const publisherCache = new Map<string, boolean>()

/** True when the signed-in account has a row in `library_publishers` (UI hint only). */
export function usePublisher(): boolean {
  const { user } = useAuth()
  const uid = user?.id ?? null
  const [isPub, setIsPub] = useState<boolean>(() => (uid ? (publisherCache.get(uid) ?? false) : false))

  useEffect(() => {
    if (!uid || !libraryAvailable() || !supabase) {
      setIsPub(false)
      return
    }
    let cancelled = false
    supabase
      .from('library_publishers')
      .select('user_id')
      .eq('user_id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        const v = !error && !!data
        publisherCache.set(uid, v)
        setIsPub(v)
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  return isPub
}

// ---- image preparation ----------------------------------------------------

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read the map image.'))
    img.src = src
  })
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b && b.type === 'image/webp' ? resolve(b) : reject(new Error('This browser cannot make WebP images.'))),
      'image/webp',
      quality,
    ),
  )
}

export interface PreparedImages {
  map: Blob
  thumb: Blob
  width: number
  height: number
}

/**
 * Re-encodes the scene's map as WebP within the size limits (at most 8192 px a side
 * and 10 MB), and makes a 480 px wide thumbnail. Shrinks quality, then size, until
 * the map fits; throws if it can't.
 */
export async function prepareImages(dataUrl: string): Promise<PreparedImages> {
  const img = await loadImg(dataUrl)
  let scale = Math.min(1, MAX_MAP_DIM / Math.max(img.naturalWidth, img.naturalHeight))
  for (let attempt = 0; attempt < 6; attempt++) {
    const width = Math.max(1, Math.round(img.naturalWidth * scale))
    const height = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not process the image.')
    ctx.drawImage(img, 0, 0, width, height)
    for (const q of [0.82, 0.65, 0.5]) {
      const map = await canvasBlob(canvas, q)
      if (map.size <= MAX_MAP_BYTES) {
        const tw = Math.min(480, width)
        const th = Math.max(1, Math.round((tw * height) / width))
        const tc = document.createElement('canvas')
        tc.width = tw
        tc.height = th
        tc.getContext('2d')!.drawImage(canvas, 0, 0, tw, th)
        return { map, thumb: await canvasBlob(tc, 0.75), width, height }
      }
    }
    scale *= 0.8 // still too big: shrink and try again (the grid is scaled with it)
  }
  throw new Error('This map is too large to publish (over 10 MB even after shrinking).')
}

// ---- storage helpers ------------------------------------------------------

const objectPaths = (id: string, version: number) => ({
  map: `${id}/v${version}/map.webp`,
  thumb: `${id}/v${version}/thumb.webp`,
})

async function removeObjects(paths: string[]): Promise<void> {
  if (!supabase || !paths.length) return
  try {
    await supabase.storage.from(LIBRARY_BUCKET).remove(paths)
  } catch {
    /* orphan objects are harmless; ignore */
  }
}

async function uploadPair(id: string, version: number, img: PreparedImages): Promise<{ map: string; thumb: string }> {
  if (!supabase) throw new Error('Sign in to publish.')
  const p = objectPaths(id, version)
  const bucket = supabase.storage.from(LIBRARY_BUCKET)
  const a = await bucket.upload(p.map, img.map, { contentType: 'image/webp', cacheControl: CACHE_CONTROL, upsert: false })
  if (a.error) throw new Error(`Map upload failed: ${a.error.message}`)
  const b = await bucket.upload(p.thumb, img.thumb, { contentType: 'image/webp', cacheControl: CACHE_CONTROL, upsert: false })
  if (b.error) {
    await removeObjects([p.map])
    throw new Error(`Thumbnail upload failed: ${b.error.message}`)
  }
  return p
}

// ---- grid -----------------------------------------------------------------

export interface SceneGeometry {
  width: number
  height: number
  grid: { cellPx: number; offsetX: number; offsetY: number }
}

/** Grid settings and square counts for the (possibly rescaled) published image. */
export function gridFor(scene: SceneGeometry, outW: number, outH: number) {
  const k = outW / scene.width
  const cellPx = Math.max(1, scene.grid.cellPx * k)
  const grid = { cellPx, offsetX: scene.grid.offsetX * k, offsetY: scene.grid.offsetY * k }
  const clamp = (n: number) => Math.min(400, Math.max(1, Math.round(n)))
  return { grid, cols: clamp((outW - grid.offsetX) / cellPx), rows: clamp((outH - grid.offsetY) / cellPx) }
}

// ---- publish / republish --------------------------------------------------

const COLUMNS =
  'id,title,description,tags,credit,credit_url,license_note,status,version,map_path,thumb_path,width,height,bytes,grid,cols,rows,updated_at,published_at'

/**
 * Publishes a scene as a NEW template, as a DRAFT. Uploads go first, then the row
 * is inserted; if either step fails the uploaded files are removed again, so a
 * failure leaves nothing behind and the owner can simply retry.
 */
export async function publishNew(scene: SceneGeometry, dataUrl: string, meta: TemplateMeta): Promise<ManagedTemplate> {
  if (!supabase) throw new Error('Sign in to publish.')
  const img = await prepareImages(dataUrl)
  const id = crypto.randomUUID()
  const paths = await uploadPair(id, 1, img)
  const { grid, cols, rows } = gridFor(scene, img.width, img.height)
  const { data, error } = await supabase
    .from('battle_map_templates')
    .insert({
      id,
      ...meta,
      status: 'draft',
      version: 1,
      map_path: paths.map,
      thumb_path: paths.thumb,
      width: img.width,
      height: img.height,
      bytes: img.map.size,
      grid,
      cols,
      rows,
    })
    .select(COLUMNS)
    .single()
  if (error || !data) {
    await removeObjects([paths.map, paths.thumb])
    throw new Error(`Could not save the template (${error?.message ?? 'no data'}). Nothing was published.`)
  }
  return data as unknown as ManagedTemplate
}

/**
 * Replaces an existing template's image and grid with a new version. The new files
 * go into a new `v<n+1>` folder first; the row switches over only if both uploads
 * worked, and the old folder is removed last. Campaign copies are unaffected (they
 * are local copies), and a failure leaves the current version untouched.
 */
export async function republish(
  existing: ManagedTemplate,
  scene: SceneGeometry,
  dataUrl: string,
  meta: TemplateMeta,
): Promise<ManagedTemplate> {
  if (!supabase) throw new Error('Sign in to publish.')
  const img = await prepareImages(dataUrl)
  const version = existing.version + 1
  const paths = await uploadPair(existing.id, version, img)
  const { grid, cols, rows } = gridFor(scene, img.width, img.height)
  const { data, error } = await supabase
    .from('battle_map_templates')
    .update({
      ...meta,
      version,
      map_path: paths.map,
      thumb_path: paths.thumb,
      width: img.width,
      height: img.height,
      bytes: img.map.size,
      grid,
      cols,
      rows,
    })
    .eq('id', existing.id)
    .select(COLUMNS)
    .single()
  if (error || !data) {
    await removeObjects([paths.map, paths.thumb])
    throw new Error(`Could not save the new version (${error?.message ?? 'no data'}). The current version is unchanged.`)
  }
  await removeObjects([existing.map_path, existing.thumb_path])
  return data as unknown as ManagedTemplate
}

// ---- manage ---------------------------------------------------------------

/** Every template, newest first (drafts and archived too: RLS lets publishers read all). */
export async function listManaged(): Promise<ManagedTemplate[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('battle_map_templates')
    .select(COLUMNS)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ManagedTemplate[]
}

export async function updateMeta(id: string, meta: TemplateMeta): Promise<void> {
  if (!supabase) throw new Error('Sign in first.')
  const { error } = await supabase.from('battle_map_templates').update(meta).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setStatus(t: ManagedTemplate, status: LibraryStatus): Promise<void> {
  if (!supabase) throw new Error('Sign in first.')
  const patch: Record<string, unknown> = { status }
  if (status === 'published' && !t.published_at) patch.published_at = new Date().toISOString()
  const { error } = await supabase.from('battle_map_templates').update(patch).eq('id', t.id)
  if (error) throw new Error(error.message)
}

/** Deletes the row first (so it disappears at once), then its files. */
export async function deleteTemplate(t: ManagedTemplate): Promise<void> {
  if (!supabase) throw new Error('Sign in first.')
  const { error } = await supabase.from('battle_map_templates').delete().eq('id', t.id)
  if (error) throw new Error(error.message)
  await removeObjects([t.map_path, t.thumb_path])
}
