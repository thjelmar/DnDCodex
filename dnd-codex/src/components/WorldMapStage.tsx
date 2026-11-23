import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { WorldMapCanvas, type WorldMapCanvasHandle } from './WorldMapCanvas'
import { Icon } from './Icon'
import type { WorldPin } from '../db/types'

/** One map the stage can show: the root map or a detail map. */
export interface StageMap {
  id: string
  name: string
  imageUrl: string | null
  width: number
  height: number
  pins: WorldPin[]
  parentMapId?: string | null
}

const OPEN_MS = 750
const EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'
const ZOOM_TO = 6
const MAX_DEPTH = 8

/** The open detail map id from `?map=`, with open and close that keep the browser
 *  history honest: opening pushes an entry, and Close goes back one entry when this
 *  page pushed it (otherwise it replaces the URL). */
export function useDetailMapRoute() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const openId = params.get('map')
  const pushed = useRef(false)
  useEffect(() => { if (!openId) pushed.current = false }, [openId])
  const open = useCallback((id: string) => {
    pushed.current = true
    setParams({ map: id })
  }, [setParams])
  const close = useCallback(() => {
    if (pushed.current) navigate(-1)
    else setParams({}, { replace: true })
  }, [navigate, setParams])
  return { openId, open, close }
}

/** The chain of map ids from the root down to `openId` (just `[rootId]` when the id is
 *  unknown). A map whose parent is not in `maps` counts as a child of the root, which
 *  is how the player view works (it does not know the DM's root id). */
