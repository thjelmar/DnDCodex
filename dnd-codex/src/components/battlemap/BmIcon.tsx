import type { ReactNode } from 'react'

// Line icons for the battle map studio. Same rules as the mockup: 24px grid,
// 1.8px round stroke, `currentColor`, never emoji. The color comes from the
// parent button, so the active tool and the dimmed states recolor them.

export type BmIconName =
  | 'select'
  | 'measure'
  | 'fog'
  | 'templates'
  | 'add-token'
  | 'add-object'
  | 'eye'
  | 'eye-off'
  | 'inspector'
  | 'fullscreen'
  | 'fullscreen-exit'
  | 'float'
  | 'dock'
  | 'close'
  | 'more'
  | 'plus'
  | 'minus'
  | 'duplicate'
  | 'trash'
  | 'chevron-down'
  | 'play'
  | 'broadcast'
  | 'notes'
  | 'map'
  | 'upload'
  | 'library'
  | 'window'

const PATHS: Record<BmIconName, ReactNode> = {
  select: <path d="M5 3l14 7.5-6.2 1.9L10.5 19 5 3z" />,
  measure: (
    <>
      <rect x="2.5" y="8" width="19" height="8" rx="1.5" />
      <path d="M6.5 8v3M10 8v4.5M13.5 8v3M17 8v4.5" />
    </>
  ),
  fog: <path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5a4.75 4.75 0 0 1 .5 9.5H7z" />,
  templates: (
    <>
      <path d="M12 3a9 9 0 0 1 0 18" />
      <path d="M12 3v18" />
      <path d="M12 12l6.4-6.4" />
    </>
  ),
  'add-token': (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M11 8v6M8 11h6" />
      <path d="M19 19l2 2" />
    </>
  ),
  'add-object': (
    <>
      <rect x="3.5" y="3.5" width="14" height="14" rx="2" />
      <path d="M10.5 7.5v6M7.5 10.5h6" />
      <path d="M21 14v7h-7" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <path d="M10.6 5.6A10 10 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.2 4M6.7 6.9C3.8 8.7 2 12 2 12s3.6 6.5 10 6.5c1.7 0 3.2-.4 4.5-1M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  ),
  inspector: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  'fullscreen-exit': <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  float: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="11" y="11" width="7" height="7" rx="1" />
    </>
  ),
  dock: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M14 3v18" />
    </>
  ),
  window: (
    <>
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M14 3h7v7M21 3l-8 8" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  duplicate: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  play: <path d="M7 4l13 8-13 8V4z" />,
  broadcast: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" />
    </>
  ),
  notes: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M9 12h7M9 16h7M9 8h3" />
    </>
  ),
  map: <path d="M9 4 3 6.5v14L9 18l6 2.5 6-2.5v-14L15 6.5 9 4zM9 4v14M15 6.5v14" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  library: <path d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 5.2l3.8-1 3 15.4-3.8 1z" />,
}

export function BmIcon({ name, size = 18 }: { name: BmIconName; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className="bm-ico"
    >
      {PATHS[name]}
    </svg>
  )
}
