#!/usr/bin/env node
// D&D Codex uptime check for the Raspberry Pi.
//
// Run every 5 minutes by codex-uptime.timer. Each run checks the app, Supabase,
// the voice bot's systemd service, and the Pi's free disk space, then posts to a
// Discord channel (through a webhook) when something changes: down, still down,
// or back. It sends nothing while everything is healthy.
//
// Usage:
//   node --env-file=.env uptime/check.mjs               run the checks and alert
//   node --env-file=.env uptime/check.mjs --print       show the results, send nothing
//   node --env-file=.env uptime/check.mjs --test-alert  post a test message to the webhook

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { evaluate } from './evaluate.mjs'

const execFileAsync = promisify(execFile)

const {
  ALERT_WEBHOOK_URL,
  CHECK_APP_URL = 'https://dndcodex.pages.dev',
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  CHECK_SERVICES = 'codexbot',
  DISK_ALERT_PERCENT = '90',
  HEARTBEAT_URL,
  STATE_DIRECTORY,
} = process.env

const TIMEOUT_MS = 10_000
// systemd sets STATE_DIRECTORY (from StateDirectory=) to a folder this service owns.
// Outside systemd the state lands in the temp folder, which only means a repeat alert
// after a reboot.
const STATE_FILE = process.env.UPTIME_STATE_FILE ?? path.join(STATE_DIRECTORY ?? os.tmpdir(), 'codex-uptime.json')

const args = new Set(process.argv.slice(2))

function describeError(err) {
  if (err?.name === 'TimeoutError') return `no answer within ${TIMEOUT_MS / 1000} s`
  return err?.cause?.code ?? err?.message ?? String(err)
}

async function checkHttp(name, url, headers = {}) {
  try {
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) })
    await res.body?.cancel()
    return { name, ok: res.status === 200, detail: `HTTP ${res.status}` }
  } catch (err) {
    return { name, ok: false, detail: describeError(err) }
  }
}

/** Returns null when systemctl isn't available (for example when testing on a Mac). */
async function checkService(unit) {
  const name = `Service ${unit}`
  try {
    await execFileAsync('systemctl', ['is-active', '--quiet', unit])
    return { name, ok: true, detail: 'active' }
  } catch (err) {
    if (err.code === 'ENOENT') return null
    return { name, ok: false, detail: 'not active' }
  }
}

function checkDisk() {
  const limit = Number(DISK_ALERT_PERCENT)
  const s = fs.statfsSync('/')
  const used = Math.round((1 - s.bavail / s.blocks) * 100)
  return { name: 'Pi disk', ok: used < limit, detail: `${used}% of the SD card used (limit ${limit}%)` }
}

async function runChecks() {
  const checks = [checkHttp('App', CHECK_APP_URL)]
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    checks.push(
      checkHttp('Supabase', `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/health`, { apikey: SUPABASE_ANON_KEY }),
    )
  }
  for (const unit of CHECK_SERVICES.split(',').map((s) => s.trim()).filter(Boolean)) {
    checks.push(checkService(unit))
  }
  const results = (await Promise.all(checks)).filter(Boolean)
  results.push(checkDisk())
  return results
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveState(state) {
  const tmp = `${STATE_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state))
  fs.renameSync(tmp, STATE_FILE)
}

/** Posts to the Discord webhook. Returns true when Discord accepted the message. */
async function sendAlert(text) {
  try {
    const res = await fetch(ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // allowed_mentions stops any text in a message from pinging people.
      body: JSON.stringify({ username: 'Codex Pi', content: text.slice(0, 1900), allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) console.error(`Discord webhook answered HTTP ${res.status}.`)
    return res.ok
  } catch (err) {
    console.error(`Could not reach the Discord webhook: ${describeError(err)}`)
    return false
  }
}

async function main() {
  if (args.has('--print')) {
    for (const r of await runChecks()) console.log(`${r.ok ? '✓' : '✗'} ${r.name} — ${r.detail}`)
    return 0
  }

  if (!ALERT_WEBHOOK_URL) {
    console.error('Missing ALERT_WEBHOOK_URL. Copy .env.example to .env and fill it in.')
    return 1
  }

  if (args.has('--test-alert')) {
    return (await sendAlert(`🧪 Test alert from ${os.hostname()}. The uptime check can reach this channel.`)) ? 0 : 1
  }

  const results = await runChecks()
  for (const r of results.filter((r) => !r.ok)) console.error(`FAIL ${r.name}: ${r.detail}`)

  const prev = loadState()
  const { state, messages } = evaluate(prev, results, Date.now())

  // If Discord didn't take the message, keep the old state so the next run tries again.
  const delivered = messages.length === 0 || (await sendAlert(messages.join('\n')))
  if (delivered && JSON.stringify(state) !== JSON.stringify(prev)) saveState(state)

  // A heartbeat proves the Pi itself is alive, which nothing running on the Pi can
  // report by itself. Point HEARTBEAT_URL at a dead-man's-switch service.
  if (HEARTBEAT_URL) {
    await fetch(HEARTBEAT_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => {})
  }
  return 0
}

process.exitCode = await main()
