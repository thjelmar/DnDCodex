// Runs the live-backend sync e2e tests against a LOCAL Supabase stack.
// Reads the stack's keys from `supabase status` and passes them to Playwright
// through environment variables. Nothing is written to disk and no key is printed.
// Refuses any backend that is not on a loopback address.
import { execFileSync, spawnSync } from 'node:child_process'

function localStackEnv() {
  let out
  try {
    out = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    console.error('The local Supabase stack is not running. Start it with: cd dnd-codex && supabase start')
    process.exit(1)
  }
  const env = {}
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

const s = process.env.E2E_SUPABASE_URL
  ? {
      API_URL: process.env.E2E_SUPABASE_URL,
      ANON_KEY: process.env.E2E_SUPABASE_ANON_KEY,
      SERVICE_ROLE_KEY: process.env.E2E_SUPABASE_SERVICE_KEY,
    }
  : localStackEnv()

if (!s.API_URL || !s.ANON_KEY || !s.SERVICE_ROLE_KEY) {
  console.error('Missing URL, anon key, or service key for the test backend.')
  process.exit(1)
}
const host = new URL(s.API_URL).hostname
if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
  console.error(`Refusing to run live e2e tests against non-local host "${host}".`)
  process.exit(1)
}

const res = spawnSync('npx', ['playwright', 'test', 'e2e/sync-repair.spec.ts', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    E2E_LIVE: '1',
    E2E_SUPABASE_URL: s.API_URL,
    E2E_SUPABASE_ANON_KEY: s.ANON_KEY,
    E2E_SUPABASE_SERVICE_KEY: s.SERVICE_ROLE_KEY,
  },
})
process.exit(res.status ?? 1)
