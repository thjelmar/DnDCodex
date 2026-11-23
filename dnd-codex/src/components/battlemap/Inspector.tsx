import { useRef, useState, type ReactNode } from 'react'
import { BmIcon, type BmIconName } from './BmIcon'

export type InspectorTab = 'tokens' | 'grid' | 'map'
/** A section a host page adds before the scene tabs (Run mode's combat, notes and dice). */
export interface ExtraInspectorTab {
  id: string
  label: string
  /** When set, the tab shows this icon, and only the active tab also shows its label. */
  icon?: BmIconName
}
/** What the studio shares with Run mode's tab bodies: the selected combatant, a way to select one
 *  (which selects its token and pans the map to it), and a token's color. */
export interface RunStudioCtx {
  selectedCombatantId: string | null
  selectCombatants: (ids: string[]) => void
  colorOf: (combatantId: string) => string | null
}
/** A Run mode tab: its body may read the studio context. */
export type RunTab = ExtraInspectorTab & { content: ReactNode | ((ctx: RunStudioCtx) => ReactNode) }

/** `docked` sits beside the map, `float` hovers over it, `drawer` is the
 *  on-demand overlay used in full screen and on a phone, and `window` fills a
 *  separate browser window. */
export type InspectorMode = 'docked' | 'float' | 'drawer' | 'window'

/** Desktop Run mode folds the three scene tabs into one (the sub-tabs live in its body). */
const FOLDED_TABS: ExtraInspectorTab[] = [{ id: 'scene', label: 'Scene', icon: 'sliders' }]

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'tokens', label: 'Tokens' },
  { id: 'grid', label: 'Grid' },
  { id: 'map', label: 'Map' },
]

/**
 * The scene inspector shell: a tab header with icon-only controls, and a
 * scrolling body. The caller supplies the tab content. In `float` mode the
 * header drags the panel around the map and the browser's native resize handle
 * (bottom-right corner) resizes it.
 */
