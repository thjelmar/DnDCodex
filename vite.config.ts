import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' keeps asset paths relative, so the build works whether it's served
// from a domain root (Cloudflare Pages, our host) or any sub-path — no hardcoded
// paths. We also use HashRouter, so deep links resolve on any static host with
// no server-side rewrite rules.
export default defineConfig({
  plugins: [react()],
  base: './',
})
