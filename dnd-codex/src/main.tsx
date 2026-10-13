import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { isDemo, DemoBlockedError } from './lib/demo'
import { seedDemoIfNeeded } from './lib/demoSeedRunner'
import './styles.css'

// A blocked write in the demo throws DemoBlockedError from the repo backstop
// (after raising the toast). That's expected control flow, not a real error, so
// swallow it here rather than making every call site catch it.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason instanceof DemoBlockedError) e.preventDefault()
})

async function start() {
  // In demo mode, load the sample campaign into the throwaway demo DB before the
  // first render so the app never flashes empty.
  if (isDemo()) await seedDemoIfNeeded()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

start()
