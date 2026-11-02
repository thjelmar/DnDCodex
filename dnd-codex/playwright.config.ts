import { defineConfig, devices } from '@playwright/test'

// End-to-end tests drive the real app in Chromium against the Vite dev server.
// The server always starts with a placeholder Supabase config (never real keys),
// so the app behaves as a configured-but-unreachable backend. Every request to
// supabase.co is intercepted and recorded by the fixtures in e2e/fixtures.ts.
const PORT = 5174

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Never reuse a running server: it could be started with real Supabase keys.
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'https://e2e-placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'e2e-placeholder-anon-key',
    },
  },
})
