// Daily Duel balance simulation. Usage (from dnd-codex/):
//   node scripts/duel-sim.mjs report [sims]     win rates by tier, hero, twist and policy
//   node scripts/duel-sim.mjs heroes [sims]     each hero's win rate (smart player, all foes and tiers)
//   node scripts/duel-sim.mjs tune-heroes [--write]  nudge hero HP so heroes win about equally often
//   node scripts/duel-sim.mjs tune [--write]    retune foe HP for a smart player; --write edits src/data/duelists.ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildSync } from 'esbuild'

const here = path.dirname(new URL(import.meta.url).pathname)
const out = path.join(os.tmpdir(), `duel-sim-${process.pid}.mjs`)
buildSync({ entryPoints: [path.join(here, 'duel-sim.entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' })
const sim = await import(out)
fs.rmSync(out, { force: true })

const cmd = process.argv[2] ?? 'report'
if (cmd === 'report') {
  sim.report(Number(process.argv[3]) || 30)
} else if (cmd === 'tune') {
  const hp = sim.tune()
  console.log(JSON.stringify(hp, null, 1))
  if (process.argv.includes('--write')) {
    const file = path.join(here, '..', 'src', 'data', 'duelists.ts')
    let src = fs.readFileSync(file, 'utf8')
    for (const [id, arr] of Object.entries(hp)) {
      const re = new RegExp(`(id: '${id}',[^\\n]*? hp: )\\[[^\\]]*\\]`)
      if (!re.test(src)) { console.error(`could not find foe ${id}`); process.exit(1) }
      src = src.replace(re, `$1[${arr.join(', ')}]`)
    }
    fs.writeFileSync(file, src)
    console.log('wrote src/data/duelists.ts')
  }
} else if (cmd === 'heroes') {
  sim.heroReport(Number(process.argv[3]) || 10)
} else if (cmd === 'tune-heroes') {
  const hp = sim.tuneHeroes()
  console.log(JSON.stringify(hp))
  if (process.argv.includes('--write')) {
    const file = path.join(here, '..', 'src', 'data', 'duelists.ts')
    let src = fs.readFileSync(file, 'utf8')
    for (const [id, n] of Object.entries(hp)) {
      const re = new RegExp(`(id: '${id}', name: '[^']*', emoji: '[^']*', hp: )\\d+`)
      if (!re.test(src)) { console.error(`could not find hero ${id}`); process.exit(1) }
      src = src.replace(re, `$1${n}`)
    }
    fs.writeFileSync(file, src)
    console.log('wrote src/data/duelists.ts')
  }
} else {
  console.error('usage: node scripts/duel-sim.mjs report|tune [--write]')
  process.exit(1)
}
