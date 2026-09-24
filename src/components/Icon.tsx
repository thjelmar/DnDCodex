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
