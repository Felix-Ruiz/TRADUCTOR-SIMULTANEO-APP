import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png'], // Asegura que tu logo cargue rápido
      manifest: {
        name: 'Traducción Simultánea en Vivo',
        short_name: 'Traductor Live',
        description: 'Plataforma de traducción simultánea con Inteligencia Artificial.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone', // Esto oculta la barra de direcciones de Chrome/Safari
        orientation: 'portrait',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // Ideal para los íconos adaptativos de Android
          }
        ]
      }
    })
  ]
})
