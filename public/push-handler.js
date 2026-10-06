// Owner push alerts. Loaded into the Workbox service worker via
// `workbox.importScripts` in vite.config.ts.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  // Browsers (Safari especially) require every push to show a notification.
  event.waitUntil(
    self.registration.showNotification(data.title || 'PilaPH', {
      body: data.body || '',
      icon: '/pwa-192x192.png',
      // White-on-transparent; Android shows it in the status bar.
      badge: '/badge-96x96.png',
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || '/dashboard' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || '/dashboard',
    self.location.origin
  ).href;

  event.waitUntil(
    (async () => {
      // Reuse an open PilaPH tab if there is one.
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
