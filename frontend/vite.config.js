import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Le decimos qué recursos estáticos debe guardar obligatoriamente
      includeAssets: ['logo.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      
      // EL MOTOR DE CACHÉ PARA VELOCIDAD EXTREMA
      workbox: {
        // Guarda en el disco duro del celular todo el código (JS, CSS, HTML)
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Limpia la caché vieja cuando lanzas una nueva actualización a Vercel
        cleanupOutdatedCaches: true,
        // Tamaño máximo de archivos a guardar (aumentado para el escáner QR)
        maximumFileSizeToCacheInBytes: 5000000 
      },

      manifest: {
        name: 'Traducción Simultánea en Vivo',
        short_name: 'Traductor Live',
        description: 'Plataforma de traducción simultánea con Inteligencia Artificial.',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone', 
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
            purpose: 'any maskable' 
          }
        ]
      }
    })
  ]
})