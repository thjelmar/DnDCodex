export type SaveState = 'saved' | 'saving'

/** The "Saving… / Saved" line under a session notes editor. */
export function NotesSaveStatus({ state }: { state: SaveState }) {
  return (
    <span className={`notes-status ${state}`} data-testid="notes-status" role="status" aria-live="polite">
      {state === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  )
}
