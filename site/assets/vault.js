/* ==========================================================================
   Remedy Finder — vault (encryption at rest)
   Optional passphrase that encrypts clinic cases, saved repertorisations and
   packs in IndexedDB with AES-256-GCM. The key lives in memory only; the
   vault file on disk is a salt plus a canary. Nothing leaves the device.
   A recovery key (the raw 32-byte key, base32) is issued once at setup.
   ========================================================================== */
(function () {
  const U = H.U;
  const $ = id => document.getElementById(id);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const STORES = ['clinic', 'cases', 'packs'];
  const META = 'vault';
  const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let key = null;                 // CryptoKey while unlocked
  let busy = false;

  const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  function toB32(bytes) {
    let bits = 0, val = 0, out = '';
    for (const b of bytes) {
      val = (val << 8) | b; bits += 8;
      while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(val << (5 - bits)) & 31];
    return out.replace(/(.{4})/g, '$1 ').trim();
  }
  function fromB32(str) {
    const clean = str.toUpperCase().replace(/[^A-Z2-9]/g, '');
    const out = []; let bits = 0, val = 0;
    for (const ch of clean) {
      const i = B32.indexOf(ch);
      if (i < 0) continue;
      val = (val << 5) | i; bits += 5;
      if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
    }
    return new Uint8Array(out);
  }

  const meta = () => H.St.g(META, null);
  const isOn = () => !!meta();
  const isUnlocked = () => !!key;

  async function derive(pass, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }

  async function seal(k, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(text));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function open(k, box) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, k, unb64(box.ct));
    return dec.decode(pt);
  }

  /* ---------- transparent encryption at the storage layer ---------- */
  const basePut = H.IDB.put.bind(H.IDB);
  const baseGet = H.IDB.get.bind(H.IDB);
  const baseAll = H.IDB.all.bind(H.IDB);
  const baseDel = H.IDB.del.bind(H.IDB);

  async function encodeRow(store, row) {
    if (!STORES.includes(store) || !key) return row;
    const box = await seal(key, JSON.stringify(row));
    return { id: row.id, __enc: 1, iv: box.iv, ct: box.ct };
  }
  async function decodeRow(row) {
    if (!row || !row.__enc) return row;
    if (!key) return null;
    try { return JSON.parse(await open(key, { iv: row.iv, ct: row.ct })); }
    catch (e) { return null; }
  }

  H.IDB.put = async function (store, row) { return basePut(store, await encodeRow(store, row)); };
  H.IDB.get = async function (store, id) { return decodeRow(await baseGet(store, id)); };
  H.IDB.all = async function (store) {
    const rows = await baseAll(store);
    if (!STORES.includes(store) || !key) return rows;
    const out = [];
    for (const r of rows) { const d = await decodeRow(r); if (d) out.push(d); }
    return out;
  };

  /* ---------- lock screen ---------- */
  function lockScreen(reason) {
    let el = $('vault-lock');
    if (!el) {
      el = document.createElement('div');
      el.id = 'vault-lock';
      el.className = 'vault-lock';
      document.body.appendChild(el);
    }
    el.innerHTML = `<div class="vault-card">
      <div class="vault-mark">✦</div>
      <h2>Remedy Finder is locked</h2>
      <p>${reason || 'Enter your passphrase to decrypt your cases on this device.'}</p>
      <input id="vault-pass" type="password" placeholder="Passphrase or recovery key" autocomplete="current-password"/>
      <div class="vault-actions">
        <button class="btn bp" id="vault-go">Unlock</button>
        <button class="btn bg" id="vault-recover">Use recovery key</button>
      </div>
      <p class="vault-note" id="vault-msg"></p>
    </div>`;
    const pass = $('vault-pass');
    pass.focus();
    const msg = t => { $('vault-msg').textContent = t || ''; };
    const attempt = async () => {
      const v = pass.value.trim();
      if (!v) return;
      msg('Decrypting…');
      const ok = await unlockWith(v);
      if (!ok) { msg('That passphrase does not open this vault.'); pass.select(); return; }
      el.remove();
      await resume();
    };
    $('vault-go').onclick = attempt;
    pass.onkeydown = e => { if (e.key === 'Enter') attempt(); };
    $('vault-recover').onclick = () => {
      pass.type = 'text';
      pass.placeholder = 'Recovery key — XXXX XXXX XXXX …';
      msg('Enter the recovery key issued when you set the passphrase.');
      pass.focus();
    };
  }

  async function unlockWith(passphrase) {
    const m = meta();
    if (!m) return false;
    let k = null;
    try {
      // recovery key path: base32 → raw key
      if (/^[A-Z2-9 ]{20,}$/i.test(passphrase.replace(/\s+/g, '')) && passphrase.replace(/[^A-Z2-9]/gi, '').length >= 48) {
        const raw = fromB32(passphrase);
        if (raw.length === 32) k = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
      }
      if (!k) k = await derive(passphrase, unb64(m.salt), m.iterations);
      const check = await open(k, m.canary);
      if (check !== 'remedy-finder-vault') return false;
      key = k;
      return true;
    } catch (e) { return false; }
  }

  let resumed = false;
  async function resume() {
    if (resumed) return;
    resumed = true;
    try { await U.init(); } catch (e) {}
    try { U.toast('Vault unlocked'); } catch (e) {}
  }

  /* ---------- setup / disable ---------- */
  U.vaultSetup = async function () {
    const pass = prompt('Choose a passphrase for this device (min 8 characters).\nIt encrypts your cases. There is no server and no reset.');
    if (pass === null) return;
    if (!pass || pass.length < 8) return this.toast('Passphrase must be at least 8 characters');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const k = await derive(pass, salt, 150000);
    const canary = await seal(k, 'remedy-finder-vault');
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', k));
    H.St.s(META, { salt: b64(salt), iterations: 150000, canary, createdAt: Date.now(), version: 1 });
    key = k;
    // re-encrypt whatever is already stored
    let n = 0;
    for (const store of STORES) {
      const rows = await baseAll(store);
      for (const r of rows) { await H.IDB.put(store, r); n++; }
    }
    this.vaultPanel();
    const rk = toB32(raw);
    const m = $('md');
    m.innerHTML = `<div class="mh"><div><div class="mt">Save your recovery key</div>
      <div class="msu">Shown once — store it somewhere safe</div></div><button class="ib" id="mc">✕</button></div>
      <div class="mbd">
        <p class="srcl">If you forget the passphrase, this key is the only way back into your cases.</p>
        <div class="recovery-key" id="rk">${rk}</div>
        <div class="xm" style="margin-top:12px">
          <button class="btn bp" id="rk-copy">Copy recovery key</button>
          <button class="btn bg" id="rk-file">Save to a text file</button>
        </div>
        <p class="srcl" style="margin-top:12px">${n} record${n === 1 ? '' : 's'} encrypted. Anyone without the passphrase or this key sees ciphertext.</p>
      </div>`;
    this.om();
    $('mc').onclick = () => this.cm();
    $('rk-copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(rk); this.toast('Recovery key copied'); };
    $('rk-file').onclick = () => H.Ex.dl('remedy-finder-recovery-key.txt',
      `Remedy Finder — recovery key\n\n${rk}\n\nKeep this offline. Anyone with it can decrypt your cases.\nCreated ${new Date().toISOString()}\n`, 'text/plain');
  };

  U.vaultDisable = async function () {
    const pass = prompt('Enter your passphrase to turn encryption off and store records in plain text.');
    if (!pass) return;
    if (!(await unlockWith(pass))) return this.toast('Wrong passphrase');
    let n = 0;
    for (const store of STORES) {
      const rows = await baseAll(store);
      for (const r of rows) {
        const d = await decodeRow(r);
        if (d) { await basePut(store, d); n++; }
      }
    }
    H.St.r(META);
    key = null;
    this.vaultPanel();
    this.toast(`Encryption off — ${n} records are now plain text`);
  };

  U.vaultLock = function () {
    key = null;
    lockScreen('Locked. Enter your passphrase to continue.');
  };

  /* ---------- panel ---------- */
  U.vaultPanel = function () {
    const on = isOn();
    const m = $('md');
    m.innerHTML = `<div class="mh"><div><div class="mt">Encryption at rest</div>
      <div class="msu">${on ? 'On — your cases are ciphertext on disk' : 'Off — records are stored as plain JSON'}</div></div><button class="ib" id="mc">✕</button></div>
      <div class="mbd">
        <div class="offgrid">
          <div class="offrow"><span>Status</span><b class="${on ? 'good' : 'bad'}">${on ? 'encrypted' : 'plain text'}</b></div>
          <div class="offrow"><span>Cipher</span><b>AES-256-GCM</b></div>
          <div class="offrow"><span>Key derivation</span><b>PBKDF2 · 150,000 rounds</b></div>
          <div class="offrow"><span>Protected stores</span><b>clinic · cases · packs</b></div>
          <div class="offrow"><span>Session</span><b>${on ? (isUnlocked() ? 'unlocked' : 'locked') : '—'}</b></div>
        </div>
        <div class="xm" style="margin-top:14px">
          ${on ? `<button class="btn bp" id="v-lock">Lock now</button>
                  <button class="btn bg" id="v-off">Turn encryption off</button>`
                : `<button class="btn bp" id="v-on">Set a passphrase</button>`}
        </div>
        <div class="msec" style="margin-top:16px"><h4>What this protects</h4>
          <p class="srcl">The passphrase never leaves this device: it derives a key in memory, and only ciphertext is written to IndexedDB. A stolen laptop or a shared clinic machine shows nothing without the passphrase or the recovery key. <strong>There is no reset</strong> — that is the point. Back up before you enable it.</p>
        </div>
      </div>`;
    this.om();
    $('mc').onclick = () => this.cm();
    const on2 = $('v-on'); if (on2) on2.onclick = () => this.vaultSetup();
    const lk = $('v-lock'); if (lk) lk.onclick = () => { this.cm(); this.vaultLock(); };
    const off = $('v-off'); if (off) off.onclick = () => this.vaultDisable();
  };

  /* ---------- boot gate ---------- */
  const baseInit = U.init;
  U.init = async function () {
    if (isOn() && !key) { lockScreen(); return; }
    return baseInit.call(this);
  };

  /* tools tile */
  const baseTools = U.toolsSheet;
  U.toolsSheet = function () {
    baseTools.call(this);
    const grid = document.querySelector('#md .xm');
    if (!grid || grid.querySelector('[data-vault]')) return;
    const b = document.createElement('button');
    b.className = 'btn bg';
    b.dataset.vault = '1';
    b.style.cssText = 'justify-content:flex-start;text-align:left;min-height:68px;flex-direction:column;align-items:flex-start;gap:3px;padding:12px 14px';
    b.innerHTML = `<span style="font-weight:700;display:flex;align-items:center;gap:7px">Encryption at rest</span>
      <span style="font-size:11.5px;color:var(--ink-2);font-weight:500;white-space:normal;text-align:left">${isOn() ? 'On — lock, or turn off' : 'Encrypt cases with a passphrase'}</span>`;
    b.onclick = () => { this.cm(); setTimeout(() => this.vaultPanel(), 60); };
    grid.appendChild(b);
  };
})();
