import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App'

Sentry.init({
  dsn: 'https://80ee9cf6b8396c84726580d8d673a85f@o4511148556091392.ingest.us.sentry.io/4511148564348928',
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.2,
  enabled: import.meta.env.PROD,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>Something went wrong</h2>
      <p>The error has been reported. Please refresh the page.</p>
    </div>}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
