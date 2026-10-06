import type { CSSProperties, ReactNode } from 'react'

// Small dependency-free line-icon set (Lucide-style: 24-grid, stroked with
// currentColor). Icons default to the accent color so they pop against the dark
// UI; pass `color` to override (e.g. "inherit" inside a filled button).

export type IconName =
  | 'lock'
  | 'unlock'
  | 'eye'
  | 'eye-off'
  | 'upload'
  | 'image'
  | 'check'
  | 'x'
  | 'search'
  | 'dice'
  | 'save'
  | 'plus'
  | 'tools'
  | 'key'
  | 'cloud'
  | 'pencil'
  | 'copy'
  | 'arrow-left'
  | 'external'
  | 'trash'
  | 'download'
  | 'link'
  | 'maximize'
  | 'minimize'
  | 'settings'
  | 'bug'
  | 'swords'
  | 'shield'
  | 'heart'
  | 'skull'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'calendar'
  | 'calendar-x'
  | 'clock'
  | 'moon'
  | 'inbox'
  | 'play'
  | 'pin'
  | 'sparkles'
  | 'map'
  | 'text'
  | 'user'
  | 'book'
  | 'beer'
  | 'scroll'
  | 'crown'
  | 'church'
  | 'coins'
  | 'gem'

const PATHS: Record<IconName, ReactNode> = {
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  unlock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.5-1.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M10.7 6.2A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.4 3.3M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 4.5-1.1" />
      <path d="m3 3 18 18" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-4.5-4.5L6 21" />
    </>
  ),
  check: <path d="m5 13 4 4L19 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  dice: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r="1.1" />
      <circle cx="16" cy="8" r="1.1" />
      <circle cx="12" cy="12" r="1.1" />
      <circle cx="8" cy="16" r="1.1" />
      <circle cx="16" cy="16" r="1.1" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  tools: (
    <>
      <path d="M14.5 5.5a3.5 3.5 0 0 0-4.9 4.2L3 16.3V21h4.7l6.6-6.6a3.5 3.5 0 0 0 4.2-4.9l-2.6 2.6-2-2 2.6-2.6Z" />
    </>
  ),
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.5 12.5 10-10" />
      <path d="m16 3 3 3" />
      <path d="m14 5 3 3" />
    </>
  ),
  cloud: <path d="M17.5 19a4.5 4.5 0 0 0 .3-9A6 6 0 0 0 6 10.5 4 4 0 0 0 6.5 19Z" />,
  pencil: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  'arrow-left': (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ),
  external: (
    <>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
  link: (
    <>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M11 6.5 12.5 5a4 4 0 0 1 5.7 5.7l-1.5 1.5" />
      <path d="M13 17.5 11.5 19a4 4 0 0 1-5.7-5.7l1.5-1.5" />
    </>
  ),
  maximize: (
    <>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </>
  ),
  minimize: (
    <>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h9" />
      <path d="M18 6h2" />
      <circle cx="15.5" cy="6" r="2.2" />
      <path d="M4 12h2" />
      <path d="M11 12h9" />
      <circle cx="8.5" cy="12" r="2.2" />
      <path d="M4 18h9" />
      <path d="M18 18h2" />
      <circle cx="15.5" cy="18" r="2.2" />
    </>
  ),
  bug: (
    <>
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Z" />
      <path d="M12 20v-9" />
      <path d="m8 2 1.9 1.9" />
      <path d="M16 2l-1.9 1.9" />
      <path d="M6 13H2" />
      <path d="M22 13h-4" />
      <path d="M6.3 9C4.5 8.8 3 7.2 3 5.2" />
      <path d="M17.7 9c1.8-.2 3.3-1.8 3.3-3.8" />
      <path d="M6.3 17C4.5 17.2 3 18.8 3 20.8" />
      <path d="M17.7 17c1.8.2 3.3 1.8 3.3 3.8" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5-12-7.5Z" />,
  pin: (
    <>
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" />
    </>
  ),
  swords: (
    <>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="m13 19 6-6" />
      <path d="m16 16 4 4" />
      <path d="m19 21 2-2" />
      <path d="M9.5 17.5 21 6V3h-3L6.5 14.5" />
      <path d="m5 19 6-6" />
      <path d="m2 21 3-3" />
      <path d="m3 19 2 2" />
    </>
  ),
  shield: <path d="M12 3 5 6v6c0 4 3 6.5 7 9 4-2.5 7-5 7-9V6l-7-3Z" />,
  heart: <path d="M12 20s-7-4.4-9.3-8.3C1.2 9 2.3 5.8 5.3 5.2c1.9-.4 3.6.6 4.7 2 1.1-1.4 2.8-2.4 4.7-2 3 .6 4.1 3.8 2.6 6.5C19 15.6 12 20 12 20Z" />,
  skull: (
    <>
      <circle cx="9" cy="12" r="1.2" />
      <circle cx="15" cy="12" r="1.2" />
      <path d="M12 3a8 8 0 0 0-4 15v3h8v-3a8 8 0 0 0-4-15Z" />
      <path d="M10 20v-2m4 2v-2" />
    </>
  ),
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18" />
    </>
  ),
  'calendar-x': (
    <>
      <path d="M8 2v4M16 2v4M3 10h18" />
      <path d="M21 14V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6" />
      <path d="m17 16 4 4M21 16l-4 4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </>
  ),
  sparkles: (
    <>
      <path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0Z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </>
  ),
  user: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </>
  ),
  beer: (
    <>
      <path d="M17 11h1a3 3 0 0 1 0 6h-1" />
      <path d="M9 12v6" />
      <path d="M13 12v6" />
      <path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z" />
      <path d="M5 8v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8" />
    </>
  ),
  scroll: (
    <>
      <path d="M19 17V5a2 2 0 0 0-2-2H4" />
      <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" />
    </>
  ),
  crown: (
    <>
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.52l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <path d="M5 21h14" />
    </>
  ),
  church: (
    <>
      <path d="M10 9h4" />
      <path d="M12 7v5" />
      <path d="M14 22v-4a2 2 0 0 0-4 0v4" />
      <path d="M18 22V5.618a1 1 0 0 0-.553-.894l-4.553-2.277a2 2 0 0 0-1.788 0L6.553 4.724A1 1 0 0 0 6 5.618V22" />
      <path d="m18 7 3.447 1.724a1 1 0 0 1 .553.894V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.618a1 1 0 0 1 .553-.894L6 7" />
    </>
  ),
  coins: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
      <path d="m16.71 13.88.7.71-2.82 2.82" />
    </>
  ),
  gem: (
    <>
      <path d="M6 3h12l4 6-10 13L2 9Z" />
      <path d="M11 3 8 9l4 13 4-13-3-6" />
      <path d="M2 9h20" />
    </>
  ),
  map: (
    <>
      <path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z" />
      <path d="M9 3v15" />
      <path d="M15 6v15" />
    </>
  ),
  text: (
    <>
      <path d="M5 6h14" />
      <path d="M5 12h14" />
      <path d="M5 18h9" />
    </>
  ),
}

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.75,
  color = 'var(--accent)',
  className,
  style,
}: {
  name: IconName
  size?: number
  strokeWidth?: number
  /** CSS color for the icon (drives currentColor). Defaults to the accent. */
  color?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      style={{ verticalAlign: '-0.15em', flexShrink: 0, color, ...style }}
    >
      {PATHS[name]}
    </svg>
  )
}
