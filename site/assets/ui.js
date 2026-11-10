/* ==========================================================================
   Remedy Finder — UI layer
   Replaces the v12 view layer with a workbench layout: rail + picker + results,
   mobile tab bar, tools sheet, and larger hit targets. All data/logic modules
   (H.DB, H.Sc, H.Clinic, H.SRS, H.Ex, H.Gr, H.Mat, ...) are untouched.
   ========================================================================== */
(function () {
  const U = H.U;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isMobile = () => window.matchMedia('(max-width:820px)').matches;

  /* ---------- helpers ---------- */
  U.freq = function () {
    if (!this._freq) {
      this._freq = new Map();
      Object.values(H.DB.remedies).forEach(r => {
        const ids = new Set([...r.mentals, ...r.generals, ...r.modalities.better, ...r.modalities.worse,
          ...Object.values(r.particulars).flat()]);
        ids.forEach(id => this._freq.set(id, (this._freq.get(id) || 0) + 1));
      });
    }
    return this._freq;
  };

  const RB = () => H.DB.rubric || {};
  U.rubricFor = function (sid) { return RB()[sid] || null; };

  let _remIdx = null;
  U.remedyIndex = function () {
    if (_remIdx) return _remIdx;
    _remIdx = Object.entries(H.DB.remedies).map(([code, r]) => ({
      code, r,
      hay: (r.name + ' ' + r.latin + ' ' + (r.clinicals || []).join(' ') + ' ' + (r.family || '')).toLowerCase()
    }));
    return _remIdx;
  };

  const PACKICON = {
    fever: '<svg class="i i-lg"><use href="#i-graph"/></svg>',
    cough: '<svg class="i i-lg"><use href="#i-study"/></svg>',
    headache: '<svg class="i i-lg"><use href="#i-tools"/></svg>',
    anxiety: '<svg class="i i-lg"><use href="#i-cases"/></svg>',
    digestive: '<svg class="i i-lg"><use href="#i-results"/></svg>'
  };
  const ic = (id, cls) => `<svg class="i ${cls || ''}"><use href="#i-${id}"/></svg>`;

  /* ---------- chapter chips ---------- */
  U.rc = function () {
    const host = $('cat-row');
    if (!host) return;
    const items = [{ k: null, l: 'All' }, ...H.DB.cats];
    host.innerHTML = items.map(c =>
      `<button class="cp" aria-pressed="${this.s.cat === c.k}" data-cat="${c.k ?? ''}">${esc(c.l)}</button>`).join('');
  };

  /* ---------- packs ---------- */
  U.rp = function () {
    const host = $('packs');
    if (!host) return;
    host.innerHTML = H.DB.packs.map(p =>
      `<button class="pk" data-pack="${p.id}" aria-pressed="false">
         <span class="pke">${PACKICON[p.id] || ic('find', 'i-lg')}</span>
         <span class="pkn">${esc(p.n)}</span><span class="pkc">${p.s.length} symptoms</span>
       </button>`).join('');
  };

  /* ---------- symptom picker ---------- */
  U.rs = function () {
    const host = $('symptoms');
    if (!host) return;
    const S = H.DB.symptoms, q = (this.s.q || '').toLowerCase().trim();
    const cats = this.s.cat ? H.DB.cats.filter(c => c.k === this.s.cat) : H.DB.cats;
    const freq = this.freq();
    let html = '';
    if (q.length >= 2) {
      const hits = this.remedyIndex().filter(x => x.hay.includes(q)).slice(0, 8);
      if (hits.length) {
        html += `<div class="ss open" data-cat="__rem">
          <button class="sh" aria-expanded="true" type="button"><span>Remedies</span><span class="ct">${hits.length}</span><span class="ch" aria-hidden="true">▸</span></button>
          <div class="sl">${hits.map(x => `<div class="sc rem" data-rem="${x.code}" role="button" tabindex="0">
            <span class="kd">${x.r.group.charAt(0).toUpperCase()}</span>
            <span>${this.hl(esc(x.r.name), q)}<em class="lt">${esc(x.r.latin)}</em></span>
            <span class="n">${(x.r.sources || []).length || ''}</span>
          </div>`).join('')}</div></div>`;
      }
    }
    cats.forEach(cat => {
      const syms = Object.values(S).filter(s => s.cat === cat.k &&
        (!q || s.name.toLowerCase().includes(q) || s.synonyms.some(sy => sy.toLowerCase().includes(q))));
      if (!syms.length) return;
      const open = this.s.open.has(cat.k) || (!!q && syms.length <= 40);
      html += `<div class="ss ${open ? 'open' : ''}" data-cat="${cat.k}">
        <button class="sh" aria-expanded="${open}" type="button">
          <span>${cat.e} ${cat.l}</span><span class="ct">${syms.length}</span><span class="ch" aria-hidden="true">▸</span>
        </button>
        <div class="sl">${syms.map(s => {
          const on = this.s.sel.has(s.id);
          const n = freq.get(s.id) || 0;
          const rb = this.rubricFor(s.id);
          const tip = rb ? `Repertorium: ${rb[0]} — ${rb[1]} rubrics` : 'Curated link (no single rubric)';
          return `<div class="sc ${on ? 'sel' : ''}" data-sid="${s.id}" role="checkbox" aria-checked="${on}" tabindex="0" title="${esc(tip)}">
            <input type="checkbox" ${on ? 'checked' : ''} tabindex="-1" aria-hidden="true">
            <span>${q ? this.hl(esc(s.name), q) : esc(s.name)}</span>
            <span class="n ${n && n <= 12 ? 'rare' : ''}" title="${n} remedies carry this symptom">${n}</span>
          </div>`;
        }).join('')}</div></div>`;
    });
    host.innerHTML = html || `<div class="emp"><div class="emp-i">${ic("find","i-lg")}</div><div>No symptom matches “${esc(this.s.q)}”.</div></div>`;
  };

  U.hl = function (t, q) {
    try {
      return t.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
    } catch (e) { return t; }
  };

  /* ---------- selection tray ---------- */
  U.rt = function () {
    const tray = $('tray');
    if (!tray) return;
    const S = H.DB.symptoms;
    if (!this.s.sel.size) { tray.style.display = 'none'; return; }
    tray.style.display = 'flex';
    $('trc').textContent = `${this.s.sel.size} symptom${this.s.sel.size > 1 ? 's' : ''}`;
    $('trch').innerHTML = [...this.s.sel].map(id => {
      const s = S[id];
      return s ? `<span class="trc-chip">${esc(s.name)}<button data-rm="${id}" aria-label="Remove ${esc(s.name)}">✕</button></span>` : '';
    }).join('');
  };

  /* ---------- pins (watch list) ---------- */
  U.pins = new Set();
  U.togglePin = function (code) {
    if (this.pins.has(code)) this.pins.delete(code);
    else { if (this.pins.size >= 3) { this.toast('Pin up to three remedies'); return; } this.pins.add(code); }
    if (this.s.last) this.rr();
  };

  /* ---------- results ---------- */
  U.rr = async function () {
    const v = $('rv');
    if (!v) return;
    v.innerHTML = `<div class="emp"><div class="emp-i">${ic("results","i-lg")}</div><div>Ranking ${this.s.sel.size} symptoms…</div></div>`;
    this.openResults();
    const res = await H.W.rank([...this.s.sel], this.s.mode);
    this.s.last = res;
    const S = H.DB.symptoms;
    const strip = `<div class="case-strip">${[...this.s.sel].map(id => S[id] ? `<span class="trc-chip">${esc(S[id].name)}<button data-rm2="${id}" aria-label="Remove">✕</button></span>` : '').join('')}</div>`;
    if (!res.length) {
      v.innerHTML = `<div class="rh"><div><div class="rt">No matches</div><div class="rs">${this.s.sel.size} symptoms selected</div></div>
        <div style="display:flex;gap:6px"><button class="btn bg mobile-close" data-close-results>${ic("back","i-sm")} Back</button><button class="btn bg" id="b-bk">${ic("back","i-sm")} Symptoms</button></div></div>
        <div class="emp"><div class="emp-i">${ic("info","i-lg")}</div><div>${H.I.t('noRes')}</div></div>`;
      this.bre();
      return;
    }
    const top = res[0].matchScore;
    const rankOf = c => { const i = res.findIndex(x => x.code === c); return i < 0 ? '—' : '#' + (i + 1); };
    const pinned = [...this.pins].filter(c => H.DB.remedies[c]);
    const pinStrip = pinned.length ? `<div class="pinbar">${pinned.map(c => {
      const s = H.Sc.sc(c, [...this.s.sel], this.s.mode) || { matchScore: 0, matchCount: 0 };
      const r = H.DB.remedies[c];
      return `<div class="pin"><div><strong>${esc(r.name)}</strong><span>${rankOf(c)} · ${s.matchScore} pts · ${s.matchCount}/${this.s.sel.size}</span></div>
        <button data-unpin="${c}" aria-label="Unpin ${esc(r.name)}">✕</button></div>`;
    }).join('')}</div>` : '';
    v.innerHTML = `<div class="rh">
        <div><div class="rt">${H.I.t('edu')}</div>
          <div class="rs">${res.length} remedies · ${this.s.sel.size} symptoms · ${this.s.mode} mode</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn bg mobile-close" data-close-results>${ic("back","i-sm")} Back</button>
          <button class="btn bg" id="b-sv">${ic("save","i-sm")} Save</button>
          <button class="btn bg" id="b-ex2">${ic("export","i-sm")} Export</button>
          <button class="btn bg" id="b-pr">${ic("print","i-sm")} Print</button>
          <button class="btn bg" id="b-bk">${ic("back","i-sm")} Symptoms</button>
        </div></div>
      ${strip}
      ${pinStrip}
      <div class="disc"><strong>${H.I.t('ro')}</strong> ${H.I.t('rot')} Grade‑3 links are marked ★.</div>
      ${res.slice(0, 25).map((r, i) => {
        const rm = H.DB.remedies[r.code];
        const pct = Math.min(100, Math.round(r.matchScore / top * 100));
        const g3 = (r.matchedIds || []).filter(id => (rm.strong || []).includes(id)).length;
        return `<article class="rc ${i < 3 ? 'top' : ''}">
          <div class="rct">
            <div><div class="rn">${i + 1}. ${esc(rm.name)}</div>
              <div class="rl">${esc(rm.latin)} · ${rm.group}${rm.family ? ' · ' + esc(rm.family) : ''}</div></div>
            <span class="rr ${i < 3 ? 'top' : ''}">${r.confidence}%</span>
          </div>
          <div class="scs">
            <div class="sc2"><span class="sc2-l">Match</span><span class="sc2-v">${r.matchScore}</span>
              <div class="sb"><div class="sbf" style="width:${pct}%"></div></div></div>
            <div class="sc2"><span class="sc2-l">Matched</span><span class="sc2-v">${r.matchCount}/${this.s.sel.size}</span></div>
            <div class="sc2"><span class="sc2-l">Grade‑3</span><span class="sc2-v">${g3}</span></div>
            <div class="sc2"><span class="sc2-l">Unique</span><span class="sc2-v">${r.diffScore}%</span></div>
          </div>
          <div class="ms">${(r.matchedIds || []).slice(0, 8).map(id => {
            const s = S[id];
            if (!s) return '';
            const u = (r.uniqueIds || []).includes(id);
            const star = (rm.strong || []).includes(id) ? ' ★' : '';
            return `<span class="msi ${u ? 'u' : ''}">${esc(s.name)}${star}</span>`;
          }).join('')}</div>
          <div class="ra">
            <button class="btn bg" data-dt="${r.code}">Details</button>
            <button class="btn bg" data-cm="${r.code}">${ic("compare","i-sm")} Compare</button>
            <button class="btn bg" data-gr="${r.code}">${ic("graph","i-sm")} Graph</button>
            <button class="btn bg" data-sr="${r.code}">${ic("study","i-sm")} Study</button>
            <button class="btn bg ${this.pins.has(r.code) ? 'on' : ''}" data-pin="${r.code}" aria-pressed="${this.pins.has(r.code)}" title="Pin to watch while you change symptoms">${this.pins.has(r.code) ? 'Pinned' : 'Pin'}</button>
            ${this.s.mode === 'teaching' ? `<button class="btn bg" data-ty="${r.code}">Why?</button>` : ''}
          </div></article>`;
      }).join('')}`;
    this.bre();
    H.A.m(`${res.length} remedies. Top: ${H.DB.remedies[res[0].code].name}.`);
  };

  /* ---------- bindings inside the results panel ---------- */
  U.bre = function () {
    const v = $('rv');
    if (!v) return;
    const close = () => this.closeResults();
    v.querySelectorAll('[data-close-results]').forEach(b => b.addEventListener('click', close));
    const bk = $('b-bk');
    if (bk) bk.addEventListener('click', () => { this.closeResults(); });
    v.querySelectorAll('[data-rm2]').forEach(b => b.addEventListener('click', e => {
      this.s.sel.delete(parseInt(e.currentTarget.dataset.rm2, 10));
      this.rs(); this.rt(); this.rr();
    }));
    const pr = $('b-pr');
    if (pr) pr.addEventListener('click', () => {
      const pd = $('pd'); if (pd) pd.textContent = `${new Date().toLocaleString()} · ${this.s.mode} · ${this.s.sel.size} symptoms`;
      window.print();
    });
    const sv = $('b-sv');
    if (sv) sv.addEventListener('click', () => {
      const name = $('case-name') && $('case-name').value.trim();
      const n = name || prompt('Case name:', 'Case ' + new Date().toLocaleDateString());
      if (n) H.C.save(n, this.s.mode, this.s.sel).then(() => this.toast('Case saved'));
    });
    const ex = $('b-ex2');
    if (ex) ex.addEventListener('click', () => this.exportSheet());
    v.querySelectorAll('[data-dt]').forEach(b => b.addEventListener('click', e => this.showDetail(e.currentTarget.dataset.dt)));
    v.querySelectorAll('[data-cm]').forEach(b => b.addEventListener('click', e => this.addCmp(e.currentTarget.dataset.cm)));
    v.querySelectorAll('[data-gr]').forEach(b => b.addEventListener('click', e => this.showGr(e.currentTarget.dataset.gr)));
    v.querySelectorAll('[data-sr]').forEach(b => b.addEventListener('click', e => {
      H.SRS.add(e.currentTarget.dataset.sr); this.toast(H.I.t('add'));
    }));
    v.querySelectorAll('[data-ty]').forEach(b => b.addEventListener('click', e => this.showTy(e.currentTarget.dataset.ty)));
    v.querySelectorAll('[data-pin]').forEach(b => b.addEventListener('click', e => this.togglePin(e.currentTarget.dataset.pin)));
    v.querySelectorAll('[data-unpin]').forEach(b => b.addEventListener('click', e => this.togglePin(e.currentTarget.dataset.unpin)));
  };

  U.exportSheet = function () {
    const m = $('md');
    m.innerHTML = `<div class="mh"><div><div class="mt">Export</div><div class="msu">Current ranking, or your saved data</div></div><button class="ib" id="mc">✕</button></div>
      <div class="mbd"><div class="xm">
        <button class="btn bg" id="e-md"> Markdown report</button>
        <button class="btn bg" id="e-cs"> CSV</button>
        <button class="btn bg" id="e-js"> Cases JSON</button>
        <button class="btn bg" id="e-ak"> Anki deck</button>
      </div></div>`;
    this.om();
    $('mc').onclick = () => this.cm();
    $('e-md').onclick = async () => { await H.Ex.mdE(this.s.last, [...this.s.sel], this.s.mode); this.cm(); };
    $('e-cs').onclick = () => { H.Ex.csvE(this.s.last); this.cm(); };
    $('e-js').onclick = async () => { await H.Ex.jsonE(); this.cm(); };
    $('e-ak').onclick = async () => { await H.Ex.anki(); this.cm(); };
  };

  /* ---------- view switching ---------- */
  U.openResults = function () {
    this.s.view = 'results';
    const rv = $('rv');
    if (rv) rv.classList.add('open');
    document.querySelectorAll('[data-view="results"]').forEach(b => b.setAttribute('aria-current', 'page'));
  };
  U.closeResults = function () {
    this.s.view = 'browse';
    const rv = $('rv');
    if (rv) rv.classList.remove('open');
    document.querySelectorAll('[data-view="results"]').forEach(b => b.removeAttribute('aria-current'));
    if (isMobile()) this.view('find');
  };
  U.view = function (name) {
    document.querySelectorAll('.rail-btn[data-view],.tabbar button[data-view]').forEach(b => {
      const on = b.dataset.view === name;
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (name === 'find') { this.closeResults(); const si = $('search'); if (si && isMobile()) si.focus(); }
    if (name === 'results') { if (this.s.sel.size) this.rr(); else this.toast('Select symptoms first'); }
    if (name === 'cases') $('b-clinic').click();
    if (name === 'study') $('b-st').click();
    if (name === 'tools') this.toolsSheet();
  };

  U.toolsSheet = function () {
    const items = [
      ['b-ex', 'graph', 'Remedy explorer', 'Browse all remedies and their relationships'],
      ['b-mx', 'results', 'Comparison matrix', 'Up to 10 remedies side by side'],
      ['b-co', 'compare', 'Compare picks', 'Shared and unique symptoms'],
      ['b-ca', 'save', 'Saved cases', 'Your saved repertorisations'],
      ['b-st', 'study', 'Study centre', 'SRS review, calendar, quizzes'],
      ['b-au', 'info', 'Data audit', 'Integrity and provenance check'],
      ['b-kb', 'tools', 'Keyboard shortcuts', 'Work faster'],
      ['b-about', 'info', 'About & sources', 'Author, licence, data provenance']
    ];
    $('md').innerHTML = `<div class="mh"><div><div class="mt">Tools</div><div class="msu">Everything outside the finder</div></div><button class="ib" id="mc">✕</button></div>
      <div class="mbd"><div class="xm">${items.map(([id, e, t, d]) => `
        <button class="btn bg" data-tool="${id}" style="justify-content:flex-start;text-align:left;min-height:68px;flex-direction:column;align-items:flex-start;gap:3px;padding:12px 14px">
          <span style="font-weight:700;display:flex;align-items:center;gap:7px">${ic(e)} ${t}</span><span style="font-size:11.5px;color:var(--ink-2);font-weight:500;white-space:normal;text-align:left">${d}</span>
        </button>`).join('')}</div>
        <p class="srcl" style="margin-top:14px">Offline · no account · nothing leaves this device</p></div>`;
    this.om();
    $('mc').onclick = () => this.cm();
    document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => {
      this.cm();
      const t = $(b.dataset.tool);
      if (t) setTimeout(() => t.click(), 60);
    }));
  };

  /* ---------- bindings ---------- */
  U.be = function () {
    if (this._bound) return;
    this._bound = true;

    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    on('b-th', () => this.toggleTheme());
    on('b-clinic', () => this.showClinic());
    on('b-about', () => this.showAbout());
    document.querySelectorAll('.seg .tab').forEach(b => b.addEventListener('click', () => {
      this.s.mode = b.dataset.mode;
      H.St.s('mode', this.s.mode);
      this.rmt();
      if (this.s.view === 'results') this.rr();
    }));
    document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => this.view(b.dataset.view)));

    const si = $('search'), sc = $('sc');
    let t = null;
    si.addEventListener('input', e => {
      this.s.q = e.target.value;
      sc.style.display = e.target.value ? '' : 'none';
      clearTimeout(t); t = setTimeout(() => this.rs(), 110);
    });
    sc.addEventListener('click', () => { si.value = ''; this.s.q = ''; sc.style.display = 'none'; this.rs(); });

    $('cat-row').addEventListener('click', e => {
      const b = e.target.closest('.cp'); if (!b) return;
      this.s.cat = b.dataset.cat || null; this.rc(); this.rs();
    });
    $('packs').addEventListener('click', e => {
      const b = e.target.closest('.pk'); if (!b) return;
      const p = H.DB.packs.find(x => x.id === b.dataset.pack); if (!p) return;
      p.s.forEach(id => this.s.sel.add(id));
      document.querySelectorAll('.pk').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      this.rs(); this.rt();
      this.toast(`${p.n} pack loaded · ${p.s.length} symptoms`);
    });
    $('symptoms').addEventListener('click', e => {
      const h = e.target.closest('.sh');
      if (h) {
        const box = h.closest('.ss'), c = box.dataset.cat;
        if (this.s.open.has(c)) this.s.open.delete(c); else this.s.open.add(c);
        box.classList.toggle('open');
        h.setAttribute('aria-expanded', box.classList.contains('open'));
        return;
      }
      const rem = e.target.closest('[data-rem]');
      if (rem) { this.showDetail(rem.dataset.rem); return; }
      const row = e.target.closest('.sc'); if (!row) return;
      const id = parseInt(row.dataset.sid, 10);
      const inp = row.querySelector('input');
      const next = !inp.checked;
      inp.checked = next;
      row.setAttribute('aria-checked', next);
      if (next) { this.s.sel.add(id); row.classList.add('sel'); }
      else { this.s.sel.delete(id); row.classList.remove('sel'); }
      this.rt();
    });
    $('symptoms').addEventListener('keydown', e => {
      if ((e.key === ' ' || e.key === 'Enter') && (e.target.classList.contains('sc'))) {
        e.preventDefault(); e.target.click();
      }
    });
    $('tray').addEventListener('click', e => {
      const r = e.target.closest('[data-rm]'); if (!r) return;
      this.s.sel.delete(parseInt(r.dataset.rm, 10)); this.rs(); this.rt();
    });
    on('b-find', () => { if (!this.s.sel.size) return this.toast('Select at least one symptom'); this.rr(); });

    const caseIn = $('case-name');
    if (caseIn) {
      caseIn.value = H.St.g('casename', '');
      caseIn.addEventListener('input', () => H.St.s('casename', caseIn.value));
    }
    // legacy header buttons stay bound (tools sheet forwards to them)
    on('b-co', () => { if (this.cmp.length >= 2) this.showCmp(); else this.toast('Add two remedies with ⇄ Compare first'); });
    on('b-st', () => this.showStudy());
    on('b-au', () => H.Au.run());
    on('b-mx', () => H.Mat.open());
    on('b-ex', () => H.Exp.open());
    on('b-ca', () => this.showCa());
    on('b-kb', () => H.KB.show());
    on('b-th2', () => this.toggleTheme());
  };

  /* ---------- remedy detail: repertory provenance + print ---------- */
  const baseDetail = U.showDetail;
  U.showDetail = function (code) {
    baseDetail.call(this, code);
    const r = H.DB.remedies[code];
    if (!r) return;
    const mbd = document.querySelector('#md .mbd');
    if (mbd) {
      const S = H.DB.symptoms;
      const rows = (r.keynotes || []).map(id => [id, this.rubricFor(id)]).filter(x => x[1]).slice(0, 6);
      if (rows.length) {
        const sec = document.createElement('div');
        sec.className = 'msec';
        sec.innerHTML = `<h4>Repertory rubric behind each keynote</h4>` +
          rows.map(([id, v]) => `<p class="rb"><span class="rbp">${esc(v[0])}</span><span class="rbn">${esc(S[id] ? S[id].name : '')} · ${v[1]} rubric${v[1]===1?'':'s'} matched</span></p>`).join('');
        const secs = mbd.querySelectorAll('.msec');
        const anchor = secs[2] || null;
        if (anchor) mbd.insertBefore(sec, anchor); else mbd.appendChild(sec);
      }
    }
    const hdr = document.querySelector('#md .mh');
    if (hdr && !hdr.querySelector('[data-print-one]')) {
      const b = document.createElement('button');
      b.className = 'btn bg btn-sm';
      b.dataset.printOne = code;
      b.textContent = 'Print';
      b.style.marginLeft = 'auto';
      b.onclick = () => this.printOne(code);
      hdr.insertBefore(b, hdr.lastElementChild);
    }
  };

  U.printOne = function (code) {
    const r = H.DB.remedies[code];
    if (!r) return;
    document.body.classList.add('print-one');
    const t = document.title;
    document.title = `${r.name} — Remedy Finder`;
    const done = () => { document.body.classList.remove('print-one'); document.title = t; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 90);
  };

  /* ---------- theme hook ---------- */
  const baseUt = U.ut;
  U.ut = function () {
    if (typeof baseUt === 'function') { try { baseUt.call(this); } catch (e) {} }
    const dark = document.body.dataset.theme === 'dark';
    document.querySelectorAll('[data-theme-icon]').forEach(el => el.textContent = dark ? '' : '');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0e1211' : '#0f766e');
  };

  /* ---------- keep rail/tab state in sync with results ---------- */
  const baseCm = U.cm;
  U.cm = function () { baseCm.call(this); };

  window.addEventListener('resize', () => {
    if (!isMobile()) { const rv = $('rv'); if (rv) rv.classList.remove('open'); }
  });
})();
