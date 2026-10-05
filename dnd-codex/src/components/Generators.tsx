import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { db } from '../db/db'
import { createLocation, createNote } from '../db/repo'
import { randomTavernName, randomPlotHook, plotHookTitle } from '../lib/nameGen'
import { useGenOverrides } from '../lib/useGenOverrides'

const MAX_LOG = 12

/** Two at-the-table rollers for the things a DM invents on the fly: a tavern
 *  that suddenly needs a sign, and a plot hook when the party wanders off-script.
 *  Each roll can drop straight into its own sheet — a tavern as a Location, a
 *  hook as a world Note — in whichever campaign is picked. Lives as the first
 *  entry on the Generators page. */
export function GeneratorsPanel({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // DM campaigns only — players can't author locations/notes.
  const campaigns = useLiveQuery(
    () =>
      db.campaigns
        .orderBy('updatedAt')
        .reverse()
        .filter((c) => !c.archived && c.role !== 'player')
        .toArray(),
    [],
  )

  // Default the target to the campaign we're viewing, if any (/campaign/<id>,
  // /run/<id>), otherwise the most-recently-updated one.
  const routeCampaignId = useMemo(() => {
    const m = /#?\/(?:campaign|run)\/([^/?]+)/.exec(pathname)
    return m ? m[1] : null
  }, [pathname])
  const [target, setTarget] = useState<string | null>(null)
  const campaignId =
    (target && campaigns?.some((c) => c.id === target) ? target : null) ??
    (routeCampaignId && campaigns?.some((c) => c.id === routeCampaignId) ? routeCampaignId : null) ??
    campaigns?.[0]?.id ??
    null

  async function addTavern(name: string) {
    if (!campaignId) return
    const loc = await createLocation(campaignId, { name, type: 'landmark', tags: ['tavern'] })
    onDone?.()
    navigate(`/campaign/${campaignId}/locations?sel=${loc.id}`)
  }

  async function addHook(hook: string) {
    if (!campaignId) return
    const note = await createNote(campaignId, {
      title: plotHookTitle(hook),
      body: `<p>${hook}</p>`,
      tags: ['Plot hook'],
    })
    onDone?.()
    navigate(`/campaign/${campaignId}/notes?sel=${note.id}`)
  }

  const hasCampaign = !!campaignId

  // Global generator tables (Tools → Generators) override the built-in lists.
  const ov = useGenOverrides()

  return (
    <div className="gen-tools">
      <div className="gen-target field" style={{ margin: 0 }}>
        <label>Add to campaign</label>
        {campaigns && campaigns.length > 0 ? (
          <select
            className="input"
            value={campaignId ?? ''}
            onChange={(e) => setTarget(e.target.value)}
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="faint" style={{ fontSize: 13 }}>
            Create a campaign first to drop these into a sheet.
          </div>
        )}
      </div>

      <RollerTool
        label="Tavern name"
        hint="An inn or tavern that needs a name right now."
        roll={() => randomTavernName(ov)}
        addLabel="Add as location"
        onAdd={hasCampaign ? addTavern : undefined}
      />
      <RollerTool
        label="Plot hook"
        hint="A patron, a task, and a twist to send the party somewhere."
        roll={() => randomPlotHook(ov)}
        addLabel="Add as note"
        onAdd={hasCampaign ? addHook : undefined}
      />
    </div>
  )
}

function RollerTool({
  label,
  hint,
  roll,
  addLabel,
  onAdd,
}: {
  label: string
  hint: string
  roll: () => string
  addLabel: string
  onAdd?: (value: string) => void | Promise<void>
}) {
  const [log, setLog] = useState<string[]>([])
  const latest = log[0]

  function doRoll() {
    setLog((l) => [roll(), ...l].slice(0, MAX_LOG))
  }

  return (
    <div className="card gen-tool">
      <div className="row between" style={{ alignItems: 'baseline', marginBottom: 8 }}>
        <div className="sidebar-heading" style={{ margin: 0 }}>{label}</div>
        {log.length > 1 && (
          <button className="btn ghost small" onClick={() => setLog([])}>Clear</button>
        )}
      </div>

      <div className="gen-result">
        {latest ? (
          <span className="gen-result-text">{latest}</span>
        ) : (
          <span className="faint">{hint}</span>
        )}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn primary" onClick={doRoll}>
          <Icon name="dice" size={15} color="inherit" /> {latest ? 'Roll again' : 'Roll'}
        </button>
        {latest && onAdd && (
          <button className="btn" onClick={() => onAdd(latest)} title="Create the sheet and open it">
            <Icon name="plus" size={15} /> {addLabel}
          </button>
        )}
      </div>

      {log.length > 1 && (
        <div className="gen-log">
          {log.slice(1).map((entry, i) => (
            <div key={i} className="gen-log-line faint">{entry}</div>
          ))}
        </div>
      )}
    </div>
  )
}
