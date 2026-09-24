import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' keeps asset paths relative, so the build works whether it's served
// from a domain root (Cloudflare Pages, our host) or any sub-path — no hardcoded
// paths. We also use HashRouter, so deep links resolve on any static host with
// no server-side rewrite rules.
// Cloudflare Pages exposes the deploying commit as CF_PAGES_COMMIT_SHA at build
// time; we bake a short version string into the bundle so bug reports say exactly
// which deploy they came from. Falls back to 'dev' for local builds. Read it off
// globalThis (rather than the bare `process` global) so the config type-checks
// with no dependency on @types/node — the Cloudflare build image has no ambient
// Node types, so a bare `process` reference fails `tsc` there.
const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
const commit = (proc?.env?.CF_PAGES_COMMIT_SHA || 'dev').slice(0, 7)

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_COMMIT__: JSON.stringify(commit),
  },
})
