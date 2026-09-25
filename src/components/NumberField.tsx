import { useEffect, useRef } from 'react'

// A number input with scroll-to-adjust while focused (like D&D Beyond's HP box)
// and, by default, clear ▲▼ steppers (the native spinner is tiny and its
// click-top/click-bottom behavior is easy to miss). Pass `steppers={false}` for
// dense/centered fields where the buttons don't fit — scrolling and the arrow
// keys still adjust the value.
//
// `value` may be null (an empty/unset field). `onChange` fires for live edits
// (typing, wheel); `onCommit` fires for deliberate ones (blur, a stepper click)
// so callers can save on commit instead of on every keystroke.

interface Props {
  value: number | null
  onChange: (v: number | null) => void
  onCommit?: (v: number | null) => void
  min?: number
  max?: number
  step?: number
  steppers?: boolean
  className?: string
  inputClassName?: string
  ariaLabel?: string
  placeholder?: string
  title?: string
}

function clamp(n: number, min?: number, max?: number): number {
  let v = Math.floor(n)
  if (min != null) v = Math.max(min, v)
  if (max != null) v = Math.min(max, v)
  return v
}

export function NumberField({
  value, onChange, onCommit, min = 0, max, step = 1,
  steppers = true, className, inputClassName, ariaLabel, placeholder, title,
}: Props) {
  const ref = useRef<HTMLInputElement>(null)
  // Keep the latest props in a ref so the once-registered wheel listener always
  // reads current values without re-subscribing.
  const st = useRef({ value, min, max, step, onChange })
  st.current = { value, min, max, step, onChange }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // React attaches onWheel passively, so preventDefault there is a no-op —
    // register natively so scrolling the field adjusts it instead of the page.
    // Only while focused, so idle page scrolling never changes a value by accident.
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== el) return
      e.preventDefault()
      const s = st.current
      const base = s.value ?? (s.min ?? 0)
      s.onChange(clamp(base + (e.deltaY < 0 ? s.step : -s.step), s.min, s.max))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function bump(dir: 1 | -1) {
    const s = st.current
    const base = s.value ?? (s.min ?? 0)
    const next = clamp(base + dir * s.step, s.min, s.max)
    s.onChange(next)
    onCommit?.(next)
  }

  return (
    <div className={`numfield${steppers ? '' : ' numfield--bare'} ${className ?? ''}`}>
      <input
        ref={ref}
        type="number"
        className={`input numfield-input ${inputClassName ?? ''}`}
        value={value ?? ''}
        min={min}
        max={max}
        placeholder={placeholder}
        title={title}
        onChange={(e) => onChange(e.target.value === '' ? null : clamp(Number(e.target.value) || 0, min, max))}
        onBlur={() => onCommit?.(value)}
        aria-label={ariaLabel}
      />
      {steppers && (
        <span className="numfield-steppers" aria-hidden>
          {/* preventDefault on mousedown keeps focus in the input (no stray blur-commit). */}
          <button type="button" tabIndex={-1} className="numfield-step" onMouseDown={(e) => e.preventDefault()} onClick={() => bump(1)}>▲</button>
          <button type="button" tabIndex={-1} className="numfield-step" onMouseDown={(e) => e.preventDefault()} onClick={() => bump(-1)}>▼</button>
        </span>
      )}
    </div>
  )
}
