import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Modal } from './Modal'

// A promise-based confirmation dialog to replace native window.confirm(), which
// can be silently suppressed by the browser ("prevent this page from creating
// more dialogs") and then makes every confirm-gated action appear broken. Usage:
//   const confirm = useConfirm()
//   if (await confirm({ message: 'Delete this?', danger: true })) { ... }

interface ConfirmOptions {
  title?: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Style the confirm button as destructive (filled red). */
  danger?: boolean
  /**
   * When set, show a "Don't ask again" checkbox. Ticking it and confirming
   * persists this key so future confirms with the same key resolve true
   * immediately (no prompt). Stored per browser.
   */
  remember?: string
}

const REMEMBER_PREFIX = 'codex.confirmSkip.'
function isRemembered(key: string): boolean {
  try {
    return localStorage.getItem(REMEMBER_PREFIX + key) === '1'
  } catch {
    return false
  }
}
function remember(key: string) {
  try {
    localStorage.setItem(REMEMBER_PREFIX + key, '1')
  } catch {
    /* ignore */
  }
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn>(async () => false)

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext)
}

/**
 * Gate for un-marking a spoiler. Returns a function that resolves true when it's
 * safe to reveal: immediately when the content isn't currently hidden or the
 * entity isn't shared, otherwise after the DM confirms (with a shared "don't ask
 * again" across every spoiler surface).
 */
export function useRevealConfirm(): (currentlySpoiled: boolean, entityShared: boolean) => Promise<boolean> {
  const confirm = useConfirm()
  return useCallback(
    (currentlySpoiled, entityShared) => {
      if (!currentlySpoiled || !entityShared) return Promise.resolve(true)
      return confirm({
        title: 'Reveal to players?',
        message:
          'This entity is shared with players. Revealing this will show the hidden content to them the next time you push changes.',
        confirmLabel: 'Reveal',
        remember: 'spoiler-reveal',
      })
    },
    [confirm],
  )
}

interface PendingState extends ConfirmOptions {
  resolve: (value: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null)
  const [dontAsk, setDontAsk] = useState(false)

  const confirm = useCallback<ConfirmFn>((opts) => {
    // Honor a remembered "don't ask again" for this key — resolve without a prompt.
    if (opts.remember && isRemembered(opts.remember)) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      setDontAsk(false)
      setPending({ ...opts, resolve })
    })
  }, [])

  const settle = (result: boolean) => {
    setPending((cur) => {
      if (result && cur?.remember && dontAsk) remember(cur.remember)
      cur?.resolve(result)
      return null
    })
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Modal
          title={pending.title ?? 'Are you sure?'}
          onClose={() => settle(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => settle(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </button>
              <button
                className={`btn ${pending.danger ? 'destructive' : 'primary'}`}
                onClick={() => settle(true)}
                autoFocus
              >
                {pending.confirmLabel ?? 'Confirm'}
              </button>
            </>
          }
        >
          <div>{pending.message}</div>
          {pending.remember && (
            <label className="row" style={{ gap: 8, marginTop: 14, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
              Don't ask again
            </label>
          )}
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}
