import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createNote } from '../db/repo'
import { useConfirm } from '../components/ConfirmDialog'
import type { Id } from '../db/types'

// Resolves [[wiki link]] targets to campaign entities and follows them. Shared
// by the rich-text editor's click handling. Mirrors the earlier CampaignMarkdown
// behavior: click an existing name to navigate to it; click an unknown one to
// offer creating a world note for it.
export function useWikiResolver(campaignId: Id) {
  const navigate = useNavigate()
  const confirm = useConfirm()

  const index = useLiveQuery(async () => {
    const [npcs, locations, notes, items, sessions, tables] = await Promise.all([
      db.npcs.where('campaignId').equals(campaignId).toArray(),
      db.locations.where('campaignId').equals(campaignId).toArray(),
      db.notes.where('campaignId').equals(campaignId).toArray(),
      db.items.where('campaignId').equals(campaignId).toArray(),
      db.sessions.where('campaignId').equals(campaignId).toArray(),
      db.rollTables.where('campaignId').equals(campaignId).toArray(),
    ])
    const map = new Map<string, string>()
    const put = (name: string, to: string) => {
      const key = name.trim().toLowerCase()
      if (key && !map.has(key)) map.set(key, to)
    }
    npcs.forEach((n) => put(n.name, `/campaign/${campaignId}/npcs?sel=${n.id}`))
    locations.forEach((l) => put(l.name, `/campaign/${campaignId}/locations?sel=${l.id}`))
    notes.forEach((n) => put(n.title, `/campaign/${campaignId}/notes?sel=${n.id}`))
    items.forEach((i) => put(i.name, `/campaign/${campaignId}/items?sel=${i.id}`))
    sessions.forEach((s) => put(s.title, `/campaign/${campaignId}/sessions?sel=${s.id}`))
    tables.forEach((t) => put(t.name, `/campaign/${campaignId}/tables?sel=${t.id}`))
    return map
  }, [campaignId])

  async function follow(target: string) {
    const to = index?.get(target.trim().toLowerCase())
    if (to) {
      navigate(to)
      return
    }
    if (
      await confirm({
        title: 'Create note?',
        message: `No page named “${target}” yet. Create a world note for it?`,
        confirmLabel: 'Create note',
      })
    ) {
      const note = await createNote(campaignId, { title: target })
      navigate(`/campaign/${campaignId}/notes?sel=${note.id}`)
    }
  }

  return { follow }
}
