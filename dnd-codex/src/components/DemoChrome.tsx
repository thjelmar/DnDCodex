import { useEffect, useRef, useState } from 'react'
import { exitDemo, onDemoBlocked } from '../lib/demo'
import { Icon } from './Icon'

/**
 * Persistent top banner shown while the app runs in demo mode (T-32). Makes it
 * obvious this is a sample and offers a one-click exit to the real site.
 */
export function DemoBanner() {
  return (
    <div className="demo-banner">
      <span className="demo-banner-text">
        <span aria-hidden>🎭</span> You're exploring the <strong>demo</strong> — sample data, and changes aren't saved.
      </span>
      <button className="demo-banner-exit" onClick={() => exitDemo()}>
        Exit to the real site <Icon name="chevron-right" size={13} color="currentColor" />
      </button>
    </div>
  )
}

/**
 * Global toast that fires whenever a disabled write is attempted in the demo
 * (via notifyDemoBlocked). Clickable → exits to the real site.
 */
export function DemoBlockedToast() {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return onDemoBlocked(() => {
      setVisible(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setVisible(false), 4000)
    })
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (!visible) return null
  return (
    <button className="demo-toast" onClick={() => exitDemo()}>
      <span aria-hidden>✨</span>
      <span>
        That's off in the demo. <u>Try it on the real site →</u>
      </span>
    </button>
  )
}
