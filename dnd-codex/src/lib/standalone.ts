/** True when the page runs as an installed app (Add to Home Screen on iOS, an installed PWA elsewhere), with no browser bars. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches
}

/** True in Safari on an iPhone or iPod (not Chrome, Firefox or Edge on iOS, and not an installed app). */
export function isIphoneSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPod/.test(ua) && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
}
