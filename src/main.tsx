import './polyfills';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DrawingProvider } from '@/contexts/DrawingProvider'
import { AuthProvider } from '@/contexts/AuthProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <DrawingProvider>
        <App />
      </DrawingProvider>
    </AuthProvider>
  </StrictMode>,
)
