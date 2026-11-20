// The numbers and text behind the four Overview hub cards (Prep, Run, World &
// Lore, Reference). Pure functions over plain records, so they are easy to test
// and never touch the network.

/** The few token fields the Run card's avatars need. */
export interface SceneTokenSummary {
  id: string
  label: string
  color: string
  imageId?: string | null
  icon?: string | null
  tokenIcon?: string | null
}

export interface SceneSummary {
  id: string
  name: string
  width: number
  height: number
  /** Size of one grid cell in image pixels; 0 when unknown. */
  cellPx: number
  updatedAt: string
  /** The map image (a StoredImage id), or null for a blank grid. */
  imageId: string | null
  /** The first few visible tokens, for the avatars over the thumbnail. */
  tokens: SceneTokenSummary[]
}

/** The world map the World card previews. */
export interface WorldMapSummary {
  id: string
  name: string
  imageId: string | null
}

export interface HubInput {
  /** Count of unticked items in the prep checklist. */
  pendingTasks: number
  sessions: Array<{ id: string; title: string; date: string; notes: string; tags?: string[] }>
  npcs: Array<{ disposition: string; tags?: string[] }>
  locations: Array<{ id: string; tags?: string[] }>
  items: Array<{ id: string; name: string; rarity: string; updatedAt: string; tags?: string[] }>
  notes: Array<{ tags?: string[] }>
  tables: Array<{ tags?: string[] }>
  scenes: SceneSummary[]
  mappedLocationIds: string[]
  timelineCount: number
  familyCount: number
}

export interface HubCards {
  prep: {
    pendingTasks: number
    lastSession: { id: string; title: string; date: string; excerpt: string } | null
    sessions: number
    timeline: number
    tables: number
  }
  run: {
    scenes: number
    /** The most recently updated scene, or null when there are none. */
    latestScene: SceneSummary | null
    /** Grid size of that scene as columns by rows, or null when unknown. */
    grid: { cols: number; rows: number } | null
    /** True when there is a session to run and a scene to show. */
    ready: boolean
  }
  world: {
    npcs: number
    hostile: number
    locations: number
    /** Locations that have a pin on a world map. */
    mapped: number
    notes: number
    families: number
    empty: boolean
  }
  reference: {
    items: number
    tables: number
    tags: number
    /** The three most recently added or edited items. */
    recentItems: Array<{ id: string; name: string; rarity: string }>
  }
}

/** Strip HTML tags and common Markdown marks, collapse whitespace, and cut to `max`
 *  characters at a word boundary with an ellipsis. */
export function plainExcerpt(text: string | null | undefined, max = 170): string {
  if (!text) return ''
  const plain = text
    .replace(/<[^>]*>/g, ' ')
    // Decode the few entities rich text produces. &amp; goes last so "&amp;lt;" stays "&lt;".
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_`>~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, '') + '…'
}

export function gridSize(scene: Pick<SceneSummary, 'width' | 'height' | 'cellPx'>): { cols: number; rows: number } | null {
  if (!(scene.cellPx > 0) || !(scene.width > 0) || !(scene.height > 0)) return null
  const cols = Math.round(scene.width / scene.cellPx)
  const rows = Math.round(scene.height / scene.cellPx)
  return cols > 0 && rows > 0 ? { cols, rows } : null
}

export function deriveHubCards(input: HubInput): HubCards {
  const lastSession = [...input.sessions].sort((a, b) => b.date.localeCompare(a.date))[0]
  const latestScene = [...input.scenes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]

  const locationIds = new Set(input.locations.map((l) => l.id))
  // Each location counts once, however many pins it has, and a pin for a deleted
  // location counts for nothing.
  const mapped = new Set(input.mappedLocationIds.filter((id) => locationIds.has(id))).size

  const tags = new Set<string>()
  for (const list of [input.sessions, input.npcs, input.locations, input.items, input.notes, input.tables]) {
    for (const r of list) for (const t of r.tags ?? []) tags.add(t)
  }

  const world = {
    npcs: input.npcs.length,
    hostile: input.npcs.filter((n) => n.disposition === 'hostile').length,
    locations: input.locations.length,
    mapped,
    notes: input.notes.length,
    families: input.familyCount,
  }

  return {
    prep: {
      pendingTasks: input.pendingTasks,
      lastSession: lastSession
        ? { id: lastSession.id, title: lastSession.title, date: lastSession.date, excerpt: plainExcerpt(lastSession.notes) }
        : null,
      sessions: input.sessions.length,
      timeline: input.timelineCount,
      tables: input.tables.length,
    },
    run: {
      scenes: input.scenes.length,
      latestScene: latestScene ?? null,
      grid: latestScene ? gridSize(latestScene) : null,
      ready: input.sessions.length > 0 && input.scenes.length > 0,
    },
    world: { ...world, empty: world.npcs + world.locations + world.notes + world.families === 0 },
    reference: {
      items: input.items.length,
      tables: input.tables.length,
      tags: tags.size,
      recentItems: [...input.items]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 3)
        .map((i) => ({ id: i.id, name: i.name || 'Untitled', rarity: i.rarity })),
    },
  }
}

/**
 * The NPCs to show in the World card's portrait strip: up to `max`, those with a
 * portrait first, then the rest, each group newest-edited first. Only ids are read
 * later, so at most `max` portraits are ever fetched.
 */
export function pickPortraitNpcs<T extends { imageId?: string | null; updatedAt: string }>(npcs: T[], max = 5): T[] {
  const byNewest = (a: T, b: T) => b.updatedAt.localeCompare(a.updatedAt)
  const withImage = npcs.filter((n) => !!n.imageId).sort(byNewest)
  const without = npcs.filter((n) => !n.imageId).sort(byNewest)
  return [...withImage, ...without].slice(0, max)
}
