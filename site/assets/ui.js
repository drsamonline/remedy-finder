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
  U.esc = esc;
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
  U.invalidateCaches = function () { _remIdx = null; this._freq = null; this._txt = null; };

  U.remedyIndex = function () {
    if (_remIdx) return _remIdx;
    _remIdx = Object.entries(H.DB.remedies).map(([code, r]) => ({
      code, r,
      hay: (r.name + ' ' + r.latin + ' ' + (r.clinicals || []).join(' ') + ' ' + (r.family || ' ') + ' ' + (r.description || '') + ' ' + (r.quote || '')).toLowerCase()
    }));
    return _remIdx;
  };

  /* ---------- language ---------- */
  const I18N = window.HRF_I18N || { en: {} };
  U.lang = 'en';
  U.t = function (k) { const L = I18N[this.lang] || I18N.en; return (L && L[k]) || I18N.en[k] || k; };
  U.setLang = function (lang) {
    if (!I18N[lang]) return;
    this.lang = lang;
    H.St.s('lang', lang);
    this.applyLang();
    this.rc(); this.rp(); this.rs(); this.rt();
    if (this.s.view === 'results' && this.s.last) this.rr();
    this.toast(lang === 'en' ? 'English' : lang === 'hi' ? 'हिंदी' : 'ગુજરાતી');
  };
  U.applyLang = function () {
    document.documentElement.lang = this.lang === 'hi' ? 'hi' : this.lang === 'gu' ? 'gu' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.dataset.i18n;
      const label = el.querySelector('em, .lbl');
      if (label) label.textContent = this.t(k); else el.textContent = this.t(k);
    });
    const si = $('search'); if (si) si.placeholder = this.t('search');
    const cn = $('case-name'); if (cn) cn.placeholder = this.t('untitled');
  };

  /* ---------- boards (rubric sets inside one case) ---------- */
  const BOARD_KEY = 'boards';
  U.boards = [];
  U.activeBoard = null;
  U.loadBoards = function () {
    let b = H.St.g(BOARD_KEY, null);
    if (!Array.isArray(b) || !b.length) b = [{ id: 'b1', name: 'Picture', sel: [], weights: {} }];
    this.boards = b;
    this.activeBoard = b[0].id;
    const cur = b[0];
    this.s.sel = new Set(cur.sel || []);
    this.weights = Object.assign({}, cur.weights || {});
    if (this.rubSel) this.rubSel = new Set(cur.rub || []);
  };
  U.saveBoards = function () { H.St.s(BOARD_KEY, this.boards); };
  U.syncBoard = function () {
    const b = this.boards.find(x => x.id === this.activeBoard);
    if (!b) return;
    b.sel = [...this.s.sel];
    b.weights = Object.assign({}, this.weights);
    if (this.rubSel) b.rub = [...this.rubSel];
    this.saveBoards();
    this.renderBoards();
  };
  U.boardSwitch = function (id) {
    this.syncBoard();
    const b = this.boards.find(x => x.id === id);
    if (!b) return;
    this.activeBoard = id;
    this.s.sel = new Set(b.sel || []);
    this.weights = Object.assign({}, b.weights || {});
    if (this.rubSel) this.rubSel = new Set(b.rub || []);
    this.rc(); this.rs(); this.rt(); this.renderBoards();
    if (this.s.view === 'results') this.rr();
  };
  U.boardAdd = function () {
    const name = prompt(this.t('addBoard') + ':', 'Board ' + (this.boards.length + 1));
    if (!name) return;
    this.syncBoard();
    const id = 'b' + Date.now().toString(36);
    this.boards.push({ id, name: name.slice(0, 24), sel: [], weights: {}, rub: [] });
    this.saveBoards();
    this.boardSwitch(id);
  };
  U.boardToCase = async function (id) {
    const b = this.boards.find(x => x.id === id);
    if (!b) return;
    let sel = (b.sel || []).slice();
    if (!sel.length && this.s.sel.size) sel = [...this.s.sel];   // live selection, not yet synced
    const n = sel.length + (b.rub || []).length;
    if (!n) return this.toast('That board is empty');
    const name = prompt('Patient or case name for this board:', b.name || 'Untitled case');
    if (name === null) return;
    const c = await H.Clinic.save({
      name: name || b.name || 'Untitled case',
      complaint: `${n} selected ${n === 1 ? 'item' : 'items'} from board “${b.name}”`,
      selectedIds: sel,
      mode: this.s.mode
    });
    this.toast(`Case saved — ${sel.length} symptom${sel.length === 1 ? '' : 's'} from “${b.name}”`);
    if (c) setTimeout(() => this.showClinicDetail(c), 60);
  };

  U.boardDelete = function (id) {
    if (this.boards.length < 2) { this.toast('Keep at least one board'); return; }
    const i = this.boards.findIndex(b => b.id === id);
    if (i < 0) return;
    const removed = this.boards.splice(i, 1)[0];
    this.saveBoards();
    if (this.activeBoard === id) this.boardSwitch(this.boards[0].id); else this.renderBoards();
    this.undo(`Board “${removed.name}” deleted`, () => { this.boards.splice(i, 0, removed); this.saveBoards(); this.renderBoards(); });
  };
  U.setPickerMode = function (m) {
    this.pickerMode = m;
    document.querySelectorAll('[data-picker]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.picker === m)));
    const si = $('search');
    if (si) si.placeholder = m === 'rubrics' ? 'Search rubrics — fear of death, thirst small, worse consolation'
      : m === 'text' ? 'Search the text — burning midnight, left side cold'
      : this.t('search');
    if (m === 'rubrics') this.loadRepertory(() => this.rs());
    this.rs();
  };

  U.renderBoards = function () {
    const host = $('boards');
    if (!host) return;
    host.innerHTML = this.boards.map(b => {
      const n = (b.sel || []).length + ((b.rub || []).length);
      const on = b.id === this.activeBoard;
      return `<button class="bd-chip ${on ? 'on' : ''}" data-board="${b.id}" aria-pressed="${on}">
        ${esc(b.name)}<span>${n}</span></button>`;
    }).join('') + `<button class="bd-chip add" data-board-add="1" title="${this.t('addBoard')}">+</button>` +
      (this.boards.some(b => (b.sel || []).length || (b.rub || []).length)
        ? `<button class="bd-chip tocase" data-board-case="1" title="Save the active board as a case">→ case</button>` : '');
  };

  const PACKNAME = {
    hi: { fever: 'बुखार', cough: 'खांसी', headache: 'सिरदर्द', anxiety: 'चिंता', digestive: 'पाचन' },
    gu: { fever: 'તાવ', cough: 'ઉધરસ', headache: 'માથું દુખવું', anxiety: 'ચિંતા', digestive: 'પાચન' }
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
    const catName = c => (c.k && I18N[this.lang] && I18N[this.lang][c.k]) || c.l;
    const items = [{ k: null, l: this.lang === 'en' ? 'All' : (this.lang === 'hi' ? 'सभी' : 'બધા') }, ...H.DB.cats];
    host.innerHTML = items.map(c =>
      `<button class="cp" aria-pressed="${this.s.cat === c.k}" data-cat="${c.k ?? ''}">${esc(catName(c))}</button>`).join('');
  };

  /* ---------- packs ---------- */
  U.rp = function () {
    const host = $('packs');
    if (!host) return;
    host.innerHTML = H.DB.packs.map(p =>
      `<button class="pk" data-pack="${p.id}" aria-pressed="false">
         <span class="pke">${PACKICON[p.id] || ic('find', 'i-lg')}</span>
         <span class="pkn">${esc(PACKNAME[this.lang] && PACKNAME[this.lang][p.id] || p.n)}</span><span class="pkc">${p.s.length} ${this.t('symptoms')}</span>
       </button>`).join('');
  };

  /* ---------- full repertory mode ---------- */
  U.pickerMode = 'symptoms';
  U.rubSel = new Set();
  U.rubIndex = null;

  U.loadRepertory = function (cb) {
    if (window.HRF_RUB) { this.parseRepertory(); return cb && cb(); }
    if (this._rubLoading) return;
    this._rubLoading = true;
    this.toast('Loading repertory…');
    const s = document.createElement('script');
    s.src = 'assets/repertory.js';
    s.onload = () => { this.parseRepertory(); this._rubLoading = false; if (cb) cb(); };
    s.onerror = () => {
      this._rubLoading = false;
      this.toast('Repertory data is not in this build — use remedy-finder-full.html or the web app');
      this.setPickerMode('symptoms');
    };
    document.head.appendChild(s);
  };

  U.parseRepertory = function () {
    if (this.rubIndex || !window.HRF_RUB) return;
    const D = window.HRF_RUB, codes = D.codes, chs = D.ch || [];
    const t0 = performance.now();
    this.rubIndex = D.r.map(([p, links]) => {
      let seg;
      if (D.v >= 2) {
        const k = p.indexOf('|');
        seg = [chs[+p.slice(0, k)]].concat(p.slice(k + 1).split('|'));
      } else {
        seg = p.split('|');
      }
      const n = D.v >= 2 ? Math.floor(links.length / 2) : links.split(',').length;
      return { p: seg.join(' › '), seg, l: links, n, g: null };
    });
    this.rubPost = new Map();
    this.rubIndex.forEach((r, i) => {
      r.seg.forEach(sgm => {
        sgm.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).forEach(w => {
          if (w.length < 3) return;
          const k = w.slice(0, 5);
          if (!this.rubPost.has(k)) this.rubPost.set(k, new Set());
          this.rubPost.get(k).add(i);
        });
      });
    });
    this._rubMs = Math.round(performance.now() - t0);
  };

  U.rubric = function (i) {
    const r = this.rubIndex[i];
    if (!r) return null;
    if (r.g) return r;
    const D = window.HRF_RUB, codes = D.codes, g = {};
    if (D.v >= 2) {
      const base = D.v === 3 ? 36 : 16;
      for (let k = 0; k < r.l.length; k += 2) {
        const v = parseInt(r.l.substr(k, 2), base);
        g[codes[Math.floor(v / 3)]] = (v % 3) + 1;
      }
    } else {
      r.l.split(',').forEach(t => {
        const [idx, gr] = t.split(':');
        g[codes[+idx]] = gr ? +gr : 2;
      });
    }
    r.g = g;
    return r;
  };

  /* ---------- full-text search over materia medica ---------- */
  U.textIndex = function () {
    if (this._txt) return this._txt;
    this._txt = Object.entries(H.DB.remedies).map(([code, r]) => {
      const f = {
        description: r.description || '',
        quote: r.quote || '',
        quote2: r.quote2 || '',
        clinical: (r.clinicals || []).join(', ')
      };
      const all = [f.description, f.quote, f.quote2, f.clinical].filter(Boolean).join('  ·  ');
      return { code, f, all, low: all.toLowerCase() };
    });
    return this._txt;
  };

  U.searchText = function (q) {
    const words = q.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length >= 3);
    if (!words.length) return [];
    const hits = [];
    this.textIndex().forEach(doc => {
      if (!words.every(w => doc.low.includes(w))) return;
      let score = 0;
      words.forEach(w => {
        if (doc.f.quote.toLowerCase().includes(w) || doc.f.quote2.toLowerCase().includes(w)) score += 2;
        else score += 1;
      });
      const first = Math.min(...words.map(w => doc.low.indexOf(w)).filter(i => i >= 0));
      const start = Math.max(0, first - 70);
      const snip = (start > 0 ? '…' : '') + doc.all.slice(start, first + 160).trim() + (doc.all.length > first + 160 ? '…' : '');
      const field = doc.f.quote.toLowerCase().includes(words[0]) || doc.f.quote2.toLowerCase().includes(words[0])
        ? 'source' : (doc.f.description.toLowerCase().includes(words[0]) ? 'description' : 'clinical');
      hits.push({ code: doc.code, field, snippet: snip, score });
    });
    return hits.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code)).slice(0, 80);
  };

  U.rsText = function () {
    const host = $('symptoms');
    if (!host) return;
    const q = (this.s.q || '').trim();
    if (q.length < 3) {
      host.innerHTML = `<div class="emp"><div class="emp-i">${ic('find','i-lg')}</div>
        <div>Search the materia medica text itself — <em>burning midnight</em>, <em>left side cold</em>, <em>worse consolation</em>.</div>
        <div class="srcl" style="margin-top:6px">297 monographs · descriptions, quoted sources and clinical uses · all on this device.</div></div>`;
      return;
    }
    const hits = this.searchText(q);
    const rub = (window.HRF_RUB && this.rubIndex) ? this.searchRubrics(q).slice(0, 8) : [];
    if (!hits.length && !rub.length) { host.innerHTML = `<div class="emp"><div class="emp-i">${ic('info','i-lg')}</div><div>No text matches “${esc(q)}”.</div></div>`; return; }
    const fieldName = { description: 'description', quote: 'source', quote2: 'source', clinical: 'clinical' };
    const rubBlock = rub.length ? `<div class="ss open" data-cat="__rub"><button class="sh" aria-expanded="true" type="button">
        <span>Repertory rubrics</span><span class="ct">${rub.length}</span><span class="ch" aria-hidden="true">▸</span></button>
      <div class="sl">${rub.map(i => {
        const r = this.rubIndex[i];
        const on = this.rubSel.has(i);
        return `<div class="sc rb-row ${on ? 'sel' : ''}" data-rub="${i}" role="checkbox" aria-checked="${on}" tabindex="0">
          <input type="checkbox" ${on ? 'checked' : ''} tabindex="-1" aria-hidden="true">
          <span>${esc(r.p)}</span><span class="n">${r.n}</span></div>`;
      }).join('')}</div></div>` : '';
    host.innerHTML = rubBlock + `<div class="ss open"><button class="sh" aria-expanded="true" type="button"><span>Text matches</span>
        <span class="ct">${hits.length}</span><span class="ch" aria-hidden="true">▸</span></button>
      <div class="sl">${hits.map(h => {
        const r = H.DB.remedies[h.code];
        return `<div class="sc txt-row" data-rem="${h.code}" role="button" tabindex="0">
          <span><b>${esc(r.name)}</b><em class="lt">${esc(fieldName[h.field] || h.field)}</em>
          <span class="snip">${this.hl(esc(h.snippet), q)}</span></span></div>`;
      }).join('')}</div></div>`;
  };

  U.searchRubrics = function (q) {
    if (!this.rubIndex) return [];
    const SYN = { worse: ['agg'], better: ['amel'], worseat: ['agg'], aggravated: ['agg'], relieved: ['amel'], relief: ['amel'] };
    const words = q.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(w => w.length >= 3);
    if (!words.length) return [];
    let acc = null;
    words.forEach(w => {
      const alts = [w].concat(SYN[w] || []);
      let union = null;
      alts.forEach(a => {
        const set = this.rubPost.get(a.slice(0, 5));
        if (!set) return;
        union = union ? new Set([...union, ...set]) : new Set(set);
      });
      if (!union) { acc = new Set(); return; }
      acc = acc ? new Set([...acc].filter(x => union.has(x))) : union;
    });
    const list = [...(acc || [])];
    const last = words[words.length - 1].slice(0, 5);
    const rank = i => {
      const r = this.rubIndex[i];
      const low = r.p.toLowerCase();
      let m = 0;
      words.forEach(w => { if (low.includes(w.slice(0, 5))) m++; });
      const leaf = r.seg[r.seg.length - 1].toLowerCase();
      return m * 10 + (leaf.includes(last) ? 5 : 0) - r.seg.length + Math.min(4, r.n / 50);
    };
    list.sort((a, b) => rank(b) - rank(a));
    return list.slice(0, 150);
  };

  U.toggleRubric = function (i) {
    if (this.rubSel.has(i)) this.rubSel.delete(i); else this.rubSel.add(i);
    const keepFocus = document.activeElement && document.activeElement.dataset &&
      document.activeElement.dataset.rub === String(i);
    this.rs(); this.rt();
    if (this.s.view === 'results') this.rr();
    if (keepFocus) {
      const again = document.querySelector(`[data-rub="${i}"]`);
      if (again) { again.focus({ preventScroll: true }); again.scrollIntoView({ block: 'nearest' }); }
    }
  };

  U.rareOnly = function () { return H.St.g('rareOnly', false); };
  U.setRareOnly = function (on) { H.St.s('rareOnly', !!on); this.rs(); };

  U.rsRubrics = function () {
    const host = $('symptoms');
    if (!host) return;
    if (!this.rubIndex) { host.innerHTML = `<div class="emp"><div class="emp-i">${ic('results','i-lg')}</div><div>Loading repertory…</div></div>`; return; }
    const q = (this.s.q || '').trim();
    if (q.length < 3) {
      host.innerHTML = `<div class="emp"><div class="emp-i">${ic('find','i-lg')}</div>
        <div>Type two or three words — <em>fear of death</em>, <em>thirst small</em>, <em>worse consolation</em>.</div>
        <div class="srcl" style="margin-top:6px">39,737 rubrics from Repertorium Publicum, each carrying at least two of this app's 297 remedies. A rubric scores as chapter weight × rarity × grade.</div></div>`;
      return;
    }
    let hits = this.searchRubrics(q);
    if (!hits.length) { host.innerHTML = `<div class="emp"><div class="emp-i">${ic('info','i-lg')}</div><div>No rubric matches “${esc(q)}”.</div></div>`; return; }
    const rare = this.rareOnly();
    if (rare) hits = hits.filter(i => this.rubIndex[i].n <= 3);
    hits.sort((a, b) => this.rubIndex[b].n - this.rubIndex[a].n);
    const bar = `<div class="rubbar">
      <span class="rubcount">${hits.length} rubric${hits.length === 1 ? '' : 's'}${rare ? ' · 3 remedies or fewer' : ''}</span>
      <button class="btn bg btn-sm ${rare ? 'on' : ''}" id="rub-rare" aria-pressed="${rare}">${rare ? 'Rare only ✓' : 'Rare only'}</button>
    </div>`;
    host.innerHTML = bar + (hits.length ? `<div class="ss open"><button class="sh" aria-expanded="true" type="button"><span>Rubrics</span>
        <span class="ct">${hits.length}</span><span class="ch" aria-hidden="true">▸</span></button>
      <div class="sl">${hits.map(i => {
        const r = this.rubIndex[i];
        const on = this.rubSel.has(i);
        return `<div class="sc rb-row ${on ? 'sel' : ''}" data-rub="${i}" role="checkbox" aria-checked="${on}" tabindex="0">
          <input type="checkbox" ${on ? 'checked' : ''} tabindex="-1" aria-hidden="true">
          <span>${esc(r.p)}</span><span class="n">${r.n}</span></div>`;
      }).join('')}</div></div>` : `<div class="emp"><div class="emp-i">${ic('info','i-lg')}</div><div>No rubric with three remedies or fewer matches “${esc(q)}”.</div><div class="srcl">Turn “Rare only” off to see all matches.</div></div>`);
    const rb = $('rub-rare');
    if (rb) rb.onclick = () => this.setRareOnly(!rare);
  };

  /* ---------- combined ranking (symptoms + rubrics) ---------- */
  U.rankCombined = async function () {
    const symSel = [...this.s.sel], W = this.weightMap(), rub = [...this.rubSel];
    if (!rub.length) return H.W.rank(symSel, this.s.mode, W);
    this.parseRepertory();
    const CHW = { Mind: 5, Generalities: 4 };
    const out = [];
    for (const code in H.DB.remedies) {
      const r = H.DB.remedies[code];
      const base = symSel.length ? H.Sc.sc(code, symSel, this.s.mode, W)
        : { code, matchScore: 0, diffScore: 0, confidence: 0, matchCount: 0, uniqueCount: 0, matchedIds: [], uniqueIds: [] };
      let extra = 0, rmatch = 0, gsum = 0;
      const rids = [];
      for (const i of rub) {
        const rr = this.rubric(i);
        const g = rr.g[code];
        if (!g) continue;
        const chapter = rr.seg[0];
        let w = CHW[chapter] || 2;
        const low = rr.p.toLowerCase();
        if (low.includes('agg') || low.includes('amel')) w = 3;
        const rarity = 1 + 0.5 * Math.log2(178 / Math.max(1, rr.n));
        extra += w * rarity * (1 + (g - 1) * 0.5);
        gsum += g;
        rmatch++; rids.push(i);
      }
      let mb = 1;
      if (this.s.mode === 'acute' && r.acute) mb = 1.15;
      if (this.s.mode === 'constitutional' && r.constitutional) mb = 1.15;
      const total = (base.matchScore + extra) * (symSel.length ? 1 : mb);
      if (!total) continue;
      out.push({
        code, matchScore: Math.round(total * 10) / 10,
        diffScore: base.diffScore, confidence: Math.min(100, Math.round(total / ((symSel.length + rub.length) * 10) * 100)),
        matchCount: base.matchCount + rmatch, uniqueCount: base.uniqueCount,
        matchedIds: base.matchedIds, uniqueIds: base.uniqueIds, rubricIds: rids, gradeSum: gsum
      });
    }
    out.sort((a, b) => b.matchScore - a.matchScore || (b.gradeSum || 0) - (a.gradeSum || 0) || b.diffScore - a.diffScore);
    return out;
  };

  /* ---------- symptom picker ---------- */
  U.rs = function () {
    if (this.pickerMode === 'rubrics') return this.rsRubrics();
    if (this.pickerMode === 'text') return this.rsText();
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
          <button class="sh" aria-expanded="true" type="button"><span>${this.t('remediesGroup')}</span><span class="ct">${hits.length}</span><span class="ch" aria-hidden="true">▸</span></button>
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
          <span>${(I18N[this.lang] && I18N[this.lang][cat.k]) || cat.l}</span><span class="ct">${syms.length}</span><span class="ch" aria-hidden="true">▸</span>
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
    host.innerHTML = html || `<div class="emp"><div class="emp-i">${ic("find","i-lg")}</div><div>${this.t('noMatch')} “${esc(this.s.q)}”.</div></div>`;
  };

  U.hl = function (t, q) {
    try {
      return t.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
    } catch (e) { return t; }
  };

  /* ---------- selection tray ---------- */
  U.rt = function () {
    const live = document.getElementById('pick-live');
    if (live) live.textContent = `${this.s.sel.size} symptom${this.s.sel.size === 1 ? '' : 's'} selected`;
    if (this.boards && this.boards.length) this.syncBoard();
    const tray = $('tray');
    if (!tray) return;
    const S = H.DB.symptoms;
    const nRub = this.rubSel ? this.rubSel.size : 0;
    if (!this.s.sel.size && !nRub) { tray.style.display = 'none'; return; }
    tray.style.display = 'flex';
    const nS = this.s.sel.size, total = nS + nRub;
    const parts = [];
    if (nS) parts.push(`${nS} ${nS > 1 ? this.t('symptoms') : this.t('symptom')}`);
    if (nRub) parts.push(`${nRub} ${nRub > 1 ? 'rubrics' : 'rubric'}`);
    $('trc').textContent = parts.join(' + ') || `${total}`;
    $('trch').innerHTML = [...this.s.sel].map(id => {
      const s = S[id];
      if (!s) return '';
      const m = this.wMult(id);
      const glyph = m === 1.5 ? '+' : (m === 0.5 ? '−' : '·');
      const label = m === 1.5 ? 'strong' : (m === 0.5 ? 'doubtful' : 'ordinary');
      return `<span class="trc-chip w${m === 1.5 ? ' up' : (m === 0.5 ? ' down' : '')}">
        <button class="wt" data-wt="${id}" title="${this.t(label)} — ${this.t('weightTip')}" aria-label="${this.t(label)}">${glyph}</button>
        ${esc(s.name)}<button data-rm="${id}" aria-label="Remove ${esc(s.name)}">✕</button></span>`;
    }).join('') + (this.rubSel ? [...this.rubSel].map(i => {
      const r = this.rubIndex ? this.rubIndex[i] : null;
      const label = r ? r.seg[r.seg.length - 1] : 'rubric';
      return `<span class="trc-chip rbchip" title="${esc(r ? r.p : '')}"><em>R</em>${esc(label)}<button data-rmrub="${i}" aria-label="Remove rubric">✕</button></span>`;
    }).join('') : '');
  };

  /* ---------- symptom weight ---------- */
  U.weights = {};
  U.wMult = function (sid) { return this.weights[sid] || 1; };
  U.cycleWeight = function (sid) {
    const cur = this.wMult(sid);
    const next = cur === 1 ? 1.5 : (cur === 1.5 ? 0.5 : 1);
    if (next === 1) delete this.weights[sid]; else this.weights[sid] = next;
    this.rt();
    if (this.s.view === 'results') this.rr();
  };
  U.weightMap = function () {
    const w = {};
    Object.keys(this.weights).forEach(k => { if (this.s.sel.has(+k)) w[k] = this.weights[k]; });
    return w;
  };

  /* ---------- eliminative: struck remedies ---------- */
  U.struck = new Set();
  U.strike = function (code) {
    if (this.struck.has(code)) this.struck.delete(code); else this.struck.add(code);
    if (this.s.last) this.rr();
  };

  /* ---------- undo toast ---------- */
  U.undo = function (msg, fn) {
    const t = $('toast');
    if (!t) return;
    t.innerHTML = `${esc(msg)} <button class="toast-undo" type="button">Undo</button>`;
    t.classList.add('on');
    clearTimeout(this._undoT);
    const close = () => { t.classList.remove('on'); t.innerHTML = ''; t.onclick = null; };
    this._undoT = setTimeout(close, 7000);
    t.querySelector('.toast-undo').onclick = e => { e.stopPropagation(); close(); try { fn(); } catch (err) {} };
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
    v.innerHTML = `<div class="emp"><div class="emp-i">${ic("results","i-lg")}</div><div>${this.t('ranking')} ${this.s.sel.size} ${this.t('symptoms')}…</div></div>`;
    this.openResults();
    const res = await this.rankCombined();
    this.s.last = res;
    const S = H.DB.symptoms;
    const strip = `<div class="case-strip">${[...this.s.sel].map(id => S[id] ? `<span class="trc-chip">${esc(S[id].name)}<button data-rm2="${id}" aria-label="Remove">✕</button></span>` : '').join('')}</div>`;
    if (!res.length) {
      v.innerHTML = `<div class="rh"><div><div class="rt">${this.t('noMatch')}</div><div class="rs">${this.s.sel.size} symptoms selected</div></div>
        <div style="display:flex;gap:6px"><button class="btn bg mobile-close" data-close-results>${ic("back","i-sm")} Back</button><button class="btn bg" id="b-bk">${ic("back","i-sm")} Symptoms</button></div></div>
        <div class="emp"><div class="emp-i">${ic("info","i-lg")}</div><div>${this.t('noMatch')}</div></div>`;
      this.bre();
      return;
    }
    const struckList = [...this.struck].filter(c => H.DB.remedies[c]);
    if (struckList.length) {
      const before = res.length;
      for (let i = res.length - 1; i >= 0; i--) if (this.struck.has(res[i].code)) res.splice(i, 1);
      if (!res.length) {
        v.innerHTML = `<div class="rh"><div><div class="rt">${this.t('struckOut')}</div><div class="rs">Nothing left to compare</div></div>
          <div style="display:flex;gap:6px"><button class="btn bg" data-unstrike-all>${this.t('restore')}</button><button class="btn bg" id="b-bk">${this.t('symptoms')}</button></div></div>
          <div class="emp"><div class="emp-i">${ic('info','i-lg')}</div><div>Eliminative repertorisation removed all ${before} remedies.</div></div>`;
        this.bre(); return;
      }
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
        <div><div class="rt">${this.t('topRemedies')}</div>
          <div class="rs">${res.length} ${this.t('remedies')} · ${(() => { const nS = this.s.sel.size, nR = this.rubSel ? this.rubSel.size : 0; const p = []; if (nS) p.push(nS + ' ' + this.t('symptoms')); if (nR) p.push(nR + ' ' + (nR > 1 ? 'rubrics' : 'rubric')); return p.join(' + ') || '0'; })()}${(() => { const w = this.weightMap(); const up = Object.values(w).filter(v => v > 1).length; const dn = Object.values(w).filter(v => v < 1).length; return (up || dn) ? ` · ${up} ${this.t('strong')}, ${dn} ${this.t('doubtful')}` : ''; })()} · ${this.t(this.s.mode)}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn bg mobile-close" data-close-results>${ic("back","i-sm")} ${this.t('back')}</button>
          <button class="btn bg" id="b-sv">${ic("save","i-sm")} ${this.t('save')}</button>
          <button class="btn bg" id="b-ex2">${ic("export","i-sm")} ${this.t('export')}</button>
          <button class="btn bg" id="b-pr">${ic("print","i-sm")} ${this.t('print')}</button>
          <button class="btn bg" id="b-bk">${ic("back","i-sm")} ${this.t('symptoms')}</button>
        </div></div>
      ${strip}
      ${pinStrip}
      ${struckList.length ? `<div class="struckbar"><span>${this.t('struckOut')} ${struckList.length}:</span>${struckList.map(c => `<button data-unstrike="${c}">${esc(H.DB.remedies[c].name)} ✕</button>`).join('')}</div>` : ''}
      <div class="disc">${this.t('eduNote')}</div>
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
            <div class="sc2"><span class="sc2-l">${this.t('match')}</span><span class="sc2-v">${r.matchScore}</span>
              <div class="sb"><div class="sbf" style="width:${pct}%"></div></div></div>
            <div class="sc2"><span class="sc2-l">${this.t('matched')}</span><span class="sc2-v">${r.matchCount}/${this.s.sel.size + (this.rubSel ? this.rubSel.size : 0)}</span></div>
            <div class="sc2"><span class="sc2-l">${this.t('grade3')}</span><span class="sc2-v">${g3}</span></div>
            <div class="sc2"><span class="sc2-l">${this.t('unique')}</span><span class="sc2-v">${r.diffScore}%</span></div>
          </div>
          ${(r.rubricIds && r.rubricIds.length) ? `<div class="ms">${r.rubricIds.slice(0, 4).map(i => {
            const rr = this.rubIndex[i]; if (!rr) return '';
            return `<span class="msi rub" title="${esc(rr.p)}">R · ${esc(rr.seg[rr.seg.length - 1])}</span>`;
          }).join('')}</div>` : ''}
          ${(r.matchedIds || []).length ? `<div class="ms">${(r.matchedIds || []).slice(0, 8).map(id => {
            const s = S[id];
            if (!s) return '';
            const u = (r.uniqueIds || []).includes(id);
            const star = (rm.strong || []).includes(id) ? ' ★' : '';
            return `<span class="msi ${u ? 'u' : ''}">${esc(s.name)}${star}</span>`;
          }).join('')}</div>` : ''}
          <div class="ra">
            <button class="btn bg" data-dt="${r.code}">${this.t('details')}</button>
            <button class="btn bg" data-cm="${r.code}">${ic("compare","i-sm")} ${this.t('compare')}</button>
            <button class="btn bg" data-gr="${r.code}">${ic("graph","i-sm")} ${this.t('graph')}</button>
            <button class="btn bg" data-sr="${r.code}">${ic("study","i-sm")} ${this.t('study')}</button>
            <button class="btn bg ${this.pins.has(r.code) ? 'on' : ''}" data-pin="${r.code}" aria-pressed="${this.pins.has(r.code)}" title="${this.t('pinTip')}">${this.pins.has(r.code) ? this.t('pinned') : this.t('pin')}</button>
            <button class="btn bg" data-strike="${r.code}" title="${this.t('strikeTip')}">${this.t('strike')}</button>
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
    v.querySelectorAll('[data-strike]').forEach(b => b.addEventListener('click', e => {
      const c = e.currentTarget.dataset.strike;
      this.strike(c);
      this.undo(`Struck out ${H.DB.remedies[c].name}`, () => this.strike(c));
    }));
    v.querySelectorAll('[data-unstrike]').forEach(b => b.addEventListener('click', e => this.strike(e.currentTarget.dataset.unstrike)));
    v.querySelectorAll('[data-unstrike-all]').forEach(b => b.addEventListener('click', () => { this.struck.clear(); this.rr(); }));
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
      ['b-about', 'info', 'About & sources', 'Author, licence, data provenance'],
      ['b-qrub', 'study', 'Rare-rubric quiz', 'Which remedy does this two-remedy rubric separate?']
    ];
    $('md').innerHTML = `<div class="mh"><div><div class="mt">Tools</div><div class="msu">Everything outside the finder</div></div><button class="ib" id="mc">✕</button></div>
      <div class="mbd">
        <div class="langrow"><span>${this.t('language')}</span>
          <button class="btn bg btn-sm ${this.lang === 'en' ? 'on' : ''}" data-lang="en">English</button>
          <button class="btn bg btn-sm ${this.lang === 'hi' ? 'on' : ''}" data-lang="hi">हिंदी</button>
          <button class="btn bg btn-sm ${this.lang === 'gu' ? 'on' : ''}" data-lang="gu">ગુજરાતી</button>
          <button class="btn bg btn-sm" data-boardcmp="1">${this.t('compareBoards')}</button>
        </div>
        <div class="xm">${items.map(([id, e, t, d]) => `
        <button class="btn bg" data-tool="${id}" style="justify-content:flex-start;text-align:left;min-height:68px;flex-direction:column;align-items:flex-start;gap:3px;padding:12px 14px">
          <span style="font-weight:700;display:flex;align-items:center;gap:7px">${ic(e)} ${t}</span><span style="font-size:11.5px;color:var(--ink-2);font-weight:500;white-space:normal;text-align:left">${d}</span>
        </button>`).join('')}</div>
        <p class="srcl" style="margin-top:14px">${this.t('offNote')}</p></div>`;
    this.om();
    $('mc').onclick = () => this.cm();
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => { this.cm(); this.setLang(b.dataset.lang); }));
    const bc = document.querySelector('[data-boardcmp]');
    if (bc) bc.addEventListener('click', () => this.boardCompare());
    document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => {
      this.cm();
      if (b.dataset.tool === 'b-qrub') { setTimeout(() => this.qRubric(), 60); return; }
      const t = $(b.dataset.tool);
      if (t) setTimeout(() => t.click(), 60);
    }));
  };

  /* ---------- bindings ---------- */
  U.be = function () {
    if (this._bound) return;
    try {
      H.Exp = {
        open: () => U.expOpen(), close: () => U.expClose(),
        render: () => U.expRender(), bind: () => U.expBind(),
        build: () => { U.expBuild(); U.exp.built = true; },
        get nodes() { return U.exp.nodes; }, get edges() { return U.exp.edges; }
      };
    } catch (e) {}
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
    document.querySelectorAll('[data-picker]').forEach(b => b.addEventListener('click', () => this.setPickerMode(b.dataset.picker)));
    const bb = $('boards');
    if (bb) bb.addEventListener('click', e => {
      const toCase = e.target.closest('[data-board-case]');
      if (toCase) { this.boardToCase(this.activeBoard); return; }
      const add = e.target.closest('[data-board-add]');
      if (add) { this.boardAdd(); return; }
      const c = e.target.closest('[data-board]');
      if (!c) return;
      if (e.target.closest('[data-board-del]')) { this.boardDelete(c.dataset.board); return; }
      this.boardSwitch(c.dataset.board);
    });

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
      const rub = e.target.closest('[data-rub]');
      if (rub) { this.toggleRubric(parseInt(rub.dataset.rub, 10)); return; }
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
      const row = e.target.closest && e.target.closest('.sc');
      if (!row) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); row.click(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      const rows = [...document.querySelectorAll('#symptoms .sc')].filter(r => r.offsetParent !== null);
      const at = rows.indexOf(row);
      if (at < 0) return;
      e.preventDefault();
      let next = at;
      if (e.key === 'ArrowDown') next = Math.min(rows.length - 1, at + 1);
      if (e.key === 'ArrowUp') next = Math.max(0, at - 1);
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = rows.length - 1;
      if (rows[next] && rows[next] !== row) {
        rows[next].focus();
        rows[next].scrollIntoView({ block: 'nearest' });
      }
    });
    $('tray').addEventListener('click', e => {
      const w = e.target.closest('[data-wt]');
      if (w) { this.cycleWeight(parseInt(w.dataset.wt, 10)); return; }
      const rr = e.target.closest('[data-rmrub]');
      if (rr) { this.rubSel.delete(parseInt(rr.dataset.rmrub, 10)); this.rs(); this.rt(); if (this.s.view === 'results') this.rr(); return; }
      const r = e.target.closest('[data-rm]'); if (!r) return;
      const id = parseInt(r.dataset.rm, 10);
      const name = H.DB.symptoms[id] ? H.DB.symptoms[id].name : 'symptom';
      this.s.sel.delete(id); this.rs(); this.rt();
      if (this.s.view === 'results') this.rr();
      this.undo(`Removed “${name}”`, () => { this.s.sel.add(id); this.rs(); this.rt(); if (this.s.view === 'results') this.rr(); });
    });
    on('b-find', () => {
      if (!this.s.sel.size && !(this.rubSel && this.rubSel.size)) return this.toast('Select at least one symptom');
      this.rr();
    });

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
    if (r.quote2) {
      const secs = [...mbd.querySelectorAll('.msec')];
      const qsec = secs.find(s => /Source text/i.test((s.querySelector('h4') || {}).textContent || ''));
      if (qsec) {
        const src2 = (H.Src.r[r.qsrc2] || {});
        const d2 = document.createElement('div');
        d2.className = 'msec';
        d2.innerHTML = `<h4>Source text — ${esc(src2.n || 'Materia medica')} ${esc(src2.era || '')}</h4>
          <blockquote class="quote alt">${esc(r.quote2)}</blockquote>`;
        qsec.after(d2);
        const h = qsec.querySelector('h4');
        const src1 = (H.Src.r[r.qsrc] || {});
        if (h && src1.n) h.textContent = `Source text — ${src1.n} ${src1.era || ''}`;
      }
    }
    // thermal tendency, derived from thermal modalities
    const th = window.HRF_THERM && window.HRF_THERM[code];
    if (th && !document.querySelector('#md .thermal')) {
      const mbd0 = document.querySelector('#md .mbd');
      if (mbd0) {
        const label = th.t === 'chilly' ? 'Chilly patient' : th.t === 'hot' ? 'Hot patient' : 'Mixed thermal';
        const cls = th.t === 'chilly' ? 'cold' : th.t === 'hot' ? 'hot' : 'mixed';
        const ev = th.ev.map(([rub, g]) => `${this.esc(rub.replace(/ › /g, ' › '))} <b>${g}</b>`).join(' · ');
        const box = document.createElement('div');
        box.className = 'thermal ' + cls;
        box.innerHTML = `<span class="th-label">${label}</span>
          <span class="th-ev">from thermal modalities — ${ev}</span>
          <span class="th-note">cold ${th.c} · heat ${th.h} grade points</span>`;
        mbd0.insertBefore(box, mbd0.firstChild);
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

  /* ---------- about (replaces the v12 card) ---------- */
  U.showAbout = function () {
    const remCount = H.DB ? H.DB.remedyCount : 0;
    const symCount = H.DB ? H.DB.count : 0;
    const m = $('md');
    m.innerHTML = `<div class="mh"><div><div class="mt">About</div>
      <div class="msu">Remedy Finder ${this.appVersion || ''} · offline, no account, no tracking</div></div><button class="ib" id="mc">✕</button></div>
      <div class="mbd">
        <div class="about-card">
          <div class="about-avatar">SM</div>
          <div class="about-name">Dr. Sohil Momin</div>
          <div class="about-role">Homeopathic physician · builder of offline-first clinical tools</div>
          <p class="about-bio">A repertory and materia medica workbench for study and practice. It runs from a single file, works with the network off, and keeps cases on the device that made them.</p>
          <div class="about-meta">
            <span>${remCount} remedies</span><span>${symCount} symptoms</span>
            <span>${(H.DB.links || 0).toLocaleString('en-IN')} graded links</span><span>${this.dataVersion()}</span>
          </div>
          <div class="about-badges">
            <span class="about-badge">Educational tool</span><span class="about-badge">Offline-first</span>
            <span class="about-badge">No data collection</span><span class="about-badge">Open knowledge</span>
          </div>
          <p class="about-bio" style="font-size:12px">Intended for education and study. It does not provide medical advice, diagnosis or treatment. It ranks similarity to the symptoms you enter; the choice of remedy remains a clinician's.</p>
          <div class="xm" style="margin-top:12px">
            <button class="btn bp btn-sm" id="ab-prov">Sources & provenance</button>
            <button class="btn bg btn-sm" id="ab-lic">Licence</button>
          </div>
          <div class="about-footer">
            <strong>Materia medica:</strong> Boericke 1906 · Clarke 1900 · Kent 1904 · Allen 1916 · Nash 1899 · Guernsey 1886 (public domain)<br>
            <strong>Repertory grades:</strong> Repertorium Publicum (2008), Vladimir Polony — GPL v3<br>
            <strong>Code:</strong> PolyForm Noncommercial 1.0.0 · © 2026 Dr. Sohil Momin
          </div>
        </div>
      </div>`;
    this.om();
    $('mc').onclick = () => this.cm();
    const p = $('ab-prov'); if (p) p.onclick = () => { this.cm(); setTimeout(() => this.provenancePanel(), 60); };
    const l = $('ab-lic'); if (l) l.onclick = () => { this.cm(); setTimeout(() => this.provenancePanel(), 60); };
  };


  /* ---------- remedy explorer (force layout, labelled, filterable) ---------- */
  U.exp = { nodes: [], edges: [], zoom: 1, panX: 0, panY: 0, drag: false, lx: 0, ly: 0,
    group: '', thermal: '', q: '', hover: null, built: false };

  U.expOpen = function () {
    const host = $('xo');
    if (!host) return;
    host.classList.add('open');
    this.expFit(true);
    this.expBind();
    this.expRender();
  };

  U.expSize = function () {
    const cv = $('x-ca');
    return { w: Math.max(280, (cv && cv.clientWidth) || 360), h: Math.max(280, (cv && cv.clientHeight) || 480) };
  };

  /* rebuild the layout when the canvas size changes (first open, rotate, resize) */
  U.expFit = function (force) {
    const { w, h } = this.expSize();
    const E = this.exp;
    if (!force && E.built && Math.abs((E.w || 0) - w) < 24 && Math.abs((E.h || 0) - h) < 24) return;
    E.w = w; E.h = h;
    this.expBuild(w, h);
    E.built = true;
    E.zoom = 1; E.panX = 0; E.panY = 0;
  };

  U.expBuild = function (W, Hh) {
    const R = H.DB.remedies, E = this.exp;
    W = W || 1200; Hh = Hh || 800;
    E.W = W; E.H = Hh;
    const codes = Object.keys(R);
    E.nodes = codes.map(code => {
      const r = R[code];
      const rel = r.relationships || {};
      const deg = (rel.comp || []).length + (rel.antid || []).length + (rel.follows || []).length;
      return { code, name: r.name, group: r.group || 'plant', family: r.family || 'Other', deg };
    });
    const byCode = {}; E.nodes.forEach(n => byCode[n.code] = n);
    E.edges = [];
    codes.forEach(code => {
      const rel = R[code].relationships || {};
      (rel.comp || []).forEach(t => { if (byCode[t]) E.edges.push({ a: code, b: t, t: 'comp' }); });
      (rel.antid || []).forEach(t => { if (byCode[t]) E.edges.push({ a: code, b: t, t: 'antid' }); });
      (rel.follows || []).forEach(t => { if (byCode[t]) E.edges.push({ a: code, b: t, t: 'follows' }); });
    });
    // deterministic start: circle grouped by family
    const fams = [...new Set(E.nodes.map(n => n.family))].sort();
    const famAngle = {}; fams.forEach((f, i) => famAngle[f] = (i / fams.length) * Math.PI * 2);
    const perFam = {}; E.nodes.forEach(n => perFam[n.family] = (perFam[n.family] || 0) + 1);
    const seen = {};
    E.nodes.forEach(n => {
      seen[n.family] = (seen[n.family] || 0) + 1;
      const a = famAngle[n.family] + (seen[n.family] / perFam[n.family]) * 0.9;
      const rad = 120 + (perFam[n.family] / E.nodes.length) * 420 + (seen[n.family] % 3) * 40;
      n.x = W / 2 + Math.cos(a) * rad;
      n.y = Hh / 2 + Math.sin(a) * rad;
      n.vx = 0; n.vy = 0;
    });
    // force relaxation
    const idx = {}; E.nodes.forEach(n => idx[n.code] = n);
    const N = E.nodes.length;
    const compact = Math.max(1, Math.min(3.4, 1200 / Math.min(W, Hh)));
    const REP = 3600 * compact;
    for (let it = 0; it < 380; it++) {
      const cool = 1 - it / 420;
      for (let i = 0; i < N; i++) {
        const a = E.nodes[i];
        for (let j = i + 1; j < N; j++) {
          const b = E.nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 0.01;
          if (d2 > 160000) continue;
          const f = REP / d2;
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          a.vx += dx * f; a.vy += dy * f;
          b.vx -= dx * f; b.vy -= dy * f;
        }
      }
      E.edges.forEach(e => {
        const a = idx[e.a], b = idx[e.b];
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - (compact > 1.8 ? 55 : 115)) * 0.010;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      });
      E.nodes.forEach(n => {
        n.vx += (W / 2 - n.x) * 0.0016;
        n.vy += (Hh / 2 - n.y) * 0.0016;
        n.x += Math.max(-12, Math.min(12, n.vx * cool));
        n.y += Math.max(-12, Math.min(12, n.vy * cool));
        n.vx *= 0.72; n.vy *= 0.72;
      });
    }
    // fit the relaxed layout into the viewport with a margin
    const xs = E.nodes.map(n => n.x), ys = E.nodes.map(n => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = Math.max(26, Math.min(70, Math.round(Math.min(W, Hh) * 0.09)));
    const availW = W - pad * 2, availH = Hh - pad * 2;
    const sx = availW / Math.max(1, maxX - minX), sy = availH / Math.max(1, maxY - minY);
    const s = Math.min(sx, sy);
    const ox = pad + (availW - (maxX - minX) * s) / 2, oy = pad + (availH - (maxY - minY) * s) / 2;
    E.nodes.forEach(n => {
      n.x = ox + (n.x - minX) * s;
      n.y = oy + (n.y - minY) * s;
      const small = Math.min(W, Hh) < 620;
      n.r = (small ? 3.2 : 4) + Math.min(small ? 4.5 : 7, n.deg * (small ? 0.5 : 0.7));
    });
  };

  U.expVisible = function () {
    const E = this.exp, q = (E.q || '').toLowerCase();
    const out = E.nodes.filter(n => {
      if (E.group && n.group !== E.group) return false;
      if (E.thermal) {
        const th = (window.HRF_THERM || {})[n.code];
        const t = th ? th.t : 'none';
        if (E.thermal === 'none' ? t !== 'none' : t !== E.thermal) return false;
      }
      if (q && !n.name.toLowerCase().includes(q)) return false;
      return true;
    });
    return out;
  };

  U.expRender = function () {
    const E = this.exp, host = $('x-ca');
    if (!host) return;
    const W = host.clientWidth || 1200, Hh = host.clientHeight || 800;
    const vis = this.expVisible();
    const visSet = new Set(vis.map(n => n.code));
    const nbr = new Set();
    if (E.hover) E.edges.forEach(e => {
      if (e.a === E.hover) nbr.add(e.b);
      if (e.b === E.hover) nbr.add(e.a);
    });
    const cols = { plant: '#0f766e', mineral: '#6366f1', animal: '#dc2626', nosode: '#7c3aed', metal: '#d97706' };
    const byCode = {}; E.nodes.forEach(n => byCode[n.code] = n);
    let svg = `<svg width="${W}" height="${Hh}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `<g transform="translate(${E.panX},${E.panY}) scale(${E.zoom})">`;
    svg += E.edges.filter(e => visSet.has(e.a) && visSet.has(e.b)).map(e => {
      const a = byCode[e.a], b = byCode[e.b];
      if (!a || !b) return '';
      const hot = E.hover && (e.a === E.hover || e.b === E.hover);
      const dash = e.t === 'antid' ? ' stroke-dasharray="3 3"' : (e.t === 'follows' ? ' stroke-dasharray="1 3"' : '');
      return `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"
        stroke="${hot ? '#0f766e' : '#b9c2c9'}" stroke-width="${hot ? 1.4 : 0.6}" opacity="${hot ? 0.9 : 0.35}"${dash}/>`;
    }).join('');
    svg += vis.map(n => {
      const dim = E.hover && E.hover !== n.code && !nbr.has(n.code);
      const fill = cols[n.group] || '#0f766e';
      return `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r}" fill="${fill}"
        opacity="${dim ? 0.18 : 1}" stroke="${E.hover === n.code ? '#111' : 'none'}" stroke-width="1.5"/>`;
    }).join('');
    // labels — avoid other labels AND other nodes
    const boxes = [];
    const nodeBoxes = vis.map(n => ({ x: n.x - n.r - 2, y: n.y - n.r - 2, w: n.r * 2 + 4, h: n.r * 2 + 4, code: n.code }));
    const hit = (b, x, y, w, h) => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y;
    const avoidNodes = Math.min(W, Hh) >= 620;   // small screens: halo instead, keeps density up
    const fits = (x, y, w, h, own) => {
      for (const b of boxes) if (hit(b, x, y, w, h)) return false;
      if (avoidNodes) for (const b of nodeBoxes) if (b.code !== own && hit(b, x, y, w, h)) return false;
      boxes.push({ x, y, w, h });
      return true;
    };
    const order = vis.slice().sort((a, b) => b.deg - a.deg);
    let shown = 0;
    const labels = order.map(n => {
      const txt = n.name;
      const zf = Math.max(0.5, Math.min(3, E.zoom));
      const fs = Math.min(W, Hh) < 620 ? 11 : 9.5;
      const w = (txt.length * fs * 0.60 + 2) / zf, h = (fs + 3) / zf;
      const important = E.hover === n.code || nbr.has(n.code);
      const gap = (n.r + 3) / zf;
      const cands = [
        { x: n.x + gap, y: n.y - h / 2, anchor: 'start' },
        { x: n.x - gap - w, y: n.y - h / 2, anchor: 'start' },
        { x: n.x - w / 2, y: n.y - gap - h, anchor: 'start' },
        { x: n.x - w / 2, y: n.y + gap, anchor: 'start' }
      ];
      let spot = null;
      for (const c of cands) {
        if (c.x < 4 || c.x + w > W - 4 || c.y < 2 || c.y + h > Hh - 2) continue;
        if (fits(c.x, c.y, w, h, n.code)) { spot = c; break; }
      }
      if (!spot) {
        if (!important) return '';
        spot = cands[0];
      }
      shown++;
      const dim = E.hover && E.hover !== n.code && !nbr.has(n.code);
      return `<text x="${spot.x.toFixed(1)}" y="${(spot.y + h * 0.78).toFixed(1)}" font-size="${fs}"
        fill="${dim ? '#9aa4ac' : '#2b3238'}" font-weight="${E.hover === n.code ? 700 : 500}"
        stroke="#fff" stroke-width="${avoidNodes ? 2 : 2.8}" paint-order="stroke" stroke-linejoin="round">${this.esc(txt)}</text>`;
    }).join('');
    svg += labels + '</g></svg>';
    host.innerHTML = svg;
    const info = $('x-in');
    if (info) info.textContent = `${vis.length} of ${E.nodes.length} remedies · ${shown} labelled · ${E.edges.length} relationships`;
  };

  U.expBind = function () {
    const E = this.exp, cv = $('x-ca');
    if (!cv) { this.expWire(); return; }
    if (cv.dataset.bound) { this.expWire(); return; }
    cv.dataset.bound = '1';
    const pts = new Map();
    let pinchStart = null, tapStart = null;

    const local = e => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const zoomAt = (mx, my, k) => {
      const nz = Math.max(0.25, Math.min(8, E.zoom * k));
      E.panX = mx - (mx - E.panX) * (nz / E.zoom);
      E.panY = my - (my - E.panY) * (nz / E.zoom);
      E.zoom = nz;
    };

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const p = local(e);
      zoomAt(p.x, p.y, e.deltaY > 0 ? 0.88 : 1.14);
      this.expRender();
    }, { passive: false });

    cv.addEventListener('pointerdown', e => {
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: E.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      } else {
        tapStart = { t: Date.now(), x: p.x, y: p.y, moved: 0 };
        E.drag = true; E.lx = e.clientX; E.ly = e.clientY;
        cv.style.cursor = 'grabbing';
      }
    });

    cv.addEventListener('pointermove', e => {
      const p = local(e);
      if (pts.has(e.pointerId)) pts.set(e.pointerId, p);
      if (pts.size === 2 && pinchStart) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const target = pinchStart.zoom * (d / Math.max(1, pinchStart.d));
        const k = target / E.zoom;
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, k);
        this.expRender();
        return;
      }
      if (E.drag && pts.size === 1) {
        const dx = e.clientX - E.lx, dy = e.clientY - E.ly;
        if (tapStart) tapStart.moved += Math.abs(dx) + Math.abs(dy);
        E.panX += dx; E.panY += dy;
        E.lx = e.clientX; E.ly = e.clientY;
        this.expRender();
        return;
      }
      if (e.pointerType === 'mouse') this.expHoverFromTarget(e, cv);
    });

    const end = e => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinchStart = null;
      if (pts.size === 0) { E.drag = false; cv.style.cursor = 'grab'; }
      if (tapStart && Date.now() - tapStart.t < 500 && tapStart.moved < 14) {
        const code = this.expNodeAt(tapStart.x, tapStart.y);
        if (code) { this.expClose(); this.showDetail(code); }
      }
      tapStart = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);

    // keyboard: arrows pan, +/- zoom
    cv.setAttribute('tabindex', '0');
    cv.addEventListener('keydown', e => {
      const step = 40;
      if (e.key === 'ArrowLeft') E.panX += step;
      else if (e.key === 'ArrowRight') E.panX -= step;
      else if (e.key === 'ArrowUp') E.panY += step;
      else if (e.key === 'ArrowDown') E.panY -= step;
      else if (e.key === '+' || e.key === '=') zoomAt((E.w || 400) / 2, (E.h || 400) / 2, 1.2);
      else if (e.key === '-') zoomAt((E.w || 400) / 2, (E.h || 400) / 2, 0.83);
      else return;
      e.preventDefault(); this.expRender();
    });

    let rt = null;
    window.addEventListener('resize', () => {
      if (!$('xo') || !$('xo').classList.contains('open')) return;
      clearTimeout(rt);
      rt = setTimeout(() => { this.expFit(false); this.expRender(); }, 180);
    });
    this.expWire();
  };

  U.expNodeAt = function (mx, my) {
    const E = this.exp;
    const lx = (mx - E.panX) / E.zoom, ly = (my - E.panY) / E.zoom;
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const slack = touch ? 18 : 7;
    let best = null, bd = 1e9;
    this.expVisible().forEach(n => {
      const d = (n.x - lx) ** 2 + (n.y - ly) ** 2;
      if (d < bd) { bd = d; best = n; }
    });
    return best && bd <= (best.r + slack) ** 2 ? best.code : null;
  };

  U.expHoverFromTarget = function (e, cv) {
    const E = this.exp;
    const rect = cv.getBoundingClientRect();
    const mx = (e.clientX - rect.left - E.panX) / E.zoom;
    const my = (e.clientY - rect.top - E.panY) / E.zoom;
    let best = null, bd = 1e9;
    this.expVisible().forEach(n => {
      const d = (n.x - mx) ** 2 + (n.y - my) ** 2;
      if (d < bd) { bd = d; best = n; }
    });
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const slack = touch ? 16 : 6;
    const hit = best && bd <= (best.r + slack) ** 2 ? best.code : null;
    cv.dataset.hoverCode = hit || '';
    if (hit !== E.hover) { E.hover = hit; this.expRender(); }
  };

  U.expWire = function () {
    const E = this.exp;
    const on = (id, fn) => { const el = $(id); if (el && !el.dataset.w) { el.dataset.w = '1'; el.addEventListener('click', fn); } };
    on('x-cl', () => this.expClose());
    on('x-zi', () => { E.zoom = Math.min(6, E.zoom * 1.25); this.expRender(); });
    on('x-zo', () => { E.zoom = Math.max(0.25, E.zoom / 1.25); this.expRender(); });
    on('x-re', () => { E.zoom = 1; E.panX = 0; E.panY = 0; E.group = ''; E.thermal = ''; E.q = ''; E.hover = null;
      const g = $('x-gr'); if (g) g.value = ''; const s = $('x-se'); if (s) s.value = ''; const t = $('x-th'); if (t) t.value = ''; this.expRender(); });
    const se = $('x-se');
    if (se && !se.dataset.w) { se.dataset.w = '1'; se.addEventListener('input', e => { E.q = e.target.value; this.expRender(); }); }
    const gr = $('x-gr');
    if (gr && !gr.dataset.w) { gr.dataset.w = '1'; gr.addEventListener('change', e => { E.group = e.target.value; this.expRender(); }); }
    const th = $('x-th');
    if (th && !th.dataset.w) { th.dataset.w = '1'; th.addEventListener('change', e => { E.thermal = e.target.value; this.expRender(); }); }
  };

  U.expClose = function () { const h = $('xo'); if (h) h.classList.remove('open'); this.exp.hover = null; };

  /* ---------- sources & provenance ---------- */
  U.provenancePanel = function () {
    const R = H.DB.remedies, codes = Object.keys(R);
    const srcCount = {};
    let quoted = 0, dual = 0;
    codes.forEach(c => {
      const r = R[c];
      if (r.quote) { quoted++; srcCount[r.qsrc] = (srcCount[r.qsrc] || 0) + 1; }
      if (r.quote2) { dual++; srcCount[r.qsrc2] = (srcCount[r.qsrc2] || 0) + 1; }
    });
    const links = H.DB.links || 0;
    const rub = (window.HRF_RUB && window.HRF_RUB.r) ? window.HRF_RUB.r.length : 0;
    const rare = (window.HRF_RUB && window.HRF_RUB.r) ? window.HRF_RUB.r.filter(x => x[1].length === 4).length : 0;
    const srcName = k => (H.Src.r[k] || {}).n || k;
    const srcEra = k => (H.Src.r[k] || {}).era || '';
    const rows = Object.entries(srcCount).sort((a, b) => b[1] - a[1]);
    const m = $('md');
    m.innerHTML = `<div class="mh"><div><div class="mt">Sources & provenance</div>
      <div class="msu">What is in this app, where it came from, and what it cannot do</div></div><button class="ib" id="mc">✕</button></div>
      <div class="mbd">
        <div class="offgrid">
          <div class="offrow"><span>Remedies</span><b>${codes.length}</b></div>
          <div class="offrow"><span>Symptoms (curated)</span><b>${H.DB.count}</b></div>
          <div class="offrow"><span>Graded symptom links</span><b>${links.toLocaleString('en-IN')}</b></div>
          <div class="offrow"><span>Repertory rubrics</span><b>${rub ? rub.toLocaleString('en-IN') : 'not in this build'}</b></div>
          ${rub ? `<div class="offrow"><span>· of which two-remedy rubrics</span><b>${rare.toLocaleString('en-IN')}</b></div>` : ''}
          <div class="offrow"><span>Remedies with a quotation</span><b>${quoted}${dual ? ` · ${dual} with two` : ''}</b></div>
          <div class="offrow"><span>Data edition</span><b>${this.dataVersion()}</b></div>
        </div>

        <div class="msec" style="margin-top:16px"><h4>Quotations by source</h4>
          <div class="offgrid">${rows.map(([k, n]) => `<div class="offrow"><span>${this.esc(srcName(k))} ${this.esc(srcEra(k))}</span><b>${n}</b></div>`).join('') || '<div class="offrow"><span>None</span><b>0</b></div>'}</div>
        </div>

        <div class="msec" style="margin-top:16px"><h4>Licences</h4>
          <ul class="cmp-list">
            <li>Repertorium Publicum (2008), Vladimir Polony — GPL v3 <span>repertory grades and rubric paths</span></li>
            <li>Boericke 1906, Kent 1904, Allen 1916, Clarke 1900, Nash 1899, Guernsey 1886 — public domain <span>materia medica text</span></li>
            <li>Application code — PolyForm Noncommercial 1.0.0 <span>free for study, teaching and noncommercial practice</span></li>
          </ul>
        </div>

        <div class="msec" style="margin-top:16px"><h4>What this app does not do</h4>
          <ul class="cmp-list">
            <li>It does not diagnose and does not prescribe. <span>it ranks similarity to the symptoms you enter</span></li>
            <li>It does not grade Kent 1897 links. <span>the grades come from Repertorium Publicum only</span></li>
            <li>It does not contain single-remedy rubrics. <span>one remedy cannot discriminate</span></li>
            <li>It does not cover every Boericke entry. <span>379 of roughly 700 were extracted</span></li>
            <li>It does not send anything anywhere. <span>no network calls at runtime</span></li>
          </ul>
        </div>
      </div>`;
    this.om();
    $('mc').onclick = () => this.cm();
  };

  /* ---------- compare two cases ---------- */
  U.caseDiffPick = async function (id) {
    const c = await H.Clinic.get(id);
    if (!c) return this.toast('Case not found');
    const all = (await H.Clinic.all()).filter(x => x.id !== id);
    if (!all.length) return this.toast('Only one case on this device');
    const m = document.getElementById('md');
    m.innerHTML = `<div class="mh"><div><div class="mt">Compare “${this.esc(c.name || 'Untitled')}” with…</div>
      <div class="msu">Follow-up or a second opinion, side by side</div></div><button class="ib" id="mc">✕</button></div>
      <div class="mbd"><div class="offgrid">${all.slice(0, 20).map(x =>
        `<div class="offrow"><span>${this.esc(x.name || 'Untitled')} · ${this.esc((x.complaint || '').slice(0, 30))}</span>
         <b><button class="btn bg btn-sm" data-cmp="${x.id}">Compare</button></b></div>`).join('')}</div></div>`;
    this.om();
    document.getElementById('mc').onclick = () => this.cm();
    m.querySelectorAll('[data-cmp]').forEach(b => b.addEventListener('click', () => this.caseDiff(id, b.dataset.cmp)));
  };

  U.caseDiff = async function (aId, bId) {
    const [a, b] = [await H.Clinic.get(aId), await H.Clinic.get(bId)];
    if (!a || !b) return this.toast('Case not found');
    const sa = new Set(a.selectedIds || []), sb = new Set(b.selectedIds || []);
    const onlyA = [...sa].filter(i => !sb.has(i) && H.DB.symptoms[i]);
    const onlyB = [...sb].filter(i => !sa.has(i) && H.DB.symptoms[i]);
    const both = [...sa].filter(i => sb.has(i) && H.DB.symptoms[i]);
    const rA = H.Sc.rank([...sa], a.mode || 'acute', {}).slice(0, 12);
    const rB = H.Sc.rank([...sb], b.mode || 'acute', {}).slice(0, 12);
    const posA = {}, posB = {};
    rA.forEach((r, i) => posA[r.code] = i + 1);
    rB.forEach((r, i) => posB[r.code] = i + 1);
    const codes = [...new Set([...rA.map(r => r.code), ...rB.map(r => r.code)])]
      .sort((x, y) => (posB[x] || 99) - (posB[y] || 99));
    const nm = code => (H.DB.remedies[code] || {}).name || code;
    const m = document.getElementById('md');
    m.innerHTML = `<div class="mh"><div><div class="mt">Case comparison</div>
      <div class="msu">${this.esc(a.name || 'A')} → ${this.esc(b.name || 'B')}</div></div><button class="ib" id="mc">✕</button></div>
      <div class="mbd">
        <div class="offgrid">
          <div class="offrow"><span>Symptoms in both</span><b class="good">${both.length}</b></div>
          <div class="offrow"><span>Only in “${this.esc(a.name || 'A')}”</span><b>${onlyA.length}</b></div>
          <div class="offrow"><span>Only in “${this.esc(b.name || 'B')}”</span><b>${onlyB.length}</b></div>
        </div>
        ${onlyB.length ? `<div class="msec" style="margin-top:14px"><h4>Added since</h4><ul class="cmp-list">${onlyB.map(i => `<li>+ ${this.esc(H.DB.symptoms[i].name)} <span>${this.esc(H.DB.symptoms[i].cat)}</span></li>`).join('')}</ul></div>` : ''}
        ${onlyA.length ? `<div class="msec" style="margin-top:14px"><h4>No longer present</h4><ul class="cmp-list">${onlyA.map(i => `<li>− ${this.esc(H.DB.symptoms[i].name)} <span>${this.esc(H.DB.symptoms[i].cat)}</span></li>`).join('')}</ul></div>` : ''}
        <div class="msec" style="margin-top:14px"><h4>Remedy movement (top 12)</h4>
          <table class="cmp-table"><thead><tr><th>Remedy</th><th class="n">${this.esc(a.name || 'A')}</th><th class="n">${this.esc(b.name || 'B')}</th><th class="n">Move</th></tr></thead>
          <tbody>${codes.map(code => {
            const pa = posA[code] || null, pb = posB[code] || null;
            const move = (pa && pb) ? (pa - pb) : null;
            const cls = move === null ? '' : (move > 0 ? 'good' : (move < 0 ? 'bad' : ''));
            const txt = move === null ? (pa ? 'dropped out' : 'new') : (move === 0 ? '—' : (move > 0 ? '↑' + move : '↓' + (-move)));
            return `<tr><td>${this.esc(nm(code))}</td><td class="n">${pa || '—'}</td><td class="n">${pb || '—'}</td><td class="n ${cls}">${txt}</td></tr>`;
          }).join('')}</tbody></table>
          <p class="srcl" style="margin-top:8px">Positions are ranks within the top 12 of each repertorisation. Movement is not evidence of improvement — it reflects the symptoms recorded.</p>
        </div>
      </div>`;
    this.om();
    document.getElementById('mc').onclick = () => this.cm();
  };

  /* ---------- printable case sheet ---------- */
  U.caseSheetHTML = async function (id) {
    const c = await H.Clinic.get(id);
    if (!c) return null;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const date = new Date(c.date || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const ids = (c.selectedIds || []).filter(i => H.DB.symptoms[i]);
    const syms = ids.map(i => H.DB.symptoms[i]);
    const ranked = ids.length ? H.Sc.rank(ids, c.mode || 'acute', {}) : [];
    const top = ranked.slice(0, 10);
    const chapters = {};
    syms.forEach(s => { chapters[s.cat] = (chapters[s.cat] || 0) + 1; });

    const quoteFor = code => {
      const r = H.DB.remedies[code];
      if (!r || !r.quote) return '';
      const src = (H.Src && H.Src.r && H.Src.r[r.qsrc]) ? H.Src.r[r.qsrc].n : (r.qsrc || 'source');
      return `<div class="pc-q"><b>${esc(r.name)}</b> — <i>“${esc(String(r.quote).slice(0, 320))}”</i><br><span style="font-size:10px;color:#777">${esc(src)}</span></div>`;
    };

    return `
      <h1>${esc(c.name || 'Untitled case')}</h1>
      <p class="pc-sub">Case summary · ${esc(date)} · ${esc((c.mode || 'acute'))} repertorisation</p>
      <div class="pc-grid">
        ${c.age ? `<div><b>Age</b> ${esc(c.age)}</div>` : ''}
        ${c.gender ? `<div><b>Sex</b> ${esc(c.gender)}</div>` : ''}
        ${c.phone ? `<div><b>Phone</b> ${esc(c.phone)}</div>` : ''}
        ${c.status ? `<div><b>Status</b> ${esc(c.status)}</div>` : ''}
      </div>
      ${c.complaint ? `<h2>Complaint</h2><p style="font-size:11.5px;line-height:1.55;margin:0">${esc(c.complaint)}</p>` : ''}
      ${c.notes ? `<h2>Notes</h2><p style="font-size:11.5px;line-height:1.55;margin:0;white-space:pre-wrap">${esc(c.notes)}</p>` : ''}
      ${syms.length ? `<h2>Symptoms (${syms.length})</h2>
        <ol>${syms.map(s => {
          let n = '';
          try { const f = H.U.freq(s.id); n = f instanceof Map ? (f.get(s.id) || '') : (typeof f === 'number' ? f : ''); } catch (e) {}
          return `<li>${esc(s.name)} <span style="color:#777;font-size:10.5px">· ${esc(s.cat)}${n ? ' · ' + n + ' remedies' : ''}${s.rare ? ' · rare' : ''}</span></li>`;
        }).join('')}</ol>
        <p style="font-size:10.5px;color:#777;margin:6px 0 0">Chapters: ${Object.entries(chapters).map(([k, v]) => `${esc(k)} ${v}`).join(' · ')}</p>` : '<h2>Symptoms</h2><p style="font-size:11.5px;color:#777;margin:0">No symptoms recorded against this case.</p>'}
      ${top.length ? `<h2>Remedies by similarity (top ${top.length})</h2>
        <table><thead><tr><th>#</th><th>Remedy</th><th class="n">Score</th><th class="n">Matched</th><th>Family</th></tr></thead>
        <tbody>${top.map((r, i) => {
          const rem = H.DB.remedies[r.code] || {};
          return `<tr><td>${i + 1}</td><td>${esc(rem.name || r.code)}</td><td class="n">${(r.matchScore != null ? r.matchScore : r.score || 0).toFixed(1)}</td><td class="n">${r.matchCount || 0}/${syms.length}</td><td>${esc(rem.family || '')}</td></tr>`;
        }).join('')}</tbody></table>
        <p style="font-size:10.5px;color:#777;margin:6px 0 0">Ranking is similarity to the symptoms entered, not a diagnosis or a prescription.</p>` : ''}
      ${top.slice(0, 3).map(r => quoteFor(r.code)).join('')}
      <div class="pc-foot">
        Remedy Finder ${H.U.appVersion || ''} · repertory data edition ${H.U.dataVersion ? H.U.dataVersion() : ''} · generated ${new Date().toLocaleString('en-IN')}<br>
        Grades from Repertorium Publicum (2008); materia medica quotations from public-domain sources. Educational tool — it ranks similarity and does not diagnose or prescribe.
      </div>`;
  };

  U.printCase = async function (id) {
    const c = await H.Clinic.get(id);
    if (!c) return this.toast('Case not found');
    const host = document.getElementById('pc');
    if (!host) return;
    const html = await this.caseSheetHTML(id);
    if (!html) return this.toast('Case not found');
    host.innerHTML = html;

    document.body.classList.add('print-case');
    const t = document.title;
    document.title = `${c.name || 'Case'} — Remedy Finder`;
    const done = () => {
      document.body.classList.remove('print-case');
      document.title = t;
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 120);
  };



  /* ---------- study centre (rewritten) ---------- */
  U.showStudy = function () {
    const daily = this.daily();
    const streak = H.SRS.streak();
    const cards = (H.SRS.all ? H.SRS.all().length : 0);
    const m = $('md');
    const tile = (id, icon, title, sub) => `<button class="btn bg study-tile" data-study="${id}">
      <span class="st-ico">${ic(icon)}</span>
      <span class="st-t">${title}</span><span class="st-s">${sub}</span></button>`;
    m.innerHTML = `<div class="mh"><div><div class="mt">Study</div>
      <div class="msu">${cards} card${cards === 1 ? '' : 's'} in rotation · ${streak.current}-day streak</div></div>
      <button class="ib" id="mc">✕</button></div>
      <div class="mbd">
        <div class="study-daily">
          <div class="sd-k">Daily remedy</div>
          <div class="sd-n">${this.esc(daily.name)} <em>${this.esc(daily.latin)}</em></div>
          <p>${this.esc(String(daily.description || '').slice(0, 220))}…</p>
          <button class="btn bp btn-sm" id="sd-open">Open monograph</button>
        </div>
        <div class="study-grid">
          ${tile('guess', 'results', 'Guess the remedy', 'Symptoms only — pick the remedy')}
          ${tile('diff', 'compare', 'Differential', 'Two remedies, which fits?')}
          ${tile('key', 'tools', 'Keynote', 'One characteristic line')}
          ${tile('qcase', 'cases', 'Case', 'Short case, choose the remedy')}
          ${tile('qrub', 'study', 'Rare-rubric quiz', 'Two or three remedies only')}
          ${tile('srs', 'study', 'Spaced repetition', 'Review what is due today')}
          ${tile('pot', 'info', 'Potency', 'Potency and dose questions')}
          ${tile('cal', 'cases', 'Calendar', 'Your review history')}
          ${tile('fam', 'graph', 'Families', 'Remedies by botanical family')}
        </div>
      </div>`;
    this.om();
    $('mc').onclick = () => this.cm();
    $('sd-open').onclick = () => this.showDetail(daily.code);
    m.querySelectorAll('[data-study]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.study;
      if (k === 'qrub') { this.qRubric(); return; }
      if (k === 'cal') { this.cm(); H.Cal.open(); return; }
      if (k === 'fam') { this.cm(); H.Fam.open(); return; }
      if (k === 'srs') { this.showSRS(); return; }
      if (k === 'guess') { this.qGuess(); return; }
      if (k === 'diff') { this.qDiff(); return; }
      if (k === 'key') { this.qKey(); return; }
      if (k === 'qcase') { this.qCase(); return; }
      if (k === 'pot') { this.showPotency(); return; }
    }));
  };

  /* ---------- rare-rubric quiz ---------- */
  U.qRubric = function () {
    if (!window.HRF_RUB) return this.toast('The repertory is a separate file — use the full build for this quiz');
    if (!this.rubIndex) this.parseRepertory();
    const D = window.HRF_RUB;
    const pool = [];
    for (let i = 0; i < D.r.length; i++) {
      const enc = D.r[i][1];
      const n = enc.length / 2;
      if (n === 2 || n === 3) pool.push(i);
    }
    if (!pool.length) return this.toast('No rare rubrics available');
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const r = this.rubric(pick);
    const codes = Object.keys(r.g);
    const correct = codes[Math.floor(Math.random() * codes.length)];
    const opts = new Set([correct]);
    const sameKingdom = Object.keys(H.DB.remedies).filter(c =>
      c !== correct && (H.DB.remedies[c].group === H.DB.remedies[correct].group));
    const others = Object.keys(H.DB.remedies).filter(c => c !== correct);
    while (opts.size < 4) {
      const src = Math.random() < 0.6 ? sameKingdom : others;
      opts.add(src[Math.floor(Math.random() * src.length)]);
    }
    const list = [...opts].sort(() => Math.random() - 0.5);
    const m = document.getElementById('md');
    const render = (answered, chosen) => {
      m.innerHTML = `<div class="mh"><div><div class="mt">Which remedy is characteristic here?</div>
        <div class="msu">${r.p} · carried by ${codes.length} remedies</div></div><button class="ib" id="mc">✕</button></div>
        <div class="mbd">
          <div class="qz-rubric">${this.esc(r.p)}</div>
          <div class="qz-opts">${list.map(c => {
            const rem = H.DB.remedies[c] || {};
            const isCorrect = c === correct;
            const cls = answered ? (isCorrect ? 'right' : (c === chosen ? 'wrong' : 'dim')) : '';
            return `<button class="qz-opt ${cls}" data-opt="${c}" ${answered ? 'disabled' : ''}>
              ${this.esc(rem.name || c)}<span>${this.esc(rem.family || '')}</span></button>`;
          }).join('')}</div>
          ${answered ? `<div class="qz-fb ${chosen === correct ? 'ok' : 'no'}">
            ${chosen === correct ? 'Correct' : 'Not this one'} — <b>${this.esc(H.DB.remedies[correct].name)}</b>, grade ${r.g[correct]} in this rubric.
            ${codes.length === 2 ? 'A two-remedy rubric: it separates exactly two remedies.' : ''}
          </div>
          <div class="xm" style="margin-top:12px">
            <button class="btn bp" id="qz-next">Next rubric</button>
            <button class="btn bg" id="qz-open">Open the rubric</button>
          </div>` : '<p class="srcl" style="margin-top:10px">Rare rubrics only — two or three remedies, the ones that discriminate.</p>'}
        </div>`;
      this.om();
      document.getElementById('mc').onclick = () => this.cm();
      if (!answered) {
        m.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => render(true, b.dataset.opt));
      } else {
        document.getElementById('qz-next').onclick = () => this.qRubric();
        document.getElementById('qz-open').onclick = () => {
          if (!this.rubSel) this.rubSel = new Set();
          this.rubSel.add(pick);
          this.cm();
          this.setPickerMode('rubrics');
          this.toast('Rubric added to the picture');
        };
      }
    };
    render(false, null);
  };

  /* ---------- case sheet download ---------- */
  U.downloadCase = async function (id) {
    const c = await H.Clinic.get(id);
    if (!c) return this.toast('Case not found');
    const body = await this.caseSheetHTML(id);
    if (!body) return;
    const css = `body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;
      max-width:760px;margin:32px auto;padding:0 20px;line-height:1.45}
      h1{font-size:22px;margin:0 0 2px} .pc-sub{font-size:12px;color:#666;margin:0 0 18px}
      .pc-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px;margin-bottom:14px;font-size:12.5px}
      h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#666;margin:18px 0 6px;
        border-bottom:1px solid #ddd;padding-bottom:3px}
      ol,ul{margin:0;padding-left:20px;font-size:12.5px;line-height:1.5}
      table{width:100%;border-collapse:collapse;font-size:12.5px}
      th,td{text-align:left;padding:4px 6px;border-bottom:1px solid #eee}
      th{font-weight:600;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
      td.n{text-align:right} .pc-q{margin:10px 0;font-size:12.5px;line-height:1.55}
      .pc-q i{color:#444} .pc-foot{margin-top:22px;padding-top:10px;border-top:1px solid #ddd;font-size:10.5px;color:#777}
      @media print{body{margin:0;max-width:none}@page{margin:16mm 14mm}}`;
    const title = (c.name || 'Case').replace(/[<>&]/g, '');
    const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>${title} — Remedy Finder case sheet</title><style>${css}</style></head>
      <body class="pc">${body}</body></html>`;
    const fname = `case-${(c.name || 'sheet').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sheet'}.html`;
    H.Ex.dl(fname, doc, 'text/html');
    this.toast('Case sheet downloaded — open it, then print or save as PDF');
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

  /* ---------- compare boards ---------- */
  U.boardCompare = function () {
    const boards = this.boards.filter(b => (b.sel || []).length);
    if (boards.length < 2) { this.toast('Add symptoms to two boards first'); return; }
    const rows = {};
    boards.forEach((b) => {
      const res = H.Sc.rank(b.sel, this.s.mode, b.weights || {});
      res.slice(0, 12).forEach((r, i) => {
        if (!rows[r.code]) rows[r.code] = { code: r.code, rank: {}, score: {}, hits: 0 };
        rows[r.code].rank[b.id] = i + 1;
        rows[r.code].score[b.id] = r.matchScore;
        rows[r.code].hits++;
      });
    });
    const list = Object.values(rows).sort((a, b) => b.hits - a.hits ||
      (Object.values(a.rank).reduce((x, y) => x + y, 0) / a.hits) - (Object.values(b.rank).reduce((x, y) => x + y, 0) / b.hits));
    const m = $('md');
    m.innerHTML = `<div class="mh"><div><div class="mt">${this.t('compareBoards')}</div>
        <div class="msu">${boards.length} boards · top 12 each · ${this.t(this.s.mode)}</div></div><button class="ib" id="mc">✕</button></div>
      <div class="mbd">
        <div class="mx-wrap"><table class="mx"><thead><tr><th class="sym-col">Remedy</th>
          ${boards.map(b => `<th>${esc(b.name)}<br><span style="font-weight:500;opacity:.7">${(b.sel || []).length} sx</span></th>`).join('')}
          <th>In</th></tr></thead><tbody>
          ${list.slice(0, 30).map(x => {
            const r = H.DB.remedies[x.code];
            const cls = x.hits === boards.length ? 'style="background:var(--accent-soft)"' : '';
            return `<tr ${cls}><td class="sym-cell">${esc(r.name)}<div style="font-size:10.5px;color:var(--ink-3);font-style:italic">${esc(r.latin)}</div></td>
              ${boards.map(b => `<td>${x.rank[b.id] ? '#' + x.rank[b.id] + ' <span style="font-size:10px;color:var(--ink-3)">' + x.score[b.id] + '</span>' : '—'}</td>`).join('')}
              <td><strong>${x.hits}</strong>/${boards.length}</td></tr>`;
          }).join('')}
        </tbody></table></div>
        <p class="srcl" style="margin-top:10px">Rows shaded green appear in every board — the remedy that keeps returning across pictures.</p>
      </div>`;
    this.om();
    $('mc').onclick = () => this.cm();
  };

  /* ---------- boot ---------- */
  const baseInit = U.init;
  U.init = async function () {
    this.lang = H.St.g('lang', 'en');
    if (!I18N[this.lang]) this.lang = 'en';
    this.loadBoards();
    await baseInit.call(this);
    this.applyLang();
    this.renderBoards();
    this.renderBoardBar();
    this.refreshStats();
  };

  U.renderBoardBar = function () { this.renderBoards(); };

  U.refreshStats = function () {
    const nums = document.querySelectorAll('#rv .stat-num');
    if (!nums.length || !H.DB) return;
    const vals = [H.DB.remedyCount, H.DB.count, (H.DB.links / 1000).toFixed(1) + 'k', '2008'];
    nums.forEach((el, i) => { if (vals[i] !== undefined) el.textContent = vals[i]; });
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

  /* ---------- persist weights with a saved case ---------- */
  const baseCSave = H.C.save;
  H.C.save = async function (n, m, s, nt) {
    const c = await baseCSave.call(this, n, m, s, nt);
    if (c) { c.weights = U.weightMap(); await H.IDB.put('cases', c); }
    return c;
  };

  /* ---------- case timeline ---------- */
  const baseClinicDetail = U.showClinicDetail;
  if (baseClinicDetail) U.showClinicDetail = function (c) {
    baseClinicDetail.call(this, c);
    const mbd = document.querySelector('#md .mbd');
    if (!mbd) return;
    if (!mbd.querySelector('[data-print-case]')) {
      const bar = document.createElement('div');
      bar.className = 'xm';
      bar.style.marginTop = '10px';
      bar.innerHTML = `<button class="btn bg btn-sm" data-print-case="${c.id}">Print</button>
        <button class="btn bg btn-sm" data-dl-case="${c.id}">Download sheet</button>
        <button class="btn bg btn-sm" data-compare-case="${c.id}">Compare with…</button>`;
      mbd.appendChild(bar);
      bar.querySelector('[data-print-case]').onclick = () => this.printCase(c.id);
      bar.querySelector('[data-dl-case]').onclick = () => this.downloadCase(c.id);
      bar.querySelector('[data-compare-case]').onclick = () => this.caseDiffPick(c.id);
    }
    mbd.querySelectorAll('.fu').forEach(el => {
      const when = el.querySelector('.fu-date');
      if (!when) return;
      const raw = when.textContent.trim();
      const d = new Date(raw);
      if (isNaN(d)) return;
      const days = Math.round((Date.now() - d.getTime()) / 864e5);
      const rel = days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : `${Math.round(days / 30)} months ago`;
      when.textContent = `${raw} · ${rel}`;
    });
  };

  /* ---------- undo for deletions ---------- */
  const baseClinicRm = H.Clinic.rm;
  H.Clinic.rm = async function (id) {
    const c = await H.Clinic.get(id);
    await baseClinicRm.call(this, id);
    if (c) U.undo(`Case “${c.name || 'untitled'}” deleted`, async () => { await H.IDB.put('clinic', c); H.U.showClinic(); });
  };
  const baseCRm = H.C.rm;
  H.C.rm = async function (id) {
    const c = await H.C.load(id);
    await baseCRm.call(this, id);
    if (c) U.undo('Saved repertorisation deleted', async () => { await H.IDB.put('cases', c); });
  };

  window.addEventListener('resize', () => {
    if (!isMobile()) { const rv = $('rv'); if (rv) rv.classList.remove('open'); }
  });
})();
