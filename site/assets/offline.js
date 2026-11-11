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
  U.appVersion = '14.8.0';

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

  /* ---------- record hashing (for deltas) ---------- */
  async function hashRow(row) {
    const buf = await crypto.subtle.digest('SHA-256', ENC.encode(JSON.stringify(row)));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }
  async function hashAll(data) {
    const out = { clinic: {}, cases: {} };
    for (const store of ['clinic', 'cases']) {
      for (const row of data.stores[store] || []) out[store][row.id] = await hashRow(row);
    }
    return out;
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
      H.St.s('backupHashes', await hashAll(data));
      syncBackupMeta();
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

  /* ---------- delta backup ---------- */
  U.canDelta = function () { return !!H.St.g('backupHashes', null); };

  U.backupDelta = async function () {
    const prev = H.St.g('backupHashes', null);
    if (!prev) return this.toast('Take a full backup first — a delta needs something to compare against');
    const pass = prompt('Passphrase for this backup (min 8 characters).\nSame passphrase as your full backup.');
    if (pass === null) return;
    if (!pass || pass.length < 8) return this.toast('Passphrase must be at least 8 characters');
    try {
      const data = await collect();
      const now = await hashAll(data);
      const changed = { clinic: [], cases: [] };
      const removed = [];
      for (const store of ['clinic', 'cases']) {
        for (const row of data.stores[store]) {
          if (prev[store][row.id] !== now[store][row.id]) changed[store].push(row);
        }
        for (const id of Object.keys(prev[store])) {
          if (!now[store][id]) removed.push({ store, id });
        }
      }
      const total = changed.clinic.length + changed.cases.length + removed.length;
      if (!total) return this.toast('Nothing has changed since the last backup');
      const payload = {
        schema: 2, kind: 'delta', appVersion: U.appVersion, dataVersion: U.dataVersion(),
        exportedAt: new Date().toISOString(),
        stores: changed, removed,
        settings: { boards: H.St.g('boards', null), lang: H.St.g('lang', 'en'), mode: H.St.g('mode', 'acute'), theme: H.St.g('theme', 'light'), casename: H.St.g('casename', '') }
      };
      const env = await encryptJSON(payload, pass);
      env.kind = 'backup-delta';
      const check = await decryptJSON(env, pass);
      if (!check || !check.stores) return this.toast('Backup verification failed — nothing was saved');
      const name = `remedy-finder-delta-${new Date().toISOString().slice(0, 10)}.rfb.json`;
      const text = JSON.stringify(env, null, 1);
      const saved = await writeBackup(name, text);
      if (/cancel/i.test(saved)) return this.toast('Backup cancelled — nothing was written');
      H.St.s('lastBackup', Date.now());
      H.St.s('backupHashes', now);
      const log = H.St.g('backupLog', []);
      log.unshift({ t: Date.now(), clinic: changed.clinic.length, cases: changed.cases.length, srs: 0, bytes: text.length, edition: data.dataVersion, where: saved + ' (delta)' });
      H.St.s('backupLog', log.slice(0, 10));
      this.toast(`Delta saved — ${changed.clinic.length} cases, ${changed.cases.length} repertorisations, ${removed.length} removed`);
      this.offlinePanel();
    } catch (e) {
      this.toast('Delta backup failed: ' + e.message);
    }
  };

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
      if (!env || (env.kind !== 'backup' && env.kind !== 'backup-delta')) return this.toast('Not a Remedy Finder backup');
      const pass = prompt(`Passphrase for this backup.\nExported ${env.exportedAt ? env.exportedAt.slice(0, 10) : '?'} · data ${env.dataVersion || '?'}`);
      if (!pass) return;
      let data;
      try { data = await decryptJSON(env, pass); }
      catch (e) { return this.toast('Wrong passphrase, or the file is damaged'); }
      if (!data || !data.stores) return this.toast('Backup is empty');
      const isDelta = env.kind === 'backup-delta' || data.kind === 'delta';
      const counts = {
        clinic: (data.stores.clinic || []).length,
        cases: (data.stores.cases || []).length,
        srs: ((data.settings || {}).srs || []).length,
        removed: (data.removed || []).length,
        delta: isDelta
      };
      const go = await this.restorePreview(env, data, counts);
      if (!go) return;
      try {
        for (const store of ['clinic', 'cases']) {
          const rows = data.stores[store] || [];
          for (const row of rows) if (row && row.id) await H.IDB.put(store, row);
        }
        if (data.removed && data.removed.length) {
          const go = confirm(`${data.removed.length} record(s) were deleted after this backup.\n\nOK = delete them here too\nCancel = keep them`);
          if (go) for (const r of data.removed) { try { await H.IDB.del(r.store, r.id); } catch (e) {} }
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
            ${counts.delta ? row('Kind', 'delta — changes only') : ''}
            ${counts.delta ? row('Deletions recorded', counts.removed) : ''}
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

  /* ---------- transfer codes (device to device, no network) ---------- */
  async function pinKey(pin, salt) {
    const base = await crypto.subtle.importKey('raw', ENC.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 60000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  U.makeCode = async function (obj, pin) {
    const salt = crypto.getRandomValues(new Uint8Array(12));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const k = await pinKey(pin, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, ENC.encode(JSON.stringify(obj)));
    return `RF1.${b64(salt)}.${b64(iv)}.${b64(ct)}`.replace(/=+$/g, '');
  };

  U.readCode = async function (str, pin) {
    const parts = String(str).trim().split('.');
    if (parts.length !== 4 || parts[0] !== 'RF1') throw new Error('Not a transfer code');
    const k = await pinKey(pin, unb64(parts[1]));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parts[2]) }, k, unb64(parts[3]));
    return JSON.parse(DEC.decode(pt));
  };

  U.transferMany = async function (ids) {
    const cases = [];
    for (const id of ids) { const c = await H.Clinic.get(id); if (c) cases.push(c); }
    if (!cases.length) return this.toast('No cases selected');
    const pin = prompt(`Choose a PIN for ${cases.length} case${cases.length > 1 ? 's' : ''} (4+ characters).`);
    if (!pin || pin.length < 4) return this.toast('PIN must be at least 4 characters');
    const code = await this.makeCode({ kind: 'cases', v: 1, dataVersion: this.dataVersion(), cases }, pin);
    $('tf-out').value = code;
    $('tf-out').select();
    this.paintQR(code);
    this.toast(`${cases.length} case${cases.length > 1 ? 's' : ''} in one code — ${code.length} characters`);
  };

  /* ---------- camera scan (BarcodeDetector) ---------- */
  U.scanSupported = function () {
    return !!(window.BarcodeDetector && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  };

  U.stopScan = function () {
    if (this._scanTimer) { clearInterval(this._scanTimer); this._scanTimer = null; }
    if (this._scanStream) { this._scanStream.getTracks().forEach(t => t.stop()); this._scanStream = null; }
    const v = document.getElementById('tf-video');
    if (v) v.remove();
  };

  U.startScan = async function () {
    const host = document.getElementById('tf-scan');
    if (!host) return;
    if (!this.scanSupported()) {
      host.innerHTML = '<p class="srcl">This browser cannot scan — paste the code instead.</p>';
      return;
    }
    host.innerHTML = '<p class="srcl">Starting camera…</p>';
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (e) {
      host.innerHTML = '<p class="srcl">Camera not available or permission refused — paste the code instead.</p>';
      return;
    }
    this._scanStream = stream;
    host.innerHTML = '<video id="tf-video" class="tf-video" autoplay playsinline muted></video><p class="srcl">Point at the QR code.</p>';
    const video = document.getElementById('tf-video');
    try { video.srcObject = stream; } catch (e) {}
    try { const p = video.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    const det = new window.BarcodeDetector({ formats: ['qr_code'] });
    this._scanTimer = setInterval(async () => {
      if (!document.getElementById('tf-video')) { this.stopScan(); return; }
      try {
        const found = await det.detect(video);
        if (found && found.length && found[0].rawValue) {
          const text = found[0].rawValue;
          this.stopScan();
          const input = document.getElementById('tf-in');
          if (input) { input.value = text; this.toast('Code scanned — enter the PIN'); }
          const read = document.getElementById('tf-read');
          if (read) read.click();
        }
      } catch (e) { /* keep polling */ }
    }, 350);
  };

  U.transferPanel = async function () {
    const cases = await H.Clinic.all();
    const m = $('md');
    m.innerHTML = `<div class="mh"><div><div class="mt">Transfer a case</div>
      <div class="msu">Device to device · no network, no account</div></div><button class="ib" id="mc">✕</button></div>
      <div class="mbd">
        <p class="srcl">Pick a case, choose a PIN, and copy the code to the other device — or type it in there. Nothing is uploaded; the code is the only thing that moves.</p>
        ${cases.length ? `<div class="offgrid" style="margin-top:10px">${cases.slice(0, 20).map(c =>
          `<div class="offrow"><span><label style="display:flex;gap:8px;align-items:center;cursor:pointer">
             <input type="checkbox" class="tf-pick" value="${esc(c.id)}" style="width:16px;height:16px;accent-color:var(--accent)"/>
             ${esc(c.name || 'Untitled')} · ${esc((c.complaint || '').slice(0, 26))}</label></span>
           <b><button class="btn bg btn-sm" data-mk="${esc(c.id)}">One</button></b></div>`).join('')}</div>
           <div class="xm" style="margin-top:8px"><button class="btn bp btn-sm" id="tf-many">Make code for selected</button></div>`
          : '<p class="srcl">No cases on this device yet.</p>'}
        <div class="msec" style="margin-top:16px"><h4>Code to show</h4>
          <textarea id="tf-out" rows="3" readonly placeholder="A code appears here after you tap “Make code”."></textarea>
          <div class="xm" style="margin-top:8px"><button class="btn bg btn-sm" id="tf-copy">Copy</button>
            <button class="btn bg btn-sm" id="tf-save">Save as file</button></div>
          <div class="qrbox" id="tf-qr"></div>
        </div>
        <div class="msec" style="margin-top:14px"><h4>Receive a code</h4>
          <div class="xm" style="margin-bottom:8px">
            <button class="btn bg btn-sm" id="tf-scan-btn" ${this.scanSupported() ? '' : 'disabled title="This browser cannot scan"'}>Scan with camera</button>
          </div>
          <div id="tf-scan"></div>
          <textarea id="tf-in" rows="3" placeholder="Paste a transfer code"></textarea>
          <div class="xm" style="margin-top:8px"><button class="btn bp btn-sm" id="tf-read">Read code</button></div>
          <p class="srcl" style="margin-top:6px">You will be asked for the PIN the sender chose.</p>
        </div>
      </div>`;
    this.om();
    $('mc').onclick = () => { this.stopScan(); this.cm(); };
    document.querySelectorAll('[data-mk]').forEach(b => b.addEventListener('click', async () => {
      const c = await H.Clinic.get(b.dataset.mk);
      if (!c) return this.toast('Case not found');
      const pin = prompt('Choose a PIN for this code (4+ characters).\nTell the person receiving it — never send it with the code.');
      if (!pin || pin.length < 4) return this.toast('PIN must be at least 4 characters');
      const code = await this.makeCode({ kind: 'case', v: 1, dataVersion: this.dataVersion(), case: c }, pin);
      $('tf-out').value = code;
      $('tf-out').select();
      this.paintQR(code);
      this.toast(`Code ready — ${code.length} characters, PIN ${pin.length} characters`);
    }));
    const many = $('tf-many');
    if (many) many.onclick = () => this.transferMany([...document.querySelectorAll('.tf-pick:checked')].map(i => i.value));
    $('tf-copy').onclick = () => {
      const t = $('tf-out'); if (!t.value) return this.toast('Nothing to copy yet');
      t.select(); navigator.clipboard && navigator.clipboard.writeText(t.value); this.toast('Code copied');
    };
    this.paintQR = function (code) {
      const box = $('tf-qr');
      if (!box) return;
      box.innerHTML = '';
      if (!window.HRF_QR) return;
      const qr = window.HRF_QR.encode(code);
      if (!qr) { box.innerHTML = '<p class="srcl">Too long for a QR — use Copy or Save as file.</p>'; return; }
      const cv = document.createElement('canvas');
      cv.className = 'qrcanvas';
      window.HRF_QR.draw(cv, code, Math.max(4, Math.floor(420 / (qr.size + 8))));
      box.appendChild(cv);
      const cap = document.createElement('p');
      cap.className = 'srcl';
      cap.textContent = `Scan with a phone camera · version ${qr.version} · ${code.length} characters`;
      box.appendChild(cap);
    };
    const save = $('tf-save');
    if (save) save.onclick = () => {
      const t = $('tf-out'); if (!t.value) return this.toast('Nothing to save yet');
      H.Ex.dl(`remedy-finder-transfer-${new Date().toISOString().slice(0, 10)}.rfc.txt`, t.value, 'text/plain');
    };
    const scanBtn = $('tf-scan-btn');
    if (scanBtn) scanBtn.onclick = () => this.startScan();
    $('tf-read').onclick = async () => {
      const raw = $('tf-in').value.trim();
      if (!raw) return this.toast('Paste a code first');
      const pin = prompt('PIN from the sender');
      if (!pin) return;
      let obj;
      try { obj = await this.readCode(raw, pin); }
      catch (e) { return this.toast('Could not read the code — wrong PIN or damaged text'); }
      const list = obj.kind === 'cases' ? (obj.cases || []) : (obj.kind === 'case' && obj.case ? [obj.case] : null);
      if (!list) return this.toast('That is not a case code');
      if (!confirm(`Add ${list.length} case${list.length > 1 ? 's' : ''} to this device?\n\nScored with data ${obj.dataVersion || 'unknown'}.`)) return;
      for (const c of list) { c.id = undefined; await H.Clinic.save(c); }
      this.toast(`${list.length} case${list.length > 1 ? 's' : ''} received`);
      this.cm();
    };
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
      ${days !== null && days > this.remindDays() ? `<div class="backup-note">Last backup was ${days} days ago. A backup is the only copy that survives clearing site data.</div>` : ''}
      <div class="xm" style="margin-top:14px">
        <button class="btn bp" id="off-backup">Backup now (encrypted)</button>
        <button class="btn bg" id="off-delta" ${this.canDelta() ? '' : 'disabled title="Take a full backup first"'}>Backup changes only</button>
        <button class="btn bg" id="off-restore">Restore from file</button>
        <button class="btn bg" id="off-transfer">Transfer a case…</button>
        ${('serviceWorker' in navigator && 'Notification' in window) ? `
        <div class="offgrid" style="margin-top:12px">
          <div class="offrow"><span>Background reminder (service worker)</span>
            <b><button class="btn ${this.bgReminderOn() ? 'bp' : 'bg'} btn-sm" id="bg-toggle">${this.bgReminderOn() ? 'On' : 'Off'}</button></b></div>
          ${this.bgReminderOn() ? '<div class="offrow"><span>Check now</span><b><button class="btn bg btn-sm" id="bg-test">Run</button></b></div>' : ''}
        </div>` : ''}
        <div class="langrow" style="margin-top:10px"><span>Remind me every</span>
          ${[3, 7, 30, 0].map(d => `<button class="btn bg btn-sm ${this.remindDays() === d ? 'on' : ''}" data-remind="${d}">${d ? d + ' days' : 'off'}</button>`).join('')}
        </div>
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
    const dl = $('off-delta'); if (dl) dl.onclick = () => this.backupDelta();
    $('off-restore').onclick = () => this.restore();
    const bgt = $('bg-toggle'); if (bgt) bgt.onclick = () => this.setBgReminder(!this.bgReminderOn());
    const bgr = $('bg-test'); if (bgr) bgr.onclick = () => this.testBgReminder();
    document.querySelectorAll('[data-remind]').forEach(b => b.addEventListener('click', () => this.setRemindDays(parseInt(b.dataset.remind, 10))));
    const tr = $('off-transfer'); if (tr) tr.onclick = () => { this.cm(); setTimeout(() => this.transferPanel(), 60); };
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
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', e => {
          if (e.data && e.data.type === 'backup-reminder') {
            try { this.backupReminder(); } catch (err) {}
          }
        });
      }
    } catch (e) {}
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { try { this.backupReminder(); } catch (e) {} }
    });
  };

  const baseSave = H.C.save;
  H.C.save = async function (n, m, s, nt) {
    const c = await baseSave.call(this, n, m, s, nt);
    if (c) { c.dv = U.dataVersion(); c.av = U.appVersion; await H.IDB.put('cases', c); }
    return c;
  };

  /* ---------- reminder ---------- */
  U.remindDays = function () { const d = H.St.g('remindDays', 7); return d; };
  U.setRemindDays = function (d) { H.St.s('remindDays', d); syncBackupMeta(); this.toast(d ? `Reminder every ${d} days` : 'Reminder off'); this.offlinePanel(); };

  /* the service worker cannot read localStorage — mirror what it needs into IndexedDB */
  async function syncBackupMeta() {
    try {
      await H.IDB.put('settings', {
        id: 'backupMeta',
        value: { lastBackup: H.St.g('lastBackup', null), remindDays: H.St.g('remindDays', 7) }
      });
    } catch (e) {}
  }
  U.syncBackupMeta = syncBackupMeta;

  /* ---------- background reminder ---------- */
  U.bgSupported = function () {
    return 'serviceWorker' in navigator && 'periodicSync' in (window.ServiceWorkerRegistration || {}) === false
      ? 'serviceWorker' in navigator && 'Notification' in window
      : 'serviceWorker' in navigator && 'Notification' in window;
  };

  U.bgReminderOn = function () { return !!H.St.g('bgReminder', false); };

  U.setBgReminder = async function (on) {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
      return this.toast('Background reminders need a service worker and notifications');
    }
    if (!on) {
      H.St.s('bgReminder', false);
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg.periodicSync) await reg.periodicSync.unregister('backup-reminder');
      } catch (e) {}
      this.toast('Background reminder off');
      return this.offlinePanel();
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return this.toast('Notification permission refused');
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg.periodicSync) return this.toast('This browser has no periodic background sync');
      await reg.periodicSync.register('backup-reminder', { minInterval: 12 * 3600 * 1000 });
      H.St.s('bgReminder', true);
      await syncBackupMeta();
      this.toast('Background reminder on — checked about twice a day');
    } catch (e) {
      this.toast('Could not register: ' + e.message);
    }
    this.offlinePanel();
  };

  U.testBgReminder = async function () {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.sync) { await reg.sync.register('backup-reminder'); return this.toast('Reminder check queued'); }
      this.toast('One-off sync is not available here');
    } catch (e) { this.toast('Could not queue: ' + e.message); }
  };

  U.backupReminder = async function () {
    const host = $('rv');
    if (!host || host.querySelector('.reminder')) return;
    const last = H.St.g('lastBackup', null);
    const snooze = H.St.g('backupSnooze', 0);
    if (snooze && Date.now() - snooze < 3 * 864e5) return;
    const sc = await storeCounts();
    const total = sc.clinic + sc.cases + sc.srs;
    if (!total) return;
    const limit = this.remindDays();
    if (!limit) return;
    const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
    if (days !== null && days <= limit) return;
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
