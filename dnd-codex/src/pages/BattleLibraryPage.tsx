import { BattleLibrary } from '../components/BattleLibrary'

/** Tools → Battle map library: browse published maps and copy one into a campaign. */
export function BattleLibraryPage() {
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
      </div>
      <BattleLibrary />
    </div>
  )
}