export function Inspector({
  mode,
  tab,
  onTab,
  onToggleFloat,
  onOpenWindow,
  onClose,
  extraTabs,
  foldScene = false,
  noun = 'inspector',
  footer,
  children,
}: {
  mode: InspectorMode
  /** A scene tab, or the id of one of `extraTabs`. */
  tab: string
  onTab: (t: string) => void
  extraTabs?: ExtraInspectorTab[]
  /** Show one Scene tab in place of Tokens, Grid and Map. */
  foldScene?: boolean
  /** What the panel is called in tooltips and labels: the scene inspector, or Run mode's panel. */
  noun?: string
  onToggleFloat: () => void
  /** Moves the inspector to its own window (omitted where that is not offered). */
  onOpenWindow?: () => void
  onClose: () => void
  /** Pinned under the scrolling body (the selected-token card). */
  footer?: ReactNode
  children: ReactNode
}) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const root = useRef<HTMLElement>(null)

  // The whole header drags the floating panel, tabs included. A press only
  // becomes a drag after it moves a few pixels, so a tap on a tab still selects
  // it. Move and release are tracked on `window`, so a fast drag that leaves the
  // header keeps working.
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (mode !== 'float' || (e.target as HTMLElement).closest('.bm-icon-btn')) return
    const el = root.current
    const box = el?.offsetParent?.getBoundingClientRect()
    if (!el || !box) return
    const r = el.getBoundingClientRect()
    const d = { dx: e.clientX - r.left, dy: e.clientY - r.top, x0: e.clientX, y0: e.clientY, active: false }
    const move = (ev: PointerEvent) => {
      if (!d.active) {
        if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < 4) return
        d.active = true
      }
      // Keep the header inside the map so the panel can't be lost off-screen.
      const left = Math.min(Math.max(0, ev.clientX - d.dx - box.left), box.width - 80)
      const top = Math.min(Math.max(0, ev.clientY - d.dy - box.top), box.height - 44)
      setPos({ left, top })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const style = mode === 'float' && pos ? { left: pos.left, top: pos.top, right: 'auto' } : undefined
  return (
    <aside
      ref={root}
      className={`bm-insp bm-insp-${mode}`}
      style={style}
      aria-label={noun === 'inspector' ? 'Scene inspector' : 'Run panel'}
      data-testid="bm-inspector"
    >
      <div
        className="bm-insp-hd"
        onPointerDown={onPointerDown}
      >
        <div className="bm-tabs" role="tablist" aria-label="Inspector sections">
          {[...(extraTabs ?? []), ...(foldScene ? FOLDED_TABS : TABS)].map((t) => {
            const icon = (t as ExtraInspectorTab).icon
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                aria-label={t.label}
                title={t.label}
                className={`${tab === t.id ? 'on' : ''}${icon ? ' has-icon' : ''}`}
                onClick={() => onTab(t.id)}
              >
                {icon && <BmIcon name={icon} size={16} />}
                <span className="bm-tab-label">{t.label}</span>
              </button>
            )
          })}
        </div>
        {onOpenWindow && mode !== 'window' && (
          <button
            type="button"
            className="bm-icon-btn"
            onClick={onOpenWindow}
            title={`Open the ${noun} in its own window, so you can move it off the page`}
            aria-label={`Open the ${noun} in its own window`}
          >
            <BmIcon name="window" size={16} />
          </button>
        )}
        {mode !== 'drawer' && mode !== 'window' && (
          <button
            type="button"
            className="bm-icon-btn"
            onClick={onToggleFloat}
            title={mode === 'float' ? `Dock the ${noun}` : `Float the ${noun} over the map`}
            aria-label={mode === 'float' ? `Dock the ${noun}` : `Float the ${noun} over the map`}
          >
            <BmIcon name={mode === 'float' ? 'dock' : 'float'} size={16} />
          </button>
        )}
        <button
          type="button"
          className="bm-icon-btn"
          onClick={onClose}
          title={mode === 'window' ? `Close the window and dock the ${noun}` : `Hide the ${noun} (I)`}
          aria-label={mode === 'window' ? `Close the window and dock the ${noun}` : `Hide the ${noun}`}
        >
          <BmIcon name="close" size={16} />
        </button>
      </div>
      <div className="bm-insp-body">{children}</div>
      {footer}
    </aside>
  )
}

/** One row in the Tokens tab: dot, name, HP pill and the show/hide eye. */
export function TokenRow({
  label,
  color,
  hp,
  hidden,
  selected,
  dead,
  lead,
  trail,
  onSelect,
  onToggleHidden,
}: {
  label: string
  color: string
  hp?: string | null
  hidden: boolean
  selected: boolean
  dead?: boolean
  /** Before the name (a selection checkbox). */
  lead?: ReactNode
  /** After the HP pill, before the eye (a + Init toggle). */
  trail?: ReactNode
  onSelect: () => void
  onToggleHidden: () => void
}) {
  return (
    <div className={`bm-row${selected ? ' on' : ''}${hidden ? ' is-hidden' : ''}${dead ? ' dead' : ''}`}>
      {lead}
      <button type="button" className="bm-row-main" onClick={onSelect} aria-pressed={selected}>
        <span className="bm-dot" style={{ background: color }} aria-hidden />
        <span className="bm-row-name">{label}</span>
        {hp && <span className="bm-pill">{hp}</span>}
      </button>
      {trail}
      <button
        type="button"
        className={`bm-icon-btn bm-eye${hidden ? ' hid' : ''}`}
        onClick={onToggleHidden}
        aria-pressed={hidden}
        aria-label={hidden ? `Show ${label} to players` : `Hide ${label} from players`}
        title={hidden ? 'Hidden from players. Click to show.' : 'Visible to players. Click to hide.'}
      >
        <BmIcon name={hidden ? 'eye-off' : 'eye'} size={16} />
      </button>
    </div>
  )
}
