import { TOKEN_ICON_AUTHORS, TOKEN_ICON_CATALOG } from '../lib/tokenIcons'

export function CreditsPage() {
  return (
    <div className="content">
      <div className="page-header">
        <div>
          <h1 className="mb-0">Credits</h1>
          <div className="subtitle">Artwork and data D&amp;D Codex builds on.</div>
        </div>
      </div>
      <section className="card" style={{ maxWidth: 720 }}>
        <h2>Token icons</h2>
        <p>
          The default token icons are human-made line icons from{' '}
          <a href="https://game-icons.net" target="_blank" rel="noopener noreferrer">game-icons.net</a>, licensed under{' '}
          <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">Creative Commons Attribution 3.0</a>.
          D&amp;D Codex recolors them but doesn’t otherwise change them. {TOKEN_ICON_CATALOG.length} icons are bundled.
        </p>
        <ul>
          {TOKEN_ICON_AUTHORS.map((a) => (
            <li key={a.name}>
              Icons made by{' '}
              <a href={a.url} target="_blank" rel="noopener noreferrer">{a.name}</a>. Available on{' '}
              <a href="https://game-icons.net" target="_blank" rel="noopener noreferrer">game-icons.net</a>.
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
