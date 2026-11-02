// Loading animation: a dragon coiled around the middle of a d20. Inline SVG +
// CSS keyframes (see .dragon-loader in styles.css), so it ships no image file.
// Colors come from theme tokens, so it follows light/dark and the accent.
//
// The body is drawn twice: the back half sits under the die (only its ends peek
// out), the front half crosses over the die, so the dragon reads as wrapped
// around the center rather than circling the outline.

export function DragonLoader({ size = 64 }: { size?: number }) {
  return (
    <svg
      className="dragon-loader"
      width={size}
      height={(size * 64) / 72}
      viewBox="0 0 72 64"
      aria-hidden
      focusable="false"
    >
      {/* back half of the body, hidden behind the die except at the ends */}
      <path className="dl-back" d="M4 36 Q32 18 62 30" />
      {/* the d20, front view: hexagon silhouette + facet lines */}
      <g className="dl-die">
        <polygon className="dl-die-body" points="32,4 56,18 56,46 32,60 8,46 8,18" />
        <polygon points="32,17 21,39 43,39" fill="none" />
        <path d="M32 4V17M8 18L21 39M56 18L43 39M8 46L21 39M56 46L43 39M32 60L21 39M32 60L43 39M32 17L8 18M32 17L56 18" fill="none" />
      </g>
      {/* front half of the body, scales crawl along it */}
      <path className="dl-front" d="M4 36 Q32 52 62 30" />
      {/* head: snout, horn and a breath puff */}
      <g className="dl-head">
        <path className="dl-head-shape" d="M57 28 L67 21 L63 32 Z" />
        <path className="dl-horn" d="M59 27 L58 20" />
        <circle className="dl-breath" cx="68" cy="26" r="1.6" />
      </g>
    </svg>
  )
}
