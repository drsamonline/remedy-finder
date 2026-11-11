/* ==========================================================================
   Remedy Finder — minimal QR encoder (byte mode, ECC level L, versions 1–15)
   Enough to put a transfer code on screen for a phone camera to read.
   Standard ISO/IEC 18004: mode indicator, character count, data codewords,
   Reed–Solomon ECC, interleaving, mask selection by penalty, format info.
   ========================================================================== */
(function () {
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

  function rsGen(deg) {
    let poly = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= mul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }
  function rsEncode(data, ecLen) {
    const gen = rsGen(ecLen);
    const res = new Array(ecLen).fill(0);
    for (const b of data) {
      const factor = b ^ res[0];
      res.shift(); res.push(0);
      for (let i = 0; i < ecLen; i++) res[i] ^= mul(gen[i + 1], factor);
    }
    return res;
  }

  // ECC L block structure: [ecPerBlock, g1blocks, g1data, g2blocks, g2data]
  const BLOCKS = {
    1: [7, 1, 19, 0, 0], 2: [10, 1, 34, 0, 0], 3: [15, 1, 55, 0, 0], 4: [20, 1, 80, 0, 0],
    5: [26, 1, 108, 0, 0], 6: [18, 2, 68, 0, 0], 7: [20, 2, 78, 0, 0], 8: [24, 2, 97, 0, 0],
    9: [30, 2, 116, 0, 0], 10: [18, 2, 68, 2, 69], 11: [20, 4, 81, 0, 0], 12: [24, 2, 92, 2, 93],
    13: [26, 4, 107, 0, 0], 14: [30, 3, 115, 1, 116], 15: [22, 5, 87, 1, 88]
  };
  const ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38],
    8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50], 11: [6, 30, 54], 12: [6, 32, 58],
    13: [6, 34, 62], 14: [6, 26, 46, 66], 15: [6, 26, 48, 70]
  };

  const dataCapacity = v => { const b = BLOCKS[v]; return b[1] * b[2] + b[3] * b[4]; };

  function chooseVersion(bytes) {
    for (let v = 1; v <= 15; v++) {
      const cap = dataCapacity(v);
      const countBits = v < 10 ? 8 : 16;
      const needed = Math.ceil((4 + countBits + bytes * 8) / 8);
      if (needed <= cap) return v;
    }
    return null;
  }

  function buildCodewords(bytes, version) {
    const cap = dataCapacity(version);
    const countBits = version < 10 ? 8 : 16;
    const bits = [];
    const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4);                       // byte mode
    push(bytes.length, countBits);
    for (const b of bytes) push(b, 8);
    // terminator + pad to byte
    const maxBits = cap * 8;
    for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const cw = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      cw.push(b);
    }
    const pad = [0xEC, 0x11];
    let k = 0;
    while (cw.length < cap) cw.push(pad[k++ % 2]);

    // split into blocks
    const [ecLen, g1, d1, g2, d2] = BLOCKS[version];
    const blocks = [];
    let off = 0;
    for (let i = 0; i < g1; i++) { blocks.push(cw.slice(off, off + d1)); off += d1; }
    for (let i = 0; i < g2; i++) { blocks.push(cw.slice(off, off + d2)); off += d2; }
    const eccs = blocks.map(b => rsEncode(b, ecLen));

    // interleave
    const out = [];
    const maxData = Math.max(...blocks.map(b => b.length));
    for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
    for (let i = 0; i < ecLen; i++) for (const e of eccs) out.push(e[i]);
    return out;
  }

  function makeMatrix(version) {
    const size = version * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(null));
    const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (r, c, v) => { if (r >= 0 && r < size && c >= 0 && c < size) { m[r][c] = v; fixed[r][c] = true; } };

    // finder patterns + separators
    const finder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const on = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                   (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                   (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        set(rr, cc, on ? 1 : 0);
      }
    };
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

    // timing patterns
    for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0 ? 1 : 0); set(i, 6, i % 2 === 0 ? 1 : 0); }

    // alignment patterns
    const ap = ALIGN[version];
    for (const r of ap) for (const c of ap) {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        set(r + dr, c + dc, on ? 1 : 0);
      }
    }

    // reserve format areas
    for (let i = 0; i < 9; i++) { if (m[8][i] === null) set(8, i, 0); if (m[i][8] === null) set(i, 8, 0); }
    for (let i = 0; i < 8; i++) { set(8, size - 1 - i, 0); set(size - 1 - i, 8, 0); }
    set(size - 8, 8, 1); // dark module

    // version info (v >= 7)
    if (version >= 7) {
      const bits = (version << 12) | bch(version, 0x1F25, 12);
      for (let i = 0; i < 18; i++) {
        const bit = (bits >>> i) & 1;
        const a = Math.floor(i / 3), b = i % 3;
        set(size - 11 + b, a, bit);
        set(a, size - 11 + b, bit);
      }
    }
    return { m, fixed };
  }

  function placeData(m, codewords, version) {
    const size = m.length;
    const bits = [];
    for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1);
    let idx = 0, up = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let n = 0; n < size; n++) {
        const row = up ? size - 1 - n : n;
        for (let c = 0; c < 2; c++) {
          const cc = col - c;
          if (m[row][cc] !== null) continue;
          m[row][cc] = idx < bits.length ? bits[idx++] : 0;
        }
      }
      up = !up;
    }
  }

  const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ];

  function applyMask(m, fixed, mask) {
    const size = m.length;
    const out = m.map(r => r.slice());
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!fixed[r][c] && MASKS[mask](r, c)) out[r][c] ^= 1;
    }
    return out;
  }

  function penalty(m) {
    const size = m.length;
    let p = 0;
    const runScore = line => {
      let s = 0, run = 1;
      for (let i = 1; i < line.length; i++) {
        if (line[i] === line[i - 1]) { run++; if (run === 5) s += 3; else if (run > 5) s++; }
        else run = 1;
      }
      return s;
    };
    for (let r = 0; r < size; r++) p += runScore(m[r]);
    for (let c = 0; c < size; c++) p += runScore(m.map(row => row[c]));
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3;
    }
    // rule 3 — finder-like 1:1:3:1:1 patterns
    const P1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const P2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const scanLine = line => {
      let s2 = 0;
      for (let i = 0; i + 11 <= line.length; i++) {
        let a = true, b = true;
        for (let j = 0; j < 11; j++) {
          if (line[i + j] !== P1[j]) a = false;
          if (line[i + j] !== P2[j]) b = false;
          if (!a && !b) break;
        }
        if (a) s2 += 40;
        if (b) s2 += 40;
      }
      return s2;
    };
    for (let r = 0; r < size; r++) p += scanLine(m[r]);
    for (let c = 0; c < size; c++) p += scanLine(m.map(row => row[c]));
    let dark = 0;
    for (const row of m) for (const v of row) dark += v;
    const pct = (dark * 100) / (size * size);
    p += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return p;
  }

  const bitLen = x => 32 - Math.clz32(x);
  function bch(data, gen, deg) {
    let d = data << deg;
    const gd = bitLen(gen);
    while (d && bitLen(d) >= gd) d ^= gen << (bitLen(d) - gd);
    return d;
  }
  function formatBits(mask) {
    const data = (1 << 3) | mask;         // ECC level L = 01
    return (((data << 10) | bch(data, 0x537, 10)) ^ 0x5412);
  }

  function applyFormat(m, mask) {
    const size = m.length;
    const bits = formatBits(mask);
    const bit = i => (bits >>> i) & 1;
    // copy 1 — around the top-left finder
    for (let i = 0; i <= 5; i++) m[8][i] = bit(14 - i);
    m[8][7] = bit(8); m[8][8] = bit(7); m[7][8] = bit(6);
    for (let i = 0; i < 6; i++) m[i][8] = bit(i);
    // copy 2 — split between the other two finders
    for (let i = 0; i < 7; i++) m[size - 1 - i][8] = bit(14 - i);
    m[8][size - 8] = bit(7);
    for (let i = 0; i < 7; i++) m[8][size - 7 + i] = bit(6 - i);
    m[size - 8][8] = 1;
  }

  window.HRF_QR = {
    /** returns {size, modules:[[0|1]]} or null if the text is too long */
    encode(text) {
      const bytes = new TextEncoder().encode(text);
      const version = chooseVersion(bytes.length);
      if (!version) return null;
      const cw = buildCodewords(bytes, version);
      const { m: base, fixed } = makeMatrix(version);
      placeData(base, cw, version);
      let best = null, bestP = Infinity;
      for (let mask = 0; mask < 8; mask++) {
        const m = applyMask(base, fixed, mask);
        applyFormat(m, mask);
        const p = penalty(m);
        if (p < bestP) { bestP = p; best = m; }
      }
      return { size: best.length, modules: best, version };
    },
    /** draw into a canvas element */
    draw(canvas, text, px) {
      const qr = this.encode(text);
      if (!qr) return null;
      const scale = px || 6, quiet = 4;
      const dim = (qr.size + quiet * 2) * scale;
      canvas.width = dim; canvas.height = dim;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dim, dim);
      ctx.fillStyle = '#000';
      for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) {
        if (qr.modules[r][c]) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
      }
      return qr.version;
    }
  };
})();
