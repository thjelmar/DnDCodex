// A tiny in-memory ring buffer of recent client-side errors, attached to the
// window's error + unhandledrejection events. The bug reporter includes these so
// a report carries whatever blew up right before the user hit "Report a bug".
// Never persisted; capped and cheap.

export interface LoggedError {
  at: string
  kind: 'error' | 'unhandledrejection'
  message: string
  source?: string
}

const MAX = 20
const buffer: LoggedError[] = []
let installed = false

function push(entry: LoggedError) {
  buffer.push(entry)
  if (buffer.length > MAX) buffer.shift()
}

/** Install the global listeners once (safe to call repeatedly). */
export function installErrorLog() {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (e) => {
    const msg = e.message || String(e.error ?? 'Unknown error')
    const source = e.filename ? `${e.filename}:${e.lineno ?? 0}` : undefined
    push({ at: new Date().toISOString(), kind: 'error', message: msg.slice(0, 500), source })
  })

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    const msg =
      reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? 'Unknown rejection')
    push({ at: new Date().toISOString(), kind: 'unhandledrejection', message: msg.slice(0, 500) })
  })
}

/** A snapshot of the recent errors (most recent last). */
export function getRecentErrors(): LoggedError[] {
  return buffer.slice()
}
