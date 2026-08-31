import { useCampaign } from './CampaignLayout'
import { ThoughtMap } from '../components/ThoughtMap'

/** The campaign thought map — a connected web of everything in the world. */
export function MapPage() {
  const campaign = useCampaign()
  return (
    <div>
      <div className="row between" style={{ marginBottom: 4 }}>
        <h2 className="mb-0">Thought Map</h2>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 14 }}>
        Every character, place, item, note and session in this world, wired together by their
        connections. Trace who knows whom, spot the threads you haven’t tied off yet, and add
        connections right on the canvas.
      </p>
      <ThoughtMap campaignId={campaign.id} />
    </div>
  )
}
