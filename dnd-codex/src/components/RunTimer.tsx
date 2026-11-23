import { BmIcon } from './battlemap/BmIcon'
import { BmMenu } from './battlemap/BmMenu'
import { useConfirm } from './ConfirmDialog'
import { formatClock, useRunTimer } from '../lib/runTimer'
import type { Id } from '../db/types'

/**
 * Run mode's run-time timer, a pill in the top bar. Before the first press it offers Start. Then it
 * shows hh:mm:ss with one Pause or Resume button, and a menu that resets it. Stored on this device only.
 */
export function RunTimer({ sessionId }: { sessionId: Id | null }) {
  const t = useRunTimer(sessionId)
  const confirm = useConfirm()
  if (!sessionId) return null

  if (!t.started) {
    return (
      <button type="button" className="bm-btn run-timer-start" aria-label="Start timer" onClick={t.start} title="Start timing this session. The time stays on this device.">
        <BmIcon name="clock" /> <span className="run-timer-lbl">Start timer</span>
      </button>
    )
  }
  return (
    <div className={`run-timer${t.running ? ' running' : ' paused'}`} role="timer" aria-label="Run time" data-testid="run-timer">
      <span className="run-timer-dot" aria-hidden />
      <span className="run-timer-val" data-testid="run-timer-value">{formatClock(t.ms)}</span>
      <button
        type="button"
        className="bm-icon-btn"
        onClick={t.running ? t.pause : t.start}
        aria-label={t.running ? 'Pause timer' : 'Resume timer'}
        title={t.running ? 'Pause the timer' : 'Resume the timer'}
      >
        <BmIcon name={t.running ? 'pause' : 'play'} size={14} />
      </button>
      <BmMenu label="Timer options" buttonClassName="bm-icon-btn" trigger={<BmIcon name="more" size={14} />}>
        {(close) => (
          <button
            type="button"
            role="menuitem"
            className="bm-item"
            onClick={async () => {
              close()
              const ok = await confirm({
                title: 'Reset the timer?',
                message: 'This discards the time counted so far for this session.',
                confirmLabel: 'Reset timer',
                danger: true,
              })
              if (ok) t.reset()
            }}
          >
            Reset timer
          </button>
        )}
      </BmMenu>
    </div>
  )
}
