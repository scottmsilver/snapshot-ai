import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DrawingProvider } from '@/contexts/DrawingContext'
import { AuthProvider } from '@/contexts/AuthContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <DrawingProvider>
        <App />
      </DrawingProvider>
    </AuthProvider>
  </StrictMode>,
)
