import './polyfills';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DrawingProvider } from '@/contexts/DrawingProvider'
import { AuthProvider } from '@/contexts/AuthProvider'
import { AIProgressProvider } from '@/contexts/AIProgressContext'
import { CoordinateHighlightProvider } from '@/contexts/CoordinateHighlightContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <DrawingProvider>
        <AIProgressProvider>
          <CoordinateHighlightProvider>
            <App />
          </CoordinateHighlightProvider>
        </AIProgressProvider>
      </DrawingProvider>
    </AuthProvider>
  </StrictMode>,
)
