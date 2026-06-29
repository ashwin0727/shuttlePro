// ============================================================
//  ShuttlePro · Firebase Messaging Service Worker
//  File: public/firebase-messaging-sw.js
//
//  This MUST live at the root of /public (not in a subfolder)
//  so it can register with scope "/".
// ============================================================

importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

// ⚠️ Replace with your actual Firebase config.
// Service workers can't read process.env, so these values
// must be hardcoded here (they are public client keys, safe to expose).
firebase.initializeApp({
  apiKey: "YOUR_FIREBASE_API_KEY",
  projectId: "shuttlepro-xxxxx",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
});

const messaging = firebase.messaging();

// ── Handle messages received while the app is in the background ──
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const notificationOptions = {
    body: body || "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    data: payload.data || {},
    vibrate: [200, 100, 200],
    tag: "shuttlepro-notification", // groups repeated notifications
  };

  self.registration.showNotification(title || "ShuttlePro", notificationOptions);
});

// ── Handle notification click — open the relevant page ──
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // If a tab is already open, focus it and navigate
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open a new tab
      return self.clients.openWindow(url);
    })
  );
});
