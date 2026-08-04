import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' keeps asset paths relative so the build works under any GitHub
// Pages sub-path (e.g. https://user.github.io/repo-name/) without hardcoding
// the repository name. We also use HashRouter, which avoids the need for any
// server-side rewrite rules that GitHub Pages cannot provide.
export default defineConfig({
  plugins: [react()],
  base: './',
})
