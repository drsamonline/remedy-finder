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
    }).join('') + `<button class="bd-chip add" data-board-add="1" title="${this.t('addBoard')}">+</button>`;
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
    if (!hits.length) { host.innerHTML = `<div class="emp"><div class="emp-i">${ic('info','i-lg')}</div><div>No text matches “${esc(q)}”.</div></div>`; return; }
    const fieldName = { description: 'description', quote: 'source', quote2: 'source', clinical: 'clinical' };
    host.innerHTML = `<div class="ss open"><button class="sh" aria-expanded="true" type="button"><span>Text matches</span>
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
    this.rs(); this.rt();
    if (this.s.view === 'results') this.rr();
  };

  U.rsRubrics = function () {
    const host = $('symptoms');
    if (!host) return;
    if (!this.rubIndex) { host.innerHTML = `<div class="emp"><div class="emp-i">${ic('results','i-lg')}</div><div>Loading repertory…</div></div>`; return; }
    const q = (this.s.q || '').trim();
    if (q.length < 3) {
      host.innerHTML = `<div class="emp"><div class="emp-i">${ic('find','i-lg')}</div>
        <div>Type two or three words — <em>fear of death</em>, <em>thirst small</em>, <em>worse consolation</em>.</div>
        <div class="srcl" style="margin-top:6px">30,343 rubrics from Repertorium Publicum, each carrying at least three of this app's 178 remedies. A rubric scores as chapter weight × rarity × grade.</div></div>`;
      return;
    }
    const hits = this.searchRubrics(q);
    if (!hits.length) { host.innerHTML = `<div class="emp"><div class="emp-i">${ic('info','i-lg')}</div><div>No rubric matches “${esc(q)}”.</div></div>`; return; }
    hits.sort((a, b) => this.rubIndex[b].n - this.rubIndex[a].n);
    host.innerHTML = `<div class="ss open"><button class="sh" aria-expanded="true" type="button"><span>Rubrics</span>
        <span class="ct">${hits.length}</span><span class="ch" aria-hidden="true">▸</span></button>
      <div class="sl">${hits.map(i => {
        const r = this.rubIndex[i];
        const on = this.rubSel.has(i);
        return `<div class="sc rb-row ${on ? 'sel' : ''}" data-rub="${i}" role="checkbox" aria-checked="${on}" tabindex="0">
          <input type="checkbox" ${on ? 'checked' : ''} tabindex="-1" aria-hidden="true">
          <span>${esc(r.p)}</span><span class="n">${r.n}</span></div>`;
      }).join('')}</div></div>`;
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
      ['b-about', 'info', 'About & sources', 'Author, licence, data provenance']
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
    document.querySelectorAll('[data-picker]').forEach(b => b.addEventListener('click', () => this.setPickerMode(b.dataset.picker)));
    const bb = $('boards');
    if (bb) bb.addEventListener('click', e => {
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
      if ((e.key === ' ' || e.key === 'Enter') && (e.target.classList.contains('sc'))) {
        e.preventDefault(); e.target.click();
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
