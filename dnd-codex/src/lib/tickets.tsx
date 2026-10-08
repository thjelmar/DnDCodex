// Shared vocabulary for tickets (the bug_reports table): categories, priorities,
// and progress stages, plus the stage bar shown on the Tickets and Roadmap pages.
// The server functions keep their own copies of the allowed values — keep them in
// step with these (functions/api/bug-report.ts, bug-reports.ts).

import { type ReactNode } from 'react'

export type TicketCategory = 'issue' | 'enhancement' | 'feature'
export type TicketPriority = 'urgent' | 'high' | 'medium' | 'low'
export type TicketStatus = 'reported' | 'planned' | 'in_progress' | 'testing' | 'released'
export type TicketSource = 'site' | 'owner'

export const CATEGORIES: { key: TicketCategory; label: string }[] = [
  { key: 'issue', label: 'Issue' },
  { key: 'enhancement', label: 'Enhancement' },
  { key: 'feature', label: 'New feature' },
]

export const PRIORITIES: { key: TicketPriority; label: string }[] = [
  { key: 'urgent', label: 'Urgent' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
]

export const STAGES: { key: TicketStatus; label: string }[] = [
  { key: 'reported', label: 'Reported' },
  { key: 'planned', label: 'Planned' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'testing', label: 'Testing' },
  { key: 'released', label: 'Released' },
]

/** Site reports start at Reported; your own tickets start at Planned. */
export function stagesFor(source: string | null | undefined) {
  return source === 'owner' ? STAGES.filter((s) => s.key !== 'reported') : STAGES
}

export function categoryLabel(c: string | null | undefined): string {
  return CATEGORIES.find((x) => x.key === c)?.label ?? 'Untriaged'
}

export function priorityLabel(p: string | null | undefined): string {
  return PRIORITIES.find((x) => x.key === p)?.label ?? 'No priority'
}

/** Sort key: urgent first, unprioritized last. */
export function priorityRank(p: string | null | undefined): number {
  const i = PRIORITIES.findIndex((x) => x.key === p)
  return i === -1 ? PRIORITIES.length : i
}

export function stageLabel(s: string | null | undefined): string {
  return STAGES.find((x) => x.key === s)?.label ?? String(s ?? '')
}

export function ticketId(n: number | null | undefined): string {
  return n == null ? 'T-?' : `T-${n}`
}

// ---------------------------------------------------------------- commits
// A ticket can carry recorded commits (ticket_commits); SHAs mentioned in a
// comment link to the GitHub commit page — the full message + diff.

export const GITHUB_REPO = 'thjelmar/DnDCodex'

export function commitUrl(sha: string): string {
  return `https://github.com/${GITHUB_REPO}/commit/${sha}`
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

// A commit-SHA token: 7–40 hex that contains at least one letter, so plain
// numbers (years, counts) aren't mistaken for commits.
const SHA_TOKEN = /\b(?=[0-9a-f]{7,40}\b)[0-9a-f]*[a-f][0-9a-f]*\b/gi

/** Render text with commit-SHA tokens turned into links to the GitHub commit. */
export function Linkified({ text }: { text: string }): ReactNode {
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  SHA_TOKEN.lastIndex = 0
  while ((m = SHA_TOKEN.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const sha = m[0]
    out.push(
      <a
        key={`${m.index}-${sha}`}
        href={commitUrl(sha)}
        target="_blank"
        rel="noreferrer"
        className="ticket-commit-link"
        title={`Commit ${sha} on GitHub`}
      >
        {shortSha(sha)}
      </a>,
    )
    last = m.index + sha.length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

/**
 * Stage progress bar. Owner tickets have no Reported stage, so their Planned
 * segment is drawn double-width to fill the same track.
 */
export function StageBar({
  source,
  status,
  showLabels = true,
}: {
  source: string | null | undefined
  status: string
  showLabels?: boolean
}) {
  const stages = stagesFor(source)
  const current = Math.max(0, stages.findIndex((s) => s.key === status))
  const released = status === 'released'
  const columns = stages.map((_, i) => (source === 'owner' && i === 0 ? '2fr' : '1fr')).join(' ')
  const label = stages[current]?.label ?? status
  return (
    <div
      className={`stage-bar${released ? ' released' : ''}`}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={stages.length}
      aria-valuenow={current + 1}
      aria-valuetext={label}
    >
      <div className="stage-track" style={{ gridTemplateColumns: columns }}>
        {stages.map((s, i) => (
          <span key={s.key} className={i <= current ? 'on' : ''} />
        ))}
      </div>
      {showLabels && (
        <div className="stage-labels" style={{ gridTemplateColumns: columns }}>
          {stages.map((s, i) => (
            <span key={s.key} className={i === current ? 'current' : ''}>
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- details text
//
// Ticket details are plain text with two list forms, so they read the same in the
// CLI and on the page:
//   - [ ] something to do      a checkbox (ticked: "- [x]"), struck through when ticked
//   - a plain point            a bullet
// scripts/tickets.mjs parses the same syntax for `show` and `check` — keep the two
// patterns in step.

const CHECK_RE = /^(\s*)[-*]\s+\[([ xX])\]\s?(.*)$/
const BULLET_RE = /^(\s*)[-*]\s+(.*)$/

export type DetailLine =
  | { kind: 'check'; line: number; indent: number; done: boolean; text: string }
  | { kind: 'bullet'; line: number; indent: number; text: string }
  | { kind: 'text'; line: number; text: string }

export function parseDetails(text: string | null | undefined): DetailLine[] {
  return (text ?? '').split('\n').map((raw, line) => {
    const c = CHECK_RE.exec(raw)
    if (c) return { kind: 'check', line, indent: c[1].length, done: c[2] !== ' ', text: c[3] }
    const b = BULLET_RE.exec(raw)
    if (b) return { kind: 'bullet', line, indent: b[1].length, text: b[2] }
    return { kind: 'text', line, text: raw }
  })
}

// The same lines as DetailLine, but without the line index — the shape the
// row editor edits and writes back. `serializeLines` is the exact inverse of
// `parseDetails`, so editing round-trips without touching the stored syntax
// (scripts/tickets.mjs still parses it).
export type EditLine =
  | { kind: 'check'; indent: number; done: boolean; text: string }
  | { kind: 'bullet'; indent: number; text: string }
  | { kind: 'text'; text: string }

export function toEditLines(text: string | null | undefined): EditLine[] {
  return parseDetails(text).map((l) =>
    l.kind === 'check'
      ? { kind: 'check', indent: l.indent, done: l.done, text: l.text }
      : l.kind === 'bullet'
        ? { kind: 'bullet', indent: l.indent, text: l.text }
        : { kind: 'text', text: l.text },
  )
}

export function serializeLines(lines: EditLine[]): string {
  return lines
    .map((l) => {
      if (l.kind === 'check') return `${' '.repeat(l.indent)}- [${l.done ? 'x' : ' '}] ${l.text}`
      if (l.kind === 'bullet') return `${' '.repeat(l.indent)}- ${l.text}`
      return l.text
    })
    .join('\n')
}

/** Flip the checkbox on one line (by line index) and return the new text. */
export function toggleCheck(text: string, line: number): string {
  const lines = text.split('\n')
  const m = CHECK_RE.exec(lines[line] ?? '')
  if (!m) return text
  lines[line] = lines[line].replace(/\[([ xX])\]/, m[2] === ' ' ? '[x]' : '[ ]')
  return lines.join('\n')
}

/** Append a checklist item to the end of the details. */
export function appendCheck(text: string | null | undefined, item: string): string {
  const base = (text ?? '').replace(/\s+$/, '')
  return `${base}${base ? '\n' : ''}- [ ] ${item.trim()}`
}

export function checklistProgress(text: string | null | undefined): { done: number; total: number } {
  const checks = parseDetails(text).filter((l) => l.kind === 'check') as { done: boolean }[]
  return { done: checks.filter((c) => c.done).length, total: checks.length }
}

/** Details rendered with live checkboxes; ticked items are struck through. */
export function DetailsView({
  text,
  onToggle,
}: {
  text: string
  onToggle?: (line: number) => void
}) {
  const lines = parseDetails(text)
  return (
    <div className="ticket-details">
      {lines.map((l) => {
        if (l.kind === 'check') {
          return (
            <label
              key={l.line}
              className={`ticket-check${l.done ? ' done' : ''}`}
              style={{ marginLeft: l.indent * 8 }}
            >
              <input
                type="checkbox"
                checked={l.done}
                disabled={!onToggle}
                onChange={() => onToggle?.(l.line)}
              />
              <span>{l.text}</span>
            </label>
          )
        }
        if (l.kind === 'bullet') {
          return (
            <div key={l.line} className="ticket-bullet" style={{ marginLeft: l.indent * 8 }}>
              {l.text}
            </div>
          )
        }
        return (
          <div key={l.line} className="ticket-line">
            {l.text || ' '}
          </div>
        )
      })}
    </div>
  )
}
