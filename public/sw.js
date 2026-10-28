// Sempere Choir service worker.
// Responsibilities:
//   - receive Web Push payloads and surface OS-level lock-screen notifications
//   - focus / open the app to the Scripture reading view on notification tap
// It deliberately does NOT intercept fetch, so normal navigation and the
// build-update detection in pwa.js keep working unchanged.

const APP_ORIGIN = self.location.origin;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "የዕለቱ የቃል ማዕድ 📖";
  const options = {
    body: data.body || "",
    data: { url: data.url || "/" },
    requireInteraction: false,
    vibrate: [80, 40, 80],
    tag: "daily-scripture",
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  const fullUrl = targetUrl.startsWith("http") ? targetUrl : APP_ORIGIN + targetUrl;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if (client.url.startsWith(APP_ORIGIN)) {
          client.focus();
          if ("postMessage" in client) {
            client.postMessage({ type: "navigate", url: targetUrl });
          }
          return;
        }
      }
      try {
        await self.clients.openWindow(fullUrl);
      } catch {
        /* ignore */
      }
    })()
  );
});
