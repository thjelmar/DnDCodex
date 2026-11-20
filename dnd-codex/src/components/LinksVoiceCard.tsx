import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icon'
import { CampaignLinks } from './CampaignLinks'
import { DiscordVoiceSettings } from './DiscordVoiceSettings'
import type { Campaign } from '../db/types'

// One Overview card with two sections, Links and Voice, split by a thin line. Each
// section has its own heading toggle that collapses only its body, so a closed
// section leaves just its heading and the rest of the card closes up around it.
// Same conventions as CollapsePanel: an <h3> wraps the toggle button, aria-expanded
// and aria-controls are set, and the body stays mounted (hidden) so typed text
// survives a toggle. Defaults are read once at mount: open on a wide screen, closed
// on a phone.

const WIDE = '(min-width: 961px)'

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    try {
      return window.matchMedia(WIDE).matches
    } catch {
      return true
    }
  })
  const bodyId = useId()
  return (
    <div className="ov-duo-section">
      <div className="ov-panel-head">
        <h3 className="mb-0">
          <button
            type="button"
            className="ov-panel-toggle"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon
              name="chevron-right"
              size={13}
              color="currentColor"
              className={`sidebar-caret${open ? ' open' : ''}`}
            />
            {title}
          </button>
        </h3>
      </div>
      <div id={bodyId} className="ov-panel-body" hidden={!open}>
        {children}
      </div>
    </div>
  )
}

export function LinksVoiceCard({ campaign }: { campaign: Campaign }) {
  return (
    <section className="ov-panel ov-duo" aria-label="Links and voice">
      <Section title="Links">
        <CampaignLinks campaignId={campaign.id} links={campaign.externalLinks ?? []} />
      </Section>
      <Section title="Voice">
        <DiscordVoiceSettings campaign={campaign} />
      </Section>
    </section>
  )
}
