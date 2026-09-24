// Client half of the bug reporter: gather diagnostic context and POST it to the
// /api/bug-report Cloudflare Pages Function (which stores + emails it). The
// function only runs on the deployed site, so a failed fetch in local dev is
// expected — the caller surfaces the error.

import { getRecentErrors } from './errorLog'

/** Build-time commit, injected by vite.config (Cloudflare's CF_PAGES_COMMIT_SHA). */
declare const __APP_COMMIT__: string

export interface BugReportInput {
  description: string
  /** Optional contact address; for signed-in users, their account email. */
  reporterEmail?: string | null
  /** The signed-in user's id, if any. */
  userId?: string | null
  /** 'bug' | 'idea' | 'question' (defaults to 'bug' server-side). */
  type?: string
  /** Optional screenshot as an image data URL. */
  screenshot?: string | null
}

export interface BugReportResult {
  ok: boolean
  stored?: boolean
  error?: string
}

/** Everything we auto-attach to a report beyond the user's own words. */
function collectContext() {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  return {
    recentErrors: getRecentErrors(),
    screen: typeof window !== 'undefined' ? { w: window.screen?.width, h: window.screen?.height } : undefined,
    viewport: typeof window !== 'undefined' ? { w: window.innerWidth, h: window.innerHeight } : undefined,
    language: nav?.language,
    online: nav?.onLine,
    reportedAt: new Date().toISOString(),
  }
}

export async function submitBugReport(input: BugReportInput): Promise<BugReportResult> {
  const description = input.description.trim()
  if (!description) return { ok: false, error: 'Please describe the problem.' }

  const appVersion = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev'
  const payload = {
    description,
    reporterEmail: input.reporterEmail ?? null,
    userId: input.userId ?? null,
    route: typeof location !== 'undefined' ? location.hash || location.pathname : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    appVersion,
    type: input.type ?? 'bug',
    screenshot: input.screenshot ?? null,
    context: collectContext(),
  }

  try {
    const res = await fetch('/api/bug-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: body.error || `Server error (${res.status}).` }
    }
    const body = (await res.json().catch(() => ({}))) as { stored?: boolean }
    return { ok: true, stored: body.stored }
  } catch {
    return { ok: false, error: 'Could not reach the server. Are you online?' }
  }
}
