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

export function normalizeTheme(v: unknown): Theme {
  return v === 'light' ? 'light' : 'dark'
}
export function normalizeAccent(v: unknown): Accent {
  return (ACCENTS as string[]).includes(v as string) ? (v as Accent) : DEFAULT_ACCENT
}

/** Set the <html> data-attributes that the CSS token overrides key off. */
export function applyTheme(theme: Theme, accent: Accent): void {
  const el = document.documentElement
  el.dataset.theme = theme
  el.dataset.accent = accent
}

/** Read the cached choice (what the boot script applied); defaults if absent. */
export function readCachedTheme(): { theme: Theme; accent: Accent } {
  let theme: Theme = DEFAULT_THEME
  let accent: Accent = DEFAULT_ACCENT
  try {
    theme = normalizeTheme(localStorage.getItem(THEME_KEY))
    accent = normalizeAccent(localStorage.getItem(ACCENT_KEY))
  } catch {
    /* private mode / storage blocked — fall back to defaults */
  }
  return { theme, accent }
}

/** Persist the choice to the localStorage cache (account sync is separate). */
export function cacheTheme(theme: Theme, accent: Accent): void {
  try {
    localStorage.setItem(THEME_KEY, theme)
    localStorage.setItem(ACCENT_KEY, accent)
  } catch {
    /* ignore */
  }
}

/** Apply + cache in one call (used when the user changes it, or on login). */
export function setTheme(theme: Theme, accent: Accent): void {
  applyTheme(theme, accent)
  cacheTheme(theme, accent)
}
