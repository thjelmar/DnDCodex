// A "what to do before the next session" checklist, derived from the campaign's
// own records. Nothing is stored: each item is true or false from the data, so it
// ticks itself once the gap is filled. Pure and synchronous, so it is easy to test.

export interface PrepInput {
  campaign: { nextSessionDate?: string | null; description: string }
  sessions: Array<{ id: string; title: string; date: string; notes: string }>
  npcs: Array<{
    id: string
    name: string
    disposition: string
    statBlockData?: unknown
    statBlock: string
  }>
  locations: Array<{ id: string; name: string; description: string }>
  /** Today as YYYY-MM-DD (local). Passed in so tests can fix it. */
  today: string
}

export interface PrepItem {
  key: string
  label: string
  /** Short extra line (for example the names behind a count). */
  detail?: string
  done: boolean
  /** Route under /campaign/:id (may carry a query string). */
  to: string
}

/** True when an HTML or Markdown string has visible content: text, or an embedded
 *  image, video or iframe (a description that is only a picture is not blank). */
export function hasText(s: string | null | undefined): boolean {
  if (!s) return false
  if (/<(img|video|iframe)\b/i.test(s)) return true
  return s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim() !== ''
}

function names(list: string[], max = 3): string {
  const shown = list.slice(0, max).join(', ')
  return list.length > max ? `${shown} and ${list.length - max} more` : shown
}

export function derivePrepChecklist(input: PrepInput): PrepItem[] {
  const { campaign, sessions, npcs, locations, today } = input
  const items: PrepItem[] = []

  // 1. A date for the next session (a past date counts as not scheduled).
  const next = campaign.nextSessionDate
  items.push({
    key: 'schedule',
    label: 'Schedule the next session',
    done: !!next && next >= today,
    to: '?planner=1',
  })

  // 2. The recap for the latest session, or a first session if there are none.
  const latest = [...sessions].sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!latest) {
    items.push({ key: 'recap', label: 'Log your first session', done: false, to: 'sessions' })
  } else {
    items.push({
      key: 'recap',
      label: `Write the recap for ${latest.title || 'your latest session'}`,
      done: hasText(latest.notes),
      to: `sessions?sel=${latest.id}`,
    })
  }

  // 3. Hostile NPCs that have no stat block yet.
  const bare = npcs.filter((n) => n.disposition === 'hostile' && !n.statBlockData && !hasText(n.statBlock))
  if (bare.length > 0 || npcs.some((n) => n.disposition === 'hostile')) {
    items.push({
      key: 'statblocks',
      label: bare.length > 0 ? `Add stat blocks for ${bare.length} hostile NPC${bare.length === 1 ? '' : 's'}` : 'Hostile NPCs have stat blocks',
      detail: bare.length > 0 ? names(bare.map((n) => n.name)) : undefined,
      done: bare.length === 0,
      to: bare.length === 1 ? `npcs?sel=${bare[0].id}` : 'npcs',
    })
  }

  // 4. Locations with no description.
  const blank = locations.filter((l) => !hasText(l.description))
  if (locations.length > 0) {
    items.push({
      key: 'locations',
      label: blank.length > 0 ? `Describe ${blank.length} location${blank.length === 1 ? '' : 's'}` : 'Every location has a description',
      detail: blank.length > 0 ? names(blank.map((l) => l.name)) : undefined,
      done: blank.length === 0,
      to: blank.length === 1 ? `locations?sel=${blank[0].id}` : 'locations',
    })
  }

  // 5. A world overview for the campaign.
  items.push({
    key: 'overview',
    label: 'Write the world overview',
    done: hasText(campaign.description),
    // Opens the Edit campaign dialog (OverviewPage reads ?edit=1, like ?planner=1).
    to: '?edit=1',
  })

  return items
}
