import type { ReactNode } from 'react'

// Line/solid glyphs for each 5e condition, drawn centered on the origin in a
// ~[-8,8] box so Tabletop can scale them into a status pip. White ink comes
// from `.tabletop-cond-glyph`; individual shapes override fill/stroke where the
// glyph reads better solid.

export const CONDITION_ICON: Record<string, ReactNode> = {
  // Eye with a slash.
  Blinded: (
    <>
      <path d="M-8 0C-4-5 4-5 8 0C4 5-4 5-8 0Z" />
      <circle cx="0" cy="0" r="2.1" />
      <path d="M-8-7L8 7" />
    </>
  ),
  // Heart.
  Charmed: <path d="M0 7C-8 1-8-6-2.6-6C-1-6 0-4.7 0-4C0-4.7 1-6 2.6-6C8-6 8 1 0 7Z" fill="#fff" stroke="none" />,
  // Concentric target.
  Concentration: (
    <>
      <circle cx="0" cy="0" r="7.4" />
      <circle cx="0" cy="0" r="3.6" />
      <circle cx="0" cy="0" r="1" fill="#fff" stroke="none" />
    </>
  ),
  // Bell with a slash.
  Deafened: (
    <>
      <path d="M-4.5 4.5C-5.5-1-3.5-6 0-6C3.5-6 5.5-1 4.5 4.5" />
      <path d="M-5.5 4.5L5.5 4.5" />
      <path d="M-8-7L8 7" />
    </>
  ),
  // Exclamation mark.
  Frightened: (
    <>
      <path d="M0-8L0 2.4" strokeWidth="2.6" />
      <circle cx="0" cy="6.4" r="1.5" fill="#fff" stroke="none" />
    </>
  ),
  // Two grips holding a point.
  Grappled: (
    <>
      <path d="M-2.5-7C-8-7-8 7-2.5 7" />
      <path d="M2.5-7C8-7 8 7 2.5 7" />
      <circle cx="0" cy="0" r="1.7" fill="#fff" stroke="none" />
    </>
  ),
  // Prohibition circle-slash.
  Incapacitated: (
    <>
      <circle cx="0" cy="0" r="7.5" />
      <path d="M-5.3-5.3L5.3 5.3" />
    </>
  ),
  // Ghost.
  Invisible: <path d="M-6 7L-6-1C-6-6.5 6-6.5 6-1L6 7L3.6 5L1.2 7L-1.2 5L-3.6 7Z" />,
  // Lightning bolt.
  Paralyzed: <path d="M1.5-8L-4.5 1.5L-0.5 1.5L-1.5 8L5-2L1-2Z" fill="#fff" stroke="none" />,
  // Faceted gem.
  Petrified: (
    <>
      <path d="M0-7.5L7.5-1L0 8L-7.5-1Z" />
      <path d="M-7.5-1L7.5-1" />
      <path d="M0-7.5L0 8" />
    </>
  ),
  // Droplet.
  Poisoned: <path d="M0-8C6.5 0 5.5 8 0 8C-5.5 8-6.5 0 0-8Z" fill="#fff" stroke="none" />,
  // Double down-chevron.
  Prone: (
    <>
      <path d="M-6-5L0 1L6-5" />
      <path d="M-6 1L0 7L6 1" />
    </>
  ),
  // Net.
  Restrained: (
    <>
      <path d="M-8-3L8-3" />
      <path d="M-8 3L8 3" />
      <path d="M-3-8L-3 8" />
      <path d="M3-8L3 8" />
    </>
  ),
  // Seeing stars.
  Stunned: (
    <>
      <path d="M-3.5-4L-3.5-1M-5-2.5L-2-2.5" strokeWidth="2" />
      <path d="M3.5 1.5L3.5 5.5M2 3.5L5 3.5" strokeWidth="2" />
      <path d="M4-5.5L4-3M2.8-4.3L5.2-4.3" strokeWidth="1.7" />
    </>
  ),
  // Crescent moon (sleep).
  Unconscious: <path d="M5.5-5A8 8 0 1 0 5.5 6A6.2 6.2 0 1 1 5.5-5Z" fill="#fff" stroke="none" />,
  // Hourglass.
  Exhaustion: (
    <>
      <path d="M-6-7L6-7L-6 7L6 7Z" />
      <path d="M-6.5-7L6.5-7M-6.5 7L6.5 7" strokeWidth="2.2" />
    </>
  ),
}

export function conditionIcon(name: string): ReactNode {
  return CONDITION_ICON[name] ?? null
}
