import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Tema y paleta de la última vez, antes de dibujar nada: evita el destello con los colores por defecto.
try {
  const [tema, paleta] = (localStorage.getItem('gl-aspecto') ?? '').split(' ')
  if (tema) document.documentElement.dataset.theme = tema
  if (paleta) document.documentElement.dataset.paleta = paleta
} catch { /* sin almacenamiento */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// El service worker (modo sin conexión) solo se registra fuera de marcos restringidos.
if ('serviceWorker' in navigator && window.self === window.top && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* sin soporte */ }) })
}
