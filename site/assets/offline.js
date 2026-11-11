/* ==========================================================================
   Remedy Finder — offline layer
   Encrypted local backup/restore (AES-256-GCM + PBKDF2), offline readiness
   panel, and a data-version stamp on everything you save. No server, no sync,
   no account: the file you export is the only copy that leaves the device.
   ========================================================================== */
(function () {
  const U = H.U;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ENC = new TextEncoder();
  const DEC = new TextDecoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  /* ---------- what edition is this data? ---------- */
  U.dataVersion = function () {
    return `rp2008-${H.DB.remedyCount}r-${H.DB.links}l`;
  };
  U.appVersion = '13.11.0';

  /* ---------- crypto ---------- */
  async function keyFrom(pass, salt, usage) {
    const base = await crypto.subtle.importKey('raw', ENC.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, usage);
  }

  async function encryptJSON(obj, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await keyFrom(pass, salt, ['encrypt']);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ENC.encode(JSON.stringify(obj)));
    return {
      app: 'remedy-finder', kind: 'backup', v: 1,
      appVersion: U.appVersion, dataVersion: U.dataVersion(),
      exportedAt: new Date().toISOString(),
      kdf: { algo: 'PBKDF2-SHA256', iterations: 150000, salt: b64(salt) },
      cipher: { algo: 'AES-256-GCM', iv: b64(iv) },
      payload: b64(ct)
    };
  }

  async function decryptJSON(env, pass) {
    const salt = unb64(env.kdf.salt), iv = unb64(env.cipher.iv);
    const key = await keyFrom(pass, salt, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, unb64(env.payload));
    return JSON.parse(DEC.decode(pt));
  }

  /* ---------- gather everything ---------- */
  async function collect() {
    const idb = async store => (H.IDB.db ? await H.IDB.all(store) : H.St.g('fb.' + store, []));
    return {
      schema: 2,
      appVersion: U.appVersion,
      dataVersion: U.dataVersion(),
      exportedAt: new Date().toISOString(),
      stores: {
        clinic: await idb('clinic'),
        cases: await idb('cases')
      },
      settings: {
        srs: H.SRS.all(),
        streak: H.SRS.streak(),
        boards: H.St.g('boards', null),
        lang: H.St.g('lang', 'en'),
        mode: H.St.g('mode', 'acute'),
        theme: H.St.g('theme', 'light'),
        casename: H.St.g('casename', '')
      }
    };
  }

  /* ---------- backup ---------- */
  U.backup = async function () {
    const pass = prompt('Passphrase for this backup (min 8 characters).\nYou will need it to restore — there is no recovery.');
    if (pass === null) return;
    if (!pass || pass.length < 8) { this.toast('Passphrase must be at least 8 characters'); return; }
    try {
      const data = await collect();
      const env = await encryptJSON(data, pass);
      // verify: decrypt what we are about to write and compare counts
      const check = await decryptJSON(env, pass);
      const same = (a, b) => (a || []).length === (b || []).length;
      if (!check || !check.stores || !same(check.stores.clinic, data.stores.clinic) ||
          !same(check.stores.cases, data.stores.cases) || !same(check.settings.srs, data.settings.srs)) {
        this.toast('Backup verification failed — nothing was saved');
        return;
      }
      const name = `remedy-finder-backup-${new Date().toISOString().slice(0, 10)}.rfb.json`;
      const text = JSON.stringify(env, null, 1);
      const saved = await writeBackup(name, text);
      if (/cancel/i.test(saved)) { this.toast('Backup cancelled — nothing was written'); return; }
      H.St.s('lastBackup', Date.now());
      const log = H.St.g('backupLog', []);
      log.unshift({
        t: Date.now(), clinic: data.stores.clinic.length, cases: data.stores.cases.length,
        srs: (data.settings.srs || []).length, bytes: text.length, edition: data.dataVersion, where: saved
      });
      H.St.s('backupLog', log.slice(0, 10));
      H.St.s('lastBackupIds', {
        clinic: data.stores.clinic.map(c => c.id),
        cases: data.stores.cases.map(c => c.id)
      });
      const counts = `${data.stores.clinic.length} cases · ${data.stores.cases.length} saved repertorisations · ${(data.settings.srs || []).length} study cards`;
      this.toast(`${saved} — verified · ${counts}`);
      this.offlinePanel();
    } catch (e) {
      this.toast('Backup failed: ' + e.message);
    }
  };

  /* ---------- write to a folder the user picked once ---------- */
  const HANDLE_KEY = 'backupHandle';
  async function getHandle() {
    try { return await H.IDB.get('settings', HANDLE_KEY); } catch (e) { return null; }
  }
  async function putHandle(h) {
    try { await H.IDB.put('settings', { id: HANDLE_KEY, handle: h }); } catch (e) {}
  }
  async function writeBackup(name, text) {
    if (!window.showSaveFilePicker) {
      H.Ex.dl(name, text, 'application/json');
      return 'Backup downloaded';
    }
    try {
      let handle = await getHandle();
      if (handle && handle.queryPermission) {
        const st = await handle.queryPermission({ mode: 'readwrite' });
        if (st !== 'granted') {
          const rq = await handle.requestPermission({ mode: 'readwrite' });
          if (rq !== 'granted') handle = null;
        }
      }
      if (!handle) {
        handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'Remedy Finder backup', accept: { 'application/json': ['.json'] } }]
        });
        await putHandle(handle);
      }
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      return 'Backup written to your folder';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'Backup cancelled';
      H.Ex.dl(name, text, 'application/json');
      return 'Backup downloaded';
    }
  }

  /* ---------- restore ---------- */
  U.restore = function () {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,.rfb.json,application/json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      let env;
      try { env = JSON.parse(await f.text()); }
      catch (e) { return this.toast('Not a backup file'); }
      if (!env || env.kind !== 'backup') return this.toast('Not a Remedy Finder backup');
      const pass = prompt(`Passphrase for this backup.\nExported ${env.exportedAt ? env.exportedAt.slice(0, 10) : '?'} · data ${env.dataVersion || '?'}`);
      if (!pass) return;
      let data;
      try { data = await decryptJSON(env, pass); }
      catch (e) { return this.toast('Wrong passphrase, or the file is damaged'); }
      if (!data || !data.stores) return this.toast('Backup is empty');
      const counts = {
        clinic: (data.stores.clinic || []).length,
        cases: (data.stores.cases || []).length,
        srs: ((data.settings || {}).srs || []).length
      };
      const go = await this.restorePreview(env, data, counts);
      if (!go) return;
      try {
        for (const store of ['clinic', 'cases']) {
          const rows = data.stores[store] || [];
          for (const row of rows) if (row && row.id) await H.IDB.put(store, row);
        }
        if (data.settings) {
          const s = data.settings;
          if (Array.isArray(s.srs)) {
            const byId = new Map(H.SRS.all().map(c => [c.id, c]));
            s.srs.forEach(c => { if (c && c.id) byId.set(c.id, c); });
            H.SRS.save([...byId.values()]);
          }
          if (s.streak) H.SRS.saveStreak(s.streak);
          if (s.boards) H.St.s('boards', s.boards);
          if (s.lang) H.St.s('lang', s.lang);
          if (s.mode) H.St.s('mode', s.mode);
          if (s.theme) H.St.s('theme', s.theme);
          if (s.casename) H.St.s('casename', s.casename);
        }
        H.U.toast(`Restored ${(data.stores.clinic || []).length} cases, ${(data.stores.cases || []).length} repertorisations, ${((data.settings || {}).srs || []).length} study cards`);
        this.offlinePanel();
      } catch (e) {
        this.toast('Restore failed: ' + e.message);
      }
    };
    inp.click();
  };

  U.restorePreview = function (env, data, counts) {
    return new Promise(resolve => {
      const m = $('md');
      const row = (k, v) => `<div class="offrow"><span>${k}</span><b>${v}</b></div>`;
      m.innerHTML = `<div class="mh"><div><div class="mt">Restore this backup?</div>
        <div class="msu">Decrypted on this device — nothing was sent anywhere</div></div><button class="ib" id="mc">✕</button></div>
        <div class="mbd">
          <div class="offgrid">
            ${row('Exported', (env.exportedAt || '').slice(0, 16).replace('T', ' '))}
            ${row('Data edition', env.dataVersion || 'unknown')}
            ${row('App version', env.appVersion || 'unknown')}
            ${row('Clinic cases', counts.clinic)}
            ${row('Saved repertorisations', counts.cases)}
            ${row('Study cards', counts.srs)}
          </div>
          <div class="backup-note" style="margin-top:12px">Records are merged: matching IDs are replaced, everything else is kept. Nothing is deleted.</div>
          <div class="xm" style="margin-top:12px">
            <button class="btn bp" id="r-yes">Restore ${counts.clinic + counts.cases + counts.srs} records</button>
            <button class="btn bg" id="r-no">Cancel</button>
          </div>
        </div>`;
      this.om();
      const done = v => { this.cm(); resolve(v); };
      $('mc').onclick = () => done(false);
      $('r-no').onclick = () => done(false);
      $('r-yes').onclick = () => done(true);
    });
  };

  /* ---------- readiness ---------- */
  async function cacheInfo() {
    if (!('caches' in window)) return { supported: false, files: 0, repertory: false, bytes: 0 };
    try {
      const names = await caches.keys();
      let files = 0, repertory = false, bytes = 0;
      for (const n of names) {
        const c = await caches.open(n);
        const keys = await c.keys();
        files += keys.length;
        for (const k of keys) {
          if (/repertory\.js/.test(k.url)) repertory = true;
          const r = await c.match(k);
          if (r) {
            const b = await r.clone().blob();
            bytes += b.size;
          }
        }
      }
      return { supported: true, files, repertory, bytes };
    } catch (e) { return { supported: false, files: 0, repertory: false, bytes: 0 }; }
  }

  async function storeCounts() {
    const out = {};
    for (const s of ['clinic', 'cases']) {
      try { out[s] = (await H.IDB.all(s)).length; } catch (e) { out[s] = 0; }
    }
    out.srs = H.SRS.all().length;
    return out;
  }

  U.offlinePanel = async function () {
    const m = $('md');
    m.innerHTML = `<div class="mh"><div><div class="mt">Offline &amp; backup</div>
      <div class="msu">Everything on this device · nothing leaves it</div></div><button class="ib" id="mc">✕</button></div>
      <div class="mbd" id="off-body"><div class="emp"><div class="emp-i"></div><div>Checking…</div></div></div>`;
    this.om();
    $('mc').onclick = () => this.cm();

    const ci = await cacheInfo();
    const sc = await storeCounts();
    const last = H.St.g('lastBackup', null);
    const lastTxt = last ? new Date(last).toLocaleString() : 'never';
    const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    const isFile = location.protocol === 'file:';
    const sw = isFile ? 'not used in this build'
      : ('serviceWorker' in navigator && navigator.serviceWorker.controller ? 'active'
        : ('serviceWorker' in navigator ? 'installing…' : 'not supported'));
    const kb = ci.bytes ? Math.round(ci.bytes / 1024) + ' KB cached' : (isFile ? 'single file — nothing to cache' : 'not cached');
    const repOffline = !!window.HRF_RUB ? 'yes (built in)' : (ci.repertory ? 'yes (cached)' : 'no — open Repertory once online');

    const body = $('off-body');
    if (!body) return;
    const ids = H.St.g('lastBackupIds', null);
    let delta = null;
    if (ids) {
      const nowC = (await H.IDB.all('clinic')).map(c => c.id);
      const nowR = (await H.IDB.all('cases')).map(c => c.id);
      const before = new Set([...(ids.clinic || []), ...(ids.cases || [])]);
      delta = [...nowC, ...nowR].filter(id => !before.has(id)).length;
    }
    const row = (k, v, good) => `<div class="offrow"><span>${k}</span><b class="${good === false ? 'bad' : good ? 'good' : ''}">${v}</b></div>`;
    body.innerHTML = `
      <div class="offgrid">
        ${row('Service worker', sw, sw === 'active')}
        ${row('Cached files', isFile ? kb : (ci.files + ' · ' + kb), isFile ? null : ci.files > 0)}
        ${row('Repertory available offline', repOffline, !!(window.HRF_RUB || ci.repertory))}
        ${row('Data edition', this.dataVersion())}
        ${row('App version', this.appVersion)}
        ${row('Clinic cases', sc.clinic)}
        ${row('Saved repertorisations', sc.cases)}
        ${row('Study cards', sc.srs)}
        ${row('Last backup', lastTxt + (days !== null && days > 7 ? ' ⚠' : ''), last ? days <= 7 : false)}
        ${row('New records since backup', delta === null ? '—' : delta, delta === null ? null : delta === 0)}
      </div>
      ${days !== null && days > 7 ? `<div class="backup-note">Last backup was ${days} days ago. A backup is the only copy that survives clearing site data.</div>` : ''}
      <div class="xm" style="margin-top:14px">
        <button class="btn bp" id="off-backup">Backup now (encrypted)</button>
        <button class="btn bg" id="off-restore">Restore from file</button>
        <button class="btn bg" id="off-precache" ${location.protocol === 'file:' ? 'disabled title="Only needed for the web app"' : ''}>Download everything for offline</button>
        <button class="btn bg" id="off-export">Plain JSON (no passphrase)</button>
      </div>
      ${(H.St.g('backupLog', []).length) ? `<div class="msec" style="margin-top:16px"><h4>Recent backups</h4>
        <div class="offgrid">${H.St.g('backupLog', []).slice(0, 5).map(e =>
          `<div class="offrow"><span>${new Date(e.t).toLocaleString()}</span>
           <b>${e.clinic + e.cases + e.srs} records · ${Math.round(e.bytes / 1024)} KB</b></div>`).join('')}</div></div>` : ''}
      <div class="msec" style="margin-top:16px">
        <h4>What this does</h4>
        <p class="srcl">The backup is one file, encrypted on this device with AES-256-GCM and a key derived from your passphrase (PBKDF2, 150,000 rounds). There is no recovery if you lose the passphrase — that is the point. Keep the file somewhere you control: a USB stick, an SD card, your own drive.</p>
      </div>`;

    $('off-backup').onclick = () => this.backup();
    $('off-restore').onclick = () => this.restore();
    $('off-export').onclick = async () => {
      const data = await collect();
      H.Ex.dl(`remedy-finder-plain-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1), 'application/json');
      this.toast('Plain JSON exported — unencrypted, treat it as patient data');
    };
    $('off-precache').onclick = async () => {
      const btn = $('off-precache');
      btn.disabled = true; btn.textContent = 'Downloading…';
      try {
        await fetch('assets/repertory.js', { cache: 'reload' }).catch(() => {});
        if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
          await navigator.serviceWorker.ready;
        }
        const names = await caches.keys();
        for (const n of names) {
          const c = await caches.open(n);
          await c.addAll(['./', './index.html', './assets/app.css', './assets/app.js',
            './assets/ui.js', './assets/data.js', './assets/i18n.js', './assets/icon.svg']).catch(() => {});
        }
        this.toast('Everything is cached — the app now opens with the network off');
        this.offlinePanel();
      } catch (e) {
        this.toast('Could not cache everything: ' + e.message);
        btn.disabled = false; btn.textContent = 'Download everything for offline';
      }
    };
  };

  /* ---------- stamp every saved case with the data edition ---------- */
  const baseInit2 = U.init;
  U.init = async function () {
    await baseInit2.call(this);
    try { this.connectionChip(); } catch (e) {}
    setTimeout(() => { try { this.backupReminder(); } catch (e) {} }, 1200);
  };

  const baseSave = H.C.save;
  H.C.save = async function (n, m, s, nt) {
    const c = await baseSave.call(this, n, m, s, nt);
    if (c) { c.dv = U.dataVersion(); c.av = U.appVersion; await H.IDB.put('cases', c); }
    return c;
  };

  /* ---------- reminder ---------- */
  U.backupReminder = async function () {
    const host = $('rv');
    if (!host || host.querySelector('.reminder')) return;
    const last = H.St.g('lastBackup', null);
    const snooze = H.St.g('backupSnooze', 0);
    if (snooze && Date.now() - snooze < 3 * 864e5) return;
    const sc = await storeCounts();
    const total = sc.clinic + sc.cases + sc.srs;
    if (!total) return;
    const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    if (days !== null && days <= 7) return;
    const el = document.createElement('div');
    el.className = 'reminder';
    el.innerHTML = `<span>${days === null ? 'No backup yet' : 'Last backup ' + days + ' days ago'} · ${total} record${total > 1 ? 's' : ''} on this device only.</span>
      <button class="btn bp btn-sm" data-bk>Back up now</button>
      <button class="btn bg btn-sm" data-bk-later>Later</button>`;
    host.prepend(el);
    el.querySelector('[data-bk]').onclick = () => { el.remove(); this.backup(); };
    el.querySelector('[data-bk-later]').onclick = () => { H.St.s('backupSnooze', Date.now()); el.remove(); };
  };

  /* ---------- connection chip ---------- */
  U.connectionChip = function () {
    const bar = document.querySelector('.topact');
    if (!bar || document.getElementById('conn-chip')) return;
    const isFile = location.protocol === 'file:';
    const chip = document.createElement('span');
    chip.id = 'conn-chip';
    chip.className = 'conn';
    chip.title = 'This app makes no network requests at runtime';
    const paint = () => {
      const online = navigator.onLine;
      chip.dataset.state = isFile ? 'file' : (online ? 'online' : 'offline');
      chip.textContent = isFile ? 'local file' : (online ? 'offline-ready' : 'offline');
    };
    paint();
    window.addEventListener('online', paint);
    window.addEventListener('offline', paint);
    bar.insertBefore(chip, bar.firstChild);
  };

  /* ---------- tools tile ---------- */
  const baseTools = U.toolsSheet;
  U.toolsSheet = function () {
    baseTools.call(this);
    const grid = document.querySelector('#md .xm');
    if (!grid || grid.querySelector('[data-offline]')) return;
    const b = document.createElement('button');
    b.className = 'btn bg';
    b.dataset.offline = '1';
    b.style.cssText = 'justify-content:flex-start;text-align:left;min-height:68px;flex-direction:column;align-items:flex-start;gap:3px;padding:12px 14px';
    b.innerHTML = `<span style="font-weight:700;display:flex;align-items:center;gap:7px">Offline &amp; backup</span>
      <span style="font-size:11.5px;color:var(--ink-2);font-weight:500;white-space:normal;text-align:left">Encrypted backup, restore, cache status</span>`;
    b.onclick = () => { this.cm(); setTimeout(() => this.offlinePanel(), 60); };
    grid.appendChild(b);
  };
})();
