import { useCallback, useEffect, useRef, useState } from 'react'

/** How long a closing dialog stays mounted. Matches --dialog-out-duration in styles.css. */
export const DIALOG_EXIT_MS = 140

/**
 * Close with an exit animation. `requestClose()` marks the dialog as `closing`
 * (CSS plays the exit and disables pointer events), keeps it mounted for the
 * exit, then calls `onClose`. A second request while closing is ignored.
 */
export function useDialogExit(onClose: () => void) {
  const [closing, setClosing] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const requestClose = useCallback(() => {
    if (timer.current !== undefined) return
    setClosing(true)
    timer.current = window.setTimeout(onClose, DIALOG_EXIT_MS)
  }, [onClose])

  return { closing, requestClose }
}
