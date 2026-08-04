import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createNote } from '../db/repo'
import { Markdown } from '../lib/markdown'
import type { Id } from '../db/types'

// Renders markdown with live [[wiki links]] scoped to a campaign. A link's
// target text is matched (case-insensitively) against the names/titles of every
// entity in the campaign; clicking navigates straight to it via the ?sel= deep
// link. Unresolved links render "broken" and, when clicked, offer to create a
// world note with that title — the classic wiki red-link behavior.

interface Target {
  to: string
}

/**
 * Builds a name -> navigation-target index for a campaign. When two entities
 * share a name the first one added wins; the insertion order below sets that
 * precedence (NPCs and locations are the most commonly linked).
 */
function useEntityIndex(campaignId: Id): Map<string, Target> | undefined {
  return useLiveQuery(async () => {
    const [npcs, locations, notes, items, sessions, tables] = await Promise.all([
      db.npcs.where('campaignId').equals(campaignId).toArray(),
      db.locations.where('campaignId').equals(campaignId).toArray(),
      db.notes.where('campaignId').equals(campaignId).toArray(),
      db.items.where('campaignId').equals(campaignId).toArray(),
      db.sessions.where('campaignId').equals(campaignId).toArray(),
      db.rollTables.where('campaignId').equals(campaignId).toArray(),
    ])
    const map = new Map<string, Target>()
    const put = (name: string, to: string) => {
      const key = name.trim().toLowerCase()
      if (key && !map.has(key)) map.set(key, { to })
    }
    npcs.forEach((n) => put(n.name, `/campaign/${campaignId}/npcs?sel=${n.id}`))
    locations.forEach((l) => put(l.name, `/campaign/${campaignId}/locations?sel=${l.id}`))
    notes.forEach((n) => put(n.title, `/campaign/${campaignId}/notes?sel=${n.id}`))
    items.forEach((i) => put(i.name, `/campaign/${campaignId}/items?sel=${i.id}`))
    sessions.forEach((s) => put(s.title, `/campaign/${campaignId}/sessions?sel=${s.id}`))
    tables.forEach((t) => put(t.name, `/campaign/${campaignId}/tables?sel=${t.id}`))
    return map
  }, [campaignId])
}

export function CampaignMarkdown({ campaignId, text }: { campaignId: Id; text: string }) {
  const index = useEntityIndex(campaignId)
  const navigate = useNavigate()

  const linkExists = (target: string) =>
    !!index?.has(target.trim().toLowerCase())

  const onWikiLink = async (target: string) => {
    const hit = index?.get(target.trim().toLowerCase())
    if (hit) {
      navigate(hit.to)
      return
    }
    // Red link: offer to create the page it points to.
    if (confirm(`No page named “${target}” yet. Create a world note for it?`)) {
      const note = await createNote(campaignId, { title: target })
      navigate(`/campaign/${campaignId}/notes?sel=${note.id}`)
    }
  }

  return <Markdown text={text} onWikiLink={onWikiLink} linkExists={linkExists} />
}
