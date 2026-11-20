import { db } from '../db/db'

// Small preview images for the Overview hub cards (T-75).
//
// The `images` store holds each image's full base64 data URL and is indexed by
// campaignId only, so these helpers never list or scan it. They fetch ONE record by
// primary key, on demand, for an image a card is about to show. A stored image that
// is already small is shown as it is; a large one is shrunk once to the size the card
// needs (createImageBitmap resizes while decoding, so the full-size bitmap is not
// built) and the small result is kept in memory, so a card that re-renders or
// remounts does not read or decode the record again. There is no new store.
//
// Nothing here touches the network. A battle-map image that exists only in cloud
// Storage (a `storagePath` with no local data URL) is reported as missing.

export interface ThumbSize {
  width: number
  height: number
}

/** The size that fits `maxEdge` on the long side, never larger than the source. */
export function thumbSize(width: number, height: number, maxEdge: number): ThumbSize | null {
  if (!(width > 0) || !(height > 0) || !(maxEdge > 0)) return null
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** A stored data URL this short is shown as it is: re-encoding would save nothing. */
export const REUSE_BELOW_CHARS = 24_000

/** How many small previews are kept in memory. */
const MAX_CACHED = 60

export type ThumbResult = { status: 'ready'; src: string } | { status: 'missing' }

const cache = new Map<string, ThumbResult>()
const inflight = new Map<string, Promise<ThumbResult>>()

const keyOf = (imageId: string, maxEdge: number) => `${imageId}|${maxEdge}`

/** The cached preview, if one has already been made. */
export function peekThumbnail(imageId: string, maxEdge: number): ThumbResult | undefined {
  return cache.get(keyOf(imageId, maxEdge))
}

function remember(key: string, result: ThumbResult): ThumbResult {
  cache.delete(key)
  cache.set(key, result)
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string)
  return result
}

function dataUrlToBlob(dataUrl: string, fallbackMime: string): Blob {
  const comma = dataUrl.indexOf(',')
  const head = dataUrl.slice(0, comma)
  const mime = /^data:([^;,]+)/.exec(head)?.[1] ?? fallbackMime
  const binary = atob(dataUrl.slice(comma + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function shrink(rec: { dataUrl: string; mime?: string }, size: ThumbSize): Promise<string> {
  const blob = dataUrlToBlob(rec.dataUrl, rec.mime ?? 'image/webp')
  let bitmap: ImageBitmap
  try {
    // Resizes while decoding, so the full-size bitmap is never built.
    bitmap = await createImageBitmap(blob, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'medium' })
  } catch {
    bitmap = await createImageBitmap(blob) // older browsers without the options: decode, then scale
  }
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    const webp = canvas.toDataURL('image/webp', 0.72)
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.78)
  } finally {
    bitmap.close()
  }
}

async function load(imageId: string, maxEdge: number): Promise<ThumbResult> {
  const rec = await db.images.get(imageId) // one record by primary key, never the table
  if (!rec || !rec.dataUrl) return { status: 'missing' }
  if (rec.dataUrl.length <= REUSE_BELOW_CHARS) return { status: 'ready', src: rec.dataUrl }
  const size = thumbSize(rec.width, rec.height, maxEdge)
  // Already no bigger than the preview: nothing to shrink.
  if (!size || (size.width >= rec.width && size.height >= rec.height)) return { status: 'ready', src: rec.dataUrl }
  const small = await shrink(rec, size)
  return { status: 'ready', src: small.length < rec.dataUrl.length ? small : rec.dataUrl }
}

/** Fetch (and shrink if needed) one image for a card. Rejects when it cannot be decoded. */
export function getThumbnail(imageId: string, maxEdge: number): Promise<ThumbResult> {
  const key = keyOf(imageId, maxEdge)
  const hit = cache.get(key)
  if (hit) return Promise.resolve(remember(key, hit))
  let pending = inflight.get(key)
  if (!pending) {
    pending = load(imageId, maxEdge)
      .then((r) => remember(key, r))
      .finally(() => inflight.delete(key))
    inflight.set(key, pending)
  }
  return pending
}
