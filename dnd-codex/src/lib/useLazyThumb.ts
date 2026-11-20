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
  const [state, setState] = useState<{ status: ThumbStatus; src: string | null }>(() => {
    const hit = imageId ? peekThumbnail(imageId, maxEdge) : undefined
    return hit?.status === 'ready' ? { status: 'ready', src: hit.src } : { status: 'idle', src: null }
  })

  useEffect(() => {
    if (!imageId) {
      setState({ status: 'idle', src: null })
      return
    }
    if (!inView) return
    let live = true
    setState((s) => (s.status === 'ready' ? s : { status: 'loading', src: null }))
    getThumbnail(imageId, maxEdge)
      .then((r) => live && setState(r.status === 'ready' ? { status: 'ready', src: r.src } : { status: 'missing', src: null }))
      .catch(() => live && setState({ status: 'failed', src: null }))
    return () => {
      live = false
    }
  }, [imageId, maxEdge, inView])

  return { ref, ...state }
}
