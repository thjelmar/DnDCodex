// Normalizes a user-entered link to a safe http(s) URL. Adds https:// when no
// scheme is given, and rejects other schemes (javascript:, data:, …) so a
// stored link can't be used to inject script.
export function normalizeUrl(raw: string): string | null {
  const url = raw.trim()
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  // Any other explicit scheme is rejected.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null
  return `https://${url}`
}

/** A short display host for a URL, e.g. "dndbeyond.com". */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
