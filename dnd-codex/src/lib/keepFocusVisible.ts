// On an iPhone the on-screen keyboard shrinks the visual viewport and Safari scrolls the page to
// reveal the focused field, which makes the screen jump. This keeps the field being edited (or the
// caret inside a rich text editor) in view whenever the keyboard opens, closes, or resizes.

function target(): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return null
  if (el.matches('input, textarea, select') || el.isContentEditable) return el
  return null
}

function reveal() {
  const el = target()
  if (!el) return
  const vv = window.visualViewport
  const sel = window.getSelection()
  let rect = el.getBoundingClientRect()
  let anchor: HTMLElement = el
  if (el.isContentEditable && sel && sel.rangeCount) {
    const r = sel.getRangeAt(0).getClientRects()[0]
    if (r && r.height) rect = r
    const n = sel.getRangeAt(0).startContainer
    anchor = (n.nodeType === 1 ? (n as HTMLElement) : n.parentElement) ?? el
  }
  const top = vv?.offsetTop ?? 0
  const bottom = top + (vv?.height ?? window.innerHeight)
  const pad = 72
  if (rect.bottom > bottom - pad || rect.top < top + pad / 2) {
    anchor.scrollIntoView({ block: 'center', behavior: 'auto' })
  }
}

export function installKeepFocusVisible() {
  const vv = window.visualViewport
  if (!vv || !window.matchMedia('(pointer: coarse)').matches) return
  let t: number | undefined
  const soon = () => {
    window.clearTimeout(t)
    t = window.setTimeout(reveal, 60)
  }
  vv.addEventListener('resize', soon)
  document.addEventListener('focusin', soon)
  document.addEventListener('selectionchange', () => {
    if (target()?.isContentEditable) soon()
  })
}
