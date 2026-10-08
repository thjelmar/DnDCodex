#!/usr/bin/env node
// Ticket queue CLI — how a Claude session (or you, in a terminal) reads and works
// the same tickets the site's Tickets page shows. Talks straight to Supabase with
// the service-role key, so no sign-in is needed.
//
//   npm run tickets -- list [--released | --all] [--source site|owner] [--category issue|enhancement|feature]
//   npm run tickets -- show T-18              full details; saves any screenshot to .tickets/T-18.png
//   npm run tickets -- add "Title" [--category c] [--priority p] [--details "…"] [--public] [--follow-up-of T-5]
//   npm run tickets -- start T-18 [--as "Claude (main)"]   → In progress, and records who's on it
//   npm run tickets -- done T-18 "What changed, and where"  → Testing, with a resolution note
//   npm run tickets -- release T-18 ["note"]                → Released
//   npm run tickets -- stage T-18 planned|in_progress|testing|released|reported
//   npm run tickets -- set T-18 [--priority p] [--category c] [--title "…"] [--details "…"] [--public | --private]
//   npm run tickets -- note T-18 "Resolution note"     the one-line summary
//   npm run tickets -- comment T-18 "A thought" [--as "Claude (main)"]   thread entry
//   npm run tickets -- commit T-18 <sha> ["subject"]   record a commit (subject auto-filled from git)
//   npm run tickets -- link T-20 T-5          T-20 is a follow-up of T-5
//   npm run tickets -- unlink T-20
//   npm run tickets -- check T-18 2 [3 …]     tick checklist items (numbers from `show`)
//   npm run tickets -- uncheck T-18 2
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

