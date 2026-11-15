import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'GymBro',
        short_name: 'GymBro',
        description: 'Registro de entrenamiento: series, pesos, reps, RIR e intensidad',
        // Android pinta con theme_color la barra de gestos de abajo y no se puede cambiar según el tema o la paleta
        // elegidos: va un neutro oscuro, que no desentona con ninguno. La barra de arriba sí sigue al tema (App.tsx).
        theme_color: '#101214',
        background_color: '#101214',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webp,woff2}'],
        navigateFallback: null
      }
    })
  ]
})
