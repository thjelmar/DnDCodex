import { useEffect, type RefObject } from 'react'
import { PHONE_LANDSCAPE_QUERY } from './usePhone'

/** Scroll distance (px) that counts as a deliberate move, so a jittery finger does not toggle the bar. */
const THRESHOLD = 8
/** The bar stays put while the page is within this many px of the top. */
const TOP_ZONE = 48

/**
 * Phone landscape only: hides the top bar while you scroll `.main` down and shows it again
 * on any scroll up, at the top of the page, after a route change and while the drawer is
 * open. It sets `data-topbar-hidden` on `.app`; styles.css moves the bar. The bar floats
 * over the page (it does not take layout space), so toggling it never shifts the content.
 */
export function useTopbarAutoHide(
  appRef: RefObject<HTMLElement | null>,
  mainRef: RefObject<HTMLElement | null>,
  navOpen: boolean,
): void {
  useEffect(() => {
    const app = appRef.current
    const main = mainRef.current
    if (!app || !main || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(PHONE_LANDSCAPE_QUERY)
    let last = main.scrollTop
    const setHidden = (hidden: boolean) => {
      if (hidden) app.setAttribute('data-topbar-hidden', 'true')
      else app.removeAttribute('data-topbar-hidden')
    }
    const onScroll = (e: Event) => {
      if (e.target !== main) return // ignore scrolling inside nested scroll areas
      const top = main.scrollTop
      if (!mql.matches || navOpen || top < TOP_ZONE) {
        setHidden(false)
        last = top
        return
      }
      const dy = top - last
      if (Math.abs(dy) < THRESHOLD) return
      setHidden(dy > 0)
      last = top
    }
    const show = () => {
      setHidden(false)
      last = main.scrollTop
    }
    if (navOpen || !mql.matches) show()
    main.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('hashchange', show)
    mql.addEventListener('change', show)
    return () => {
      main.removeEventListener('scroll', onScroll)
      window.removeEventListener('hashchange', show)
      mql.removeEventListener('change', show)
      app.removeAttribute('data-topbar-hidden')
    }
  }, [appRef, mainRef, navOpen])
}
