// The parts of the hub-card thumbnails that need neither the database nor the
// browser's image APIs, so they can be tested on their own: sizing, the in-memory
// cache, and the decision of what to show for a stored image (T-75).

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

/** What a stored image record looks like to the preview logic. */
export interface StoredPreviewSource {
  dataUrl: string
  mime?: string
  width: number
  height: number
}

const isSvg = (rec: StoredPreviewSource) => rec.mime === 'image/svg+xml' || /^data:image\/svg\+xml/i.test(rec.dataUrl)

/**
 * The `<img src>` to show for a stored image, as a data URL.
 *  - Small images are shown as they are.
 *  - SVG is shown as it is: it is vector, so it scales for free, and the browser
 *    cannot decode it into a bitmap to shrink.
 *  - An image already no bigger than the preview is shown as it is.
 *  - Anything else is shrunk with `shrink`. If shrinking fails for any reason (an
 *    unusual encoding, an unsupported format) or does not make it smaller, the
 *    original is shown instead; only the `<img>` itself failing marks it broken.
 */
export async function previewSource(
  rec: StoredPreviewSource,
  maxEdge: number,
  shrink: (rec: StoredPreviewSource, size: ThumbSize) => Promise<string>,
): Promise<string> {
  if (rec.dataUrl.length <= REUSE_BELOW_CHARS) return rec.dataUrl
  if (isSvg(rec)) return rec.dataUrl
  const size = thumbSize(rec.width, rec.height, maxEdge)
  if (!size || (size.width >= rec.width && size.height >= rec.height)) return rec.dataUrl
  try {
    const small = await shrink(rec, size)
    return small.length < rec.dataUrl.length ? small : rec.dataUrl
  } catch {
    return rec.dataUrl
  }
}

/**
 * A small in-memory cache of ready previews, keyed `imageId|maxEdge`. It is bounded
 * three ways so it can never hold much: by entry count, by the total characters held,
 * and by a limit on any single entry (an original that was not worth shrinking can be
 * large, and is simply not kept). Only ready previews go in: a missing or failed image
 * is never remembered, so it is looked up again next time.
 */
export class ThumbCache {
  private entries = new Map<string, string>()
  private total = 0

  constructor(
    private readonly maxEntries = 60,
    private readonly maxTotalChars = 8_000_000,
    private readonly maxEntryChars = 2_000_000,
  ) {}

  get(key: string): string | undefined {
    const hit = this.entries.get(key)
    if (hit === undefined) return undefined
    this.entries.delete(key) // most recently used goes last
    this.entries.set(key, hit)
    return hit
  }

  set(key: string, src: string): void {
    this.delete(key)
    if (src.length > this.maxEntryChars) return
    this.entries.set(key, src)
    this.total += src.length
    while (this.entries.size > this.maxEntries || this.total > this.maxTotalChars) {
      const oldest = this.entries.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.delete(oldest)
    }
  }

  /** Forget every preview of one image, whatever size it was made at. */
  dropImage(imageId: string): void {
    const prefix = `${imageId}|`
    for (const key of Array.from(this.entries.keys())) if (key.startsWith(prefix)) this.delete(key)
  }

  private delete(key: string): void {
    const old = this.entries.get(key)
    if (old === undefined) return
    this.entries.delete(key)
    this.total -= old.length
  }

  get size(): number {
    return this.entries.size
  }
  get chars(): number {
    return this.total
  }
}
