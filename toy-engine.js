/* FML toy engine: a from-scratch, faithful-in-miniature implementation of
   Functional Memory of Low-rank subspaces on a 2-module tanh network.
   Pure JS, no dependencies. */
var FMLCore = (function () {
  'use strict';

  // ---------- RNG ----------
  function rngFrom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ---------- dense matrices (row-major) ----------
  function Mat(r, c) { return { r: r, c: c, d: new Float64Array(r * c) }; }
  function randn(r, c, rng, s) {
    var A = Mat(r, c); s = s === undefined ? 1 : s;
    for (var i = 0; i < A.d.length; i++) A.d[i] = gauss(rng) * s;
    return A;
  }
  function clone(A) { var B = Mat(A.r, A.c); B.d.set(A.d); return B; }
  function mul(A, B) { // A(r×k) B(k×c)
    var C = Mat(A.r, B.c), r = A.r, k = A.c, c = B.c, Ad = A.d, Bd = B.d, Cd = C.d;
    for (var i = 0; i < r; i++) {
      for (var p = 0; p < k; p++) {
        var a = Ad[i * k + p]; if (a === 0) continue;
        var bo = p * c, co = i * c;
        for (var j = 0; j < c; j++) Cd[co + j] += a * Bd[bo + j];
      }
    }
    return C;
  }
  function add(A, B) { var C = clone(A); for (var i = 0; i < C.d.length; i++) C.d[i] += B.d[i]; return C; }
  function sub(A, B) { var C = clone(A); for (var i = 0; i < C.d.length; i++) C.d[i] -= B.d[i]; return C; }
  function scale(A, s) { var C = clone(A); for (var i = 0; i < C.d.length; i++) C.d[i] *= s; return C; }
  function frob2(A) { var s = 0; for (var i = 0; i < A.d.length; i++) s += A.d[i] * A.d[i]; return s; }
  function matvec(A, x, out) {
    out = out || new Float64Array(A.r);
    for (var i = 0; i < A.r; i++) { var s = 0, o = i * A.c; for (var j = 0; j < A.c; j++) s += A.d[o + j] * x[j]; out[i] = s; }
    return out;
  }
  function matTvec(A, y, out) {
    out = out || new Float64Array(A.c); out.fill(0);
    for (var i = 0; i < A.r; i++) { var yi = y[i]; if (yi === 0) continue; var o = i * A.c; for (var j = 0; j < A.c; j++) out[j] += A.d[o + j] * yi; }
    return out;
  }
  function dot(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  function outerAdd(W, s, u, v) { // W += s u v^T
    for (var i = 0; i < W.r; i++) { var ui = s * u[i]; if (ui === 0) continue; var o = i * W.c; for (var j = 0; j < W.c; j++) W.d[o + j] += ui * v[j]; }
  }
  function col(A, j) { var v = new Float64Array(A.r); for (var i = 0; i < A.r; i++) v[i] = A.d[i * A.c + j]; return v; }
  function row(A, i) { return A.d.slice(i * A.c, (i + 1) * A.c); }

  // orthonormal columns from random gaussian (Gram-Schmidt)
  function randOrtho(d, k, rng) {
    var cols = [];
    while (cols.length < k) {
      var v = new Float64Array(d);
      for (var i = 0; i < d; i++) v[i] = gauss(rng);
      if (orthAppend(cols, v, 1e-6)) continue;
    }
    return cols;
  }
  // orthogonalize v against cols (twice), append if residual large enough. returns index or -1
  function orthAppend(cols, v, tol) {
    var w = Float64Array.from(v), n0 = norm(w);
    if (n0 < 1e-12) return -1;
    for (var pass = 0; pass < 2; pass++) {
      for (var k = 0; k < cols.length; k++) {
        var c = cols[k], p = dot(c, w);
        for (var i = 0; i < w.length; i++) w[i] -= p * c[i];
      }
    }
    var n = norm(w);
    if (n < tol * n0 || n < 1e-10) return -1;
    for (var i2 = 0; i2 < w.length; i2++) w[i2] /= n;
    cols.push(w);
    return cols.length - 1;
  }
  // U^T W V for column-lists U (dout), V (din)
  function coreOf(W, UB, UA) {
    var KB = UB.length, KA = UA.length, G = Mat(KB, KA);
    if (!KB || !KA) return G;
    // T = W V  (dout × KA)
    var T = [];
    for (var a = 0; a < KA; a++) T.push(matvec(W, UA[a]));
    for (var b = 0; b < KB; b++) for (var a2 = 0; a2 < KA; a2++) G.d[b * KA + a2] = dot(UB[b], T[a2]);
    return G;
  }
  // U G V^T  -> dense dout × din
  function expand(G, UB, UA, dout, din) {
    var W = Mat(dout, din);
    for (var b = 0; b < G.r; b++) {
      // tmp = sum_a G[b,a] UA[a]
      var tmp = new Float64Array(din), any = false;
      for (var a = 0; a < G.c; a++) {
        var g = G.d[b * G.c + a]; if (g === 0) continue; any = true;
        var ua = UA[a]; for (var j = 0; j < din; j++) tmp[j] += g * ua[j];
      }
      if (any) outerAdd(W, 1, UB[b], tmp);
    }
    return W;
  }
  function project(W, UB, UA) { return expand(coreOf(W, UB, UA), UB, UA, W.r, W.c); }

  // one-sided Jacobi SVD. Returns comps sorted by sigma desc: {s, u (len r), v (len c)}
  function svd(A, relTol) {
    var m = A.r, n = A.c;
    // work on columns of A: n columns of length m
    var C = [], V = [];
    for (var j = 0; j < n; j++) { C.push(col(A, j)); var e = new Float64Array(n); e[j] = 1; V.push(e); }
    for (var sweep = 0; sweep < 40; sweep++) {
      var off = 0;
      for (var p = 0; p < n - 1; p++) {
        for (var q = p + 1; q < n; q++) {
          var cp = C[p], cq = C[q];
          var al = dot(cp, cp), be = dot(cq, cq), ga = dot(cp, cq);
          if (al < 1e-300 || be < 1e-300) continue;
          var rel = Math.abs(ga) / Math.sqrt(al * be);
          if (rel < 1e-13) continue;
          off = Math.max(off, rel);
          var zeta = (be - al) / (2 * ga);
          var t = (zeta >= 0 ? 1 : -1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
          var cs = 1 / Math.sqrt(1 + t * t), sn = cs * t;
          for (var i = 0; i < m; i++) { var x = cp[i], y = cq[i]; cp[i] = cs * x - sn * y; cq[i] = sn * x + cs * y; }
          var vp = V[p], vq = V[q];
          for (var i2 = 0; i2 < n; i2++) { var x2 = vp[i2], y2 = vq[i2]; vp[i2] = cs * x2 - sn * y2; vq[i2] = sn * x2 + cs * y2; }
        }
      }
      if (off < 1e-12) break;
    }
    var comps = [];
    for (var j2 = 0; j2 < n; j2++) {
      var s = norm(C[j2]);
      comps.push({ s: s, u: C[j2], v: V[j2] });
    }
    comps.sort(function (a, b) { return b.s - a.s; });
    var smax = comps.length ? comps[0].s : 0, out = [];
    relTol = relTol === undefined ? 1e-7 : relTol;
    for (var k = 0; k < comps.length; k++) {
      var c = comps[k];
      if (c.s <= Math.max(relTol * smax, 1e-10)) break;
      var u = new Float64Array(m); for (var i3 = 0; i3 < m; i3++) u[i3] = c.u[i3] / c.s;
      out.push({ s: c.s, u: u, v: c.v });
    }
    return out;
  }

  // symmetric Jacobi eigendecomposition (small K). returns {vals, vecs (cols)} sorted desc
  function eigSym(S) {
    var n = S.r, A = clone(S), Vm = Mat(n, n);
    for (var i = 0; i < n; i++) Vm.d[i * n + i] = 1;
    for (var sweep = 0; sweep < 60; sweep++) {
      var off = 0;
      for (var p = 0; p < n; p++) for (var q = p + 1; q < n; q++) off += A.d[p * n + q] * A.d[p * n + q];
      if (off < 1e-22) break;
      for (var p2 = 0; p2 < n - 1; p2++) {
        for (var q2 = p2 + 1; q2 < n; q2++) {
          var apq = A.d[p2 * n + q2]; if (Math.abs(apq) < 1e-300) continue;
          var app = A.d[p2 * n + p2], aqq = A.d[q2 * n + q2];
          var th = (aqq - app) / (2 * apq);
          var t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
          var c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (var k = 0; k < n; k++) {
            var akp = A.d[k * n + p2], akq = A.d[k * n + q2];
            A.d[k * n + p2] = c * akp - s * akq; A.d[k * n + q2] = s * akp + c * akq;
          }
          for (var k2 = 0; k2 < n; k2++) {
            var apk = A.d[p2 * n + k2], aqk = A.d[q2 * n + k2];
            A.d[p2 * n + k2] = c * apk - s * aqk; A.d[q2 * n + k2] = s * apk + c * aqk;
          }
          for (var k3 = 0; k3 < n; k3++) {
            var vkp = Vm.d[k3 * n + p2], vkq = Vm.d[k3 * n + q2];
            Vm.d[k3 * n + p2] = c * vkp - s * vkq; Vm.d[k3 * n + q2] = s * vkp + c * vkq;
          }
        }
      }
    }
    var idx = []; for (var i4 = 0; i4 < n; i4++) idx.push(i4);
    idx.sort(function (a, b) { return A.d[b * n + b] - A.d[a * n + a]; });
    return { vals: idx.map(function (i) { return A.d[i * n + i]; }), vecs: idx.map(function (i) { return col(Vm, i); }) };
  }

  // exact SVD for a matrix of known small rank (<= k): range finder + small Jacobi
  function lowRankSVD(A, k, relTol, seed) {
    var m = A.r, n = A.c, rng = rngFrom(seed || 12345);
    var Q = [];
    for (var j = 0; j < k; j++) {
      var om = new Float64Array(n); for (var i = 0; i < n; i++) om[i] = gauss(rng);
      orthAppend(Q, matvec(A, om), 1e-9);
    }
    if (!Q.length) return [];
    // B = Q^T A  (q × n); work on B^T columns (q columns of length n)
    var q = Q.length, Bt = Mat(n, q);
    var tmp = new Float64Array(n);
    for (var a = 0; a < q; a++) { matTvec(A, Q[a], tmp); for (var i2 = 0; i2 < n; i2++) Bt.d[i2 * q + a] = tmp[i2]; }
    var comps = svd(Bt, relTol);  // Bt = U' S V'^T  ->  A = (Q V') S U'^T
    return comps.map(function (c) {
      var u = new Float64Array(m);
      for (var a2 = 0; a2 < q; a2++) { var w = c.v[a2]; if (w === 0) continue; var qa = Q[a2]; for (var i3 = 0; i3 < m; i3++) u[i3] += w * qa[i3]; }
      return { s: c.s, u: u, v: c.u };
    });
  }
  // top-K eigenvectors of a symmetric PSD matrix by subspace iteration + Rayleigh-Ritz
  function topKEig(S, K, iters, seed) {
    var n = S.r, rng = rngFrom(seed || 777), Qc = [];
    for (var j = 0; j < K; j++) { var v = new Float64Array(n); for (var i = 0; i < n; i++) v[i] = gauss(rng); orthAppend(Qc, v, 1e-12); }
    for (var it = 0; it < (iters || 25); it++) {
      var Z = Qc.map(function (q) { return matvec(S, q); }), nq = [];
      Z.forEach(function (z) { orthAppend(nq, z, 1e-12); });
      Qc = nq;
    }
    var k = Qc.length, T = Mat(k, k);
    var SQ = Qc.map(function (q) { return matvec(S, q); });
    for (var a = 0; a < k; a++) for (var b = 0; b < k; b++) T.d[a * k + b] = dot(Qc[a], SQ[b]);
    var e = eigSym(T);
    return { vals: e.vals, vecs: e.vecs.map(function (w) { var u = new Float64Array(n); for (var a2 = 0; a2 < k; a2++) for (var i2 = 0; i2 < n; i2++) u[i2] += w[a2] * Qc[a2][i2]; return u; }) };
  }

  // ---------- the toy network ----------
  // x(d0) -> h1 = tanh((W1+dW1) x) (d1) -> h2 = tanh((W2+dW2) h1) (d2) -> z = W3 h2 (C)
  // sized so the memory stays small relative to each space, as in real models (K ≈ 320–460 of 4096 per side)
  var DIMS = { d0: 160, d1: 128, d2: 128, C: 24, r: 4 };
  var MODS = [ { name: 'layer 1', dout: DIMS.d1, din: DIMS.d0 }, { name: 'layer 2', dout: DIMS.d2, din: DIMS.d1 } ];

  function softmax(z) {
    var m = -Infinity; for (var i = 0; i < z.length; i++) if (z[i] > m) m = z[i];
    var p = new Float64Array(z.length), s = 0;
    for (var j = 0; j < z.length; j++) { p[j] = Math.exp(z[j] - m); s += p[j]; }
    for (var k = 0; k < z.length; k++) p[k] /= s;
    return p;
  }
  function kl(p, q) { var s = 0; for (var i = 0; i < p.length; i++) if (p[i] > 0) s += p[i] * Math.log(p[i] / Math.max(q[i], 1e-300)); return s; }

  function makeNet(net, dWs) { // effective weights
    return { W1: dWs && dWs[0] ? add(net.W1, dWs[0]) : net.W1, W2: dWs && dWs[1] ? add(net.W2, dWs[1]) : net.W2, W3: net.W3 };
  }
  function fwd(E, x) {
    var p1 = matvec(E.W1, x), h1 = new Float64Array(p1.length);
    for (var i = 0; i < p1.length; i++) h1[i] = Math.tanh(p1[i]);
    var p2 = matvec(E.W2, h1), h2 = new Float64Array(p2.length);
    for (var j = 0; j < p2.length; j++) h2[j] = Math.tanh(p2[j]);
    var z = matvec(E.W3, h2);
    return { h1: h1, h2: h2, z: z };
  }
  function predict(E, X) { return X.map(function (x) { return softmax(fwd(E, x).z); }); }
  function meanKL(P, Q) { var s = 0; for (var i = 0; i < P.length; i++) s += kl(P[i], Q[i]); return s / P.length; }

  // ---------- world & task stream ----------
  var FAMILY_NAMES = ['Q&A', 'Sentiment', 'Translation', 'Code', 'Math', 'Toxicity'];

  function createWorld(seed, opts) {
    opts = opts || {};
    var rng = rngFrom(seed);
    var d0 = DIMS.d0, d1 = DIMS.d1, d2 = DIMS.d2, C = DIMS.C;
    var net = {
      W1: randn(d1, d0, rng, 1.0 / Math.sqrt(d0)),
      W2: randn(d2, d1, rng, 1.0 / Math.sqrt(d1)),
      W3: randn(C, d2, rng, 1.6 / Math.sqrt(d2))
    };
    var rowW3 = []; for (var rr = 0; rr < C; rr++) orthAppend(rowW3, row(net.W3, rr), 1e-9);
    var nullW3 = [];
    while (nullW3.length < d2 - rowW3.length) { var w0 = orthTo(randVec(d2, rng), rowW3.concat(nullW3)); if (norm(w0) > 1e-6) nullW3.push(unit(w0)); }
    var nFeat = opts.nFeat || 40, m = opts.m || 6;
    var feats = randOrtho(d0, nFeat, rng);           // input features (shared across families)
    var h1pool = randOrtho(d1, 16, rng);             // what layer 1 writes / layer 2 reads
    var h2pool = [];                                 // what layer 2 writes (moves the logits)
    while (h2pool.length < 16) { var z0 = new Float64Array(d2), gz = randVec(rowW3.length, rng); for (var a0 = 0; a0 < rowW3.length; a0++) for (var b0 = 0; b0 < d2; b0++) z0[b0] += gz[a0] * rowW3[a0][b0]; orthAppend(h2pool, z0, 1e-6); }
    var F = FAMILY_NAMES.length, fam = [];
    function shuffled(n, r) { var a = []; for (var i = 0; i < n; i++) a.push(i); for (var j = n - 1; j > 0; j--) { var t = Math.floor(r() * (j + 1)); var tmp = a[j]; a[j] = a[t]; a[t] = tmp; } return a; }
    for (var f = 0; f < F; f++) {
      var fs = shuffled(nFeat, rng), hs = shuffled(16, rng), os = shuffled(16, rng);
      var sig = [fs.slice(0, m), fs.slice(m, 2 * m)];
      // each latent signal is written redundantly across its m features (family-specific code)
      var code = sig.map(function () { var e = new Float64Array(m); for (var i = 0; i < m; i++) e[i] = 0.4 + rng(); return unit(e); });
      fam.push({ name: FAMILY_NAMES[f], sig: sig, code: code, h1: [hs[0], hs[1]], h1x: [hs[2]], h2: [os[0], os[1]], h2x: [os[2]] });
    }
    return { seed: seed, net: net, pools: { feats: feats, h1: h1pool, h2: h2pool }, fam: fam, rng: rng, opts: opts, nullW3: nullW3 };
  }

  function combo(cols, idx, rng, d, scaleVar) {
    var v = new Float64Array(d);
    for (var k = 0; k < idx.length; k++) {
      var w = gauss(rng) * (scaleVar ? scaleVar[k] : 1), c = cols[idx[k]];
      for (var i = 0; i < d; i++) v[i] += w * c[i];
    }
    return v;
  }
  function randVec(d, rng) { var v = new Float64Array(d); for (var i = 0; i < d; i++) v[i] = gauss(rng); return v; }
  function unit(v) { var n = norm(v); var w = new Float64Array(v.length); for (var i = 0; i < v.length; i++) w[i] = v[i] / n; return w; }
  function orthTo(v, cols) { var w = Float64Array.from(v); for (var p = 0; p < 2; p++) for (var k = 0; k < cols.length; k++) { var c = cols[k], s = dot(c, w); for (var i = 0; i < w.length; i++) w[i] -= s * c[i]; } return w; }

  // A task = trained-LoRA stand-in: per module B (dout×r), A (r×din) plus unlabelled inputs.
  // Each family has two latent signals, each written redundantly across several input features.
  // A task reads each signal through its own direction in that feature span, so part of every
  // reader is functional (aligned with the signal) and part is nearly inert. Partial overlap with
  // directions from earlier tasks keeps the function but shrinks its magnitude, and the task adds
  // one behaviour of its own plus a little leftover random-init energy.
  function makeTask(world, t, famIdx, opts) {
    opts = opts || {};
    var rng = rngFrom((world.seed * 7919 + t * 104729 + 17) >>> 0);
    var P = world.pools, fm = world.fam[famIdx], r = opts.rank || DIMS.r;
    var d0 = DIMS.d0, d1 = DIMS.d1, d2 = DIMS.d2;
    var eps = opts.eps === undefined ? 0.1 : opts.eps;          // deviation of writers from family prototypes
    var kappa = opts.kappa === undefined ? 1.0 : opts.kappa;    // reader alignment with the signal axis
    var inert = opts.inert === undefined ? 0.25 : opts.inert;   // leftover random-init energy
    var uniq = opts.uniq === undefined ? 0.35 : opts.uniq;      // task-specific behaviour
    var fnoise = opts.fnoise === undefined ? 0.12 : opts.fnoise;
    var phi = P.feats;
    var spans = fm.sig.map(function (ks) { return ks.map(function (k) { return phi[k]; }); });
    var delta = opts.delta === undefined ? 0.6 : opts.delta;   // how far a task's signal axis turns from its family's
    // each task encodes its signals along its own axis: the family code, turned by a task-specific amount
    var codes = fm.code.map(function (e) { var w = new Float64Array(e.length); for (var i = 0; i < e.length; i++) w[i] = e[i] + delta * gauss(rng) / Math.sqrt(e.length); return unit(w); });
    var axes = spans.map(function (S, l) { var v = new Float64Array(d0); for (var i = 0; i < S.length; i++) for (var j = 0; j < d0; j++) v[j] += codes[l][i] * S[i][j]; return v; });
    var uDir = unit(orthTo(randVec(d0, rng), phi));
    var N = opts.nInputs || 48, X = [];
    for (var n = 0; n < N; n++) {
      var x = new Float64Array(d0);
      for (var l = 0; l < 2; l++) {
        var s = gauss(rng) * 1.2;
        for (var j = 0; j < d0; j++) x[j] += s * axes[l][j];
        spans[l].forEach(function (f) { var c = gauss(rng) * fnoise; for (var j2 = 0; j2 < d0; j2++) x[j2] += c * f[j2]; });
      }
      var su = gauss(rng) * 1.2; for (var j3 = 0; j3 < d0; j3++) x[j3] += su * uDir[j3];
      for (var j4 = 0; j4 < d0; j4++) x[j4] += gauss(rng) * 0.02;
      X.push(x);
    }
    function reader(l) { // reads the task's own signal axis, plus a little off-axis energy
      var S = spans[l], e = codes[l], w = new Float64Array(S.length);
      for (var i = 0; i < S.length; i++) w[i] = kappa * e[i] + 0.25 * gauss(rng) / Math.sqrt(S.length);
      w = unit(w);
      var v = new Float64Array(d0); for (var i2 = 0; i2 < S.length; i2++) for (var j = 0; j < d0; j++) v[j] += w[i2] * S[i2][j];
      return v;
    }
    function writer(pool, k, d) { var v = Float64Array.from(pool[k]), g = unit(randVec(d, rng)); for (var i = 0; i < d; i++) v[i] += eps * g[i]; return unit(v); }
    var visitedIn = phi.concat([uDir]);
    // ---- module 1: x -> h1
    var A1 = Mat(r, d0), B1 = Mat(d1, r);
    var rows1 = [reader(0), reader(1), uDir], cols1 = [writer(P.h1, fm.h1[0], d1), writer(P.h1, fm.h1[1], d1), writer(P.h1, fm.h1x[0], d1)];
    var w1 = [1.0, 0.9, uniq];
    for (var e1 = 3; e1 < r; e1++) { // leftover random-init components: inputs never excite their readers
      rows1.push(unit(orthTo(randVec(d0, rng), visitedIn.concat(rows1.slice(3)))));
      cols1.push(unit(randVec(d1, rng)));
      w1.push(inert * (0.6 + 0.8 * rng()));
    }
    for (var q = 0; q < r; q++) {
      for (var j1 = 0; j1 < d0; j1++) A1.d[q * d0 + j1] = rows1[q][j1] * Math.sqrt(w1[q]);
      for (var j2 = 0; j2 < d1; j2++) B1.d[j2 * r + q] = cols1[q][j2] * Math.sqrt(w1[q]);
    }
    // ---- module 2: h1 -> h2 (reads what module 1 writes)
    var A2 = Mat(r, d1), B2 = Mat(d2, r);
    function nullDir() { var nz = new Float64Array(d2), gN = unit(randVec(world.nullW3.length, rng)); for (var k2 = 0; k2 < world.nullW3.length; k2++) for (var k3 = 0; k3 < d2; k3++) nz[k3] += gN[k2] * world.nullW3[k2][k3]; return nz; }
    // layer 2 reads the layer-1 representation of the task's own signals (base response + what layer 1 writes)
    var gam = opts.gam === undefined ? 1.0 : opts.gam;
    function repr(dirIn, wcol) { var v = matvec(world.net.W1, dirIn), nv = norm(v); for (var i = 0; i < d1; i++) v[i] = v[i] / nv + gam * wcol[i]; return unit(v); }
    var rows2 = [repr(axes[0], cols1[0]), repr(axes[1], cols1[1]), repr(uDir, cols1[2])];
    var cols2 = [writer(P.h2, fm.h2[0], d2), writer(P.h2, fm.h2[1], d2), writer(P.h2, fm.h2x[0], d2)];
    var w2 = [1.0, 0.9, uniq * 0.8];
    for (var e2 = 3; e2 < r; e2++) { // leftover energy the read-out ignores (written into the null space of W3)
      rows2.push(unit(randVec(d1, rng)));
      cols2.push(nullDir());
      w2.push(inert * (0.6 + 0.8 * rng()));
    }
    for (var q2 = 0; q2 < r; q2++) {
      for (var j3 = 0; j3 < d1; j3++) A2.d[q2 * d1 + j3] = rows2[q2][j3] * Math.sqrt(w2[q2]);
      for (var j4 = 0; j4 < d2; j4++) B2.d[j4 * r + q2] = cols2[q2][j4] * Math.sqrt(w2[q2]);
    }
    var g1 = opts.gain1 || 2.0, g2 = opts.gain2 || 2.4;
    B1 = scale(B1, g1); B2 = scale(B2, g2);
    var mods = [{ B: B1, A: A1, dW: mul(B1, A1) }, { B: B2, A: A2, dW: mul(B2, A2) }];
    var Xrank = X.slice(0, Math.min(X.length, opts.nRank || 32));
    var Xeval = X.slice(X.length - Math.min(X.length, opts.nEval || 32));
    var task = { t: t, r: r, fam: famIdx, famName: fm.name, mods: mods, X: X, Xrank: Xrank, Xeval: Xeval };
    task.Pt = predict(makeNet(world.net, mods.map(function (m) { return m.dW; })), Xeval);
    task.P0 = predict(makeNet(world.net, null), Xeval);
    task.Dbase = meanKL(task.Pt, task.P0);
    return task;
  }

  function makeStream(world, T, opts) {
    var rng = rngFrom((world.seed * 31 + 5) >>> 0), F = world.fam.length, seq = [];
    // interleave families; each appears with roughly equal frequency
    for (var t = 0; t < T; t++) seq.push(Math.floor(rng() * F));
    return seq.map(function (f, t) { return makeTask(world, t, f, opts); });
  }

  // ---------- FML memory ----------
  function Memory(kind, opts) {
    this.kind = kind; // 'functional' | 'weight'
    this.opts = opts || {};
    this.UA = MODS.map(function () { return []; });
    this.UB = MODS.map(function () { return []; });
    this.stored = []; // {t, G:[Mat], alpha, recon:[Mat] (audit)}
    this.history = []; // per task stats
  }
  Memory.prototype.size = function () { var s = 0; for (var m = 0; m < MODS.length; m++) s += this.UA[m].length + this.UB[m].length; return s; };
  Memory.prototype.sizes = function () { var self = this; return MODS.map(function (_, m) { return { A: self.UA[m].length, B: self.UB[m].length }; }); };

  function capture(world, task, dWs, alpha) {
    var scaled = dWs.map(function (W) { return alpha === 1 ? W : scale(W, alpha); });
    var Ph = predict(makeNet(world.net, scaled), task.Xeval);
    var D = meanKL(task.Pt, Ph);
    return { C: 1 - D / task.Dbase, D: D, P: Ph };
  }
  function normMatch(task, dWs) {
    var num = 0, den = 0;
    for (var m = 0; m < dWs.length; m++) { num += frob2(task.mods[m].dW); den += frob2(dWs[m]); }
    return den > 0 ? Math.sqrt(num / den) : 1;
  }

  // functional sketch: Q random output probes over ranking inputs, sensitivities of all candidates
  function sketch(world, task, cands, Q, seed) {
    var rng = rngFrom(seed >>> 0);
    var E = makeNet(world.net, task.mods.map(function (m) { return m.dW; }));
    var X = task.Xrank, C = DIMS.C, sq = Math.sqrt(C);
    var H = [], J = cands.length;
    for (var q = 0; q < Q; q++) {
      var x = X[q % X.length];
      var f = fwd(E, x);
      var r = new Float64Array(C); for (var i = 0; i < C; i++) r[i] = rng() < 0.5 ? -1 : 1;
      // backprop r^T z
      var s3 = matTvec(E.W3, r);
      var s2 = new Float64Array(s3.length); for (var i2 = 0; i2 < s3.length; i2++) s2[i2] = s3[i2] * (1 - f.h2[i2] * f.h2[i2]);
      var gh1 = matTvec(E.W2, s2);
      var s1 = new Float64Array(gh1.length); for (var i3 = 0; i3 < gh1.length; i3++) s1[i3] = gh1[i3] * (1 - f.h1[i3] * f.h1[i3]);
      var rowv = new Float64Array(J);
      for (var j = 0; j < J; j++) {
        var c = cands[j];
        if (c.m === 0) rowv[j] = c.s * dot(s1, c.u) * dot(c.v, x) / sq;
        else rowv[j] = c.s * dot(s2, c.u) * dot(c.v, f.h1) / sq;
      }
      H.push(rowv);
    }
    return H; // Q rows × J
  }
  // CPQR pivot order on columns of H (Q×J); trace of residual column norms per step
  function cpqr(H) {
    var Q = H.length, J = Q ? H[0].length : 0, cols = [];
    for (var j = 0; j < J; j++) { var v = new Float64Array(Q); for (var q = 0; q < Q; q++) v[q] = H[q][j]; cols.push(v); }
    var used = new Uint8Array(J), order = [], trace = [];
    for (var step = 0; step < J; step++) {
      var norms = cols.map(function (c, j) { return used[j] ? 0 : norm(c); });
      trace.push(Float64Array.from(norms));
      var best = -1, bn = -1;
      for (var j2 = 0; j2 < J; j2++) if (!used[j2] && norms[j2] > bn) { bn = norms[j2]; best = j2; }
      if (best < 0) break;
      used[best] = 1; order.push(best);
      if (bn < 1e-14) continue;
      var qv = cols[best].map(function (x) { return x / bn; });
      for (var j3 = 0; j3 < J; j3++) if (!used[j3]) { var p = dot(qv, cols[j3]); for (var q2 = 0; q2 < Q; q2++) cols[j3][q2] -= p * qv[q2]; }
    }
    return { order: order, trace: trace };
  }

  // admission criterion (paper App. B.6, scaled to the toy)
  function admitOK(hist, k, tau, dAbs) {
    var cur = hist[hist.length - 1];
    if (cur.C < tau) return false;
    if (cur.D <= dAbs) return true;
    // saturation: relative KL improvement < 5% for two consecutive expansions after reaching tau
    var n = hist.length;
    if (n >= 3) {
      var rho1 = (hist[n - 2].D - hist[n - 1].D) / Math.max(hist[n - 2].D, 1e-12);
      var rho2 = (hist[n - 3].D - hist[n - 2].D) / Math.max(hist[n - 3].D, 1e-12);
      if (rho1 < 0.05 && rho2 < 0.05 && hist[n - 2].C >= tau && hist[n - 3].C >= tau) return true;
    }
    return false;
  }

  Memory.prototype.admit = function (world, task, cfg) {
    cfg = cfg || {};
    var tau = cfg.tau === undefined ? 0.98 : cfg.tau;
    var Q = cfg.Q || 48;
    var useNM = cfg.normMatch !== false;
    var dAbs = cfg.dAbs === undefined ? 0.01 : cfg.dAbs;
    var self = this, nm = MODS.length;
    var trace = { t: task.t, kind: this.kind };
    // 1. project into current memory
    var proj = task.mods.map(function (md, m) { return project(md.dW, self.UB[m], self.UA[m]); });
    var e0 = 0, e1 = 0; for (var m = 0; m < nm; m++) { e0 += frob2(task.mods[m].dW); e1 += frob2(proj[m]); }
    trace.energyKept = e0 > 0 ? e1 / e0 : 0;
    var alpha0 = useNM ? normMatch(task, proj) : 1;
    if (e1 === 0) alpha0 = 1;
    var c0 = capture(world, task, proj, alpha0);
    trace.proj = proj; trace.alpha0 = alpha0; trace.C0 = c0.C; trace.D0 = c0.D; trace.P0hat = c0.P;
    trace.C0raw = capture(world, task, proj, 1).C; // capture before norm matching (for display)
    var hist = [{ k: 0, C: c0.C, D: c0.D, alpha: alpha0 }];
    // 2. residual candidates (SVD of each module's residual)
    var cands = [];
    var resid = task.mods.map(function (md, m) { return sub(md.dW, proj[m]); });
    trace.resid = resid;
    var preOK = (task.Dbase <= 1e-9) || (c0.C >= 1 - 1e-4) || admitOK(hist, 0, tau, dAbs);
    var chosen = [], recon = proj, alpha = alpha0;
    if (!preOK) {
      for (var m2 = 0; m2 < nm; m2++) {
        var comps = lowRankSVD(resid[m2], 2 * (task.r || DIMS.r) + 4, 1e-6, world.seed * 31 + task.t * 7 + m2);
        comps.forEach(function (c) { cands.push({ m: m2, s: c.s, u: c.u, v: c.v }); });
      }
    }
    trace.cands = cands;
    if (cands.length) {
      // 3. ranking
      var order;
      if (this.kind === 'weight') {
        order = cands.map(function (_, j) { return j; }).sort(function (a, b) { return cands[b].s - cands[a].s; });
        trace.H = null; trace.cp = null;
      } else {
        var H = sketch(world, task, cands, Q, world.seed * 13 + task.t * 977 + 3);
        var cp = cpqr(H);
        order = cp.order; trace.H = H; trace.cp = cp;
      }
      trace.order = order;
      // 4. admission: grow k until criterion met
      var best = { C: -Infinity }, accepted = null;
      for (var k = 1; k <= order.length; k++) {
        var rec = proj.map(function (P) { return clone(P); });
        for (var i = 0; i < k; i++) { var c = cands[order[i]]; outerAdd(rec[c.m], c.s, c.u, c.v); }
        var a = useNM ? normMatch(task, rec) : 1;
        var ck = capture(world, task, rec, a);
        hist.push({ k: k, C: ck.C, D: ck.D, alpha: a });
        if (ck.C > best.C) best = { C: ck.C, k: k, rec: rec, a: a };
        if (admitOK(hist, k, tau, dAbs)) { accepted = { k: k, rec: rec, a: a }; break; }
      }
      if (!accepted) accepted = best;
      chosen = order.slice(0, accepted.k);
      recon = accepted.rec; alpha = accepted.a;
      // 5. append orthogonalized directions
      var added = MODS.map(function () { return { A: [], B: [] }; });
      var tolApp = cfg.appendTol === undefined ? 0.2 : cfg.appendTol;
      chosen.forEach(function (j) {
        var c = cands[j];
        var ib = orthAppend(self.UB[c.m], c.u, tolApp); if (ib >= 0) added[c.m].B.push(ib);
        var ia = orthAppend(self.UA[c.m], c.v, tolApp); if (ia >= 0) added[c.m].A.push(ia);
      });
      trace.added = added;
    } else {
      trace.added = MODS.map(function () { return { A: [], B: [] }; });
      trace.order = [];
    }
    trace.hist = hist; trace.chosen = chosen;
    // 6. store coefficients in the (expanded) basis; discard the adapter
    var G = recon.map(function (W, m) { return coreOf(W, self.UB[m], self.UA[m]); });
    var inSpan = G.map(function (g, m) { return expand(g, self.UB[m], self.UA[m], MODS[m].dout, MODS[m].din); });
    if (useNM && chosen.length) alpha = normMatch(task, inSpan);
    var fin = capture(world, task, inSpan, alpha);
    // The visual toy normally drops nearly redundant basis components. If that
    // approximation invalidates a candidate set which passed admission, retain
    // the omitted components before storing the task. Existing columns stay
    // unchanged, so this repair preserves every previously admitted update.
    var selectedHistory = hist.slice(0, chosen.length + 1);
    if (chosen.length && fin.C < tau - 1e-10 &&
        admitOK(selectedHistory, chosen.length, tau, dAbs)) {
      var beforeRepair = fin.C, repairedColumns = 0, numericalTol = 1e-8;
      chosen.forEach(function (j) {
        var c = cands[j];
        var ib = orthAppend(self.UB[c.m], c.u, numericalTol);
        if (ib >= 0) { trace.added[c.m].B.push(ib); repairedColumns++; }
        var ia = orthAppend(self.UA[c.m], c.v, numericalTol);
        if (ia >= 0) { trace.added[c.m].A.push(ia); repairedColumns++; }
      });
      G = recon.map(function (W, m) { return coreOf(W, self.UB[m], self.UA[m]); });
      inSpan = G.map(function (g, m) { return expand(g, self.UB[m], self.UA[m], MODS[m].dout, MODS[m].din); });
      if (useNM) alpha = normMatch(task, inSpan);
      fin = capture(world, task, inSpan, alpha);
      trace.storageRepair = {
        beforeCapture: beforeRepair, afterCapture: fin.C,
        additionalBasisColumns: repairedColumns, tolerance: numericalTol
      };
    }
    trace.alpha = alpha; trace.Cpost = fin.C; trace.Dpost = fin.D; trace.Phat = fin.P;
    var auditRecon = inSpan.map(function (W) { return scale(W, alpha); });
    this.stored.push({ t: task.t, fam: task.fam, G: G, alpha: alpha, recon: auditRecon });
    trace.G = G; trace.size = this.size(); trace.sizes = this.sizes();
    this.history.push({ t: task.t, C0: c0.C, Cpost: fin.C, nAdd: chosen.length, size: trace.size, alpha: alpha });
    return trace;
  };

  // reconstruct stored task s from the CURRENT basis (zero-padded coefficients)
  Memory.prototype.reconstruct = function (s) {
    var self = this;
    return s.G.map(function (g, m) {
      return scale(expand(g, self.UB[m].slice(0, g.r), self.UA[m].slice(0, g.c), MODS[m].dout, MODS[m].din), s.alpha);
    });
  };
  // max |Δ| between today's reconstruction and the one recorded at admission, over all stored tasks
  Memory.prototype.driftAudit = function () {
    var worst = 0, self = this;
    this.stored.forEach(function (s) {
      var now = self.reconstruct(s);
      for (var m = 0; m < now.length; m++) for (var i = 0; i < now[m].d.length; i++) { var d = Math.abs(now[m].d[i] - s.recon[m].d[i]); if (d > worst) worst = d; }
    });
    return worst;
  };
  // functional re-ranking: rotate bases by cross-task usage; coefficients follow
  Memory.prototype.rerank = function () {
    var self = this, spectra = [];
    for (var m = 0; m < MODS.length; m++) {
      var KA = this.UA[m].length, KB = this.UB[m].length;
      if (!KA || !KB) { spectra.push({ A: [], B: [] }); continue; }
      var SA = Mat(KA, KA), SB = Mat(KB, KB);
      this.stored.forEach(function (s) {
        var g = s.G[m], a2 = s.alpha * s.alpha;
        // pad to full size
        for (var i = 0; i < KA; i++) for (var j = 0; j < KA; j++) {
          var acc = 0; for (var b = 0; b < g.r; b++) { var gi = i < g.c ? g.d[b * g.c + i] : 0, gj = j < g.c ? g.d[b * g.c + j] : 0; acc += gi * gj; }
          SA.d[i * KA + j] += a2 * acc;
        }
        for (var i2 = 0; i2 < KB; i2++) for (var j2 = 0; j2 < KB; j2++) {
          var acc2 = 0; for (var a = 0; a < g.c; a++) { var gi2 = i2 < g.r ? g.d[i2 * g.c + a] : 0, gj2 = j2 < g.r ? g.d[j2 * g.c + a] : 0; acc2 += gi2 * gj2; }
          SB.d[i2 * KB + j2] += a2 * acc2;
        }
      });
      var eA = eigSym(SA), eB = eigSym(SB);
      // rotate bases
      var newUA = eA.vecs.map(function (v) { var u = new Float64Array(MODS[m].din); for (var k = 0; k < KA; k++) { var w = v[k], ua = self.UA[m][k]; for (var i = 0; i < u.length; i++) u[i] += w * ua[i]; } return u; });
      var newUB = eB.vecs.map(function (v) { var u = new Float64Array(MODS[m].dout); for (var k = 0; k < KB; k++) { var w = v[k], ub = self.UB[m][k]; for (var i = 0; i < u.length; i++) u[i] += w * ub[i]; } return u; });
      // coefficients: G* = VB^T G VA (padded to full)
      this.stored.forEach(function (s) {
        var g = s.G[m], Gs = Mat(KB, KA);
        for (var b2 = 0; b2 < KB; b2++) for (var a3 = 0; a3 < KA; a3++) {
          var acc3 = 0;
          for (var bb = 0; bb < g.r; bb++) for (var aa = 0; aa < g.c; aa++) acc3 += eB.vecs[b2][bb] * g.d[bb * g.c + aa] * eA.vecs[a3][aa];
          Gs.d[b2 * KA + a3] = acc3;
        }
        s.G[m] = Gs;
      });
      this.UA[m] = newUA; this.UB[m] = newUB;
      spectra.push({ A: eA.vals, B: eB.vals });
    }
    return spectra;
  };

  // first candidate-set size that satisfies the admission rule (same rule as Memory.admit)
  function firstAdmit(curve, tau, dAbs) {
    dAbs = dAbs === undefined ? 0.01 : dAbs;
    if (curve[0].C >= 1 - 1e-4) return 0;
    for (var k = 0; k < curve.length; k++) if (admitOK(curve.slice(0, k + 1), k, tau, dAbs)) return k;
    var b = 0; for (var j = 1; j < curve.length; j++) if (curve[j].C > curve[b].C) b = j;
    return b;
  }

  // capture curve C(k) for an arbitrary ordering of the residual candidates (same memory state)
  function curveFor(world, task, proj, cands, order, useNM, stop) {
    var out = [];
    var a0 = useNM ? normMatch(task, proj) : 1;
    var c0 = capture(world, task, proj, a0);
    out.push({ k: 0, C: c0.C, D: c0.D, alpha: a0 });
    if (stop && (c0.C >= 1 - 1e-4 || admitOK(out, 0, stop.tau, stop.dAbs))) return out;
    for (var k = 1; k <= order.length; k++) {
      var rec = proj.map(function (P) { return clone(P); });
      for (var i = 0; i < k; i++) { var c = cands[order[i]]; outerAdd(rec[c.m], c.s, c.u, c.v); }
      var a = useNM ? normMatch(task, rec) : 1;
      var ck = capture(world, task, rec, a);
      out.push({ k: k, C: ck.C, D: ck.D, alpha: a });
      if (stop && admitOK(out, k, stop.tau, stop.dAbs)) break;
    }
    return out;
  }

  function captureOf(world, task, dWs) { return capture(world, task, dWs, 1).C; }

  return {
    DIMS: DIMS, MODS: MODS, FAMILY_NAMES: FAMILY_NAMES,
    rngFrom: rngFrom, createWorld: createWorld, makeTask: makeTask, makeStream: makeStream,
    Memory: Memory, captureOf: captureOf, capture: capture, curveFor: curveFor, firstAdmit: firstAdmit, normMatch: normMatch, predict: predict, makeNet: makeNet,
    la: { Mat: Mat, mul: mul, add: add, sub: sub, scale: scale, frob2: frob2, svd: svd, lowRankSVD: lowRankSVD, topKEig: topKEig, eigSym: eigSym, project: project, coreOf: coreOf, expand: expand, cpqr: cpqr }
  };
})();
if (typeof module !== 'undefined') module.exports = FMLCore;
