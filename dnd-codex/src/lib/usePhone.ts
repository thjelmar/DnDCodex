import { useMediaQuery } from './useMediaQuery'

/**
 * A phone is a narrow screen, or a touch screen turned sideways (short). Keep this in step
 * with the `(max-width: 820px), (pointer: coarse) and (max-height: 500px)` media queries
 * in styles.css. A tablet (iPad landscape is 768px tall or more) and a desktop window are not phones.
 */
export const PHONE_QUERY = '(max-width: 820px), (pointer: coarse) and (max-height: 500px)'
/** A touch screen turned sideways. */
export const PHONE_LANDSCAPE_QUERY = '(pointer: coarse) and (max-height: 500px) and (orientation: landscape)'

export const useIsPhone = (): boolean => useMediaQuery(PHONE_QUERY)
export const useIsPhoneLandscape = (): boolean => useMediaQuery(PHONE_LANDSCAPE_QUERY)
