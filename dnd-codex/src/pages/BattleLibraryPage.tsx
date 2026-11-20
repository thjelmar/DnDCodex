import { Link } from 'react-router-dom'
import { BattleLibrary } from '../components/BattleLibrary'
import { usePublisher } from '../lib/libraryPublish'

/** Tools → Battle map library: browse published maps and copy one into a campaign. */
export function BattleLibraryPage() {
  const publisher = usePublisher()
  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="mb-0">Battle map library</h1>
          <div className="subtitle">
            Ready-made battle maps with the grid already lined up. Adding one copies it into your
            campaign, so it keeps working offline even if the library changes.
          </div>
        </div>
        {publisher && <Link className="btn" to="/tools/battlemaps/manage">Manage</Link>}
      </div>
      <BattleLibrary />
    </div>
  )
}