// soft: return null instead of exiting on an error response.
async function rest(path, init = {}, { soft = false } = {}) {
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
  if (!res.ok && soft) return null
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
// Details checklists: "- [ ] item" / "- [x] item" lines. Same syntax as
// src/lib/tickets.tsx (parseDetails) — keep the two in step.
const CHECK_RE = /^(\s*)[-*]\s+\[([ xX])\]\s?(.*)$/

/** Line indexes of the checklist items, in order (item 1 is checks[0]). */
function checkLines(text) {
  const lines = (text ?? '').split('\n')
  return lines.map((l, i) => (CHECK_RE.test(l) ? i : -1)).filter((i) => i !== -1)
}

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
  const filters = ['select=number,title,description,category,priority,status,source,is_public,claimed_by,follow_up_of']
  if (flags.released) filters.push('status=eq.released')
  else if (!flags.all) filters.push('status=neq.released')
  if (flags.source) filters.push(`source=eq.${oneOf(flags.source, ['site', 'owner'], '--source')}`)
  if (flags.category) filters.push(`category=eq.${oneOf(flags.category, CATEGORIES, '--category')}`)
  // Before 0022_ticket_links.sql has run there's no follow_up_of column.
  const rows =
    (await rest(`bug_reports?${filters.join('&')}`, {}, { soft: true })) ??
    (await rest(`bug_reports?${filters.join('&').replace(',follow_up_of', '')}`))
  rows.sort((a, b) => rank(a.priority) - rank(b.priority) || b.number - a.number)
  if (!rows.length) {
    console.log('No tickets in this view.')
    return
  }
  console.log(`${pad('ID', 7)}${pad('PRI', 8)}${pad('CATEGORY', 13)}${pad('SOURCE', 7)}${pad('STAGE', 13)}TITLE`)
  for (const t of rows) {
    const who = t.claimed_by && t.status !== 'released' ? `  [${t.claimed_by}]` : ''
    const parent = t.follow_up_of ? `  (follow-up of T-${t.follow_up_of})` : ''
    const checks = checkLines(t.description)
    const done = checks.filter((i) => CHECK_RE.exec(t.description.split('\n')[i])[2] !== ' ').length
    const progress = checks.length ? `  [${done}/${checks.length} done]` : ''
    console.log(
      `${pad(tid(t), 7)}${pad(t.priority ?? '-', 8)}${pad(t.category ?? 'untriaged', 13)}` +
        `${pad(t.source === 'owner' ? 'you' : 'site', 7)}${pad(t.status, 13)}${titleOf(t)}${t.is_public ? '  (public)' : ''}${parent}${progress}${who}`,
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
  if (t.follow_up_of) {
    const [p] = await rest(`bug_reports?select=number,title,description,status&number=eq.${t.follow_up_of}`)
    console.log(`Follow-up of: T-${t.follow_up_of}${p ? `  ${titleOf(p)} [${p.status}]` : '  (not found)'}`)
  }
  const kids = 'follow_up_of' in t
    ? await rest(`bug_reports?select=number,title,description,status&follow_up_of=eq.${t.number}&order=number`)
    : []
  if (kids.length) console.log(`Follow-ups: ${kids.map((k) => `T-${k.number} ${titleOf(k)} [${k.status}]`).join('; ')}`)
  if (t.description) {
    // Number the checklist items so `check T-n <item>` can refer to them.
    let item = 0
    const body = t.description
      .split('\n')
      .map((l) => (CHECK_RE.test(l) ? l.replace(CHECK_RE, (_, ind, x, text) => `${ind}${x === ' ' ? '[ ]' : '[x]'} ${++item}. ${text}`) : l))
      .join('\n')
    console.log(`\n${t.source === 'owner' ? 'Details' : 'Reported'}:\n${body}`)
    if (item) console.log(`(${item} checklist item${item === 1 ? '' : 's'}; tick with: npm run tickets -- check ${tid(t)} <n>)`)
  }
  if (t.resolution_note) console.log(`\nResolution note: ${t.resolution_note}`)

  // Commit refs + comment thread (0030_ticket_threads.sql); soft so a pre-
  // migration DB just skips them.
  const commits = await rest(
    `ticket_commits?ticket_number=eq.${t.number}&order=created_at&select=sha,subject`,
    {},
    { soft: true },
  )
  if (Array.isArray(commits) && commits.length) {
    console.log(`\nCommits (${commits.length}):`)
    for (const c of commits) {
      console.log(`  ${c.sha.slice(0, 12)}${c.subject ? `  ${c.subject}` : ''}`)
      console.log(`    https://github.com/${GITHUB_REPO}/commit/${c.sha}`)
    }
  }
  const comments = await rest(
    `ticket_comments?ticket_number=eq.${t.number}&order=created_at&select=author,body,created_at`,
    {},
    { soft: true },
  )
  if (Array.isArray(comments) && comments.length) {
    console.log(`\nComments (${comments.length}):`)
    for (const c of comments) {
      console.log(`  [${c.author} · ${new Date(c.created_at).toLocaleString()}]`)
      for (const line of String(c.body).split('\n')) console.log(`    ${line}`)
    }
  }

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
  if (flags['follow-up-of']) row.follow_up_of = (await getTicket(flags['follow-up-of'])).number
  const rows = await rest('bug_reports?select=number', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  console.log(`✓ Added T-${rows[0].number}: ${title}${row.follow_up_of ? ` (follow-up of T-${row.follow_up_of})` : ''}`)
}

async function set(ref, flags) {
  const t = await getTicket(ref)
  const fields = {}
  if (flags.priority) fields.priority = oneOf(flags.priority, PRIORITIES, '--priority')
  if (flags.category) fields.category = oneOf(flags.category, CATEGORIES, '--category')
  if (typeof flags.title === 'string') fields.title = flags.title
  if (typeof flags.details === 'string') fields.description = flags.details
  if (flags.public) {
    if (!t.title && !fields.title) die('a public ticket needs a title first (--title "…")')
    fields.is_public = true
  }
  if (flags.private) fields.is_public = false
  if (!Object.keys(fields).length) die('nothing to set (use --priority, --category, --title, --details, --public or --private)')
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

async function link(ref, parentRef) {
  const t = await getTicket(ref)
  const parent = await getTicket(parentRef)
  if (parent.number === t.number) die('a ticket can’t follow up itself')
  await patch(t, { follow_up_of: parent.number })
  console.log(`✓ ${tid(t)} is now a follow-up of ${tid(parent)} (${titleOf(parent)})`)
}

async function check(ref, items, done) {
  const t = await getTicket(ref)
  if (!items.length) die(`which item? e.g. npm run tickets -- ${done ? 'check' : 'uncheck'} ${tid(t)} 2`)
  const at = checkLines(t.description)
  if (!at.length) die(`${tid(t)} has no checklist`)
  const lines = t.description.split('\n')
  for (const raw of items) {
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 1 || n > at.length) die(`item must be 1–${at.length}, got "${raw}"`)
    lines[at[n - 1]] = lines[at[n - 1]].replace(/\[([ xX])\]/, done ? '[x]' : '[ ]')
  }
  await patch(t, { description: lines.join('\n') })
  const ticked = lines.filter((l) => CHECK_RE.test(l) && CHECK_RE.exec(l)[2] !== ' ').length
  console.log(`✓ ${tid(t)}: ${done ? 'ticked' : 'unticked'} ${items.join(', ')} (${ticked}/${at.length} done)`)
}

const GITHUB_REPO = 'thjelmar/DnDCodex'

/** Add a comment to a ticket's thread. */
async function comment(ref, text, flags) {
  if (!text) die('comment needs text: npm run tickets -- comment T-18 "A thought"')
  const t = await getTicket(ref)
  const author = typeof flags.as === 'string' ? flags.as : t.claimed_by || 'Claude (main)'
  await rest('ticket_comments', {
    method: 'POST',
    body: JSON.stringify({ ticket_number: t.number, author, body: text }),
  })
  console.log(`✓ ${tid(t)} comment added (as ${author})`)
}

/** Record a commit on a ticket. Subject auto-fills from `git log` when omitted. */
async function commitCmd(ref, sha, subjectArg) {
  if (!sha) die('commit needs a SHA: npm run tickets -- commit T-18 <sha> ["subject"]')
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) die(`"${sha}" doesn't look like a commit SHA (7–40 hex)`)
  const t = await getTicket(ref)
  let subject = subjectArg ?? null
  if (!subject) {
    try {
      subject = execFileSync('git', ['log', '-1', '--format=%s', sha], {
        cwd: APP_DIR,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || null
    } catch {
      // Unknown commit locally — store the SHA alone.
    }
  }
  // merge-duplicates so re-recording the same commit is a no-op, not an error.
  await rest('ticket_commits', {
    method: 'POST',
    headers: { prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ ticket_number: t.number, sha, subject }),
  })
  console.log(`✓ ${tid(t)} commit ${sha.slice(0, 12)} recorded${subject ? `: ${subject}` : ''}`)
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
  case 'comment':
    await comment(positional[0], positional[1], flags)
    break
  case 'commit':
    await commitCmd(positional[0], positional[1], positional[2])
    break
  case 'link':
    if (!positional[1]) die('link needs two tickets: npm run tickets -- link T-20 T-5  (T-20 follows up T-5)')
    await link(positional[0], positional[1])
    break
  case 'unlink': {
    const t = await getTicket(positional[0])
    await patch(t, { follow_up_of: null })
    console.log(`✓ ${tid(t)} is no longer linked`)
    break
  }
  case 'check':
  case 'uncheck':
    await check(positional[0], positional.slice(1), command === 'check')
    break
  default:
    die(`unknown command "${command}". Try: list, show, add, start, done, release, stage, set, note, comment, commit, link, unlink, check, uncheck`)
}
