import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import App from './App'
import { ManifestAuthProvider } from './auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ManifestAuthProvider>
      <App />
    </ManifestAuthProvider>
  </StrictMode>,
)
