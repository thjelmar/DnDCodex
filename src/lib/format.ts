// Small formatting helpers shared across pages.

/** "Aug 4, 2026" from an ISO date or datetime string. */
export function formatDate(iso: string): string {
  if (!iso) return ''
  // Treat a bare YYYY-MM-DD as local noon to avoid timezone off-by-one.
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** "3 days ago" style relative time from an ISO timestamp. */
export function relativeTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(iso)
}

/** Today's date as YYYY-MM-DD in local time (for date input defaults). */
export function todayISODate(): string {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}
