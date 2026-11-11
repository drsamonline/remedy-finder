/* Remedy Finder — offline cache + background backup reminder.
   Bump CACHE whenever an asset changes. */
const CACHE = 'rf-14.8.0';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './assets/app.css', './assets/app.js', './assets/data.js', './assets/ui.js',
  './assets/offline.js', './assets/packs.js', './assets/vault.js', './assets/qr.js',
  './assets/i18n.js', './assets/icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  // Documents: network first, so a new deploy is seen immediately; cache is the fallback.
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html').then(hit => hit || caches.match('./')))
    );
    return;
  }

  // Everything else: cache first, refresh in the background (stale-while-revalidate).
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => null);
      return hit || net.then(r => r || caches.match('./index.html'));
    })
  );
});

/* ---------- background backup reminder ----------
   Reads the same IndexedDB the app writes (settings store) so it can tell how
   long it has been since the last backup without a server. */
function idbGet(store, key) {
  return new Promise(resolve => {
    const open = indexedDB.open('hrp-v9');   // keep in sync with H.IDB.n
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(store)) return resolve(null);
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    };
  });
}

async function checkBackupAge() {
  const row = await idbGet('settings', 'backupMeta');
  const meta = row && row.value ? row.value : null;
  const last = meta && meta.lastBackup ? meta.lastBackup : null;
  const limit = meta && meta.remindDays !== undefined ? meta.remindDays : 7;
  if (!limit) return null;
  const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
  if (days !== null && days <= limit) return null;
  return days;
}

async function remind(where) {
  const days = await checkBackupAge();
  if (days === null) return;
  const body = days === null
    ? 'No backup of your cases has been taken yet.'
    : `Last backup was ${days} day${days === 1 ? '' : 's'} ago.`;
  await self.registration.showNotification('Back up your Remedy Finder cases', {
    body,
    tag: 'rf-backup-reminder',
    icon: './assets/icon.svg',
    badge: './assets/icon.svg',
    data: { url: './' }
  });
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.postMessage({ type: 'backup-reminder', days, where }));
}

self.addEventListener('periodicsync', e => {
  if (e.tag === 'backup-reminder') e.waitUntil(remind('periodicsync'));
});

self.addEventListener('sync', e => {
  if (e.tag === 'backup-reminder') e.waitUntil(remind('sync'));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  }));
});
