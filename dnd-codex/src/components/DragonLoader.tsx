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
        <g className="dl-nums">
          <text x="32" y="29" fontSize="9">20</text>
          <text x="19.5" y="26" fontSize="5.5">8</text>
          <text x="44.5" y="26" fontSize="5.5">14</text>
          <text x="23" y="13" fontSize="4.5">5</text>
          <text x="41" y="13" fontSize="4.5">17</text>
        </g>
      </g>
      {/* front half of the body, scales crawl along it */}
      <path className="dl-front" d="M4 36 Q32 52 62 30" />
      {/* head, in profile: skull, snout, two swept-back horns, eye, mouth line */}
      <g transform="translate(60 30) rotate(-35)">
        <g className="dl-head">
          <path className="dl-head-shape" d="M0 -3.4 L5 -4.2 L11 -2.4 L12.5 0.2 L7.5 2.2 L4.5 4 L0 3.4 Z" />
          <path className="dl-horn" d="M3 -3.8 Q0 -6 -3 -6.5 M5.5 -4 Q3 -7.5 0 -9" />
          <path className="dl-mouth" d="M12.3 0.4 L7 1.2" />
          <circle className="dl-eye" cx="6.2" cy="-1.4" r="0.9" />
        </g>
      </g>
    </svg>
  )
}
