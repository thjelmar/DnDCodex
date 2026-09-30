#!/usr/bin/env node
// Ticket queue CLI — how a Claude session (or you, in a terminal) reads and works
// the same tickets the site's Tickets page shows. Talks straight to Supabase with
// the service-role key, so no sign-in is needed.
//
//   npm run tickets -- list [--released | --all] [--source site|owner] [--category issue|enhancement|feature]
//   npm run tickets -- show T-18              full details; saves any screenshot to .tickets/T-18.png
//   npm run tickets -- add "Title" [--category c] [--priority p] [--details "…"] [--public]
//   npm run tickets -- start T-18 [--as "Claude (main)"]   → In progress, and records who's on it
//   npm run tickets -- done T-18 "What changed, and where"  → Testing, with a resolution note
//   npm run tickets -- release T-18 ["note"]                → Released
//   npm run tickets -- stage T-18 planned|in_progress|testing|released|reported
//   npm run tickets -- set T-18 [--priority p] [--category c] [--title "…"] [--public | --private]
//   npm run tickets -- note T-18 "Resolution note"
//
// Setup: put the Supabase secret key in dnd-codex/.env.tickets (gitignored):
//   SUPABASE_SERVICE_ROLE_KEY=sb_secret_…
//   SUPABASE_URL=https://…supabase.co      (optional)
// It's looked up next to this script first, then in the main checkout, so
// sessions running in a git worktree find it too. Real env vars win over the file.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_SUPABASE_URL = 'https://hxdrkifgwrbqpcevvbit.supabase.co'
const CATEGORIES = ['issue', 'enhancement', 'feature']
const PRIORITIES = ['urgent', 'high', 'medium', 'low']
const STAGES = ['reported', 'planned', 'in_progress', 'testing', 'released']

function die(msg) {
  console.error(`tickets: ${msg}`)
  process.exit(1)
}

// ---------------------------------------------------------------- config

function envFileCandidates() {
  const out = [join(APP_DIR, '.env.tickets')]
  try {
    // In a worktree, --git-common-dir points at the main checkout's .git.
    const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd: APP_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    out.push(join(dirname(common), 'dnd-codex', '.env.tickets'))
  } catch {
    // Not a git checkout — the local file is the only candidate.
  }
  return out
}

function loadEnv() {
  const file = envFileCandidates().find((f) => existsSync(f))
  const vars = {}
  if (file) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (m && !line.trimStart().startsWith('#')) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || vars.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.SUPABASE_URL || vars.SUPABASE_URL || DEFAULT_SUPABASE_URL
  if (!key) {
    die(
      'no Supabase key found. Add SUPABASE_SERVICE_ROLE_KEY=sb_secret_… to dnd-codex/.env.tickets ' +
        '(see docs/TICKETS.md).',
    )
  }
  return { key, url }
}

const { key, url } = loadEnv()

async function rest(path, init = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) die(`Supabase said ${res.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const name = a.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        flags[name] = next
        i++
      } else {
        flags[name] = true
      }
    } else {
      positional.push(a)
    }
  }
  return { positional, flags }
}

function parseNumber(ref) {
  const m = /^(?:T-?)?(\d+)$/i.exec(ref ?? '')
  if (!m) die(`expected a ticket like T-18, got "${ref ?? ''}"`)
  return Number(m[1])
}

function oneOf(value, allowed, what) {
  if (value === undefined) return undefined
  if (!allowed.includes(value)) die(`${what} must be one of: ${allowed.join(', ')}`)
  return value
}

// ---------------------------------------------------------------- helpers

const tid = (t) => `T-${t.number}`
const titleOf = (t) => t.title || (t.description ?? '').split('\n')[0].slice(0, 80) || '(untitled)'
const pad = (s, n) => String(s ?? '').padEnd(n)
const rank = (p) => (PRIORITIES.includes(p) ? PRIORITIES.indexOf(p) : PRIORITIES.length)

async function getTicket(ref) {
  const n = parseNumber(ref)
  const rows = await rest(`bug_reports?select=*&number=eq.${n}`)
  if (!rows.length) die(`no ticket T-${n}`)
  return rows[0]
}

async function patch(t, fields) {
  if ('status' in fields) fields.released_at = fields.status === 'released' ? new Date().toISOString() : null
  const rows = await rest(`bug_reports?id=eq.${t.id}&select=number,title,description,status`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  })
  return rows[0]
}

// ---------------------------------------------------------------- commands

async function list(flags) {
  const filters = ['select=number,title,description,category,priority,status,source,is_public,claimed_by']
  if (flags.released) filters.push('status=eq.released')
  else if (!flags.all) filters.push('status=neq.released')
  if (flags.source) filters.push(`source=eq.${oneOf(flags.source, ['site', 'owner'], '--source')}`)
  if (flags.category) filters.push(`category=eq.${oneOf(flags.category, CATEGORIES, '--category')}`)
  const rows = await rest(`bug_reports?${filters.join('&')}`)
  rows.sort((a, b) => rank(a.priority) - rank(b.priority) || b.number - a.number)
  if (!rows.length) {
    console.log('No tickets in this view.')
    return
  }
  console.log(`${pad('ID', 7)}${pad('PRI', 8)}${pad('CATEGORY', 13)}${pad('SOURCE', 7)}${pad('STAGE', 13)}TITLE`)
  for (const t of rows) {
    const who = t.claimed_by && t.status !== 'released' ? `  [${t.claimed_by}]` : ''
    console.log(
      `${pad(tid(t), 7)}${pad(t.priority ?? '-', 8)}${pad(t.category ?? 'untriaged', 13)}` +
        `${pad(t.source === 'owner' ? 'you' : 'site', 7)}${pad(t.status, 13)}${titleOf(t)}${t.is_public ? '  (public)' : ''}${who}`,
    )
  }
}

async function show(ref) {
  const t = await getTicket(ref)
  console.log(`${tid(t)}  ${titleOf(t)}`)
  console.log(
    `[${t.category ?? 'untriaged'} · ${t.priority ?? 'no priority'} · ${t.source === 'owner' ? 'yours' : 'site report'}` +
      ` · ${t.status}${t.is_public ? ' · public' : ''}]`,
  )
  console.log(`Created ${t.created_at}${t.released_at ? ` · released ${t.released_at}` : ''}`)
  if (t.claimed_by) console.log(`Worked on by: ${t.claimed_by}`)
  if (t.description) console.log(`\n${t.source === 'owner' ? 'Details' : 'Reported'}:\n${t.description}`)
  if (t.resolution_note) console.log(`\nResolution note: ${t.resolution_note}`)
  if (t.source === 'site') {
    console.log('\nReport context:')
    console.log(`  route: ${t.route ?? '-'}   version: ${t.app_version ?? '-'}`)
    console.log(`  browser: ${t.user_agent ?? '-'}`)
    const errs = t.context?.recentErrors
    if (Array.isArray(errs) && errs.length) {
      console.log(`  recent errors (${errs.length}):`)
      for (const e of errs.slice(-5)) console.log(`    - ${e.message ?? JSON.stringify(e)}`)
    }
  }
  const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(t.screenshot ?? '')
  if (m) {
    const dir = join(APP_DIR, '.tickets')
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${tid(t)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`)
    writeFileSync(file, Buffer.from(m[2], 'base64'))
    console.log(`\nScreenshot saved to ${file}`)
  }
}