export function mapChain(maps: StageMap[], rootId: string, openId: string | null): string[] {
  const byId = new Map(maps.map((m) => [m.id, m]))
  const down: string[] = []
  let cur = openId ? byId.get(openId) : undefined
  for (let i = 0; cur && cur.id !== rootId && i < MAX_DEPTH; i++) {
    down.push(cur.id)
    cur = cur.parentMapId ? byId.get(cur.parentMapId) : undefined
  }
  return [rootId, ...down.reverse()]
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Shows the root world map and, on top of it, the open detail map. Opening zooms the
 *  larger map toward the pin while the detail map grows out of it; Close reverses that.
 *  Every map in the chain stays mounted, so the larger map keeps its pan and zoom. */
export function WorldMapStage({
  maps,
  rootId,
  openId,
  onOpen,
  onClose,
  editable = false,
  selectedPinId = null,
  onSelectPin,
  onAddPin,
  onMovePin,
}: {
  maps: StageMap[]
  rootId: string
  openId: string | null
  onOpen: (mapId: string) => void
  onClose: () => void
  /** Editing applies to the top map only. */
  editable?: boolean
  selectedPinId?: string | null
  onSelectPin?: (id: string | null) => void
  onAddPin?: (x: number, y: number) => void
  onMovePin?: (id: string, x: number, y: number) => void
}) {
  const byId = useMemo(() => new Map(maps.map((m) => [m.id, m])), [maps])
  const chain = useMemo(() => mapChain(maps, rootId, openId), [maps, rootId, openId])
  const chainKey = chain.join('|')
  const [mounted, setMounted] = useState<string[]>(chain)
  const [animating, setAnimating] = useState(false)
  const layers = useRef(new Map<string, HTMLDivElement>())
  const canvases = useRef(new Map<string, WorldMapCanvasHandle>())
  const pending = useRef<{ parent: string; child: string; origin: { x: number; y: number } } | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  const originFor = useCallback((parentId: string, childId: string) => {
    const parent = byId.get(parentId)
    const pin = parent?.pins.find((p) => p.detailMapId === childId)
    const pt = pin ? canvases.current.get(parentId)?.pinPoint(pin.id) : null
    const r = stageRef.current?.getBoundingClientRect()
    return pt ?? { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 }
  }, [byId])

  // Reconcile the target chain (from the URL) with the mounted layers.
  // It waits for a running transition to end, then reconciles against the latest chain,
  // so rapid history changes (back, forward) never leave the layers out of step.
  useEffect(() => {
    if (animating || chainKey === mounted.join('|')) return
    const have = mounted.length
    if (chain.length > have && chain.slice(0, have).join('|') === mounted.join('|')) {
      // Opening: mount the new layer, then animate it in (see the layout effect).
      const parent = chain[have - 1]
      const child = chain[have]
      pending.current = { parent, child, origin: originFor(parent, child) }
      setAnimating(true)
      setMounted(chain)
    } else if (chain.length < have && mounted.slice(0, chain.length).join('|') === chain.join('|')) {
      // Closing: animate the top layer out, then unmount it.
      const child = mounted[have - 1]
      const parent = mounted[have - 2]
      const origin = originFor(parent, child)
      setAnimating(true)
      void play('close', layers.current.get(parent), layers.current.get(child), origin).then(() => {
        setMounted((m) => m.slice(0, have - 1))
        setAnimating(false)
      })
    } else {
      setMounted(chain) // A jump (for example browser history across two levels): no animation.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainKey, animating, mounted])

  useLayoutEffect(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    void play('open', layers.current.get(p.parent), layers.current.get(p.child), p.origin).then(() => setAnimating(false))
  }, [mounted])

  // Escape closes the detail map, unless the user is typing.
  useEffect(() => {
    if (chain.length < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chain.length, onClose])

  const topId = chain[chain.length - 1]
  const inside = chain.length > 1

  return (
    <div ref={stageRef} className={`wm-stage${animating ? ' is-animating' : ''}`}>
      {mounted.map((id, i) => {
        const m = byId.get(id)
        if (!m) return null
        const isTop = id === topId && i === mounted.length - 1
        return (
          <div
            key={id}
            ref={(el) => { if (el) layers.current.set(id, el); else layers.current.delete(id) }}
            className={`wm-layer${isTop ? '' : ' is-covered'}`}
            // `inert` keeps the covered map out of the tab order and away from clicks.
            {...(isTop ? {} : ({ inert: '' } as object))}
          >
            <WorldMapCanvas
              ref={(h) => { if (h) canvases.current.set(id, h); else canvases.current.delete(id) }}
              imageUrl={m.imageUrl}
              width={m.width}
              height={m.height}
              pins={m.pins}
              editable={editable && isTop}
              selectedPinId={isTop ? selectedPinId : null}
              onSelectPin={isTop ? onSelectPin : undefined}
              onAddPin={isTop ? onAddPin : undefined}
              onMovePin={isTop ? onMovePin : undefined}
              openable={(p) => !!p.detailMapId && byId.has(p.detailMapId)}
              onOpenPin={(p) => { if (p.detailMapId) onOpen(p.detailMapId) }}
            />
          </div>
        )
      })}
      {inside && (
        <div className="wm-crumbs" onPointerDown={(e) => e.stopPropagation()}>
          <button className="btn small wm-close" onClick={onClose} aria-label="Close the detail map and return to the larger map">
            <Icon name="chevron-left" size={16} color="inherit" /> Close
          </button>
          <nav className="wm-breadcrumb" aria-label="Map breadcrumb">
            {chain.map((id, i) => {
              const last = i === chain.length - 1
              const name = byId.get(id)?.name?.trim() || 'Map'
              return (
                <span key={id} className="wm-crumb-part">
                  {i > 0 && <span className="wm-crumb-sep" aria-hidden>/</span>}
                  {last ? (
                    <span className="wm-crumb-current" aria-current="page">{name}</span>
                  ) : (
                    <button className="wm-crumb-link" onClick={i === 0 ? onClose : () => onOpen(id)}>{name}</button>
                  )}
                </span>
              )
            })}
          </nav>
        </div>
      )}
    </div>
  )
}

/** Run the open or close transition between two layers. Resolves when it ends. */
async function play(
  kind: 'open' | 'close',
  parent: HTMLElement | undefined,
  child: HTMLElement | undefined,
  origin: { x: number; y: number },
): Promise<void> {
  if (!parent || !child) return
  const reduce = reducedMotion()
  const duration = reduce ? 200 : OPEN_MS
  const easing = reduce ? 'ease' : EASE
  const origin2 = `${origin.x}px ${origin.y}px`
  parent.style.transformOrigin = origin2
  child.style.transformOrigin = origin2
  const grow = (a: number, b: number) => (reduce ? {} : { transform: [`scale(${a})`, `scale(${b})`] })
  const fade = (a: number, b: number) => ({ opacity: [a, b] })
  const opts: KeyframeAnimationOptions = { duration, easing, fill: 'both' }
  const anims: Animation[] = []
  if (kind === 'open') {
    anims.push(parent.animate({ ...grow(1, ZOOM_TO), ...fade(1, 0) } as PropertyIndexedKeyframes, opts))
    anims.push(child.animate({ ...grow(0.2, 1), ...fade(0, 1) } as PropertyIndexedKeyframes, opts))
  } else {
    anims.push(parent.animate({ ...grow(ZOOM_TO, 1), ...fade(0, 1) } as PropertyIndexedKeyframes, opts))
    anims.push(child.animate({ ...grow(1, 0.2), ...fade(1, 0) } as PropertyIndexedKeyframes, opts))
  }
  await Promise.all(anims.map((a) => a.finished.catch(() => undefined)))
  if (kind === 'close') {
    // The parent is back to its natural look; drop the finished effects.
    for (const a of anims) { try { a.cancel() } catch { /* already gone */ } }
  } else {
    // Keep the parent's end state (hidden) and the child's (natural) for the open.
    anims[1].cancel()
  }
}
