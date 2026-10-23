/* sw.js — a deliberately EMPTY service worker. It caches nothing and answers nothing: every request goes straight
   to the network, so a new upload on Netlify is always what people get. It only exists so phones treat the website
   as an installable app. */
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(){ /* network only */ });
