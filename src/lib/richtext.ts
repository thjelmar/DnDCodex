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
