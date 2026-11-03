import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import App from './App'
import { ManifestAuthProvider } from './auth'
import { ConnectMetrcGate } from './components/ConnectMetrcGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ManifestAuthProvider>
      <ConnectMetrcGate>
        <App />
      </ConnectMetrcGate>
    </ManifestAuthProvider>
  </StrictMode>,
)
