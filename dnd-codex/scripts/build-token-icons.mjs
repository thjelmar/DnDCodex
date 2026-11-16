// Builds src/data/tokenIconPaths.json from a local clone of
// github.com/game-icons/icons (CC BY 3.0). Usage:
//   node scripts/build-token-icons.mjs <path-to-clone>
// Only Lorc and Delapouite icons are bundled (see AUTHORS in src/lib/tokenIcons.ts).
// Each SVG is 512x512 with a black background path first and the white glyph second;
// we keep just the glyph's path data so it can be recolored with currentColor.
import fs from 'node:fs'
import path from 'node:path'

const repo = process.argv[2]
if (!repo) { console.error('usage: node scripts/build-token-icons.mjs <clone>'); process.exit(1) }
const here = path.dirname(new URL(import.meta.url).pathname)
const catalog = fs.readFileSync(path.join(here, '../src/lib/tokenIconCatalog.ts'), 'utf8')
const ids = [...catalog.matchAll(/\['([a-z0-9-]+)',\s*'[^']*'\]/g)].map((m) => m[1])
const AUTHORS = ['lorc', 'delapouite']
const out = {}
const missing = []
for (const id of ids) {
  const author = AUTHORS.find((a) => fs.existsSync(path.join(repo, a, id + '.svg')))
  if (!author) { missing.push(id); continue }
  const svg = fs.readFileSync(path.join(repo, author, id + '.svg'), 'utf8')
  const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1])
  // First path is the black background square (M0 0h512v512H0z).
  const glyph = paths.filter((d) => d.replace(/\s/g, '') !== 'M0 0h512v512H0z'.replace(/\s/g, '')).join(' ')
  if (!glyph) { missing.push(id + ' (no glyph)'); continue }
  out[id] = { a: author === 'lorc' ? 'Lorc' : 'Delapouite', d: glyph }
}
if (missing.length) { console.error('MISSING:', missing.join(', ')); process.exit(2) }
fs.writeFileSync(path.join(here, '../src/data/tokenIconPaths.json'), JSON.stringify(out))
console.log(`wrote ${Object.keys(out).length} icons`)
