/* Minimal QR Code encoder (byte mode, error correction level M, versions 1–15).
   Follows the QR Code specification (ISO/IEC 18004); structure after Project Nayuki's reference design. */
(function (G) {
  const ECC = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24], BLK = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10];
  function rawModules(v) { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36 } return r }
  const dataCw = v => Math.floor(rawModules(v) / 8) - ECC[v] * BLK[v];
  function rsDivisor(deg) { const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1; for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1] } root = mul(root, 2) } return r }
  function mul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x } return z & 255 }
  function rsRem(data, div) { const r = div.map(() => 0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => r[i] ^= mul(c, f)) } return r }
  function align(v) { if (v === 1) return []; const n = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, res = [6]; for (let p = v * 4 + 10; res.length < n; p -= step) res.splice(1, 0, p); return res }
  function encode(text) {
    const bytes = [...new TextEncoder().encode(text)]; let v = 1; for (; v <= 15; v++) if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= dataCw(v) * 8) break; if (v > 15) throw new Error("Text too long for QR");
    const bits = [], put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1) };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8)); const cap = dataCw(v) * 8; put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8); for (let p = 0xEC; bits.length < cap; p ^= 0xEC ^ 0x11) put(p, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + b, 0));
    /* split into blocks, add Reed–Solomon error correction, interleave */
    const nb = BLK[v], ecl = ECC[v], raw = Math.floor(rawModules(v) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(ecl), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) { const dat = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1)); k += dat.length; const e = rsRem(dat, div); if (i < nShort) dat.push(0); blocks.push(dat.concat(e)) }
    const cw = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= nShort) cw.push(b[i]) });
    const size = v * 4 + 17, M = [...Array(size)].map(() => new Array(size).fill(false)), F = [...Array(size)].map(() => new Array(size).fill(false));
    const set = (x, y, d) => { M[y][x] = d; F[y][x] = true };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
    const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4) } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const A = align(v); A.forEach((a, i) => A.forEach((b, j) => { if (!((i === 0 && j === 0) || (i === 0 && j === A.length - 1) || (i === A.length - 1 && j === 0))) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1) }));
    const format = mask => { const d = (0 << 3) | mask; /* level M = 00 */ let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const b = ((d << 10) | r) ^ 0x5412; const g = i => ((b >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, g(i)); set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i)); set(8, size - 8, true) };
    format(0);
    if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const b = (v << 12) | r; for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) !== 0, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit) } }
    /* zigzag data placement */
    let i = 0; for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert; if (!F[y][x] && i < cw.length * 8) { M[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++ } } }
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const apply = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x] };
    const penalty = () => { let p = 0; const line = get => { for (let a = 0; a < size; a++) { let run = 1, hist = []; for (let b = 1; b <= size; b++) { if (b < size && get(a, b) === get(a, b - 1)) run++; else { if (run >= 5) p += run - 2; run = 1 } } for (let b = 0; b + 10 < size + 1; b++) { const s = []; for (let k = 0; k < 11 && b + k < size; k++) s.push(get(a, b + k) ? 1 : 0); const t = s.join(""); if (t === "10111010000" || t === "00001011101") p += 40 } } };
      line((a, b) => M[a][b]); line((a, b) => M[b][a]); for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3 }
      let dark = 0; M.forEach(r => r.forEach(c => { if (c) dark++ })); const total = size * size; p += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10; return p };
    let best = 0, bestP = Infinity; for (let m = 0; m < 8; m++) { apply(m); format(m); const pp = penalty(); if (pp < bestP) { bestP = pp; best = m } apply(m) }
    apply(best); format(best); return M;
  }
  function svg(text, opts) { opts = opts || {}; const M = encode(text), n = M.length, q = 4, s = n + q * 2; let d = ""; M.forEach((r, y) => r.forEach((c, x) => { if (c) d += "M" + (x + q) + " " + (y + q) + "h1v1h-1z" })); return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + " " + s + '" shape-rendering="crispEdges"' + (opts.size ? ' width="' + opts.size + '" height="' + opts.size + '"' : "") + ' role="img" aria-label="' + (opts.label || "QR code") + '"><rect width="100%" height="100%" fill="' + (opts.bg || "#fff") + '"/><path d="' + d + '" fill="' + (opts.fg || "#111") + '"/></svg>' }
  G.GVQR = { encode, svg };
})(typeof window !== "undefined" ? window : globalThis);
