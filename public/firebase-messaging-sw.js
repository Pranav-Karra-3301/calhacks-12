// Stub service worker to satisfy legacy requests and avoid 500s in dev.
// Your project no longer uses Firebase messaging; this file prevents errors
// from old clients still trying to load /firebase-messaging-sw.js.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
