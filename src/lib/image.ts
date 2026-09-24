// Client-side image processing. Uploaded images are downscaled to a sensible
// maximum dimension and re-encoded (WebP, falling back to JPEG) to keep both
// IndexedDB storage and JSON backups reasonable. Animated GIFs are passed
// through untouched so their animation survives.

export interface ProcessedImage {
  dataUrl: string
  mime: string
  width: number
  height: number
  /** Approximate decoded byte size of the data URL payload. */
  bytes: number
}

const MAX_DIM = 1600
const QUALITY = 0.82

function base64Bytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const payload = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  // 4 base64 chars encode 3 bytes.
  return Math.round((payload.length * 3) / 4)
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Validates, downscales, and encodes an image file. Throws if the file is not
 * an image. Returns a data URL plus metadata.
 */
export async function processImageFile(file: File): Promise<ProcessedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That file is not an image.')
  }

  // Preserve animated GIFs as-is (canvas would flatten them to one frame).
  if (file.type === 'image/gif') {
    const dataUrl = await readAsDataUrl(file)
    const size = await imageDimensions(dataUrl)
    return { dataUrl, mime: 'image/gif', width: size.width, height: size.height, bytes: base64Bytes(dataUrl) }
  }

  // Decode respecting EXIF orientation so photos aren't sideways.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process the image.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  let mime = 'image/webp'
  let dataUrl = canvas.toDataURL(mime, QUALITY)
  // Some browsers ignore WebP and silently return PNG; fall back to JPEG then.
  if (!dataUrl.startsWith('data:image/webp')) {
    mime = 'image/jpeg'
    dataUrl = canvas.toDataURL(mime, QUALITY)
  }

  return { dataUrl, mime, width, height, bytes: base64Bytes(dataUrl) }
}

function imageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({ width: 0, height: 0 })
    img.src = src
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load the image.'))
    img.src = src
  })
}

/**
 * Downscale an existing (already-processed) image data URL to a small thumbnail,
 * re-encoded as WebP (JPEG fallback). Used to embed a self-contained portrait
 * preview in a shared-entity snapshot so the player's card needs no extra fetch.
 * Falls back to the original data URL if the canvas is unavailable.
 */
export async function makeThumbnail(
  dataUrl: string,
  maxDim = 256,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return { dataUrl, width: img.naturalWidth, height: img.naturalHeight }
  ctx.drawImage(img, 0, 0, width, height)
  let out = canvas.toDataURL('image/webp', 0.8)
  if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/jpeg', 0.8)
  return { dataUrl: out, width, height }
}

/** "1.2 MB" style human-readable size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
