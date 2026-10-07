// PilaPH service worker. Shows the owner's push alerts and opens the
// dashboard when one is tapped. Registered on owner pages only
// (resources/js/lib/push.ts); there is no offline cache, since running a
// queue needs the network anyway.
//
// Payloads come from Laravel's WebPushMessage (app/Notifications/OwnerAlerts):
// { title, body, icon, badge, tag, renotify, data: { url } }.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    let alert = {};
    try {
        alert = event.data ? event.data.json() : {};
    } catch {
        alert = { body: event.data ? event.data.text() : '' };
    }

    // Browsers (Safari especially) require every push to show a notification.
    event.waitUntil(
        self.registration.showNotification(alert.title || 'PilaPH', {
            body: alert.body || '',
            icon: alert.icon || '/pwa-192x192.png',
            // White on transparent; Android shows it in the status bar.
            badge: alert.badge || '/badge-96x96.png',
            tag: alert.tag,
            renotify: Boolean(alert.tag && alert.renotify),
            data: { url: (alert.data && alert.data.url) || '/dashboard' },
        }),
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL(
        (event.notification.data && event.notification.data.url) ||
            '/dashboard',
        self.location.origin,
    ).href;

    event.waitUntil(
        (async () => {
            // Reuse an open PilaPH window if there is one.
            const windows = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true,
            });
            for (const client of windows) {
                if (client.url.startsWith(self.location.origin)) {
                    await client.focus();
                    if ('navigate' in client) {
                        await client.navigate(target);
                    }
                    return;
                }
            }
            await self.clients.openWindow(target);
        })(),
    );
});
