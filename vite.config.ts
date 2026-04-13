import { defineConfig } from 'vite'
import { VitePWA }      from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    open: true,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // Precache everything in the build output
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        // Phaser chunk is large — raise the warning limit
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
      manifest: {
        name: 'Tropical Island',
        short_name: 'Tropical',
        description: 'Stack & sell tropical island simulator',
        start_url: '.',
        display: 'fullscreen',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#0c71a4',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            // Maskable icon uses the same file — slight padding would be ideal
            // but the design has enough safe zone for now
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
