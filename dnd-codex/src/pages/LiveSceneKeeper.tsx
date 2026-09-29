import { useEffect, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { updateScene } from '../db/repo'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useLiveScene } from '../auth/liveScene'
import { useDmLiveScene } from './useDmLiveScene'
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

/** Mount once on DM campaign screens (campaign layout, Run mode). Renders nothing. */
export function LiveSceneKeeper({ campaign }: { campaign: Campaign }) {
  const { user } = useAuth()
  const live = useLiveScene(supabase && user ? campaign.id : null)
  const sceneId = live.scene?.sceneId ?? null
  const editorOpen = useIsSceneEditorOpen(sceneId)
  const scene = useLiveQuery(() => (sceneId ? db.scenes.get(sceneId) : undefined), [sceneId])
  if (!sceneId || editorOpen || !scene) return null
  return <KeeperFor key={scene.id} campaign={campaign} scene={scene} />
}

function KeeperFor({ campaign, scene }: { campaign: Campaign; scene: Scene }) {
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
