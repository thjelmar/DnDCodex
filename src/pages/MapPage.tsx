import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCampaign } from './CampaignLayout'
import { ThoughtMap, type MapConfig } from '../components/ThoughtMap'
import { ShareWithPlayersModal } from '../components/ShareWithPlayersModal'
import { createLink } from '../db/repo'
import { buildCampaignGraph, disconnectEdge, disconnectNode, KIND_META, NODE_KINDS, type GraphNode } from '../lib/graph'

/** The campaign thought map — a connected web of everything in the world. */
export function MapPage() {
  const campaign = useCampaign()
  const navigate = useNavigate()
  const graph = useLiveQuery(() => buildCampaignGraph(campaign.id), [campaign.id])
  const [shareNode, setShareNode] = useState<GraphNode | null>(null)

  const config = useMemo<MapConfig>(
    () => ({
      meta: KIND_META,
      kinds: NODE_KINDS,
      onConnect: async (from, to, label) => {
        await createLink(campaign.id, from.linkKind, from.id, to.linkKind, to.id, label)
      },
      onDisconnectEdge: (edge) => disconnectEdge(edge),
      onDisconnectNode: (node) => disconnectNode(campaign.id, node),
      onOpen: (node) => navigate(`/campaign/${campaign.id}/${node.section}?sel=${node.id}`),
      onShare: (node) => setShareNode(node),
      emptyHint: 'Add some NPCs, locations, notes or sessions and they’ll appear here to connect.',
      gapLabel: 'Lore gaps',
      gapWord: 'lore gap',
      gapNote: 'Structural links (home, ruler, parent, allies) are cleared too.',
    }),
    [campaign.id, navigate],
  )

  return (
    <div>
      <div className="row between" style={{ marginBottom: 4 }}>
        <h2 className="mb-0">Thought Map</h2>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 14 }}>
        Every character, place, item, note and session in this world, wired together by their connections. Trace who
        knows whom, spot the threads you haven’t tied off yet, and add connections right on the canvas.
      </p>
      <ThoughtMap graph={graph} config={config} />

      {shareNode && graph && (
        <ShareWithPlayersModal
          campaignId={campaign.id}
          node={shareNode}
          graph={graph}
          onClose={() => setShareNode(null)}
        />
      )}
    </div>
  )
}
