/** How a copy attempt ended. `manual` means the caller must show the text for the user to copy. */
export type CopyResult = 'copied' | 'shared' | 'manual'

/** Old-style copy through a hidden textarea. Works in WebViews that block `navigator.clipboard`. */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'
  document.body.appendChild(ta)
  try {
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, text.length) // iOS needs the explicit range
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(ta)
  }
}

/**
 * Copy text with a fallback chain: Clipboard API, then `execCommand('copy')`, then the Web Share
 * sheet. Returns `manual` when all of them fail, so the UI can show a selectable text box.
 * Call it straight from a tap handler so the browser still counts it as a user gesture.
 */
export async function copyText(text: string): Promise<CopyResult> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return 'copied'
    }
  } catch {
    /* blocked or not allowed here; try the next way */
  }
  if (legacyCopy(text)) return 'copied'
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ text })
      return 'shared'
    }
  } catch {
    /* the user closed the share sheet, or sharing is blocked */
  }
  return 'manual'
}
