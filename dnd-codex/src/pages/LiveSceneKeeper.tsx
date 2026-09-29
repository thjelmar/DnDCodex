import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { updateScene } from '../db/repo'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useLiveScene } from '../auth/liveScene'
import { useDmLiveScene } from './useDmLiveScene'
import { useCombatState } from '../components/CombatRoster'
import type { Campaign, Id, Scene } from '../db/types'

// Keeps the map players are seeing in sync while its editor ISN'T open (e.g. it
// was shown from Run mode's "Start live session" offer, or the DM switched Run
// mode's center back to Notes). It re-pushes player color changes and records
// player moves into the saved scene. When the map's editor is open, the editor
// does this itself, so the keeper steps aside; the registry below tracks that.

const openEditors = new Map<Id, number>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/** Called by SceneEditor: marks its scene's editor as open while mounted. */
export function useRegisterSceneEditor(sceneId: Id) {
  useEffect(() => {
    openEditors.set(sceneId, (openEditors.get(sceneId) ?? 0) + 1)
    notify()
    return () => {
      const n = (openEditors.get(sceneId) ?? 1) - 1
      if (n > 0) openEditors.set(sceneId, n)
      else openEditors.delete(sceneId)
      notify()
    }
  }, [sceneId])
}

function useIsSceneEditorOpen(sceneId: Id | null): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => (sceneId ? openEditors.has(sceneId) : false),
  )
}

// The `openEditors` registry above is a per-tab module singleton, so two DM tabs
// each ran their own background keeper and both pushed to the cloud. Elect a
// single keeper per campaign across all tabs with the Web Locks API: only the
// tab holding the lock runs the keeper. The lock is released automatically when
// that tab navigates away, closes, or crashes, so another tab takes over. Where
// Web Locks aren't available, fall back to the old behaviour (every tab keeps —
// harmless duplicates). Only the passive keeper is gated; an open editor always
// pushes its own edits, so a DM's changes are never withheld.
const supportsLocks = typeof navigator !== 'undefined' && 'locks' in navigator

function useIsKeeperLeader(campaignId: Id | null): boolean {
  const [leader, setLeader] = useState(false)
  useEffect(() => {
    if (!campaignId) {
      setLeader(false)
      return
    }
    if (!supportsLocks) {
      setLeader(true)
      return
    }
    setLeader(false)
    const ac = new AbortController()
    let release: (() => void) | null = null
    let done = false
    navigator.locks
      .request(`codex.scenePush.${campaignId}`, { signal: ac.signal }, () =>
        // Hold the lock (stay leader) until we release on cleanup.
        new Promise<void>((resolve) => {
          if (done) {
            resolve()
            return
          }
          setLeader(true)
          release = () => {
            setLeader(false)
            resolve()
          }
        }),
      )
      .catch(() => {
        // AbortError on unmount while still waiting for the lock — not an error.
      })
    return () => {
      done = true
      ac.abort() // cancels a still-pending acquire
      release?.() // releases the held lock so another tab can take over
    }
  }, [campaignId])
  return leader
}

/** Mount once on DM campaign screens (campaign layout, Run mode). Renders nothing. */
export function LiveSceneKeeper({ campaign }: { campaign: Campaign }) {
  const { user } = useAuth()
  const live = useLiveScene(supabase && user ? campaign.id : null)
  const sceneId = live.scene?.sceneId ?? null
  const editorOpen = useIsSceneEditorOpen(sceneId)
  const isLeader = useIsKeeperLeader(supabase && user ? campaign.id : null)
  const scene = useLiveQuery(() => (sceneId ? db.scenes.get(sceneId) : undefined), [sceneId])
  if (!sceneId || editorOpen || !scene || !isLeader) return null
  return <KeeperFor key={scene.id} campaign={campaign} scene={scene} />
}

function KeeperFor({ campaign, scene }: { campaign: Campaign; scene: Scene }) {
  const combat = useCombatState()
  useDmLiveScene(
    campaign,
    {
      sceneId: scene.id,
      name: scene.name,
      grid: scene.grid,
      width: scene.width,
      height: scene.height,
      imageId: scene.imageId,
      tokens: scene.tokens,
      fog: scene.fog ?? null,
      combat,
    },
    async (moves) => {
      // Read fresh so concurrent edits aren't clobbered by a stale copy.
      const current = await db.scenes.get(scene.id)
      if (!current) return
      await updateScene(scene.id, {
        tokens: current.tokens.map((t) => {
          const m = moves.find((x) => x.id === t.id)
          return m ? { ...t, col: m.col, row: m.row } : t
        }),
      })
    },
  )
  return null
}
