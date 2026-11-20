import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { TokenIcon } from './TokenIcon'
import { gridSize, pickPortraitNpcs } from '../lib/hubCards'
import type { SceneSummary, SceneTokenSummary, WorldMapSummary } from '../lib/hubCards'
import { initials } from '../lib/tabletop'
import { npcTokenIcon, tokenGlyphId, useTokenIconPaths } from '../lib/tokenIcons'
import { useInView, useLazyThumb } from '../lib/useLazyThumb'
import type { ThumbStatus } from '../lib/useLazyThumb'
import type { NPC } from '../db/types'

// The pictures on the Overview hub cards (T-75): NPC portraits and a world map
// thumbnail on the World card, a battle map thumbnail with token avatars on the Run
// card. Each picture is a small preview loaded on demand (lib/thumbnail.ts) only once
// it is on screen, so a collapsed card fetches nothing and the first paint never
// waits. The box has its size from CSS (aspect-ratio), so a late image does not shift
// the page. A missing, cloud-only or undecodable image shows a placeholder, never a
// broken-image icon.

/** A box that shows a lazily loaded preview, or `fallback` until it is ready (and
 *  whenever there is no image, or it is missing, or it fails to load). */
function ThumbImage({
  imageId,
  maxEdge,
  alt,
  className = '',
  fallback,
  overlay,
}: {
  imageId: string | null | undefined
  maxEdge: number
  /** Meaningful text for an informative image; '' marks it decorative. */
  alt: string
  className?: string
  fallback: ReactNode | ((status: ThumbStatus) => ReactNode)
  /** Decorative extras drawn over the box (avatars). */
  overlay?: ReactNode
}) {
  const { ref, src, status } = useLazyThumb(imageId, maxEdge)
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  const showImage = !!src && !broken
  const shown: ThumbStatus = broken ? 'failed' : status
  return (
    <span ref={ref} className={`ov-media ${className}`} data-state={showImage ? 'ready' : shown}>
      {showImage ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />
      ) : typeof fallback === 'function' ? (
        fallback(shown)
      ) : (
        fallback
      )}
      {overlay}
    </span>
  )
}

/** The bundled glyph for a token or NPC once it is on screen (its chunk loads then,
 *  not before), else a custom emoji, else initials. */
function GlyphOrInitials({ glyph, emoji, label }: { glyph: string | null; emoji?: string | null; label: string }) {
  const [ref, inView] = useInView()
  return (
    <span ref={ref} className="ov-avatar-face">
      {inView && glyph ? <Glyph id={glyph} label={label} /> : (emoji ?? initials(label))}
    </span>
  )
}

function Glyph({ id, label }: { id: string; label: string }) {
  const paths = useTokenIconPaths()
  return paths?.[id] ? <TokenIcon id={id} size={22} /> : <>{initials(label)}</>
}

function NpcAvatar({ npc }: { npc: NPC }) {
  return (
    <Link to={`npcs?sel=${npc.id}`} className="ov-npc">
      <span className="ov-avatar" aria-hidden>
        <ThumbImage
          imageId={npc.imageId}
          maxEdge={96}
          alt=""
          className="ov-media-fill"
          fallback={<GlyphOrInitials glyph={npcTokenIcon(npc)} label={npc.name || 'NPC'} />}
        />
      </span>
      <span className="ov-npc-name">{npc.name || 'Unnamed'}</span>
    </Link>
  )
}

/** Up to five NPCs, portraits first; each links to its sheet. */
export function NpcPortraits({ npcs }: { npcs: NPC[] }) {
  const shown = pickPortraitNpcs(npcs, 5)
  if (shown.length === 0) return null
  return (
    <ul className="ov-portraits" aria-label="NPCs">
      {shown.map((n) => (
        <li key={n.id}>
          <NpcAvatar npc={n} />
        </li>
      ))}
    </ul>
  )
}

export function WorldMapThumb({ map }: { map: WorldMapSummary | null }) {
  const name = map?.name || 'World map'
  return (
    <Link to="worldmap" className="ov-mapthumb">
      <ThumbImage
        imageId={map?.imageId}
        maxEdge={360}
        alt={`World map: ${name}`}
        className="ov-media-map"
        fallback={
          <span className="ov-media-empty">
            <Icon name="map" size={18} color="currentColor" />
            <span>{map ? 'No map image yet' : 'No world map yet'}</span>
          </span>
        }
      />
    </Link>
  )
}

function TokenAvatar({ token }: { token: SceneTokenSummary }) {
  const glyph = tokenGlyphId(token)
  return (
    <li className="ov-avatar ov-token" style={{ borderColor: token.color }}>
      <ThumbImage
        imageId={token.imageId}
        maxEdge={64}
        alt=""
        className="ov-media-fill"
        fallback={<GlyphOrInitials glyph={glyph} emoji={glyph ? null : token.icon} label={token.label || 'Token'} />}
      />
    </li>
  )
}

/** The latest battle map as a small preview with a few token avatars over it. A blank
 *  grid, a missing image or a map that only exists in cloud Storage shows a grid
 *  placeholder (nothing is fetched from Storage). */
export function BattleMapThumb({ scene }: { scene: SceneSummary | null }) {
  if (!scene) {
    return (
      <Link to="battlemap" className="ov-battle">
        <span className="ov-media ov-media-battle" data-state="empty">
          <span className="ov-media-empty">
            <Icon name="map" size={18} color="currentColor" />
            <span>No battle map yet. Create a battle map</span>
          </span>
        </span>
      </Link>
    )
  }
  const name = scene.name || 'Untitled map'
  const grid = gridSize(scene)
  return (
    <Link to="battlemap" className="ov-battle">
      <ThumbImage
        imageId={scene.imageId}
        maxEdge={640}
        alt={`Battle map: ${name}`}
        className="ov-media-battle ov-media-grid"
        fallback={(status) => (
          <span className="ov-media-empty">
            <span className="sr-only">Battle map: {name}</span>
            {scene.imageId && (status === 'missing' || status === 'failed') && (
              <span aria-hidden>Map image not available on this device</span>
            )}
          </span>
        )}
        overlay={
          scene.tokens.length > 0 ? (
            <ul className="ov-avatars" aria-hidden>
              {scene.tokens.map((t) => (
                <TokenAvatar key={t.id} token={t} />
              ))}
            </ul>
          ) : undefined
        }
      />
      <span className="ov-media-cap" aria-hidden>
        {name}
        {grid ? ` · ${grid.cols} × ${grid.rows} grid` : ''}
      </span>
    </Link>
  )
}
