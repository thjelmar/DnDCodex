// ---------------------------------------------------------------------------
// Per-user appearance: theme (dark/light) + accent color.
//
// The account is the source of truth (profiles.theme / profiles.accent, synced
// across devices), but we also cache the last choice in localStorage so the
// very first paint — before auth resolves — already matches the user's theme.
// An inline script in index.html applies the cache before React mounts; this
// module keeps the cache and the <html> data-attributes in sync afterward.
// ---------------------------------------------------------------------------

export type Theme = 'dark' | 'light'
export type Accent = 'violet' | 'emerald' | 'sky' | 'amber' | 'rose'

export const THEMES: Theme[] = ['dark', 'light']
export const ACCENTS: Accent[] = ['violet', 'emerald', 'sky', 'amber', 'rose']

export const DEFAULT_THEME: Theme = 'dark'
export const DEFAULT_ACCENT: Accent = 'violet'

export const ACCENT_LABEL: Record<Accent, string> = {
  violet: 'Violet',
  emerald: 'Emerald',
  sky: 'Sky',
  amber: 'Amber',
  rose: 'Rose',
}

// A representative swatch color per accent, for the picker UI (matches the
// --accent token each one sets in styles.css).
export const ACCENT_SWATCH: Record<Accent, string> = {
  violet: '#a78bfa',
  emerald: '#34d399',
  sky: '#38bdf8',
  amber: '#fbbf24',
  rose: '#fb7185',
}

const THEME_KEY = 'codex.theme'
const ACCENT_KEY = 'codex.accent'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** Whether an accent value is a custom hex color (vs. a named preset). */
export function isHexAccent(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v)
}

// The custom accent is stored in the same `accent` field as the presets — a
// `#rrggbb` string instead of a preset name — so no new column/migration. When
// set, we inline-derive the two accent tokens (the presets set them via CSS
// [data-accent] rules). Light mode darkens the accent so it reads on white,
// mirroring the preset light-mode overrides.
const LIGHT_ACCENT_SHADE = 0.22
const DARK_STRONG_SHADE = 0.3
const LIGHT_STRONG_SHADE = 0.42

/** Darken a #rrggbb color by mixing it toward black (amount 0..1). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const k = 1 - amount
  const r = Math.round(((n >> 16) & 255) * k)
  const g = Math.round(((n >> 8) & 255) * k)
  const b = Math.round((n & 255) * k)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

/** The on-surface accent + the stronger (button/link) accent for a custom hex. */
export function customAccentTokens(hex: string, theme: Theme): { accent: string; strong: string } {
  return theme === 'light'
    ? { accent: shade(hex, LIGHT_ACCENT_SHADE), strong: shade(hex, LIGHT_STRONG_SHADE) }
    : { accent: hex, strong: shade(hex, DARK_STRONG_SHADE) }
}

export function normalizeTheme(v: unknown): Theme {
  return v === 'light' ? 'light' : 'dark'
}

/** A valid accent value: a known preset name, a `#rrggbb` custom color, or the
 *  default. Returned as a string since it can be either a preset or a hex. */
export function normalizeAccent(v: unknown): string {
  if ((ACCENTS as string[]).includes(v as string)) return v as Accent
  if (isHexAccent(v)) return (v as string).toLowerCase()
  return DEFAULT_ACCENT
}

/** Set the <html> data-attributes (presets) or inline token overrides (custom)
 *  that the CSS keys off. A custom hex wins via inline style; switching back to
 *  a preset clears the inline overrides so the [data-accent] rules apply again. */
export function applyTheme(theme: Theme, accent: string): void {
  const el = document.documentElement
  el.dataset.theme = theme
  if (isHexAccent(accent)) {
    el.dataset.accent = 'custom'
    const { accent: a, strong } = customAccentTokens(accent.toLowerCase(), theme)
    el.style.setProperty('--accent', a)
    el.style.setProperty('--accent-strong', strong)
  } else {
    el.dataset.accent = accent
    el.style.removeProperty('--accent')
    el.style.removeProperty('--accent-strong')
  }
}

/** Read the cached choice (what the boot script applied); defaults if absent. */
export function readCachedTheme(): { theme: Theme; accent: string } {
  let theme: Theme = DEFAULT_THEME
  let accent: string = DEFAULT_ACCENT
  try {
    theme = normalizeTheme(localStorage.getItem(THEME_KEY))
    accent = normalizeAccent(localStorage.getItem(ACCENT_KEY))
  } catch {
    /* private mode / storage blocked — fall back to defaults */
  }
  return { theme, accent }
}

/** Persist the choice to the localStorage cache (account sync is separate). */
export function cacheTheme(theme: Theme, accent: string): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
    localStorage.setItem(ACCENT_KEY, accent)
  } catch {
    /* ignore */
  }
}

/** Apply + cache in one call (used when the user changes it, or on login). */
export function setTheme(theme: Theme, accent: string): void {
  applyTheme(theme, accent)
  cacheTheme(theme, accent)
}