async function add(title, flags) {
  if (!title) die('add needs a title: npm run tickets -- add "Title"')
  const row = {
    source: 'owner',
    status: 'planned',
    title,
    description: typeof flags.details === 'string' ? flags.details : null,
    category: oneOf(flags.category, CATEGORIES, '--category') ?? 'enhancement',
    priority: oneOf(flags.priority, PRIORITIES, '--priority') ?? 'medium',
    is_public: flags.public === true,
  }
  const rows = await rest('bug_reports?select=number', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  console.log(`✓ Added T-${rows[0].number}: ${title}`)
}

async function set(ref, flags) {
  const t = await getTicket(ref)
  const fields = {}
  if (flags.priority) fields.priority = oneOf(flags.priority, PRIORITIES, '--priority')
  if (flags.category) fields.category = oneOf(flags.category, CATEGORIES, '--category')
  if (typeof flags.title === 'string') fields.title = flags.title
  if (flags.public) {
    if (!t.title && !fields.title) die('a public ticket needs a title first (--title "…")')
    fields.is_public = true
  }
  if (flags.private) fields.is_public = false
  if (!Object.keys(fields).length) die('nothing to set (use --priority, --category, --title, --public or --private)')
  await patch(t, fields)
  console.log(`✓ ${tid(t)} updated`)
}

async function stage(ref, next, extra = {}) {
  const t = await getTicket(ref)
  oneOf(next, STAGES, 'stage')
  if (next === 'reported' && t.source === 'owner') die('your own tickets start at planned; they have no reported stage')
  await patch(t, { status: next, ...extra })
  console.log(`✓ ${tid(t)} → ${next}${extra.resolution_note ? ` (note: ${extra.resolution_note})` : ''}`)
}

// ---------------------------------------------------------------- main

const [command, ...rest_] = process.argv.slice(2)
const { positional, flags } = parseArgs(rest_)

switch (command) {
  case 'list':
  case undefined:
    await list(flags)
    break
  case 'show':
    await show(positional[0])
    break
  case 'add':
    await add(positional[0], flags)
    break
  case 'start':
    await stage(positional[0], 'in_progress', {
      claimed_by: typeof flags.as === 'string' ? flags.as : 'Claude',
    })
    break
  case 'done':
    if (!positional[1]) die('done needs a note: npm run tickets -- done T-18 "What changed, and where"')
    await stage(positional[0], 'testing', { resolution_note: positional[1] })
    break
  case 'release':
    await stage(positional[0], 'released', positional[1] ? { resolution_note: positional[1] } : {})
    break
  case 'stage':
    await stage(positional[0], positional[1])
    break
  case 'set':
    await set(positional[0], flags)
    break
  case 'note': {
    if (!positional[1]) die('note needs text')
    const t = await getTicket(positional[0])
    await patch(t, { resolution_note: positional[1] })
    console.log(`✓ ${tid(t)} note saved`)
    break
  }
  default:
    die(`unknown command "${command}". Try: list, show, add, start, done, release, stage, set, note`)
}
