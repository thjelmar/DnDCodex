import { useEffect, useState } from 'react'
import { getThumbnail, peekThumbnail } from './thumbnail'

/** True once the element has come within `rootMargin` of the screen (and stays true).
 *  A hidden element, such as a collapsed card body, has no box and never counts. */
export function useInView(rootMargin = '200px'): [(node: HTMLElement | null) => void, boolean] {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!node || seen) return
    if (typeof IntersectionObserver === 'undefined') {
      setSeen(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [node, seen, rootMargin])
  return [setNode, seen]
}

export type ThumbStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'failed'

/**
 * A small preview of a stored image, loaded only once the returned `ref` element is
 * on (or near) the screen. Until then, and while loading, `src` is null, so the first
 * paint never waits on an image; callers draw a placeholder at the same size.
 */
export function useLazyThumb(imageId: string | null | undefined, maxEdge: number) {
  const [ref, inView] = useInView()
  // The state remembers which image it belongs to. When the id changes, whatever was
  // loaded for the old id is ignored at once (in the very next render, not after an
  // effect), so an old picture never stays on screen while a new one loads or is missing.
  const [state, setState] = useState<{ forId: string | null; status: ThumbStatus; src: string | null }>(() => {
    const hit = imageId ? peekThumbnail(imageId, maxEdge) : undefined
    return hit?.status === 'ready'
      ? { forId: imageId ?? null, status: 'ready', src: hit.src }
      : { forId: imageId ?? null, status: 'idle', src: null }
  })

  useEffect(() => {
    const id = imageId ?? null
    if (!id) {
      setState({ forId: null, status: 'idle', src: null })
      return
    }
    // A preview already made for this exact image and size is used straight away.
    const hit = peekThumbnail(id, maxEdge)
    if (hit?.status === 'ready') {
      setState({ forId: id, status: 'ready', src: hit.src })
      return
    }
    if (!inView) {
      setState({ forId: id, status: 'idle', src: null })
      return
    }
    let live = true
    setState({ forId: id, status: 'loading', src: null })
    getThumbnail(id, maxEdge)
      .then((r) => live && setState(r.status === 'ready' ? { forId: id, status: 'ready', src: r.src } : { forId: id, status: 'missing', src: null }))
      .catch(() => live && setState({ forId: id, status: 'failed', src: null }))
    return () => {
      live = false
    }
  }, [imageId, maxEdge, inView])

  const current = state.forId === (imageId ?? null)
  return {
    ref,
    status: (current ? state.status : 'idle') as ThumbStatus,
    src: current ? state.src : null,
  }
}
