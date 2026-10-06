import type { TimelineEvent, PlotThread } from '../db/types'

// Rule-based timeline consistency check. It compares the DM's manual ordering
// (sortKey) against the in-world `year` on each event and flags where they
// disagree — the structural version of "my town predates the world's start".
// It reasons only about the timeline's own events and their years; it does not
// read prose (that would need an LLM).

export type TimelineIssueKind = 'order' | 'thread-order' | 'undated'

export interface TimelineIssue {
  id: string
  kind: TimelineIssueKind
  /** Higher = more pressing (a hard contradiction vs. a gentle nudge). */
  severity: 'warn' | 'info'
  message: string
  suggestion: string
  /** The event to jump to / highlight, when the issue is about one. */
  eventId?: string
}

const hasYear = (e: TimelineEvent): e is TimelineEvent & { year: number } => typeof e.year === 'number'
const bySort = (a: TimelineEvent, b: TimelineEvent) => a.sortKey - b.sortKey

/** All consistency issues, most pressing first. */
export function checkTimeline(events: TimelineEvent[], threads: PlotThread[]): TimelineIssue[] {
  const issues: TimelineIssue[] = []
  const ordered = [...events].sort(bySort)
  const dated = ordered.filter(hasYear)

  // 1) Global order: scanning the line top-to-bottom, the year should never go
  //    backwards. Where it does, the later-placed event is dated too early.
  let maxYear = -Infinity
  let maxEvent: (TimelineEvent & { year: number }) | null = null
  for (const e of dated) {
    if (e.year < maxYear && maxEvent) {
      issues.push({
        id: `order:${e.id}`,
        kind: 'order',
        severity: 'warn',
        message: `“${e.title}” is dated year ${e.year}, but it sits after “${maxEvent.title}” (year ${maxYear}) on the timeline.`,
        suggestion: `Give it a year of ${maxYear} or later, or move it earlier — “Reorder by year” fixes the whole line at once.`,
        eventId: e.id,
      })
    } else {
      maxYear = e.year
      maxEvent = e
    }
  }

  // 2) Within a plot thread, the same check — a thread can read in order overall
  //    yet have its own beats out of sequence once interleaved with others.
  for (const t of threads) {
    const te = dated.filter((e) => e.threadId === t.id)
    let tMax = -Infinity
    let tPrev: (TimelineEvent & { year: number }) | null = null
    for (const e of te) {
      if (e.year < tMax && tPrev && !issues.some((i) => i.eventId === e.id)) {
        issues.push({
          id: `thread:${e.id}`,
          kind: 'thread-order',
          severity: 'warn',
          message: `In “${t.name}”, “${e.title}” (year ${e.year}) comes after “${tPrev.title}” (year ${tMax}) but is dated earlier.`,
          suggestion: `Re-date it to ${tMax} or later, or reorder the thread’s beats.`,
          eventId: e.id,
        })
      } else {
        tMax = e.year
        tPrev = e
      }
    }
  }

  // 3) Undated events can't be checked. One gentle nudge if several are missing.
  const undated = ordered.filter((e) => !hasYear(e))
  if (undated.length > 0 && dated.length > 0) {
    issues.push({
      id: 'undated',
      kind: 'undated',
      severity: 'info',
      message: `${undated.length} event${undated.length === 1 ? '' : 's'} ${undated.length === 1 ? 'has' : 'have'} no in-world year, so ${undated.length === 1 ? "it isn't" : "they aren't"} checked.`,
      suggestion: 'Add a year to each event to include it in the consistency check.',
    })
  }

  // Warnings before info.
  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1))
}

/** New sortKeys that put every dated event in year order (ties keep their
 *  current relative order); undated events trail, keeping their order. Returns
 *  only the events whose sortKey actually changes. */
export function reorderByYear(events: TimelineEvent[]): { id: string; sortKey: number }[] {
  const resequenced = [...events].sort((a, b) => {
    const ay = hasYear(a) ? a.year : Infinity
    const by = hasYear(b) ? b.year : Infinity
    return ay !== by ? ay - by : a.sortKey - b.sortKey
  })
  const out: { id: string; sortKey: number }[] = []
  resequenced.forEach((e, i) => {
    const sortKey = (i + 1) * 10
    if (e.sortKey !== sortKey) out.push({ id: e.id, sortKey })
  })
  return out
}
