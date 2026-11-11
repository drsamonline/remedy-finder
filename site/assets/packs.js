/* ==========================================================================
   Remedy Finder — data packs
   An offline pack is one JSON file that adds remedies (and their links) to the
   running app. No server, no registry: you choose the file, you own the data.
   Pack format v1:
     { "format":"rf-pack", "v":1, "name":"...", "author":"...", "note":"...",
       "remedies": { "CODE": [name, latin, group, acute, con, mentals, generals,
                              better, worse, particulars, keynotes, clinicals,
                              rel, family, sources, desc, strong, weak,
                              quote, qsrc, quote2, qsrc2] } }
   ========================================================================== */
(function () {
  const U = H.U;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'packs';

  const mapTuple = (code, d) => ({
    code, name: d[0], latin: d[1], group: d[2], acute: !!d[3], constitutional: !!d[4],
    mentals: d[5] || [], generals: d[6] || [], modalities: { better: d[7] || [], worse: d[8] || [] },
    particulars: d[9] || {}, keynotes: d[10] || [], clinicals: d[11] || [],
    relationships: { comp: (d[12] || {}).c || [], antid: (d[12] || {}).a || [], follows: (d[12] || {}).f || [] },
    family: d[13] || '', sources: d[14] || [], description: d[15] || '',
    strong: d[16] || [], weak: d[17] || [], quote: d[18] || '', qsrc: d[19] || '',
    quote2: d[20] || '', qsrc2: d[21] || ''
  });

  U.packList = function () { return H.St.g(KEY, []); };

  U.validatePack = function (obj) {
    if (!obj || obj.format !== 'rf-pack') return 'Not a Remedy Finder pack';
    if (obj.v !== 1) return 'Unsupported pack version';
    if (!obj.remedies || typeof obj.remedies !== 'object') return 'Pack has no remedies';
    const codes = Object.keys(obj.remedies);
    if (!codes.length) return 'Pack is empty';
    const known = new Set(Object.values(H.DB.symptoms).map(s => s.id));
    let bad = 0;
    for (const c of codes) {
      const d = obj.remedies[c];
      if (!Array.isArray(d) || d.length < 16 || typeof d[0] !== 'string') return `Bad record for ${c}`;
      const ids = [].concat(d[5] || [], d[6] || [], d[7] || [], d[8] || [], ...Object.values(d[9] || {}).flat());
      for (const id of ids) if (!known.has(id)) bad++;
    }
    if (bad) return `${bad} link${bad > 1 ? 's' : ''} point at symptoms this app does not have`;
    return null;
  };

  U.applyPack = function (obj) {
    let added = 0, replaced = 0;
    Object.entries(obj.remedies).forEach(([code, d]) => {
      if (H.DB.remedies[code]) replaced++; else added++;
      H.DB.remedies[code] = mapTuple(code, d);
    });
    // rebuild what depends on the remedy set
    try { H.Sc.bf(); } catch (e) {}
    try { H.Idx.build(); } catch (e) {}
    try { this.invalidateCaches(); } catch (e) {}
    const list = this.packList().filter(p => p.name !== obj.name);
    list.push({ name: obj.name || 'Untitled pack', author: obj.author || '', count: Object.keys(obj.remedies).length, at: Date.now() });
    H.St.s(KEY, list);
    try { H.IDB.put('packs', { id: obj.name || 'pack', obj }); } catch (e) {}
    H.DB.remedyCount = Object.keys(H.DB.remedies).length;
    this.toast(`Pack “${obj.name || 'untitled'}” loaded — ${added} new, ${replaced} replaced`);
    this.refreshStats();
  };

  U.importPack = function () {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      let obj;
      try { obj = JSON.parse(await f.text()); }
      catch (e) { return this.toast('Not a JSON file'); }
      const err = this.validatePack(obj);
      if (err) return this.toast('Pack rejected: ' + err);
      const codes = Object.keys(obj.remedies);
      if (!confirm(`Load “${obj.name || 'untitled pack'}” with ${codes.length} remedies?\n\nExisting remedies with the same code will be replaced.`)) return;
      this.applyPack(obj);
      this.packPanel();
    };
    inp.click();
  };

  U.exportPack = function () {
    const out = { format: 'rf-pack', v: 1, name: 'Remedy Finder — current data', author: 'Dr Sohil Momin', note: 'Full snapshot of this app\'s remedies, generated offline.', remedies: {} };
    Object.entries(H.DB.remedies).forEach(([code, r]) => {
      out.remedies[code] = [r.name, r.latin, r.group, r.acute ? 1 : 0, r.constitutional ? 1 : 0,
        r.mentals, r.generals, r.modalities.better, r.modalities.worse, r.particulars,
        r.keynotes, r.clinicals, { c: r.relationships.comp, a: r.relationships.antid, f: r.relationships.follows },
        r.family, r.sources, r.description, r.strong, r.weak, r.quote, r.qsrc, r.quote2, r.qsrc2];
    });
    H.Ex.dl(`remedy-finder-pack-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out), 'application/json');
    this.toast(`Pack exported — ${Object.keys(out.remedies).length} remedies`);
  };

  U.removePacks = function () {
    H.St.s(KEY, []);
    H.IDB.all('packs').then(rows => rows.forEach(r => H.IDB.del('packs', r.id))).catch(() => {});
    this.toast('Packs cleared — reload to drop the added remedies');
    this.packPanel();
  };

  U.reapplyPacks = async function () {
    try {
      const rows = await H.IDB.all('packs');
      if (!rows || !rows.length) return;
      let n = 0;
      rows.forEach(r => { if (r && r.obj) { try { this.applyPackSilent(r.obj); n++; } catch (e) {} } });
      if (n) { try { H.Sc.bf(); H.Idx.build(); this.invalidateCaches(); } catch (e) {} this.refreshStats(); }
    } catch (e) {}
  };

  U.applyPackSilent = function (obj) {
    Object.entries(obj.remedies || {}).forEach(([code, d]) => {
      H.DB.remedies[code] = mapTuple(code, d);
    });
    H.DB.remedyCount = Object.keys(H.DB.remedies).length;
  };

  U.packPanel = function () {
    const list = this.packList();
    const m = $('md');
    m.innerHTML = `<div class="mh"><div><div class="mt">Data packs</div>
      <div class="msu">Add remedies offline, from a file you choose</div></div><button class="ib" id="mc">✕</button></div>
      <div class="mbd">
        <div class="offgrid">
          <div class="offrow"><span>Remedies loaded</span><b>${H.DB.remedyCount}</b></div>
          <div class="offrow"><span>Packs stored</span><b>${list.length}</b></div>
        </div>
        ${list.length ? `<div class="msec" style="margin-top:14px"><h4>Applied packs</h4>
          <div class="offgrid">${list.map(p => `<div class="offrow"><span>${esc(p.name)}${p.author ? ' · ' + esc(p.author) : ''}</span><b>${p.count} ${p.count === 1 ? 'remedy' : 'remedies'}</b></div>`).join('')}</div></div>` : ''}
        <div class="xm" style="margin-top:14px">
          <button class="btn bp" id="pk-import">Import pack…</button>
          <button class="btn bg" id="pk-export">Export current data as pack</button>
          ${list.length ? '<button class="btn bg" id="pk-clear">Clear pack list</button>' : ''}
        </div>
        <div class="msec" style="margin-top:16px"><h4>Format</h4>
          <p class="srcl">A pack is one JSON file: <code>{format:"rf-pack", v:1, name, remedies:{CODE:[…]}}</code>. Links must use this app's symptom IDs, so a pack can add remedies but never invent symptoms. Importing replaces any remedy with the same code; the list is remembered and re-applied only for this session — export your data first if you are experimenting.</p>
        </div>
      </div>`;
    this.om();
    $('mc').onclick = () => this.cm();
    $('pk-import').onclick = () => this.importPack();
    $('pk-export').onclick = () => this.exportPack();
    const c = $('pk-clear'); if (c) c.onclick = () => this.removePacks();
  };

  const baseInit = U.init;
  U.init = async function () {
    await baseInit.call(this);
    setTimeout(() => { this.reapplyPacks(); }, 300);
  };

  /* tools tile */
  const baseTools = U.toolsSheet;
  U.toolsSheet = function () {
    baseTools.call(this);
    const grid = document.querySelector('#md .xm');
    if (!grid || grid.querySelector('[data-packs]')) return;
    const b = document.createElement('button');
    b.className = 'btn bg';
    b.dataset.packs = '1';
    b.style.cssText = 'justify-content:flex-start;text-align:left;min-height:68px;flex-direction:column;align-items:flex-start;gap:3px;padding:12px 14px';
    b.innerHTML = `<span style="font-weight:700;display:flex;align-items:center;gap:7px">Data packs</span>
      <span style="font-size:11.5px;color:var(--ink-2);font-weight:500;white-space:normal;text-align:left">Import or export remedies as a file</span>`;
    b.onclick = () => { this.cm(); setTimeout(() => this.packPanel(), 60); };
    grid.appendChild(b);
  };
})();
