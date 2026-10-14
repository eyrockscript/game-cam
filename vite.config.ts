import { execFileSync } from 'child_process'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

let commitHash = '????'
try {
  commitHash = execFileSync('git', ['rev-parse', '--short=4', 'HEAD'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim()
} catch {
  // Not a git repo yet: keep the placeholder.
}

export default defineConfig({
  define: { __COMMIT_HASH__: JSON.stringify(commitHash) },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Game Cam',
        short_name: 'Game Cam',
        lang: 'es',
        description: 'Juegos de movimiento que se controlan con tu cuerpo frente a la cámara. Funciona sin conexión.',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        theme_color: '#0f1115',
        background_color: '#0f1115',
        start_url: './',
        scope: './',
        icons: [
          { src: 'android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,json,bin,webmanifest,mp3}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
