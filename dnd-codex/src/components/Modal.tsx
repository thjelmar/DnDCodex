import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useDialogExit } from '../lib/useDialogExit'

interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  /** Footer content, typically action buttons. */
  footer?: React.ReactNode
}

/**
 * A simple centered modal dialog. Closes on backdrop click, the Escape key, or
 * the caller's own close control. It renders into <body>: opened from inside the
 * phone nav drawer (which has a transform and clips overflow), an in-place modal
 * was cut off at the drawer's edge (T-61). Its entrance and exit animations are in
 * styles.css (.modal-backdrop / .modal).
 */
export function Modal({ title, onClose, children, footer }: ModalProps) {
  const { closing, requestClose } = useDialogExit(onClose)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  return createPortal(
    <div className={`modal-backdrop${closing ? ' closing' : ''}`} onMouseDown={requestClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
