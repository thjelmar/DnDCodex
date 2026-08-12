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
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn>(async () => false)

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext)
}

interface PendingState extends ConfirmOptions {
  resolve: (value: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => setPending({ ...opts, resolve }))
  }, [])

  const settle = (result: boolean) => {
    setPending((cur) => {
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
        </Modal>
      )}
    </ConfirmContext.Provider>
  )
}
