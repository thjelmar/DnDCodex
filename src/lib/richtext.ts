// Helpers for working with the rich-text HTML now stored in prose fields.

/** Strips HTML tags and decodes common entities to plain text (for search). */
export function htmlToText(html: string): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when the HTML has no meaningful content (empty paragraphs, whitespace). */
export function isRichTextEmpty(html: string): boolean {
  if (!html) return true
  const withoutTags = html.replace(/<(?!img)[^>]+>/gi, '').replace(/&nbsp;/gi, '').trim()
  // Consider it non-empty if any text remains or there's an image.
  return withoutTags === '' && !/<img\b/i.test(html)
}

/** The distinct [[wiki link]] targets in a rich-text field, in document order. */
export function wikiTargets(html: string): string[] {
  if (!html || !html.includes('data-wikilink')) return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const out: string[] = []
  const seen = new Set<string>()
  doc.querySelectorAll('a[data-wikilink]').forEach((a) => {
    const target = (a.getAttribute('data-wikilink') || a.textContent || '').trim()
    const key = target.toLowerCase()
    if (target && !seen.has(key)) {
      seen.add(key)
      out.push(target)
    }
  })
  return out
}
