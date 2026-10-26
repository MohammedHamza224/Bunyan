// Bunyan PWA Service Worker - Static Asset Shell Only
// IMPORTANT SECURITY & DATA INTEGRITY RULE:
// Authenticated API requests (/api/*) and financial transaction data MUST NEVER be cached.
// Only immutable static shell assets (CSS, JS, fonts, static branding) are cached.

const CACHE_NAME = 'bunyan-shell-v1'
const STATIC_ASSETS = [
  '/',
  '/favicon.svg',
  '/manifest.webmanifest'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Continue even if some static files fail to prefetch
      })
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key)
          }
        })
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // 1. NEVER intercept or cache non-GET requests
  if (event.request.method !== 'GET') {
    return
  }

  // 2. CRITICAL: Never cache API endpoints or financial data
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) {
    return
  }

  // 3. For navigation requests, use network-first strategy
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/') || caches.match(event.request)
      })
    )
    return
  }

  // 4. For static shell assets (js, css, fonts, images), cache-first with network fallback
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|otf|svg|png|jpg|jpeg|webp|ico)$/)
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone)
            })
          }
          return networkResponse
        })
      })
    )
  }
})
