import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

function pwaDevSafeRegisterPlugin(): Plugin {
  return {
    name: 'pwa-dev-safe-register',
    apply: 'serve',
    enforce: 'pre',
    load(id) {
      if (id.includes('@vite-plugin-pwa/pwa-entry-point-loaded')) {
        return `
function registerDevSW() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) {
      reg.unregister().catch(() => {});
    }
  }).catch(() => {});
}
export default registerDevSW;
`;
      }
      return undefined;
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      pwaDevSafeRegisterPlugin(),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: '/',
          name: 'Alpha Gram',
          short_name: 'Alpha Gram',
          description: 'Build your Alpha Gram poultry farm, collect eggs 24/7, invite friends for rewards, and manage GRAM deposits & withdrawals.',
          theme_color: '#F59E0B',
          background_color: '#F7F6F2',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallback: null,
          navigateFallbackDenylist: [/^\/api\//],
          globPatterns: ['**/*.{ico,png,svg,jpg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
            },
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'classic',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
