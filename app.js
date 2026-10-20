(function () {
"use strict";
// ---------------------------------------------------------------- shared helpers
var $ = function (s, el) { return (el || document).querySelector(s); };
var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function cssv(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function fmt(x, d) { if (x === null || x === undefined || isNaN(x)) return '–'; return (+x).toFixed(d === undefined ? 2 : d); }
function fmtInt(x) { return Math.round(x).toLocaleString('en-US'); }
function fmtK(x) { if (Math.abs(x) < 1000) return String(Math.round(x)); if (Math.abs(x) >= 1e6) return (x / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M'; var v = x / 1000; return (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, '') + 'k'; }
function el(tag, attrs, text) {
  var e = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); });
  if (text !== undefined) e.textContent = text;
  return e;
}
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

// theme changes: canvases re-read their colors
var themeHooks = [];
function onTheme(fn) { themeHooks.push(fn); }
function fireTheme() { themeHooks.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
if (window.matchMedia) {
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mq.addEventListener) mq.addEventListener('change', fireTheme); else if (mq.addListener) mq.addListener(fireTheme);
}
new MutationObserver(fireTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });

// redraw on width change only
function watchWidth(node, fn) {
  var w = -1;
  var pending = false;
  var ro = new ResizeObserver(function () {
    if (pending) return; pending = true;
    requestAnimationFrame(function () { pending = false; var nw = Math.round(node.clientWidth); if (nw !== w && nw > 0) { w = nw; fn(nw); } });
  });
  ro.observe(node);
}

// canvas with device-pixel-ratio scaling
function fitCanvas(cv, cssW, cssH) {
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.style.height = cssH + 'px';
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  var ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// ---------------------------------------------------------------- tooltip
var tipEl = null;
function tipShow(evt, head, rows) {
  tipEl = tipEl || document.getElementById('tip');
  tipEl.textContent = '';
  if (head) tipEl.appendChild(el('div', { class: 't-h' }, head));
  rows.forEach(function (r) {
    var row = el('div', { class: 't-r' });
    var key = el('i'); key.style.background = r.c || 'transparent'; if (!r.c) key.style.width = '0';
    row.appendChild(key);
    row.appendChild(el('b', null, r.v));
    if (r.l) row.appendChild(el('span', null, r.l));
    tipEl.appendChild(row);
  });
  tipEl.classList.add('on');
  var x = evt.clientX, y = evt.clientY;
  var r = tipEl.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
  var left = x + 14, top = y + 14;
  if (left + r.width > vw - 8) left = x - r.width - 14;
  if (top + r.height > vh - 8) top = y - r.height - 14;
  tipEl.style.left = Math.max(8, left) + 'px'; tipEl.style.top = Math.max(8, top) + 'px';
}
function tipHide() { (tipEl || document.getElementById('tip')).classList.remove('on'); }

// ---------------------------------------------------------------- svg chart scaffolding (d3)
function svgFrame(container, w, h, m) {
  var sel = d3.select(container);
  sel.selectAll('svg').remove();
  var svg = sel.append('svg').attr('viewBox', '0 0 ' + w + ' ' + h).attr('width', w).attr('height', h).attr('role', 'img');
  var host = container.closest ? container.closest('.fig, .pg, .heat, div') : null, pt = container.parentNode && container.parentNode.querySelector ? container.parentNode.querySelector('.panel-title') : null;
  var fh = container.closest ? container.closest('.fig') : null, h3 = fh ? fh.querySelector('h3') : null;
  var name = (pt ? pt.textContent : '') || (h3 ? h3.textContent : '') || 'Chart';
  svg.attr('aria-label', name.trim() + '. Values are listed in the tooltip and in the figure caption or table.');
  var g = svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')');
  return { svg: svg, g: g, iw: w - m.l - m.r, ih: h - m.t - m.b };
}
function styleText(selection, size, color, weight) {
  return selection.style('font-family', 'var(--font-ui)').style('font-size', (size || 11) + 'px').style('fill', color || 'var(--muted)').style('font-weight', weight || 400);
}
function halo(sel) { return sel.style('paint-order', 'stroke').style('stroke', 'var(--surface)').style('stroke-width', '4px').style('stroke-linejoin', 'round'); }
function gridY(g, y, iw, ticks, fmtFn) {
  var tv = Array.isArray(ticks) ? ticks : y.ticks(ticks || 5);
  var gg = g.append('g');
  tv.forEach(function (v) {
    gg.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(v)).attr('y2', y(v)).style('stroke', 'var(--grid)').style('stroke-width', 1);
    styleText(gg.append('text').attr('x', -8).attr('y', y(v)).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmtFn ? fmtFn(v) : v), 10.5).style('font-variant-numeric', 'tabular-nums');
  });
  return gg;
}
function axisX(g, x, ih, ticks, fmtFn, opts) {
  opts = opts || {};
  var tv = Array.isArray(ticks) ? ticks : x.ticks(ticks || 5);
  var gg = g.append('g');
  gg.append('line').attr('x1', x.range()[0]).attr('x2', x.range()[1]).attr('y1', ih).attr('y2', ih).style('stroke', 'var(--axis)').style('stroke-width', 1);
  tv.forEach(function (v) {
    var xx = x(v);
    if (opts.grid) gg.append('line').attr('x1', xx).attr('x2', xx).attr('y1', 0).attr('y2', ih).style('stroke', 'var(--grid)');
    gg.append('line').attr('x1', xx).attr('x2', xx).attr('y1', ih).attr('y2', ih + 4).style('stroke', 'var(--axis)');
    styleText(gg.append('text').attr('x', xx).attr('y', ih + 16).attr('text-anchor', 'middle').text(fmtFn ? fmtFn(v) : v), 10.5).style('font-variant-numeric', 'tabular-nums');
  });
  if (opts.label) styleText(gg.append('text').attr('x', (x.range()[0] + x.range()[1]) / 2).attr('y', ih + 32).attr('text-anchor', 'middle').text(opts.label), 11, 'var(--ink-2)');
  return gg;
}
function setPressed(group, btn) { $$('button', group).forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); }); }
function makeSeg(container, items, initial, onPick) {
  container.textContent = '';
  items.forEach(function (it) {
    var b = el('button', { type: 'button', 'aria-pressed': it.v === initial ? 'true' : 'false' }, it.label);
    b.addEventListener('click', function () { setPressed(container, b); onPick(it.v); });
    container.appendChild(b);
  });
}
function makeChips(container, items, initial, onPick) {
  container.textContent = '';
  items.forEach(function (it) {
    var b = el('button', { type: 'button', class: 'chip', 'aria-pressed': it.v === initial ? 'true' : 'false' });
    if (it.dot) { var d = el('span', { class: 'dot' }); d.style.background = it.dot; b.appendChild(d); }
    b.appendChild(document.createTextNode(it.label));
    if (it.small) b.appendChild(el('small', null, it.small));
    b.addEventListener('click', function () { $$('.chip', container).forEach(function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); }); onPick(it.v); });
    container.appendChild(b);
  });
}
// diverging heat colour (blue - mid - red), read from tokens
var heatLUT = null;
function buildHeatLUT() {
  var neg = d3.rgb(cssv('--heat-neg')), mid = d3.rgb(cssv('--heat-mid')), pos = d3.rgb(cssv('--heat-pos'));
  heatLUT = new Uint8ClampedArray(256 * 3);
  for (var i = 0; i < 256; i++) {
    var t = i / 255 * 2 - 1, a, b, u;
    if (t < 0) { a = mid; b = neg; u = Math.pow(-t, 0.75); } else { a = mid; b = pos; u = Math.pow(t, 0.75); }
    heatLUT[i * 3] = a.r + (b.r - a.r) * u; heatLUT[i * 3 + 1] = a.g + (b.g - a.g) * u; heatLUT[i * 3 + 2] = a.b + (b.b - a.b) * u;
  }
}
onTheme(function () { heatLUT = null; });
function drawHeat(cv, rows, cols, getter, vmax, cell) {
  if (!heatLUT) buildHeatLUT();
  cell = cell || 1;
  cv.width = cols * cell; cv.height = rows * cell;
  var ctx = cv.getContext('2d'), img = ctx.createImageData(cols * cell, rows * cell), d = img.data;
  for (var i = 0; i < rows; i++) for (var j = 0; j < cols; j++) {
    var v = getter(i, j), t = vmax > 0 ? clamp(v / vmax, -1, 1) : 0, k = Math.round((t + 1) / 2 * 255) * 3;
    for (var a = 0; a < cell; a++) for (var b = 0; b < cell; b++) {
      var p = ((i * cell + a) * cols * cell + (j * cell + b)) * 4;
      d[p] = heatLUT[k]; d[p + 1] = heatLUT[k + 1]; d[p + 2] = heatLUT[k + 2]; d[p + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
function maxAbs(arr) { var m = 0; for (var i = 0; i < arr.length; i++) { var a = Math.abs(arr[i]); if (a > m) m = a; } return m; }

// ---------------------------------------------------------------- sticky nav: border on scroll, current chapter
(function nav() {
  var bar = document.getElementById('navbar'); if (!bar) return;
  var links = Array.prototype.slice.call(bar.querySelectorAll('[data-sec]'));
  var sections = links.map(function (a) { return document.getElementById(a.getAttribute('data-sec')); }).filter(Boolean);
  var pending = false;
  function update() {
    pending = false;
    bar.classList.toggle('scrolled', window.scrollY > 8);
    // Follow the reading position even when disclosures change section heights.
    var marker = bar.getBoundingClientRect().bottom + 24, active = null;
    sections.forEach(function (section) {
      var rect = section.getBoundingClientRect();
      if (rect.top <= marker && rect.bottom > marker) active = section.id;
    });
    links.forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('data-sec') === active ? 'true' : 'false'); });
  }
  function schedule() { if (!pending) { pending = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  document.addEventListener('toggle', schedule, true);
  update();
})();

// ---------------------------------------------------------------- hero: what it costs to keep 440 adapters
(function hero() {
  var cv = $('#heroCanvas'), spark = $('#heroSpark'), scrub = $('#heroScrub');
  var N = 440, F = PAPER.basis.fml, Wt = PAPER.basis.weight, ORDER = PAPER.order;
  var RAW_PER = 3072;                       // rank 16 × 96 modules × (A side + B side)
  var REC = PAPER.retention && PAPER.retention.recovery ? PAPER.retention.recovery.fml : null;
  var MAXB = 90000;
  var s = reduceMotion ? N : 96, playing = !reduceMotion, fast = true, holdT = 0, visible = true, lastTs = 0;
  var ctx, W = 0, H = 0, L = {}, colAdapter = null, colors = {};
  var sctx, SW = 0, SH = 54;
  var lastShown = -1;

  function readColors() {
    colors = {
      ink: cssv('--ink'), ink2: cssv('--ink-2'), muted: cssv('--muted'), faint: cssv('--faint'), rule: cssv('--rule'), grid: cssv('--grid'),
      surface: cssv('--surface'), surface2: cssv('--surface-2'), fml: cssv('--fml'), fmlInk: cssv('--fml-ink'), weight: cssv('--weight'),
      wash: cssv('--fml-wash'), axis: cssv('--axis'), weightInk: cssv('--weight-ink'), ref: cssv('--ref'),
      seq: [cssv('--seq1'), cssv('--seq2'), cssv('--seq3'), cssv('--seq4')]
    };
    var dark = d3.hsl(colors.surface).l < 0.5;
    colors.ramp = d3.interpolateRgb(dark ? d3.rgb(28, 63, 108) : d3.rgb(20, 66, 129), d3.rgb(colors.fml));
    colors.dark = dark;
  }
  function interp(arr, x) { // arr[i] = value after adapter i; x = adapters consolidated (float)
    if (x <= 0) return 0;
    if (x >= N) return arr[N - 1];
    var i = Math.floor(x), f = x - i, a = i === 0 ? 0 : arr[i - 1];
    return a + (arr[i] - a) * f;
  }
  function recBin(i) { // per-task share of the LoRA's ROUGE-L gain that FML keeps
    if (!REC || REC[i] === null || REC[i] === undefined) return -1;
    var r = REC[i];
    return r >= 0.95 ? 3 : r >= 0.8 ? 2 : r >= 0.5 ? 1 : 0;
  }
  function layout() {
    W = cv.clientWidth; if (!W) return;
    var mobile = W < 640;
    H = mobile ? 520 : 330;
    ctx = fitCanvas(cv, W, H);
    var pad = 16;
    if (!mobile) {
      L = { mobile: false, qx: pad + 4, qy: 64, gap: 40,
        rx0: W * 0.215, rx1: W * 0.665, ry: 84, rh: 22, rgap: 36,
        gx0: W * 0.71, gx1: W - pad, gy0: 64, gy1: H - 52, gcols: 20 };
    } else {
      L = { mobile: true, qx: pad, qy: 46, gap: 0,
        rx0: pad, rx1: W - pad, ry: 130, rh: 20, rgap: 34,
        gx0: pad, gx1: W - pad, gy0: 352, gy1: H - 44, gcols: 40 };
    }
    var bw = Math.max(1, Math.round(L.rx1 - L.rx0));
    colAdapter = new Int16Array(bw);
    var a = 0;
    for (var px = 0; px < bw; px++) {
      var d = (px + 0.5) / bw * MAXB;
      while (a < N - 1 && F[a] < d) a++;
      colAdapter[px] = F[a] >= d ? a : -1;
    }
    SW = scrub.clientWidth; sctx = fitCanvas(spark, SW, SH);
    draw(); drawSpark();
  }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function drawCard(c, i, x, y, scale, alpha) {
    var id = ORDER[i], h = hash(id), w = 92 * scale, hh = 30 * scale;
    c.save(); c.globalAlpha = alpha;
    roundRect(c, x, y - hh / 2, w, hh, 6 * scale);
    c.fillStyle = colors.surface; c.fill();
    c.lineWidth = 1; c.strokeStyle = colors.rule; c.stroke();
    var cs = 3.2 * scale, bx = x + 7 * scale, byy = y - 3 * cs;
    for (var r = 0; r < 6; r++) for (var k = 0; k < 2; k++) {
      var v = ((h >>> ((r * 2 + k) % 29)) & 7) / 7;
      c.fillStyle = v > 0.5 ? colors.fml : colors.surface2; c.globalAlpha = alpha * (0.35 + 0.65 * Math.abs(v - 0.5) * 2);
      c.fillRect(bx + k * cs, byy + r * cs, cs - 0.6, cs - 0.6);
    }
    var ax = bx + 2 * cs + 3 * scale, ay = y - cs;
    for (var r2 = 0; r2 < 2; r2++) for (var k2 = 0; k2 < 6; k2++) {
      var v2 = ((h >>> ((r2 * 6 + k2 + 7) % 29)) & 7) / 7;
      c.fillStyle = v2 > 0.5 ? colors.fml : colors.surface2; c.globalAlpha = alpha * (0.35 + 0.65 * Math.abs(v2 - 0.5) * 2);
      c.fillRect(ax + k2 * cs, ay + r2 * cs, cs - 0.6, cs - 0.6);
    }
    c.globalAlpha = alpha;
    c.fillStyle = colors.ink; c.font = '500 ' + (11 * scale) + 'px "Geist Mono", ui-monospace, monospace';
    c.textBaseline = 'middle'; c.fillText(id, ax + 6 * cs + 5 * scale, y + 0.5);
    c.restore();
  }
  function text(c, t, x, y, color, align, size, weight, haloOn) {
    c.save(); c.font = (weight || 500) + ' ' + (size || 11) + 'px "Geist", "Helvetica Neue", Arial, sans-serif';
    c.textAlign = align || 'left'; c.textBaseline = 'alphabetic';
    if (haloOn) { c.lineWidth = 4; c.strokeStyle = colors.surface; c.lineJoin = 'round'; c.strokeText(t, x, y); }
    c.fillStyle = color; c.fillText(t, x, y); c.restore();
  }
  function rowY(k) { return L.ry + k * (L.rh + L.rgap); } // 0 raw, 1 weight-ranked, 2 FML
  function draw() {
    if (!ctx) return;
    var c = ctx; c.clearRect(0, 0, W, H);
    var n = Math.floor(s), frac = s - n;
    var bw = L.rx1 - L.rx0, X = function (v) { return L.rx0 + Math.min(v, MAXB) / MAXB * bw; };
    var rawV = RAW_PER * Math.min(s, N), wV = interp(Wt, s), fV = interp(F, s);
    // tracks
    for (var k = 0; k < 3; k++) { c.fillStyle = colors.surface2; c.fillRect(L.rx0, rowY(k), bw, L.rh); }
    // raw LoRAs: every adapter keeps all 3,072 of its directions
    var rx = X(rawV);
    c.fillStyle = colors.ref; c.fillRect(L.rx0, rowY(0), rx - L.rx0, L.rh);
    if (rawV > MAXB) { // torn edge: the bar runs off the chart
      c.fillStyle = colors.surface; c.beginPath();
      var ex = L.rx1 - 10, y0 = rowY(0), y1 = y0 + L.rh;
      c.moveTo(ex, y0 - 1); for (var z = 0; z <= 4; z++) c.lineTo(ex + (z % 2 ? 7 : 2), y0 + z * L.rh / 4); c.lineTo(L.rx1 + 2, y1 + 1); c.lineTo(L.rx1 + 2, y0 - 1); c.closePath(); c.fill();
    }
    // ours, ranked by weight
    c.fillStyle = colors.weight; c.fillRect(L.rx0, rowY(1), X(wV) - L.rx0, L.rh);
    // FML, colored by when each direction was admitted
    var fx = X(fV), lim = Math.min(colAdapter.length, Math.floor(fx - L.rx0));
    for (var px = 0; px < lim; px++) {
      var a = colAdapter[px]; if (a < 0) continue;
      c.fillStyle = colors.ramp(a / (N - 1)); c.fillRect(L.rx0 + px, rowY(2), 1.02, L.rh);
    }
    if (n > 0 && n < N && playing) {
      var gx = X(interp(F, Math.max(0, s - 6)));
      var grad = c.createLinearGradient(gx, 0, fx, 0); grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, colors.fml);
      c.globalAlpha = 0.55; c.fillStyle = grad; c.fillRect(gx, rowY(2), Math.max(0, fx - gx), L.rh); c.globalAlpha = 1;
    }
    // axis
    var axY = rowY(2) + L.rh + 18;
    c.strokeStyle = colors.axis; c.lineWidth = 1; c.beginPath(); c.moveTo(L.rx0, axY + 0.5); c.lineTo(L.rx1, axY + 0.5); c.stroke();
    [0, 20000, 40000, 60000, 80000].forEach(function (v) {
      var x = X(v); c.beginPath(); c.moveTo(x + 0.5, axY); c.lineTo(x + 0.5, axY + 4); c.stroke();
      text(c, v ? fmtK(v) : '0', x, axY + 16, colors.muted, 'center', 10.5, 400);
    });
    text(c, 'directions stored', L.rx0, axY + 32, colors.muted, 'left', 10.5, 400);
    // ---- stored tasks, colored by how much of each LoRA's gain FML keeps
    var cols = L.gcols, rows = Math.ceil(N / cols);
    var cw = (L.gx1 - L.gx0) / cols, ch = Math.min(cw, (L.gy1 - L.gy0) / rows), cell = Math.max(2, Math.min(cw, ch) - 1.5);
    for (var i = 0; i < N; i++) {
      var gx2 = L.gx0 + (i % cols) * cw, gy2 = L.gy0 + Math.floor(i / cols) * ch, b = recBin(i);
      c.fillStyle = i < n ? (b < 0 ? colors.faint : colors.seq[b]) : colors.surface2;
      c.fillRect(gx2, gy2, cell, cell);
    }
    // legend under the grid
    var ly = L.gy0 + rows * ch + 16, lx = L.gx0, labs = ['≥95%', '80–95%', '50–80%', '<50%'];
    c.save(); c.font = '500 10px "Geist", "Helvetica Neue", Arial, sans-serif';
    [3, 2, 1, 0].forEach(function (bi, j) {
      c.fillStyle = colors.seq[bi]; c.fillRect(lx, ly - 8, 9, 9);
      text(c, labs[j], lx + 13, ly, colors.ink2, 'left', 10, 500);
      lx += 13 + c.measureText(labs[j]).width + 12;
    });
    c.restore();
    // ---- queue and the adapter in flight
    var qx = L.qx, qy = L.qy;
    if (!L.mobile) {
      for (var q = 5; q >= 0; q--) {
        var idx = n + q; if (idx >= N) continue;
        var p = s - idx;
        if (p < 0) drawCard(c, idx, qx, qy + (-p) * L.gap, 1, clamp(1.25 - (-p) / 5, 0, 1));
      }
    } else {
      for (var q3 = 3; q3 >= 0; q3--) {
        var idx3 = n + q3; if (idx3 >= N) continue;
        var p3 = s - idx3;
        if (p3 < 0) drawCard(c, idx3, qx + (-p3) * 104, qy + 12, 1, clamp(1.2 - (-p3) / 3.5, 0, 1));
      }
    }
    if (n < N) {
      var t = easeInOut(clamp(frac / 0.8, 0, 1));
      var sx = qx, sy = L.mobile ? qy + 12 : qy, exx = Math.max(L.rx0, fx - 30), ey = rowY(2) + L.rh / 2;
      var cx = lerp(sx, exx, t), cy = lerp(sy, ey, t) - Math.sin(t * Math.PI) * 26;
      var sc = lerp(1, 0.5, t), al = frac < 0.8 ? 1 : clamp(1 - (frac - 0.8) / 0.2, 0, 1);
      if (frac > 0.02) drawCard(c, n, cx, cy, sc, al);
      if (frac > 0.55) {
        var u = easeInOut(clamp((frac - 0.55) / 0.45, 0, 1));
        var tgx = L.gx0 + (n % cols) * cw, tgy = L.gy0 + Math.floor(n / cols) * ch, bb = recBin(n);
        c.fillStyle = bb < 0 ? colors.faint : colors.seq[bb];
        c.fillRect(lerp(fx, tgx, u), lerp(ey, tgy, u) - Math.sin(u * Math.PI) * 30, cell + 2, cell + 2);
      }
    }
    // ---- labels last, so moving cards never cover them
    text(c, 'INCOMING ADAPTERS', L.qx, L.mobile ? 22 : 32, colors.muted, 'left', 10.5, 600, true);
    text(c, 'STORED TASKS · GAIN KEPT', L.gx0, L.gy0 - 14, colors.muted, 'left', 10.5, 600, true);
    var names = ['Raw LoRAs', 'Ours, ranked by weight', 'FML'];
    var vals = [rawV, wV, fV];
    for (var r3 = 0; r3 < 3; r3++) {
      var yy = rowY(r3);
      text(c, names[r3].toUpperCase(), L.rx0, yy - 7, colors.muted, 'left', 10, 600, true);
      var v = vals[r3], ex2 = X(v), lab = fmtInt(v);
      if (r3 === 0 && fV > 0) lab += '  ·  ' + (v / fV).toFixed(1) + '× FML';
      if (r3 === 1 && fV > 0) lab += '  ·  ' + (v / fV).toFixed(1) + '× FML';
      var inside = r3 === 0 ? v > MAXB * 0.55 : false;
      text(c, lab, inside ? L.rx1 - 18 : Math.min(ex2 + 8, L.rx1 - 4), yy + L.rh / 2 + 4, inside ? '#ffffff' : colors.ink, inside ? 'right' : (ex2 + 8 > L.rx1 - 120 ? 'right' : 'left'), 11.5, 600, !inside);
    }
  }
  function drawSpark() {
    if (!sctx) return;
    var c = sctx; c.clearRect(0, 0, SW, SH);
    var top = 6, bot = SH - 14, x = function (i) { return 6 + i / (N - 1) * (SW - 12); }, y = function (v) { return bot - Math.min(v, MAXB) / MAXB * (bot - top); };
    c.fillStyle = colors.wash; c.beginPath(); c.moveTo(x(0), bot);
    for (var i = 0; i < N; i++) c.lineTo(x(i), y(F[i]));
    c.lineTo(x(N - 1), bot); c.closePath(); c.fill();
    c.lineWidth = 1.5; c.strokeStyle = colors.ref; c.beginPath(); // raw LoRAs leave the chart almost at once
    c.moveTo(x(0), y(RAW_PER)); c.lineTo(x(MAXB / RAW_PER - 1), y(MAXB)); c.stroke();
    c.lineWidth = 1.5; c.strokeStyle = colors.weight; c.beginPath();
    for (var j = 0; j < N; j++) { if (j) c.lineTo(x(j), y(Wt[j])); else c.moveTo(x(j), y(Wt[j])); } c.stroke();
    c.lineWidth = 2; c.strokeStyle = colors.fml; c.beginPath();
    for (var k = 0; k < N; k++) { if (k) c.lineTo(x(k), y(F[k])); else c.moveTo(x(k), y(F[k])); } c.stroke();
    var px = x(clamp(s - 1, 0, N - 1));
    c.fillStyle = colors.surface; c.globalAlpha = 0.6; c.fillRect(px + 1, 0, SW - px, SH - 12); c.globalAlpha = 1;
    c.strokeStyle = colors.ink; c.lineWidth = 1.5; c.beginPath(); c.moveTo(px, 2); c.lineTo(px, bot + 2); c.stroke();
    c.fillStyle = colors.ink; c.beginPath(); c.arc(px, y(interp(F, s)), 4, 0, Math.PI * 2); c.fill();
    text(c, 'adapter 1', 6, SH - 2, colors.muted, 'left', 10, 400);
    text(c, '440', SW - 6, SH - 2, colors.muted, 'right', 10, 400);
  }
  function updateStats() {
    var n = Math.floor(s);
    if (n === lastShown) return; lastShown = n;
    var A = $('#stA'); A.textContent = ''; A.appendChild(document.createTextNode(String(n) + ' ')); A.appendChild(el('small', null, '/ 440'));
    $('#stAs').textContent = n < N ? 'next: ' + ORDER[n] : 'stream complete';
    var fb = n ? F[n - 1] : 0, wb = n ? Wt[n - 1] : 0, rb = RAW_PER * n;
    $('#stB').textContent = fmtInt(fb);
    $('#stBs').textContent = n ? 'raw LoRAs: ' + fmtInt(rb) : 'raw LoRAs: 3,072 per adapter';
    $('#stC').textContent = n ? (Math.round((1 - fb / rb) * 1000) / 10) + '%' : '–';
    $('#stCs').textContent = n ? (rb / fb).toFixed(1) + '× fewer directions' : '';
    scrub.setAttribute('aria-valuenow', String(Math.max(1, n)));
    scrub.setAttribute('aria-valuetext', 'adapter ' + n + ' of 440');
  }
  function setPlaying(p) {
    playing = p;
    $('#heroPlayIcon').setAttribute('d', p ? 'M4 3h3v10H4zM9 3h3v10H9z' : 'M4 2.5v11l9-5.5z');
    $('#heroPlay').setAttribute('aria-label', p ? 'Pause replay' : 'Play replay');
    if (p) lastTs = 0;
  }
  function tick(ts) {
    requestAnimationFrame(tick);
    if (!visible || document.hidden) { lastTs = 0; return; }
    if (!lastTs) { lastTs = ts; }
    var dt = Math.min(0.1, (ts - lastTs) / 1000); lastTs = ts;
    if (playing) {
      if (s >= N) { holdT += dt; if (holdT > 2.6) { s = 0; holdT = 0; } }
      else s = Math.min(N, s + dt * (fast ? 16 : 1.6));
      draw(); drawSpark(); updateStats();
    }
  }
  $('#heroPlay').addEventListener('click', function () { if (!playing && s >= N) { s = 0; holdT = 0; } setPlaying(!playing); });
  $('#heroSlow').addEventListener('click', function (e) { fast = false; setPressed($('#heroSlow').parentNode, e.currentTarget); });
  $('#heroFast').addEventListener('click', function (e) { fast = true; setPressed($('#heroFast').parentNode, e.currentTarget); });
  function scrubTo(evt) {
    var r = scrub.getBoundingClientRect();
    s = Math.round(clamp((evt.clientX - r.left - 6) / (r.width - 12), 0, 1) * (N - 1)) + 1; holdT = 0;
    draw(); drawSpark(); updateStats();
  }
  var dragging = false;
  scrub.addEventListener('pointerdown', function (e) { dragging = true; scrub.setPointerCapture(e.pointerId); setPlaying(false); scrubTo(e); });
  scrub.addEventListener('pointermove', function (e) { if (dragging) scrubTo(e); });
  scrub.addEventListener('pointerup', function () { dragging = false; });
  scrub.addEventListener('keydown', function (e) {
    var step = e.shiftKey ? 20 : 1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') s = clamp(Math.floor(s) + step, 0, N);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') s = clamp(Math.floor(s) - step, 0, N);
    else if (e.key === 'Home') s = 0; else if (e.key === 'End') s = N; else return;
    e.preventDefault(); setPlaying(false); draw(); drawSpark(); updateStats();
  });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(cv);
  readColors();
  onTheme(function () { readColors(); draw(); drawSpark(); });
  watchWidth(cv, layout);
  setPlaying(playing);
  updateStats();
  requestAnimationFrame(tick);
})();

// ---------------------------------------------------------------- Observation 1: rescaling one direction
(function alphaFig() {
  var tasks = PAPER.alpha; // [{task, cap, alpha_nm, pts:[[a,rec]...]}]
  var cur = tasks.filter(function (t) { return t.task === '1428'; })[0] || tasks[0], alpha = 1;
  var slider = $('#alphaSlider');
  function range() { var p = cur.pts; return [p[0][0], p[p.length - 1][0]]; }
  function toSlider(a) { var r = range(); return Math.round((Math.log(a) - Math.log(r[0])) / (Math.log(r[1]) - Math.log(r[0])) * 1000); }
  function fromSlider(v) { var r = range(); return Math.exp(Math.log(r[0]) + v / 1000 * (Math.log(r[1]) - Math.log(r[0]))); }
  function recAt(a) {
    var p = cur.pts, la = Math.log(a);
    if (a <= p[0][0]) return p[0][1];
    for (var i = 1; i < p.length; i++) if (a <= p[i][0]) { var t = (la - Math.log(p[i - 1][0])) / (Math.log(p[i][0]) - Math.log(p[i - 1][0])); return lerp(p[i - 1][1], p[i][1], t); }
    return p[p.length - 1][1];
  }
  function isMeasured(a) { return cur.pts.some(function (q) { return Math.abs(Math.log(q[0] / a)) < 0.01; }); }
  makeChips($('#alphaTasks'), tasks.map(function (t) { return { v: t.task, label: 'task ' + t.task, small: 'cap ' + fmt(t.cap, 2) }; }), cur.task, function (v) {
    cur = tasks.filter(function (t) { return t.task === v; })[0]; alpha = cur.alpha_nm; slider.value = toSlider(alpha); render();
  });
  slider.addEventListener('input', function () { alpha = fromSlider(+slider.value); render(); });
  $('#alphaSnap').addEventListener('click', function () { alpha = cur.alpha_nm; slider.value = toSlider(alpha); render(); });
  $('#alphaOne').addEventListener('click', function () { alpha = 1; slider.value = toSlider(1); render(); });

  function renderGeo() {
    var box = $('#alphaGeo'), w = Math.max(280, box.clientWidth), h = 150;
    var f = svgFrame(box, w, h, { l: 10, r: 14, t: 10, b: 24 });
    var g = f.g, iw = f.iw, ih = f.ih;
    var c = Math.sqrt(cur.cap), th = Math.acos(c);
    var R = Math.min(iw * 0.42, (ih - 10) / Math.max(0.5, Math.sin(th)));
    var ox = 8, oy = ih - 6;
    // subspace line (the shared basis)
    g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', oy).attr('y2', oy).style('stroke', 'var(--axis)').style('stroke-width', 1.5);
    styleText(g.append('text').attr('x', iw).attr('y', oy + 18).attr('text-anchor', 'end').text('span of the retained direction'), 10.5);
    // unit arc = norm of the trained update
    var arc = d3.arc()({ innerRadius: R, outerRadius: R, startAngle: Math.PI / 2 - 1.25, endAngle: Math.PI / 2 });
    g.append('path').attr('d', arc).attr('transform', 'translate(' + ox + ',' + oy + ')').style('fill', 'none').style('stroke', 'var(--rule)').style('stroke-width', 1.2).style('stroke-dasharray', '3 3');
    styleText(g.append('text').attr('x', ox + R * Math.cos(1.25) + 6).attr('y', oy - R * Math.sin(1.25)).text('‖ΔW‖'), 10.5);
    function arrow(x2, y2, color, width, id) {
      var defs = f.svg.select('defs').empty() ? f.svg.append('defs') : f.svg.select('defs');
      defs.append('marker').attr('id', id).attr('viewBox', '0 0 10 10').attr('refX', 8).attr('refY', 5).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto-start-reverse')
        .append('path').attr('d', 'M0,0 L10,5 L0,10 z').style('fill', color);
      g.append('line').attr('x1', ox).attr('y1', oy).attr('x2', x2).attr('y2', y2).style('stroke', color).style('stroke-width', width).attr('marker-end', 'url(#' + id + ')');
    }
    var tx = ox + R * Math.cos(th), ty = oy - R * Math.sin(th);
    // drop line
    g.append('line').attr('x1', tx).attr('y1', ty).attr('x2', tx).attr('y2', oy).style('stroke', 'var(--faint)').style('stroke-dasharray', '2 3');
    // angle arc
    var aArc = d3.arc()({ innerRadius: 26, outerRadius: 26, startAngle: Math.PI / 2 - th, endAngle: Math.PI / 2 });
    g.append('path').attr('d', aArc).attr('transform', 'translate(' + ox + ',' + oy + ')').style('fill', 'none').style('stroke', 'var(--muted)');
    if (iw > 380) halo(styleText(g.append('text').attr('x', ox + 34 * Math.cos(th / 2) + 2).attr('y', oy - 34 * Math.sin(th / 2) + 4).text(Math.round(th * 180 / Math.PI) + '°'), 10.5, 'var(--ink-2)'));
    // scaled projection (the knob)
    var L = alpha * c * R, maxL = iw - ox - 6, over = L > maxL;
    arrow(ox + Math.min(L, maxL), oy, 'var(--fml)', 3, 'agArrS');
    // plain projection
    arrow(ox + c * R, oy - 0.01, 'var(--ink-2)', 1.5, 'agArrP');
    // original
    arrow(tx, ty, 'var(--ink)', 2, 'agArrO');
    styleText(g.append('text').attr('x', tx + 8).attr('y', ty - 4).text('trained update ΔW'), 11, 'var(--ink)', 600);
    var lab = 'α × projection' + (over ? '  →  ' + fmt(alpha * c, 1) + ' ‖ΔW‖' : '');
    styleText(g.append('text').attr('x', ox + Math.min(L, maxL)).attr('y', oy + 18).attr('text-anchor', L > iw * 0.55 ? 'end' : 'start').text(lab), 10.5, 'var(--fml-ink)', 600);
    if ($('#alphaGeoNote')) $('#alphaGeoNote').textContent = 'kept energy ' + Math.round(cur.cap * 100) + '%';
  }
  function renderChart() {
    var box = $('#alphaChart'), w = Math.max(300, box.clientWidth), h = 230;
    var f = svgFrame(box, w, h, { l: 40, r: 14, t: 14, b: 36 });
    var g = f.g, iw = f.iw, ih = f.ih;
    var x = d3.scaleLog().domain([0.5, 10]).range([0, iw]), y = d3.scaleLinear().domain([-1.1, 1.25]).range([ih, 0]);
    gridY(g, y, iw, [-1, -0.5, 0, 0.5, 1], function (v) { return v === 0 ? '0' : fmt(v, 1); });
    axisX(g, x, ih, [0.5, 1, 2, 3, 5, 10], function (v) { return v + '×'; }, { label: 'scale α (log)' });
    // references
    g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(1)).attr('y2', y(1)).style('stroke', 'var(--ink-2)').style('stroke-width', 1);
    styleText(g.append('text').attr('x', iw - 2).attr('y', y(1) - 5).attr('text-anchor', 'end').text('trained adapter'), 10, 'var(--ink-2)');
    g.append('line').attr('x1', 0).attr('x2', iw).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--faint)').style('stroke-width', 1);
    styleText(g.append('text').attr('x', iw - 2).attr('y', y(0) - 5).attr('text-anchor', 'end').text('base model'), 10, 'var(--muted)');
    var line = d3.line().x(function (d) { return x(d[0]); }).y(function (d) { return y(d[1]); });
    g.append('path').attr('d', line(cur.pts)).style('fill', 'none').style('stroke', 'var(--fml)').style('stroke-width', 2).style('stroke-linejoin', 'round');
    cur.pts.forEach(function (p) {
      g.append('circle').attr('cx', x(p[0])).attr('cy', y(p[1])).attr('r', 4).style('fill', 'var(--fml)').style('stroke', 'var(--surface)').style('stroke-width', 2);
    });
    // norm-matched marker
    var nm = cur.alpha_nm, nmr = recAt(nm);
    g.append('rect').attr('x', x(nm) - 7).attr('y', y(nmr) - 7).attr('width', 14).attr('height', 14).style('fill', 'none').style('stroke', 'var(--ink)').style('stroke-width', 2);
    styleText(g.append('text').attr('x', x(nm)).attr('y', y(nmr) + 22).attr('text-anchor', 'middle').text('norm-matched'), 10, 'var(--ink-2)', 600);
    // cursor
    var a = alpha, r = recAt(a);
    g.append('line').attr('x1', x(a)).attr('x2', x(a)).attr('y1', 0).attr('y2', ih).style('stroke', 'var(--ink)').style('stroke-width', 1);
    g.append('circle').attr('cx', x(a)).attr('cy', y(r)).attr('r', 6).style('fill', 'var(--surface)').style('stroke', 'var(--ink)').style('stroke-width', 2);
    // drag on chart
    var hit = g.append('rect').attr('width', iw).attr('height', ih).style('fill', 'transparent').style('cursor', 'ew-resize');
    function setFromEvent(ev) {
      var pt = d3.pointer(ev, g.node()), rr = range();
      alpha = clamp(x.invert(pt[0]), rr[0], rr[1]); slider.value = toSlider(alpha); render();
    }
    var drag = false;
    hit.on('pointerdown', function (ev) { drag = true; this.setPointerCapture(ev.pointerId); setFromEvent(ev); })
      .on('pointermove', function (ev) {
        if (drag) { setFromEvent(ev); return; }
        var pt = d3.pointer(ev, g.node()), best = null, bd = 1e9;
        cur.pts.forEach(function (p) { var dd = Math.abs(x(p[0]) - pt[0]); if (dd < bd) { bd = dd; best = p; } });
        if (best && bd < 24) tipShow(ev, 'task ' + cur.task + ' · α = ' + fmt(best[0], 2) + '× (' + fmt(best[0] / cur.alpha_nm, 1) + ' × norm-matched)', [{ c: 'var(--fml)', v: fmt(best[1], 2), l: 'recovery (measured)' }]);
        else tipHide();
      })
      .on('pointerup', function () { drag = false; })
      .on('pointerleave', function () { drag = false; tipHide(); });
  }
  function render() {
    renderGeo(); renderChart();
    var r = recAt(alpha);
    $('#alphaOut').textContent = fmt(alpha, 2) + '×';
    var read = $('#alphaRead'); read.textContent = '';
    function item(lbl, v, hi) { var d = el('div', hi ? { class: 'hi' } : null, lbl); d.appendChild(el('b', null, Math.round(v * 100) + '%')); read.appendChild(d); }
    item('recovered at α = ' + fmt(alpha, 2), r, false);
    item('norm-matched (α = ' + fmt(cur.alpha_nm, 2) + ')', recAt(cur.alpha_nm), true);
  }
  slider.value = toSlider(alpha);
  watchWidth($('#figAlpha'), render);
})();

// ---------------------------------------------------------------- Observation 2: sparse gates
(function gatesFig() {
  var Q17 = PAPER_TABLES.q17, lambdas = Q17.lambdas, TOTAL = 3072;
  var cur = Q17.tasks[0], li = 3, shown = cur.open[li], anim = null;
  var cv = $('#gateWaffle'), ctx = null, cw = 0;
  makeChips($('#gateTasks'), Q17.tasks.map(function (t) { return { v: t.task, label: 'task ' + t.task }; }), cur.task, function (v) {
    cur = Q17.tasks.filter(function (t) { return t.task === v; })[0]; go();
  });
  makeSeg($('#gateLambda'), lambdas.map(function (l, i) { return { v: i, label: l.label }; }), li, function (v) { li = v; go(); });
  function drawWaffle(count) {
    if (!ctx) return;
    var cols = 96, rows = 32, gap = cw < 520 ? 0.6 : 1, cell = (cw - (cols - 1) * gap) / cols;
    var hgt = rows * cell + (rows - 1) * gap;
    ctx.clearRect(0, 0, cw, hgt + 2);
    var on = cssv('--fml'), off = cssv('--surface-2');
    for (var k = 0; k < cols * rows; k++) {
      // fill column-major so each module (column) fills before the next
      var c = Math.floor(k / rows), r = k % rows;
      ctx.fillStyle = k < count ? on : off;
      ctx.fillRect(c * (cell + gap), r * (cell + gap), cell, cell);
    }
    if (count > 0 && count < 700) { // ring the few kept cells so they are easy to find
      var colsUsed = Math.ceil(count / rows), wRing = colsUsed * (cell + gap) - gap;
      ctx.strokeStyle = cssv('--ink'); ctx.lineWidth = 1.5;
      ctx.strokeRect(-0.5, -0.5, wRing + 1.5, Math.min(count, rows) * (cell + gap) - gap + 1.5);
      ctx.font = '600 12px "Geist", "Helvetica Neue", Arial, sans-serif'; ctx.textBaseline = 'middle';
      var tx = wRing + 8, ty = Math.min(count, rows) * (cell + gap) / 2;
      ctx.lineWidth = 4; ctx.strokeStyle = cssv('--surface'); ctx.strokeText(count + ' kept', tx, ty);
      ctx.fillStyle = cssv('--ink'); ctx.fillText(count + ' kept', tx, ty);
    }
  }
  function layout() {
    cw = cv.parentNode.clientWidth; if (!cw) return;
    var cols = 96, rows = 32, gap = cw < 520 ? 0.6 : 1, cell = (cw - (cols - 1) * gap) / cols;
    ctx = fitCanvas(cv, cw, rows * cell + (rows - 1) * gap + 1);
    drawWaffle(shown); renderBullet();
  }
  function renderRead() {
    var n = cur.open[li], box = $('#gateRead'); box.textContent = '';
    function item(lbl, val) { var d = el('div', null, lbl); d.appendChild(el('b', null, val)); box.appendChild(d); }
    item('directions kept', fmtInt(n) + ' / 3,072');
    item('ROUGE-L', fmt(cur.rl[li], 3));
    item('trained adapter', fmt(cur.trained, 3));
    if ($('#gateWaffleNote')) $('#gateWaffleNote').textContent = 'λ = ' + lambdas[li].label + ' · task ' + cur.task;
  }
  function renderBullet() {
    var box = $('#gateBullet'), w = Math.max(260, box.clientWidth), h = 86;
    var f = svgFrame(box, w, h, { l: 8, r: 16, t: 18, b: 26 });
    var g = f.g, iw = f.iw;
    var x = d3.scaleLinear().domain([0, 1]).range([0, iw]);
    axisX(g, x, 34, [0, 0.25, 0.5, 0.75, 1], function (v) { return fmt(v, 2); });
    g.append('rect').attr('x', 0).attr('y', 8).attr('width', iw).attr('height', 18).attr('rx', 4).style('fill', 'var(--surface-2)');
    g.append('rect').attr('x', x(cur.base)).attr('y', 8).attr('width', Math.max(0, x(cur.rl[li]) - x(cur.base))).attr('height', 18).attr('rx', 4).style('fill', 'var(--fml)');
    function tick(v, lbl, color, above) {
      g.append('line').attr('x1', x(v)).attr('x2', x(v)).attr('y1', 2).attr('y2', 32).style('stroke', color).style('stroke-width', 2);
      styleText(g.append('text').attr('x', x(v)).attr('y', above ? -4 : 44).attr('text-anchor', v > 0.85 ? 'end' : (v < 0.1 ? 'start' : 'middle')).text(lbl), 10, color === 'var(--faint)' ? 'var(--muted)' : 'var(--ink-2)', 600);
    }
    tick(cur.base, 'base ' + fmt(cur.base, 3), 'var(--faint)', true);
    tick(cur.trained, 'trained ' + fmt(cur.trained, 3), 'var(--ink)', true);
  }
  function go() {
    renderRead(); renderBullet();
    var target = cur.open[li], from = shown, t0 = performance.now();
    if (anim) cancelAnimationFrame(anim);
    if (reduceMotion) { shown = target; drawWaffle(shown); return; }
    (function step(now) {
      var u = clamp((now - t0) / 450, 0, 1), e = easeInOut(u);
      shown = Math.round(from + (target - from) * e); drawWaffle(shown);
      if (u < 1) anim = requestAnimationFrame(step);
    })(t0);
  }
  onTheme(function () { drawWaffle(shown); });
  watchWidth($('#figGates'), layout);
  renderRead();
})();

// ---------------------------------------------------------------- FML playground (live toy implementation)
var PG = (function playground() {
  var S = {
    seed: 11, T: 40, tau: 0.98, Q: 48, nm: true, dAbs: 0.01, firstRun: true, opts: { m: 8, nFeat: 40, delta: 0.8, inert: 0.4 },
    world: null, stream: null, memF: null, memW: null, trF: [], trW: [], colAdmit: null, audit: null,
    t: 0, step: 0, mod: 0, inputIdx: 0, cpk: 0, playing: false, timer: null, token: 0, ready: false, curves: {}, worldSeed: -1
  };
  var MODS = FMLCore.MODS;
  var STEP_NAMES = ['Project', 'Rescale', 'Check', 'Rank', 'Admit'];
  var view = $('#pgView'), stepsBox = $('#pgSteps');

  // ---- computation (chunked so the page stays responsive)
  function compute(keepT) {
    var token = ++S.token;
    S.ready = false; stopPlay();
    if (S.worldSeed !== S.seed || !S.world) {
      S.world = FMLCore.createWorld(S.seed, S.opts);
      S.stream = FMLCore.makeStream(S.world, S.T, S.opts);
      S.worldSeed = S.seed;
    }
    S.memF = new FMLCore.Memory('functional'); S.memW = new FMLCore.Memory('weight');
    S.trF = []; S.trW = []; S.curves = {}; S.audit = null; S.needF = []; S.needW = [];
    S.colAdmit = MODS.map(function () { return { A: [], B: [] }; });
    var cfg = { tau: S.tau, Q: S.Q, normMatch: S.nm, dAbs: S.dAbs };
    var i = 0;
    $('#pgToast').textContent = 'Computing…';
    (function chunk() {
      if (token !== S.token) return;
      var end = Math.min(S.T, i + 1);
      for (; i < end; i++) {
        var task = S.stream[i];
        var tf = S.memF.admit(S.world, task, cfg);
        tf.added.forEach(function (ad, m) { ad.A.forEach(function (k) { S.colAdmit[m].A[k] = i; }); ad.B.forEach(function (k) { S.colAdmit[m].B[k] = i; }); });
        S.trF.push(tf);
        var kw = 0;
        if (tf.cands.length) {
          var wOrd = tf.cands.map(function (_, j) { return j; }).sort(function (a, b) { return tf.cands[b].s - tf.cands[a].s; });
          kw = FMLCore.firstAdmit(FMLCore.curveFor(S.world, task, tf.proj, tf.cands, wOrd, S.nm, { tau: S.tau, dAbs: S.dAbs }), S.tau, S.dAbs);
        }
        S.needF.push(tf.chosen.length); S.needW.push(kw);
        var tw = S.memW.admit(S.world, task, cfg);
        S.trW.push({ C0: tw.C0, Cpost: tw.Cpost, size: tw.size, nAdd: tw.chosen.length });
      }
      $('#pgToast').textContent = i < S.T ? 'Computing adapter ' + i + ' of ' + S.T + '…' : '';
      if (i < S.T) { setTimeout(chunk, 0); return; }
      S.audit = S.memF.driftAudit();
      S.ready = true;
      if (!keepT) S.t = S.firstRun ? 3 : 0;
      S.firstRun = false;
      S.t = Math.min(S.t, S.T - 1);
      S.cpk = 0;
      $('#pgT').max = String(S.T);
      render();
      resetRerank();
    })();
  }

  // ---- helpers
  function curvesFor(t) {
    if (S.curves[t]) return S.curves[t];
    var tr = S.trF[t], task = S.stream[t];
    if (!tr.cands.length) { S.curves[t] = { f: tr.hist, w: tr.hist, kw: 0 }; return S.curves[t]; }
    var full = tr.order.length;
    var fOrder = tr.order;
    var wOrder = tr.cands.map(function (_, j) { return j; }).sort(function (a, b) { return tr.cands[b].s - tr.cands[a].s; });
    var f = FMLCore.curveFor(S.world, task, tr.proj, tr.cands, fOrder, S.nm);
    var w = FMLCore.curveFor(S.world, task, tr.proj, tr.cands, wOrder, S.nm);
    S.curves[t] = { f: f, w: w, wOrder: wOrder, fOrder: fOrder, kf: tr.chosen.length, kw: FMLCore.firstAdmit(w, S.tau, S.dAbs) };
    return S.curves[t];
  }
  function candLabel(c, tr) {
    var idx = 0; for (var j = 0; j < tr.cands.length; j++) { if (tr.cands[j] === c) break; if (tr.cands[j].m === c.m) idx++; }
    return 'L' + (c.m + 1) + '·' + (idx + 1);
  }
  function totalNorm(list) { var s = 0; list.forEach(function (W) { s += FMLCore.la.frob2(W); }); return Math.sqrt(s); }
  function gauge(parent, value, tau, label, raw) {
    var wrap = el('div');
    var lab = el('div', { class: 'readout' });
    lab.appendChild(document.createTextNode(label + ' '));
    lab.appendChild(el('strong', null, fmt(value, 3)));
    wrap.appendChild(lab);
    var g = el('div', { class: 'gauge' });
    var fill = el('div', { class: 'fill' + (raw ? ' raw' : '') }); fill.style.width = clamp(value, 0, 1) * 100 + '%';
    var tk = el('div', { class: 'tau' }); tk.style.left = 'calc(' + tau * 100 + '% - 1px)';
    tk.appendChild(el('span', null, 'τ = ' + fmt(tau, 3)));
    g.appendChild(fill); g.appendChild(tk); wrap.appendChild(g);
    parent.appendChild(wrap);
  }
  function heatBox(parent, title, shape, W, vmax) {
    var box = el('div', { class: 'heat' });
    var hl = el('div', { class: 'hl' }, title); hl.appendChild(el('span', null, shape));
    box.appendChild(hl);
    var cv = el('canvas'); box.appendChild(cv);
    drawHeat(cv, W.r, W.c, function (i, j) { return W.d[i * W.c + j]; }, vmax, 2);
    parent.appendChild(box);
    return box;
  }
  function p(parent, html) { var e = el('p', { class: 'lede' }); e.innerHTML = html; parent.appendChild(e); return e; }

  // ---- step header
  function renderSteps() {
    if (!S.ready) return;
    var tr = S.trF[S.t];
    stepsBox.textContent = '';
    var vals = [
      'keeps ' + Math.round(tr.energyKept * 100) + '%',
      S.nm ? 'α = ' + fmt(tr.alpha0, 2) : 'α = 1 (off)',
      'C = ' + fmt(tr.C0, 3),
      tr.cands.length ? tr.cands.length + ' candidates' : 'not needed',
      tr.chosen.length ? '+' + tr.chosen.length + (tr.chosen.length === 1 ? ' direction' : ' directions') : 'nothing new'
    ];
    STEP_NAMES.forEach(function (nm, i) {
      var b = el('button', { type: 'button', class: 'step', role: 'tab', 'aria-selected': i === S.step ? 'true' : 'false', id: 'pgStep' + i });
      b.appendChild(el('span', { class: 'sn' }, String(i + 1)));
      b.appendChild(el('span', { class: 'st' }, nm));
      b.appendChild(el('span', { class: 'sv' }, vals[i]));
      if (i === 2 && !tr.cands.length) b.classList.add('pass');
      if (i === 4 && !tr.chosen.length) b.classList.add('pass');
      b.addEventListener('click', function () { S.step = i; renderSteps(); renderView(); });
      stepsBox.appendChild(b);
    });
  }

  // ---- step views
  function viewProject(tr, task) {
    var kept = Math.round(tr.energyKept * 100);
    p(view, S.t === 0 ? 'The memory is empty, so <b>no directions are yet represented</b>.' : 'The memory already spans <b>' + kept + '%</b> of this adapter\'s weight energy.');
    var rows = MODS.map(function (md, m) {
      var e0 = FMLCore.la.frob2(task.mods[m].dW), e1 = FMLCore.la.frob2(tr.proj[m]);
      return { l: 'Layer ' + (m + 1), v: e0 ? e1 / e0 : 0 };
    });
    rows.push({ l: 'Both layers', v: tr.energyKept, total: true });
    var leg = el('div', { class: 'legend' });
    var k1 = el('span', { class: 'key fml' }); k1.appendChild(el('i', { class: 'sq' })); k1.appendChild(document.createTextNode('represented in the basis')); leg.appendChild(k1);
    var k2 = el('span', { class: 'key ref' }); var i2 = el('i', { class: 'sq' }); i2.style.background = 'var(--surface-3)'; k2.appendChild(i2); k2.appendChild(document.createTextNode('new (residual)')); leg.appendChild(k2);
    view.appendChild(leg);
    var box = el('div', { class: 'chart' }); view.appendChild(box);
    var w = Math.max(280, view.clientWidth), bh = 26, gap = 18, h = rows.length * (bh + gap) + 4;
    var f = svgFrame(box, w, h, { l: 96, r: 10, t: 4, b: 0 });
    var x = d3.scaleLinear().domain([0, 1]).range([0, f.iw]);
    rows.forEach(function (r, i) {
      var y = i * (bh + gap) + (r.total ? 8 : 0);
      styleText(f.g.append('text').attr('x', -10).attr('y', y + bh / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text(r.l), 12, r.total ? 'var(--ink)' : 'var(--ink-2)', r.total ? 700 : 500);
      f.g.append('rect').attr('x', 0).attr('y', y).attr('width', f.iw).attr('height', bh).attr('rx', 4).style('fill', 'var(--surface-3)');
      f.g.append('rect').attr('x', 0).attr('y', y).attr('width', Math.max(0, x(r.v))).attr('height', bh).attr('rx', 4).style('fill', 'var(--fml)');
      var inside = x(r.v) > 60;
      styleText(f.g.append('text').attr('x', inside ? x(r.v) - 8 : x(r.v) + 8).attr('y', y + bh / 2).attr('dy', '0.32em').attr('text-anchor', inside ? 'end' : 'start').text(Math.round(r.v * 100) + '%'), 12, inside ? '#fff' : 'var(--ink)', 700);
    });
  }
  function viewRescale(tr, task) {
    var n0 = totalNorm(task.mods.map(function (md) { return md.dW; })), n1 = totalNorm(tr.proj);
    if (!S.nm) p(view, 'Norm matching is off, so <b>α = 1</b>.');
    else if (S.t === 0 || n1 === 0) p(view, 'Nothing projects yet, so <b>α = 1</b>.');
    else p(view, 'One scale <b>α = ' + fmt(tr.alpha0, 2) + '</b> restores the norm. Capture changes from <b>' + fmt(tr.C0raw, 2) + ' → ' + fmt(tr.C0, 2) + '</b>.');
    var box = el('div', { class: 'chart' }); view.appendChild(box);
    var w = Math.max(280, view.clientWidth), h = 120;
    var f = svgFrame(box, w, h, { l: 150, r: 60, t: 6, b: 6 });
    var rows = [{ l: 'Incoming ‖ΔW‖', v: n0, c: 'var(--ink)' }, { l: 'Projected ‖ΔW̃‖', v: n1, c: 'var(--ref)' }, { l: 'Rescaled ‖α ΔW̃‖', v: (S.nm && n1 > 0 ? tr.alpha0 : 1) * n1, c: 'var(--fml)' }];
    var x = d3.scaleLinear().domain([0, n0 * 1.05]).range([0, f.iw]), bh = 18, gap = 18;
    rows.forEach(function (r, i) {
      var y = i * (bh + gap) + 4;
      styleText(f.g.append('text').attr('x', -10).attr('y', y + bh / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text(r.l), 11.5, 'var(--ink-2)');
      f.g.append('rect').attr('x', 0).attr('y', y).attr('width', Math.max(1, x(r.v))).attr('height', bh).attr('rx', 3).style('fill', r.c);
      styleText(f.g.append('text').attr('x', x(r.v) + 6).attr('y', y + bh / 2).attr('dy', '0.32em').text(fmt(r.v, 2)), 11, 'var(--ink-2)').style('font-variant-numeric', 'tabular-nums');
    });
    var gg = el('div', { class: 'grid2' }); gg.style.marginTop = '1rem';
    gauge(gg, tr.C0raw, S.tau, 'Capture of the plain projection', true);
    gauge(gg, tr.C0, S.tau, S.nm ? 'Capture after rescaling' : 'Capture used for the check (no rescaling)');
    view.appendChild(gg);
  }
  function viewCheck(tr, task) {
    var pass = !tr.cands.length;
    p(view, pass ? 'Capture <b>' + fmt(tr.C0, 3) + '</b> clears τ: <b>nothing new is needed</b>.'
      : (tr.C0 >= S.tau ? 'Capture <b>' + fmt(tr.C0, 3) + '</b> clears τ, but the leftover KL is above the floor: <b>keep going</b>.'
        : 'Capture <b>' + fmt(tr.C0, 3) + '</b> is below τ = ' + fmt(S.tau, 2) + ': <b>residual admission is required</b>.'));
    gauge(view, tr.C0, S.tau, 'Capture before admission');
    var n = task.Xeval.length, i = S.inputIdx % n;
    var head = el('div', { class: 'panel-title' }); head.appendChild(document.createTextNode('Predicted class distribution, one unlabelled input'));
    var nx = el('button', { class: 'btn', type: 'button' }, 'Another input (' + (i + 1) + ' of ' + n + ')');
    nx.addEventListener('click', function () { S.inputIdx = (S.inputIdx + 1) % n; renderView(); });
    var hw = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:.4rem' });
    hw.appendChild(head); hw.appendChild(nx); view.appendChild(hw);
    var box = el('div', { class: 'chart' }); view.appendChild(box);
    var Pt = task.Pt[i], Ph = tr.P0hat[i], P0 = task.P0[i];
    function kl(pp, q) { var s = 0; for (var k = 0; k < pp.length; k++) if (pp[k] > 0) s += pp[k] * Math.log(pp[k] / Math.max(q[k], 1e-300)); return s; }
    var rows = [{ l: 'Adapter p_t', d: Pt, c: 'var(--ink)', note: 'target' }, { l: 'Rescaled projection p̂', d: Ph, c: 'var(--fml)', note: 'KL ' + fmt(kl(Pt, Ph), 3) }, { l: 'Base model p₀', d: P0, c: 'var(--ref)', note: 'KL ' + fmt(kl(Pt, P0), 3) }];
    var w = Math.max(300, view.clientWidth), rh = 46, h = rows.length * (rh + 10) + 16;
    var f = svgFrame(box, w, h, { l: 148, r: 64, t: 4, b: 14 });
    var C = Pt.length, x = d3.scaleBand().domain(d3.range(C)).range([0, f.iw]).padding(0.18);
    var ymax = Math.max(d3.max(Pt), d3.max(Ph), d3.max(P0));
    rows.forEach(function (r, ri) {
      var y0 = ri * (rh + 10);
      var y = d3.scaleLinear().domain([0, ymax]).range([rh, 0]);
      f.g.append('line').attr('x1', 0).attr('x2', f.iw).attr('y1', y0 + rh).attr('y2', y0 + rh).style('stroke', 'var(--axis)');
      styleText(f.g.append('text').attr('x', -10).attr('y', y0 + rh / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text(r.l), 11.5, 'var(--ink-2)');
      styleText(f.g.append('text').attr('x', f.iw + 8).attr('y', y0 + rh / 2).attr('dy', '0.32em').text(r.note), 10.5, 'var(--muted)');
      for (var k = 0; k < C; k++) {
        var v = r.d[k];
        f.g.append('rect').attr('x', x(k)).attr('y', y0 + y(v)).attr('width', x.bandwidth()).attr('height', Math.max(0, rh - y(v))).style('fill', r.c);
      }
    });
    styleText(f.g.append('text').attr('x', f.iw / 2).attr('y', h - 6).attr('text-anchor', 'middle').text('24 output classes'), 10, 'var(--muted)');
  }
  function viewRank(tr, task) {
    if (!tr.cands.length) {
      p(view, 'Nothing to rank: <b>no new directions needed</b>.');
      return;
    }
    var J = tr.cands.length, Q = tr.H.length;
    p(view, 'Select the direction with the largest <b>unexplained functional signal</b>, then remove its contribution from the remaining candidates.');
    var ctrl = el('div', { class: 'fig-controls rank-controls' });
    var bStep = el('button', { class: 'btn primary', id: 'rank-next', type: 'button' }, S.cpk < J ? 'Select ' + candLabel(tr.cands[tr.cp.order[S.cpk]], tr) : 'Order complete');
    var bPrev = el('button', { class: 'btn', id: 'rank-back', type: 'button' }, 'Back');
    var bReset = el('button', { class: 'btn', id: 'rank-reset', type: 'button' }, 'Restart');
    bStep.disabled = S.cpk >= J;
    bPrev.disabled = S.cpk === 0;
    bReset.disabled = S.cpk === 0;
    bStep.addEventListener('click', function () { S.cpk = Math.min(J, S.cpk + 1); renderView(); $(S.cpk < J ? '#rank-next' : '#rank-back').focus({ preventScroll: true }); });
    bPrev.addEventListener('click', function () { S.cpk = Math.max(0, S.cpk - 1); renderView(); $(S.cpk ? '#rank-back' : '#rank-next').focus({ preventScroll: true }); });
    bReset.addEventListener('click', function () { S.cpk = 0; renderView(); $('#rank-next').focus({ preventScroll: true }); });
    ctrl.appendChild(bStep); ctrl.appendChild(bPrev); ctrl.appendChild(bReset);
    ctrl.appendChild(el('span', { class: 'readout' }, S.cpk + ' / ' + J + ' selected'));
    // residual sketch after k pivots
    var cols = [];
    for (var j = 0; j < J; j++) { var v = new Float64Array(Q); for (var q = 0; q < Q; q++) v[q] = tr.H[q][j]; cols.push(v); }
    var order = tr.cp.order, used = new Uint8Array(J);
    for (var s = 0; s < S.cpk; s++) {
      var b = order[s], nb = Math.sqrt(cols[b].reduce(function (a, x) { return a + x * x; }, 0));
      used[b] = 1;
      if (nb < 1e-14) continue;
      var qv = cols[b].map(function (x) { return x / nb; });
      for (var j2 = 0; j2 < J; j2++) if (!used[j2]) { var pr = 0; for (var q2 = 0; q2 < Q; q2++) pr += qv[q2] * cols[j2][q2]; for (var q3 = 0; q3 < Q; q3++) cols[j2][q3] -= pr * qv[q3]; }
    }
    var resn = cols.map(function (c, jj) { return used[jj] ? 0 : Math.sqrt(c.reduce(function (a, z) { return a + z * z; }, 0)); });
    var full = tr.cp.trace[0], fmax = d3.max(full) || 1;
    var focus = el('div', { class: 'rank-focus', 'aria-live': 'polite' });
    focus.appendChild(el('div', { class: 'rank-status' }, S.cpk ? 'Selected ' + candLabel(tr.cands[order[S.cpk - 1]], tr) + ' · pivot ' + S.cpk : 'Before the first pivot'));
    focus.appendChild(el('h4', null, S.cpk < J ? 'Next direction: ' + candLabel(tr.cands[order[S.cpk]], tr) : 'All candidates are ordered'));
    focus.appendChild(el('p', null, S.cpk === J ? 'Ranking is complete. Admission checks the required number of directions.' : S.cpk ? 'The remaining sketch norms are recomputed after removing the selected direction’s contribution.' : 'The first pivot has the largest functional sketch norm.'));
    view.appendChild(focus);
    view.appendChild(ctrl);
    // Evaluate the actual reconstructed prefix, not the CPQR sketch norm.
    var cv2 = curvesFor(S.t);
    var captureCurve = cv2.f, captureNow = captureCurve[S.cpk].C;
    var capturePrev = captureCurve[Math.max(0, S.cpk - 1)].C;
    var captureDelta = captureNow - capturePrev;
    var capturePanel = el('div', { class: 'rank-capture' });
    var captureHead = el('div', { class: 'rank-capture-head', 'aria-live': 'polite' });
    captureHead.appendChild(el('span', null, 'Functional capture C'));
    captureHead.appendChild(el('strong', { id: 'rank-capture-value' }, fmt(captureNow, 3)));
    captureHead.appendChild(el('span', { class: 'rank-capture-delta' }, S.cpk ? (captureDelta >= 0 ? '+' : '') + fmt(captureDelta, 3) + ' this pivot' : 'Projection before any additions'));
    capturePanel.appendChild(captureHead);
    var captureBox = el('div', { class: 'chart', id: 'rank-capture-chart' });
    capturePanel.appendChild(captureBox);
    view.appendChild(capturePanel);
    var cf = svgFrame(captureBox, Math.max(260, view.clientWidth - 24), 132, { l: 38, r: 12, t: 18, b: 30 });
    var cx = d3.scaleLinear().domain([0, J]).range([0, cf.iw]);
    var captureLo = Math.floor((Math.min(d3.min(captureCurve, function (d) { return d.C; }), S.tau) - .015) * 20) / 20;
    var cy = d3.scaleLinear().domain([captureLo, 1]).range([cf.ih, 0]);
    gridY(cf.g, cy, cf.iw, 3, function (v) { return fmt(v, 2); });
    axisX(cf.g, cx, cf.ih, d3.range(0, J + 1, J > 10 ? 4 : J > 5 ? 2 : 1), null, { label: 'selected directions (k)' });
    cf.g.append('line').attr('x1', 0).attr('x2', cf.iw).attr('y1', cy(S.tau)).attr('y2', cy(S.tau)).style('stroke', 'var(--ink-2)').style('stroke-dasharray', '4 3');
    styleText(cf.g.append('text').attr('x', cf.iw).attr('y', cy(S.tau) - 5).attr('text-anchor', 'end').text('τ = ' + fmt(S.tau, 3)), 10, 'var(--ink-2)');
    var captureSeen = captureCurve.slice(0, S.cpk + 1);
    cf.g.append('path').attr('d', d3.line().x(function (d) { return cx(d.k); }).y(function (d) { return cy(d.C); })(captureSeen)).style('fill', 'none').style('stroke', 'var(--fml)').style('stroke-width', 2.5);
    captureSeen.forEach(function (d, i) { cf.g.append('circle').attr('cx', cx(d.k)).attr('cy', cy(d.C)).attr('r', i === S.cpk ? 4.5 : 2.5).style('fill', 'var(--fml)').append('title').text('k = ' + d.k + ': C = ' + fmt(d.C, 3)); });
    cf.svg.attr('aria-label', 'Functional capture after ' + S.cpk + ' selected directions: ' + fmt(captureNow, 3) + '. Capture threshold: ' + fmt(S.tau, 3) + '. Focused vertical axis from ' + fmt(captureLo, 2) + ' to 1.');
    if (captureNow >= S.tau) capturePanel.appendChild(el('p', { class: 'rank-note' }, 'Capture threshold reached.'));
    var remaining = d3.range(J).filter(function (j) { return !used[j]; }).sort(function (a, b) { return resn[b] - resn[a] || a - b; });
    if (remaining.length) {
      var chart = el('div', { class: 'rank-candidates' });
      chart.appendChild(el('div', { class: 'panel-title' }, 'Largest remaining sketch norms'));
      remaining.slice(0, 5).forEach(function (j) {
        var row = el('div', { class: 'rank-candidate' + (j === order[S.cpk] ? ' is-next' : '') });
        row.appendChild(el('span', { class: 'rank-candidate-label' }, candLabel(tr.cands[j], tr) + (j === order[S.cpk] ? ' · next' : '')));
        var track = el('span', { class: 'rank-track', 'aria-hidden': 'true' });
        var bar = el('span'); bar.style.width = (100 * resn[j] / fmax) + '%'; track.appendChild(bar);
        row.appendChild(track);
        row.appendChild(el('span', { class: 'rank-value' }, fmt(100 * resn[j] / fmax, 1) + '%'));
        chart.appendChild(row);
      });
      chart.appendChild(el('p', { class: 'rank-note' }, 'Largest initial sketch norm = 100% · L1 / L2 = model layers'));
      view.appendChild(chart);
    }
    var history = el('div', { class: 'rank-history' });
    history.appendChild(el('span', { class: 'rank-history-label' }, 'Selection order'));
    if (!S.cpk) history.appendChild(el('span', { class: 'rank-note' }, 'No directions selected yet.'));
    order.slice(0, S.cpk).forEach(function (j, k) {
      history.appendChild(el('span', { class: 'rank-history-chip' }, (k + 1) + '. ' + candLabel(tr.cands[j], tr)));
    });
    view.appendChild(history);

  }
  function viewAdmit(tr, task) {
    var cv2 = curvesFor(S.t);
    var addA = 0, addB = 0; tr.added.forEach(function (a) { addA += a.A.length; addB += a.B.length; });
    if (!tr.cands.length) p(view, 'Stored as coefficients on existing directions: <b>the memory does not grow</b>.');
    else p(view, 'FML adds <b>' + tr.chosen.length + '</b> direction' + (tr.chosen.length === 1 ? '' : 's') + ' to meet the criterion. Weight ranking requires <b>' + cv2.kw + '</b>.');
    if (tr.cands.length) {
      var box = el('div', { class: 'chart' }); view.appendChild(box);
      var leg = el('div', { class: 'legend' }); leg.appendChild(el('span', { class: 'key fml' }, '')); leg.firstChild.appendChild(el('i')); leg.firstChild.appendChild(document.createTextNode('Functional (CPQR) order'));
      var k2 = el('span', { class: 'key weight' }); k2.appendChild(el('i')); k2.appendChild(document.createTextNode('Weight (σ) order')); leg.appendChild(k2);
      box.appendChild(leg);
      var w = Math.max(300, view.clientWidth), h = 200;
      var f = svgFrame(box, w, h, { l: 40, r: 16, t: 10, b: 34 });
      var J = cv2.f.length - 1;
      var lo = Math.min(d3.min(cv2.f, function (d) { return d.C; }), d3.min(cv2.w, function (d) { return d.C; }));
      var y = d3.scaleLinear().domain([Math.max(-0.2, Math.min(lo, S.tau - 0.1)), 1]).range([f.ih, 0]).nice();
      var x = d3.scaleLinear().domain([0, J]).range([0, f.iw]);
      gridY(f.g, y, f.iw, 5, function (v) { return fmt(v, 2); });
      axisX(f.g, x, f.ih, d3.range(0, J + 1, J > 10 ? 2 : 1), null, { label: 'directions added (k)' });
      f.g.append('line').attr('x1', 0).attr('x2', f.iw).attr('y1', y(S.tau)).attr('y2', y(S.tau)).style('stroke', 'var(--ink)').style('stroke-width', 1);
      styleText(f.g.append('text').attr('x', f.iw).attr('y', y(S.tau) - 5).attr('text-anchor', 'end').text('τ = ' + fmt(S.tau, 3)), 10, 'var(--ink-2)', 600);
      var line = d3.line().x(function (d) { return x(d.k); }).y(function (d) { return y(Math.max(d.C, y.domain()[0])); });
      [['w', 'var(--weight)'], ['f', 'var(--fml)']].forEach(function (pair) {
        var arr = cv2[pair[0]];
        f.g.append('path').attr('d', line(arr)).style('fill', 'none').style('stroke', pair[1]).style('stroke-width', 2);
        arr.forEach(function (d) { f.g.append('circle').attr('cx', x(d.k)).attr('cy', y(Math.max(d.C, y.domain()[0]))).attr('r', 3).style('fill', pair[1]).style('stroke', 'var(--surface)').style('stroke-width', 1.5); });
      });
      var kf = tr.chosen.length, kw = cv2.kw;
      function mark(k, arr, color, lbl, dy) {
        var d = arr[Math.min(k, arr.length - 1)];
        f.g.append('circle').attr('cx', x(k)).attr('cy', y(Math.max(d.C, y.domain()[0]))).attr('r', 6.5).style('fill', 'none').style('stroke', color).style('stroke-width', 2);
        halo(styleText(f.g.append('text').attr('x', x(k)).attr('y', y(Math.max(d.C, y.domain()[0])) + dy).attr('text-anchor', x(k) > f.iw - 60 ? 'end' : 'middle').text(lbl), 10.5, 'var(--ink)', 600));
      }
      mark(kf, cv2.f, 'var(--fml)', 'FML stops: k = ' + kf, 20);
      if (kw !== kf) mark(kw, cv2.w, 'var(--weight)', 'weight: k = ' + kw, -12);
      var hit = f.g.append('rect').attr('width', f.iw).attr('height', f.ih).style('fill', 'transparent');
      hit.on('pointermove', function (ev) {
        var k = clamp(Math.round(x.invert(d3.pointer(ev, f.g.node())[0])), 0, J);
        tipShow(ev, 'k = ' + k + ' directions added', [{ c: 'var(--fml)', v: fmt(cv2.f[k].C, 3), l: 'functional order' }, { c: 'var(--weight)', v: fmt(cv2.w[k].C, 3), l: 'weight order' }]);
      }).on('pointerleave', tipHide);
    }
    // stored representation
    var st = el('div', { class: 'panel-title' }); st.style.marginTop = '1rem';
    st.appendChild(document.createTextNode('Kept for this task')); st.appendChild(el('span', null, 'coefficients and a global scale'));
    view.appendChild(st);
    var heats = el('div', { class: 'heats' });
    var ranks = tr.G.map(function (G) { if (!G.r || !G.c) return 0; var comps = FMLCore.la.svd(G, 1e-9); return comps.length; });
    tr.G.forEach(function (G, m) {
      var vmax = maxAbs(G.d) * 0.8 || 1;
      var bx = heatBox(heats, 'Layer ' + (m + 1) + ' core G', G.r + '×' + G.c, G, vmax);
      var cv = bx.querySelector('canvas'); cv.style.width = Math.min(200, Math.max(90, G.c * 9)) + 'px';
    });
    var info = el('div', { class: 'heat' });
    info.appendChild(el('div', { class: 'hl' }, 'Scale'));
    var big = el('div', { class: 'big-readout' }); var d1 = el('div', null, 'α'); d1.appendChild(el('b', null, fmt(tr.alpha, 3))); big.appendChild(d1);
    info.appendChild(big);
    heats.appendChild(info);
    view.appendChild(heats);
  }

  function renderView() {
    if (!S.ready) return;
    var tr = S.trF[S.t], task = S.stream[S.t];
    view.textContent = '';
    [viewProject, viewRescale, viewCheck, viewRank, viewAdmit][S.step](tr, task);
    $$('.step', stepsBox).forEach(function (b, i) { b.setAttribute('aria-selected', i === S.step ? 'true' : 'false'); });
  }

  // ---- side panel
  function renderGrowth() {
    var box = $('#pgGrowth'), w = Math.max(240, box.clientWidth), h = 170;
    var f = svgFrame(box, w, h, { l: 38, r: 46, t: 8, b: 26 });
    var T = S.T, tt = S.t;
    var rawPer = (S.stream[0].r || FMLCore.DIMS.r) * 2 * MODS.length;
    var ymax = Math.max(d3.max(S.trW, function (d) { return d.size; }), d3.max(S.trF, function (d) { return d.size; })) * 1.25;
    var x = d3.scaleLinear().domain([1, T]).range([0, f.iw]), y = d3.scaleLinear().domain([0, ymax]).range([f.ih, 0]).nice();
    gridY(f.g, y, f.iw, 4);
    axisX(f.g, x, f.ih, [1, 10, 20, 30, 40].filter(function (v) { return v <= T; }));
    var line = d3.line().x(function (d, i) { return x(i + 1); }).y(function (d) { return y(d.size); });
    // raw LoRAs climb straight off the chart; clip them at the top
    var yTop = y.domain()[1], tExit = Math.min(T, yTop / rawPer);
    f.g.append('line').attr('x1', x(1)).attr('y1', y(rawPer)).attr('x2', x(Math.max(1, tExit))).attr('y2', y(Math.min(yTop, rawPer * tExit))).style('stroke', 'var(--ref)').style('stroke-width', 2);
    halo(styleText(f.g.append('text').attr('x', x(Math.max(1, tExit)) + 6).attr('y', 10).text('raw LoRAs: ' + (rawPer * T) + ' at the end ↑'), 10.5, 'var(--ink-2)', 600));
    var fw = S.trW.slice(0, tt + 1), ff = S.trF.slice(0, tt + 1);
    f.g.append('path').attr('d', line(S.trW)).style('fill', 'none').style('stroke', 'var(--weight)').style('stroke-width', 1).style('opacity', 0.25);
    f.g.append('path').attr('d', line(S.trF)).style('fill', 'none').style('stroke', 'var(--fml)').style('stroke-width', 1).style('opacity', 0.25);
    f.g.append('path').attr('d', line(fw)).style('fill', 'none').style('stroke', 'var(--weight)').style('stroke-width', 2);
    f.g.append('path').attr('d', line(ff)).style('fill', 'none').style('stroke', 'var(--fml)').style('stroke-width', 2);
    var a = ff[tt], b = fw[tt];
    f.g.append('circle').attr('cx', x(tt + 1)).attr('cy', y(b.size)).attr('r', 4).style('fill', 'var(--weight)').style('stroke', 'var(--surface)').style('stroke-width', 2);
    f.g.append('circle').attr('cx', x(tt + 1)).attr('cy', y(a.size)).attr('r', 4).style('fill', 'var(--fml)').style('stroke', 'var(--surface)').style('stroke-width', 2);
    var ly1 = y(a.size), ly2 = y(b.size); if (Math.abs(ly1 - ly2) < 13) { if (ly1 > ly2) { ly1 += 6; ly2 -= 6; } else { ly1 -= 6; ly2 += 6; } }
    styleText(f.g.append('text').attr('x', x(tt + 1) + 8).attr('y', ly1).attr('dy', '0.32em').text(a.size), 11, 'var(--ink)', 600);
    styleText(f.g.append('text').attr('x', x(tt + 1) + 8).attr('y', ly2).attr('dy', '0.32em').text(b.size), 11, 'var(--ink)', 600);
    var hit = f.g.append('rect').attr('width', f.iw).attr('height', f.ih).style('fill', 'transparent').style('cursor', 'pointer');
    hit.on('pointermove', function (ev) {
      var i = clamp(Math.round(x.invert(d3.pointer(ev, f.g.node())[0])) - 1, 0, T - 1);
      tipShow(ev, 'After adapter ' + (i + 1), [{ c: 'var(--ref)', v: String(rawPer * (i + 1)), l: 'raw LoRAs' }, { c: 'var(--weight)', v: String(S.trW[i].size), l: 'ours, ranked by weight' }, { c: 'var(--fml)', v: String(S.trF[i].size), l: 'FML' }]);
    }).on('pointerleave', tipHide).on('click', function (ev) {
      var i = clamp(Math.round(x.invert(d3.pointer(ev, f.g.node())[0])) - 1, 0, T - 1); setT(i);
    });
  }
  function renderPre() {
    if (!$('#pgPre')) return;
    var box = $('#pgPre'), w = Math.max(240, box.clientWidth), h = 130;
    var f = svgFrame(box, w, h, { l: 38, r: 12, t: 8, b: 24 });
    var T = S.T, x = d3.scaleLinear().domain([1, T]).range([0, f.iw]), y = d3.scaleLinear().domain([0, 1]).range([f.ih, 0]);
    gridY(f.g, y, f.iw, [0, 0.5, 1], function (v) { return fmt(v, 1); });
    axisX(f.g, x, f.ih, [1, 10, 20, 30, 40].filter(function (v) { return v <= T; }));
    f.g.append('line').attr('x1', 0).attr('x2', f.iw).attr('y1', y(S.tau)).attr('y2', y(S.tau)).style('stroke', 'var(--ink)').style('stroke-width', 1);
    styleText(f.g.append('text').attr('x', 2).attr('y', y(S.tau) - 4).text('τ'), 10, 'var(--ink-2)', 600);
    S.trF.forEach(function (tr, i) {
      if (i > S.t) return;
      var pass = !tr.cands.length, v = clamp(tr.C0, 0, 1);
      f.g.append('circle').attr('cx', x(i + 1)).attr('cy', y(v)).attr('r', i === S.t ? 5 : 3.5)
        .style('fill', pass ? 'var(--fml)' : 'var(--surface)').style('stroke', 'var(--fml)').style('stroke-width', i === S.t ? 2.5 : 1.5);
    });
    var hit = f.g.append('rect').attr('width', f.iw).attr('height', f.ih).style('fill', 'transparent').style('cursor', 'pointer');
    hit.on('pointermove', function (ev) {
      var i = clamp(Math.round(x.invert(d3.pointer(ev, f.g.node())[0])) - 1, 0, T - 1);
      if (i > S.t) { tipHide(); return; }
      var tr = S.trF[i];
      tipShow(ev, 'Adapter ' + (i + 1) + ' · ' + S.stream[i].famName + ' family', [{ c: 'var(--fml)', v: fmt(tr.C0, 3), l: 'capture before admission' }, { v: '+' + tr.chosen.length, l: 'directions admitted' }]);
    }).on('pointerleave', tipHide).on('click', function (ev) {
      var i = clamp(Math.round(x.invert(d3.pointer(ev, f.g.node())[0])) - 1, 0, T - 1); setT(i);
    });
  }
  var wallCanvases = null;
  function renderWalls() {
    var box = $('#pgWalls'); if (!box) return;
    if (!wallCanvases) {
      box.textContent = ''; wallCanvases = [];
      MODS.forEach(function (m, mi) {
        [['A', 'in', m.din], ['B', 'out', m.dout]].forEach(function (sd) {
          var wbox = el('div', { class: 'wall' });
          var lab = el('div', { class: 'wl' }); lab.appendChild(el('span', null, 'L' + (mi + 1) + ' ' + sd[1])); var cnt = el('span'); lab.appendChild(cnt);
          wbox.appendChild(lab);
          var cv = el('canvas'); wbox.appendChild(cv); box.appendChild(wbox);
          wallCanvases.push({ cv: cv, cnt: cnt, m: mi, side: sd[0], cap: sd[2] });
        });
      });
    }
    var tr = S.trF[S.t];
    var dark = d3.hsl(cssv('--surface')).l < 0.5;
    var ramp = d3.interpolateRgb(dark ? d3.rgb(28, 63, 108) : d3.rgb(20, 66, 129), d3.rgb(cssv('--fml')));
    var hiCol = cssv('--weight'), bg = cssv('--surface-2');
    wallCanvases.forEach(function (wc) {
      var w = wc.cv.clientWidth || 80, h = 64, ctx = fitCanvas(wc.cv, w, h);
      var n = tr.sizes[wc.m][wc.side], adm = S.colAdmit[wc.m][wc.side];
      wc.cnt.textContent = n + ' / ' + wc.cap;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      var cw = w / wc.cap;
      for (var k = 0; k < n; k++) {
        var a = adm[k];
        ctx.fillStyle = a === S.t ? hiCol : ramp(a / Math.max(1, S.T - 1));
        ctx.fillRect(k * cw, a === S.t ? 0 : 6, Math.max(1, cw - (cw > 2.5 ? 0.8 : 0)), a === S.t ? h : h - 6);
      }
    });
  }
  function renderSame() {
    var box = $('#pgSame'); if (!box) return;
    var nf = 0, nw = 0; for (var i = 0; i <= S.t; i++) { nf += S.needF[i] || 0; nw += S.needW[i] || 0; }
    box.textContent = '';
    var big = el('div', { class: 'big-readout' });
    var a = el('div', null, 'FML'); a.appendChild(el('b', null, String(nf))); big.appendChild(a);
    var b = el('div', null, 'by weight'); b.appendChild(el('b', null, String(nw))); big.appendChild(b);
    var c = el('div', null, 'saved'); c.appendChild(el('b', null, nw ? Math.round((1 - nf / nw) * 100) + '%' : '–')); big.appendChild(c);
    box.appendChild(big);
  }
  function renderAudit() {
    $('#pgAuditVal').textContent = S.audit === null ? '…' : (S.audit === 0 ? '0 (exactly)' : S.audit.toExponential(1));
  }
  function render() {
    if (!S.ready) return;
    var tr = S.trF[S.t], task = S.stream[S.t];
    $('#pgTitle').textContent = 'Adapter ' + (S.t + 1) + ' of ' + S.T;
    $('#pgTag').textContent = task.famName + ' family';
    $('#pgT').value = String(S.t + 1); $('#pgTOut').textContent = String(S.t + 1);
    $('#pgPrev').disabled = S.t <= 0; $('#pgNext').disabled = S.t >= S.T - 1;
    renderSteps(); renderView(); renderGrowth(); renderPre(); renderSame(); renderWalls(); renderAudit();
  }
  function setT(t) { S.t = clamp(t, 0, S.T - 1); S.cpk = 0; S.inputIdx = 0; render(); }

  // ---- playback
  function stopPlay() {
    S.playing = false; if (S.timer) { clearTimeout(S.timer); S.timer = null; }
    $('#pgRunIcon').setAttribute('d', 'M4 2.5v11l9-5.5z'); $('#pgRunLabel').textContent = 'Run stream';
  }
  function play() {
    if (!S.ready) return;
    if (S.t >= S.T - 1) setT(0);
    S.playing = true;
    $('#pgRunIcon').setAttribute('d', 'M4 3h3v10H4zM9 3h3v10H9z'); $('#pgRunLabel').textContent = 'Pause';
    (function adv() {
      if (!S.playing) return;
      if (S.t >= S.T - 1) { stopPlay(); return; }
      setT(S.t + 1);
      S.timer = setTimeout(adv, reduceMotion ? 900 : 520);
    })();
  }
  $('#pgRun').addEventListener('click', function () { if (S.playing) stopPlay(); else play(); });
  // keyboard: ←/→ move through the stream, 1–5 pick a step (ignored while typing in a control)
  $('#pg').addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey || !S.ready) return;
    if (e.key === 'ArrowRight') { stopPlay(); setT(S.t + 1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { stopPlay(); setT(S.t - 1); e.preventDefault(); }
    else if (/^[1-5]$/.test(e.key)) { S.step = +e.key - 1; renderSteps(); renderView(); e.preventDefault(); }
  });
  $('#pgNext').addEventListener('click', function () { stopPlay(); setT(S.t + 1); });
  $('#pgPrev').addEventListener('click', function () { stopPlay(); setT(S.t - 1); });
  $('#pgNew').addEventListener('click', function () { S.seed = (S.seed * 7 + 13) % 997 + 1; compute(false); });
  $('#pgT').addEventListener('input', function (e) { stopPlay(); setT(+e.target.value - 1); });
  var deb = null;
  function settingsChanged() { clearTimeout(deb); deb = setTimeout(function () { compute(true); }, 220); }
  $('#pgTau').addEventListener('input', function (e) { S.tau = +e.target.value / 1000; $('#pgTauOut').textContent = fmt(S.tau, 3); settingsChanged(); });
  $('#pgQ').addEventListener('input', function (e) { S.Q = +e.target.value; $('#pgQOut').textContent = String(S.Q); settingsChanged(); });
  $('#pgNM').addEventListener('change', function (e) { S.nm = e.target.checked; settingsChanged(); });
  onTheme(function () { if (S.ready) render(); });
  var lastW = 0;
  watchWidth($('#pg'), function (w) { if (S.ready && Math.abs(w - lastW) > 4) { lastW = w; render(); } });

  // ---------------------------------------------------------------- re-ranking demo
  var rrDone = false, rrData = null, rrBasis = 0;
  function resetRerank() { rrDone = false; rrData = null; $('#rrBtn').disabled = false; $('#rrBtn').textContent = 'Re-rank the memory'; renderRerank(); }
  function usageDiag(mem) {
    return MODS.map(function (_, m) {
      var KA = mem.UA[m].length, KB = mem.UB[m].length, dA = new Float64Array(KA), dB = new Float64Array(KB);
      mem.stored.forEach(function (s) {
        var g = s.G[m], a2 = s.alpha * s.alpha;
        for (var b = 0; b < g.r; b++) for (var a = 0; a < g.c; a++) { var v = g.d[b * g.c + a] * g.d[b * g.c + a] * a2; dA[a] += v; dB[b] += v; }
      });
      return { A: Array.from(dA), B: Array.from(dB) };
    });
  }
  function projCheck(before, after, dim) {
    var worst = 0, rng = FMLCore.rngFrom(5);
    for (var trial = 0; trial < 4; trial++) {
      var v = new Float64Array(dim); for (var i = 0; i < dim; i++) v[i] = rng() * 2 - 1;
      function P(U) { var out = new Float64Array(dim); U.forEach(function (u) { var c = 0; for (var i = 0; i < dim; i++) c += u[i] * v[i]; for (var j = 0; j < dim; j++) out[j] += c * u[j]; }); return out; }
      var a = P(before), b = P(after); for (var k = 0; k < dim; k++) worst = Math.max(worst, Math.abs(a[k] - b[k]));
    }
    return worst;
  }
  $('#rrBtn').addEventListener('click', function () {
    if (!S.ready || rrDone) return;
    var mem = S.memF;
    var before = usageDiag(mem);
    var basesBefore = MODS.map(function (_, m) { return { A: mem.UA[m].slice(), B: mem.UB[m].slice() }; });
    var spectra = mem.rerank();
    var pc = 0; MODS.forEach(function (md, m) { pc = Math.max(pc, projCheck(basesBefore[m].A, mem.UA[m], md.din), projCheck(basesBefore[m].B, mem.UB[m], md.dout)); });
    var drift = mem.driftAudit();
    rrData = { before: before, after: spectra, proj: pc, drift: drift };
    rrDone = true; $('#rrBtn').disabled = true; $('#rrBtn').textContent = 'Re-ranked';
    renderRerank();
  });
  function renderRerank() {
    var box = $('#rrChart'), read = $('#rrRead');
    var w = Math.max(260, box.clientWidth), h = 190;
    var f = svgFrame(box, w, h, { l: 36, r: 8, t: 8, b: 28 });
    read.textContent = '';
    if (!S.ready) return;
    var m = 0, side = 'A';
    var bef = (rrData ? rrData.before : usageDiag(S.memF))[m][side];
    var aft = rrData ? rrData.after[m][side] : null;
    var sb = d3.sum(bef) || 1;
    var nb = bef.map(function (v) { return v / sb; });
    var na = aft ? aft.map(function (v) { return Math.max(0, v) / (d3.sum(aft) || 1); }) : null;
    var K = nb.length, show = Math.min(K, 40);
    var x = d3.scaleBand().domain(d3.range(show)).range([0, f.iw]).padding(0.15);
    var ymax = Math.max(d3.max(nb.slice(0, show)), na ? d3.max(na.slice(0, show)) : 0) * 1.08;
    var y = d3.scaleLinear().domain([0, ymax]).range([f.ih, 0]);
    gridY(f.g, y, f.iw, 4, function (v) { return Math.round(v * 100) + '%'; });
    axisX(f.g, d3.scaleLinear().domain([0, show]).range([0, f.iw]), f.ih, [0, 10, 20, 30, 40].filter(function (v) { return v <= show; }), null, { label: 'direction index' });
    var bw = x.bandwidth();
    for (var i = 0; i < show; i++) {
      if (na) {
        f.g.append('rect').attr('x', x(i)).attr('y', y(nb[i])).attr('width', bw / 2).attr('height', f.ih - y(nb[i])).style('fill', 'var(--ref)');
        f.g.append('rect').attr('x', x(i) + bw / 2).attr('y', y(na[i])).attr('width', bw / 2).attr('height', f.ih - y(na[i])).style('fill', 'var(--fml)');
      } else {
        f.g.append('rect').attr('x', x(i)).attr('y', y(nb[i])).attr('width', bw).attr('height', f.ih - y(nb[i])).style('fill', 'var(--ref)');
      }
    }
    function topShare(arr, k) { var s = arr.slice().sort(function (a, b) { return b - a; }); return d3.sum(s.slice(0, k)); }
    function firstShare(arr, k) { return d3.sum(arr.slice(0, k)); }
    var lines = [];
    lines.push(['Directions in this basis', String(K)]);
    lines.push(['Usage in the first 5 directions, admission order', Math.round(firstShare(nb, 5) * 100) + '%']);
    if (na) {
      lines.push(['Usage in the first 5 directions, after re-ranking', Math.round(firstShare(na, 5) * 100) + '%']);
      lines.push(['Largest change in any projection UUᵀv', rrData.proj.toExponential(1)]);
      lines.push(['Largest change in any stored reconstruction', rrData.drift.toExponential(1)]);
    }
    lines.forEach(function (l) {
      var row = el('div', { style: 'display:flex;justify-content:space-between;gap:1rem;border-bottom:1px solid var(--grid);padding:.45rem 0' });
      row.appendChild(el('span', null, l[0])); row.appendChild(el('strong', null, l[1])); read.appendChild(row);
    });
    var note = el('p', { class: 'note' }, na ? 'Re-ranking preserves stored updates up to rounding.' : 'Press Re-rank to rotate the bases by cross-task usage.');
    read.appendChild(note);
  }
  watchWidth($('#figRerank'), function () { renderRerank(); });

  compute(false);
  return S;
})();

// ---------------------------------------------------------------- Results Q1: building the memory over 440 adapters
(function streamFig() {
  var stat = 'median', N = 440, hoverI = null, charts = {};
  var keys = ['growth', 'ratio', 'pre', 'post'];
  var boxes = { growth: $('#chGrowth'), ratio: $('#chRatio'), pre: $('#chPre'), post: $('#chPost') };
  var F = PAPER.basis.fml, Wt = PAPER.basis.weight, RAW = F.map(function (_, i) { return 3072 * (i + 1); });
  var RATIO = F.map(function (v, i) { return v / Wt[i]; });
  function series(key) {
    if (key === 'growth') return { f: F, w: Wt, r: RAW };
    if (key === 'ratio') return { f: RATIO, w: null };
    var src = PAPER[key]; return { f: src['fml_' + stat], w: src['w_' + stat] };
  }
  var spec = {
    growth: { dom: [100, 3e6], log: true, ticks: [100, 1e3, 1e4, 1e5, 1e6], fmt: function (v) { return v >= 1e6 ? '1M' : fmtK(v); }, h: 240 },
    ratio: { dom: [0.5, 1.08], ticks: [0.5, 0.6, 0.7, 0.8, 0.9, 1], fmt: function (v) { return Math.round(v * 100) + '%'; }, h: 240 },
    pre: { dom: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], fmt: function (v) { return fmt(v, 2); }, h: 200 },
    post: { dom: [0.976, 0.997], ticks: [0.98, 0.985, 0.99, 0.995], fmt: function (v) { return fmt(v, 3); }, h: 200 }
  };
  function draw(key) {
    var box = boxes[key], w = Math.max(240, box.clientWidth), sp = spec[key], h = sp.h;
    var f = svgFrame(box, w, h, { l: 44, r: 14, t: 12, b: 30 });
    var s = series(key);
    var x = d3.scaleLinear().domain([1, N]).range([0, f.iw]), y = (sp.log ? d3.scaleLog() : d3.scaleLinear()).domain(sp.dom).range([f.ih, 0]);
    gridY(f.g, y, f.iw, sp.ticks, sp.fmt);
    axisX(f.g, x, f.ih, [1, 100, 200, 300, 440], null, { label: 'adapters admitted' });
    var cy = function (v) { return y(clamp(v, sp.dom[0], sp.dom[1])); };
    var line = d3.line().x(function (d, i) { return x(i + 1); }).y(cy);
    if (key === 'growth') {
      f.g.append('path').attr('d', d3.area().x(function (d, i) { return x(i + 1); }).y0(function (d, i) { return y(F[i]); }).y1(function (d) { return y(d); })(RAW)).style('fill', 'var(--fml-wash)');
      f.g.append('path').attr('d', line(RAW)).style('fill', 'none').style('stroke', 'var(--ref)').style('stroke-width', 2);
    }
    if (key === 'ratio') {
      f.g.append('line').attr('x1', 0).attr('x2', f.iw).attr('y1', y(1)).attr('y2', y(1)).style('stroke', 'var(--weight)').style('stroke-width', 1.5);
      halo(styleText(f.g.append('text').attr('x', f.iw - 2).attr('y', y(1) - 6).attr('text-anchor', 'end').text('ranked by weight (100%)'), 10.5, 'var(--weight-ink)', 600));
      f.g.append('path').attr('d', d3.area().x(function (d, i) { return x(i + 1); }).y0(y(1)).y1(function (d) { return y(d); })(RATIO)).style('fill', 'var(--fml-wash)');
    }
    if (s.w) f.g.append('path').attr('d', line(s.w)).style('fill', 'none').style('stroke', 'var(--weight)').style('stroke-width', 2).style('stroke-linejoin', 'round');
    f.g.append('path').attr('d', line(s.f)).style('fill', 'none').style('stroke', 'var(--fml)').style('stroke-width', 2).style('stroke-linejoin', 'round');
    // selective labels
    if (key === 'growth') {
      var fe = F[N - 1], we = Wt[N - 1], re = RAW[N - 1];
      halo(styleText(f.g.append('text').attr('x', x(N) - 6).attr('y', y(re) - 8).attr('text-anchor', 'end').text('raw LoRAs ' + fmtK(re)), 10.5, 'var(--ink)', 600));
      halo(styleText(f.g.append('text').attr('x', x(N) - 6).attr('y', y(we) - 8).attr('text-anchor', 'end').text('by weight ' + fmtK(we) + ' · ' + (re / we).toFixed(0) + '× fewer'), 10.5, 'var(--ink)', 600));
      halo(styleText(f.g.append('text').attr('x', x(N) - 6).attr('y', y(fe) + 18).attr('text-anchor', 'end').text('FML ' + fmtK(fe) + ' · ' + (re / fe).toFixed(0) + '× fewer'), 11, 'var(--fml-ink)', 700));
      if (f.iw > 480) halo(styleText(f.g.append('text').attr('x', x(170)).attr('y', y(Math.sqrt(RAW[169] * F[169]))).attr('dy', '0.32em').attr('text-anchor', 'middle').text('direction-count reduction'), 11, 'var(--fml-ink)', 700));
    }
    if (key === 'ratio') {
      var lo = d3.min(RATIO.slice(20)), hi = d3.max(RATIO.slice(20));
      halo(styleText(f.g.append('text').attr('x', x(220)).attr('y', y(hi) - 12).attr('text-anchor', 'middle').text(Math.round(lo * 100) + '–' + Math.round(hi * 100) + '% from adapter 20 on'), 11, 'var(--fml-ink)', 700));
      f.g.append('circle').attr('cx', x(N)).attr('cy', y(RATIO[N - 1])).attr('r', 4).style('fill', 'var(--fml)').style('stroke', 'var(--surface)').style('stroke-width', 2);
      halo(styleText(f.g.append('text').attr('x', x(N) - 8).attr('y', y(RATIO[N - 1]) + 18).attr('text-anchor', 'end').text('end: ' + Math.round(RATIO[N - 1] * 1000) / 10 + '%'), 10.5, 'var(--ink)', 600));
    }
    if (key === 'pre' && stat === 'median') {
      [[99, 'after 100: ' + fmt(s.f[99], 3)], [439, 'end: ' + fmt(s.f[439], 3)]].forEach(function (a, k) {
        var xx = x(a[0] + 1), yy = y(s.f[a[0]]);
        f.g.append('circle').attr('cx', xx).attr('cy', yy).attr('r', 4).style('fill', 'var(--fml)').style('stroke', 'var(--surface)').style('stroke-width', 2);
        halo(styleText(f.g.append('text').attr('x', xx + (k ? -6 : 6)).attr('y', yy + 18).attr('text-anchor', k ? 'end' : 'start').text(a[1]), 10.5, 'var(--ink)', 600));
      });
    }
    if (key === 'post') {
      f.g.append('line').attr('x1', 0).attr('x2', f.iw).attr('y1', y(0.98)).attr('y2', y(0.98)).style('stroke', 'var(--ink)').style('stroke-width', 1).style('stroke-dasharray', '4 3');
      halo(styleText(f.g.append('text').attr('x', f.iw - 2).attr('y', y(0.98) + 14).attr('text-anchor', 'end').text('admission bar τ = 0.98'), 10, 'var(--ink-2)', 600));
    }
    var cross = f.g.append('g').style('display', 'none');
    cross.append('line').attr('y1', 0).attr('y2', f.ih).style('stroke', 'var(--ink)').style('stroke-width', 1);
    var cw = cross.append('circle').attr('r', 4).style('fill', 'var(--weight)').style('stroke', 'var(--surface)').style('stroke-width', 2).style('display', s.w ? null : 'none');
    var cf = cross.append('circle').attr('r', 4).style('fill', 'var(--fml)').style('stroke', 'var(--surface)').style('stroke-width', 2);
    var cr = cross.append('circle').attr('r', 4).style('fill', 'var(--ref)').style('stroke', 'var(--surface)').style('stroke-width', 2).style('display', s.r ? null : 'none');
    charts[key] = { x: x, cy: cy, cross: cross, cw: cw, cf: cf, cr: cr, s: s };
    var hit = f.g.append('rect').attr('width', f.iw).attr('height', f.ih).style('fill', 'transparent');
    hit.on('pointermove', function (ev) {
      var i = clamp(Math.round(x.invert(d3.pointer(ev, f.g.node())[0])) - 1, 0, N - 1);
      hoverI = i; updateCross();
      var P = series('pre'), Q = series('post');
      tipShow(ev, 'After adapter ' + (i + 1) + ' (' + PAPER.order[i] + ')', [
        { v: '', l: 'Directions stored' },
        { c: 'var(--ref)', v: fmtInt(RAW[i]), l: 'raw LoRAs' }, { c: 'var(--weight)', v: fmtInt(Wt[i]), l: 'ours, ranked by weight' },
        { c: 'var(--fml)', v: fmtInt(F[i]), l: 'FML (' + (RAW[i] / F[i]).toFixed(1) + '× fewer than raw, ' + Math.round(RATIO[i] * 100) + '% of ranked by weight)' },
        { v: '', l: 'Capture before admission · running ' + stat },
        { c: 'var(--fml)', v: fmt(P.f[i], 3), l: 'FML' }, { c: 'var(--weight)', v: fmt(P.w[i], 3), l: 'ranked by weight' },
        { v: '', l: 'Capture after admission · running ' + stat },
        { c: 'var(--fml)', v: fmt(Q.f[i], 4), l: 'FML' }, { c: 'var(--weight)', v: fmt(Q.w[i], 4), l: 'ranked by weight' }
      ]);
    }).on('pointerleave', function () { hoverI = null; updateCross(); tipHide(); });
  }
  function updateCross() {
    keys.forEach(function (k) {
      var c = charts[k]; if (!c) return;
      if (hoverI === null) { c.cross.style('display', 'none'); return; }
      var xx = c.x(hoverI + 1);
      c.cross.style('display', null);
      c.cross.select('line').attr('x1', xx).attr('x2', xx);
      c.cf.attr('cx', xx).attr('cy', c.cy(c.s.f[hoverI]));
      if (c.s.w) c.cw.attr('cx', xx).attr('cy', c.cy(c.s.w[hoverI]));
      if (c.s.r) c.cr.attr('cx', xx).attr('cy', c.cy(c.s.r[hoverI]));
    });
  }
  $$('#streamStat button').forEach(function (b) { b.addEventListener('click', function () { setPressed($('#streamStat'), b); stat = b.getAttribute('data-v'); draw('pre'); draw('post'); }); });
  keys.forEach(function (k) { if (boxes[k]) watchWidth(boxes[k], function () { draw(k); }); });
})();

// ---------------------------------------------------------------- Results Q1: against UWSH at the same size
(function reconFig() {
  var R = PAPER.retention.recovery;
  var methods = [
    { key: 'fml', name: 'FML', sub: 'one adapter at a time', mean: 98.33, color: 'var(--fml)' },
    { key: 'uwsh', name: 'UWSH', sub: 'all 440 at once', mean: 83.61, color: 'var(--ref)' }
  ];
  var bins = [{ lo: 0.95, label: '≥95% kept', tok: 'var(--seq4)', ink: '#fff' }, { lo: 0.8, label: '80–95%', tok: 'var(--seq3)', ink: '#fff' }, { lo: 0.5, label: '50–80%', tok: 'var(--seq2)', ink: 'var(--ink)' }, { lo: -Infinity, label: '<50%', tok: 'var(--seq1)', ink: 'var(--ink)' }];
  var dist = methods.map(function (m) {
    var v = R[m.key].filter(function (x) { return x !== null; }), cnt = bins.map(function () { return 0; });
    v.forEach(function (x) { for (var b = 0; b < bins.length; b++) if (x >= bins[b].lo) { cnt[b]++; break; } });
    return cnt.map(function (c) { return c / v.length; });
  });
  function drawMean() {
    var box = $('#chReconMean'), w = Math.max(260, box.clientWidth), narrow = w < 460;
    var bh = 22, gap = 30, h = methods.length * (bh + gap) + 34;
    var f = svgFrame(box, w, h, { l: narrow ? 8 : 150, r: 56, t: narrow ? 22 : 10, b: 30 });
    var x = d3.scaleLinear().domain([0, 100]).range([0, f.iw]);
    axisX(f.g, x, f.ih, [0, 20, 40, 60, 80, 100], function (v) { return v + '%'; }, { grid: true });
    methods.forEach(function (m, i) {
      var y = i * (bh + gap) + 10;
      if (narrow) styleText(f.g.append('text').attr('x', 0).attr('y', y - 6).text(m.name + ' · ' + m.sub), 10.5, 'var(--ink-2)', 500);
      else {
        styleText(f.g.append('text').attr('x', -12).attr('y', y + 8).attr('text-anchor', 'end').text(m.name), 11.5, m.key === 'fml' ? 'var(--ink)' : 'var(--ink-2)', m.key === 'fml' ? 700 : 500);
        styleText(f.g.append('text').attr('x', -12).attr('y', y + 21).attr('text-anchor', 'end').text(m.sub), 10, 'var(--muted)');
      }
      f.g.append('rect').attr('x', 0).attr('y', y).attr('width', x(m.mean)).attr('height', bh).attr('rx', 4).style('fill', m.color);
      var t = styleText(f.g.append('text').attr('x', x(m.mean) + 8).attr('y', y + bh / 2).attr('dy', '0.32em'), 11.5, 'var(--ink)', 700).text(fmt(m.mean, 1) + '%');
      f.g.append('rect').attr('x', -f.iw).attr('y', y - gap / 2).attr('width', 2 * f.iw + 70).attr('height', bh + gap).style('fill', 'transparent')
        .on('pointermove', function (ev) { tipShow(ev, m.name + ' · ' + m.sub, [{ c: m.color, v: fmt(m.mean, 2) + '%', l: 'mean share of each LoRA\'s ROUGE-L gain kept' }, { v: fmt(100 - m.mean, 2) + '%', l: 'lost' }]); })
        .on('pointerleave', tipHide);
    });
  }
  function drawDist() {
    var box = $('#chReconDist'), w = Math.max(260, box.clientWidth), narrow = w < 460;
    var bh = 22, gap = 30, h = methods.length * (bh + gap) + 46;
    var f = svgFrame(box, w, h, { l: narrow ? 8 : 150, r: 10, t: narrow ? 22 : 10, b: 42 });
    var x = d3.scaleLinear().domain([0, 1]).range([0, f.iw]);
    methods.forEach(function (m, i) {
      var y = i * (bh + gap) + 10, acc = 0;
      if (narrow) styleText(f.g.append('text').attr('x', 0).attr('y', y - 6).text(m.name), 10.5, 'var(--ink-2)', 500);
      else styleText(f.g.append('text').attr('x', -12).attr('y', y + bh / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text(m.name), 11.5, m.key === 'fml' ? 'var(--ink)' : 'var(--ink-2)', m.key === 'fml' ? 700 : 500);
      dist[i].forEach(function (share, bi) {
        var x0 = x(acc), wd = Math.max(0, x(acc + share) - x0 - (bi < bins.length - 1 ? 2 : 0));
        f.g.append('rect').attr('x', x0).attr('y', y).attr('width', wd).attr('height', bh).attr('rx', bi === 0 || bi === bins.length - 1 ? 3 : 0).style('fill', bins[bi].tok)
          .on('pointermove', function (ev) { tipShow(ev, m.name + ' · tasks keeping ' + bins[bi].label.replace(' kept', ''), [{ c: bins[bi].tok, v: Math.round(share * 100) + '%', l: 'of 439 tasks' }]); })
          .on('pointerleave', tipHide);
        if (wd > 34) styleText(f.g.append('text').attr('x', x0 + wd / 2).attr('y', y + bh / 2).attr('dy', '0.34em').attr('text-anchor', 'middle').style('pointer-events', 'none').text(Math.round(share * 100) + '%'), 10.5, bins[bi].ink, 600);
        acc += share;
      });
    });
    var lx = 0, ly = f.ih + 26;
    bins.forEach(function (b) {
      f.g.append('rect').attr('x', lx).attr('y', ly - 9).attr('width', 10).attr('height', 10).attr('rx', 2).style('fill', b.tok);
      var t = styleText(f.g.append('text').attr('x', lx + 14).attr('y', ly), 10.5, 'var(--ink-2)', 500).text(b.label);
      lx += (b.label.length * 6.2) + 30;
    });
  }
  watchWidth($('#figRecon'), function () { drawMean(); drawDist(); });
})();

// ---------------------------------------------------------------- Results Q1: cross-task usage after re-ranking
(function usageFig() {
  var U = PAPER.usage, side = 'A', K = 40;
  function draw() {
    var box = $('#chUsage'), w = Math.max(280, box.clientWidth), h = 250;
    var f = svgFrame(box, w, h, { l: 46, r: 16, t: 14, b: 36 });
    var fm = U[side].fml.slice(0, K), uw = U[side].uwsh321.slice(0, K);
    var ymax = Math.max(d3.max(fm), d3.max(uw)) * 1.1;
    var x = d3.scaleLinear().domain([1, K]).range([0, f.iw]), y = d3.scaleLinear().domain([0, ymax]).range([f.ih, 0]).nice();
    gridY(f.g, y, f.iw, 5, function (v) { return (v * 100).toFixed(0) + '%'; });
    axisX(f.g, x, f.ih, [1, 10, 20, 30, 40], null, { label: 'direction, in re-ranked order' });
    var line = d3.line().x(function (d, i) { return x(i + 1); }).y(function (d) { return y(d); });
    f.g.append('path').attr('d', d3.area().x(function (d, i) { return x(i + 1); }).y0(function (d, i) { return y(uw[i]); }).y1(function (d) { return y(d); })(fm)).style('fill', 'var(--fml-wash)');
    f.g.append('path').attr('d', line(uw)).style('fill', 'none').style('stroke', 'var(--ref)').style('stroke-width', 2);
    f.g.append('path').attr('d', line(fm)).style('fill', 'none').style('stroke', 'var(--fml)').style('stroke-width', 2);
    [[fm, 'var(--fml)', 'FML'], [uw, 'var(--ref)', 'UWSH']].forEach(function (s, k) {
      f.g.append('circle').attr('cx', x(1)).attr('cy', y(s[0][0])).attr('r', 4.5).style('fill', s[1]).style('stroke', 'var(--surface)').style('stroke-width', 2);
      halo(styleText(f.g.append('text').attr('x', x(1) + 10).attr('y', y(s[0][0]) + (k ? 14 : -4)).text(s[2] + ': ' + (s[0][0] * 100).toFixed(1) + '% of usage in the first direction'), 10.5, 'var(--ink)', 600));
    });
    var s5f = d3.sum(U[side].fml.slice(0, 5)), s5u = d3.sum(U[side].uwsh321.slice(0, 5));
    halo(styleText(f.g.append('text').attr('x', f.iw).attr('y', y(ymax * 0.55)).attr('text-anchor', 'end').text('first 5 directions: FML ' + Math.round(s5f * 100) + '% · UWSH ' + Math.round(s5u * 100) + '%'), 11, 'var(--fml-ink)', 700));
    var hit = f.g.append('rect').attr('width', f.iw).attr('height', f.ih).style('fill', 'transparent');
    hit.on('pointermove', function (ev) {
      var i = clamp(Math.round(x.invert(d3.pointer(ev, f.g.node())[0])) - 1, 0, K - 1);
      tipShow(ev, 'Direction ' + (i + 1) + ' · ' + (side === 'A' ? 'input side' : 'output side'), [{ c: 'var(--fml)', v: (fm[i] * 100).toFixed(2) + '%', l: 'FML' }, { c: 'var(--ref)', v: (uw[i] * 100).toFixed(2) + '%', l: 'UWSH (K = 321)' }]);
    }).on('pointerleave', tipHide);
  }
  $$('#usageSide button').forEach(function (b) { b.addEventListener('click', function () { setPressed($('#usageSide'), b); side = b.getAttribute('data-v'); draw(); }); });
  watchWidth($('#figUsage'), draw);
})();

// ---------------------------------------------------------------- Results Q2: SHARE comparison
(function shareFig() {
  var mode = 'step';
  var D = PAPER.dumbbell, T22 = PAPER.tasks22;
  function legend() {
    var lg = $('#shareLegend'); lg.textContent = '';
    function k(cls, txt, sq) { var s = el('span', { class: 'key ' + cls }); var i = el('i', sq ? { class: 'sq' } : null); s.appendChild(i); s.appendChild(document.createTextNode(txt)); lg.appendChild(s); return s; }
    var a = k('fml', 'FML (ours)', true), b = k('share', 'SHARE', true); b.querySelector('i').style.background = 'var(--share)';
    if (mode === 'task') { var c = k('ref', 'Task-specific LoRA', true); }
  }
  function drawStep() {
    var box = $('#chShare'), w = Math.max(300, box.clientWidth), rh = 26, h = D.length * rh + 46;
    var f = svgFrame(box, w, h, { l: 46, r: 64, t: 8, b: 38 });
    var x = d3.scaleLinear().domain([-35, 6]).range([0, f.iw]);
    axisX(f.g, x, f.ih, [-35, -30, -25, -20, -15, -10, -5, 0, 5], function (v) { return v > 0 ? '+' + v : String(v); }, { grid: true, label: 'ROUGE-L relative to the task-specific LoRA' });
    f.g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', -4).attr('y2', f.ih).style('stroke', 'var(--ink)').style('stroke-width', 1.5);
    styleText(f.g.append('text').attr('x', x(0)).attr('y', f.ih + 32).attr('text-anchor', 'middle').text(''), 10);
    D.forEach(function (d, i) {
      var y = i * rh + rh / 2;
      styleText(f.g.append('text').attr('x', -10).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text('T-' + d.step), 11, 'var(--ink-2)', 500);
      var sx = d.clipped ? f.iw + 4 : x(d.share), fx = x(d.fml);
      f.g.append('line').attr('x1', Math.min(sx, fx)).attr('x2', Math.max(sx, fx)).attr('y1', y).attr('y2', y).style('stroke', 'var(--axis)').style('stroke-width', 2);
      if (d.clipped) {
        f.g.append('path').attr('d', 'M' + (f.iw + 2) + ',' + (y - 6) + 'L' + (f.iw + 12) + ',' + y + 'L' + (f.iw + 2) + ',' + (y + 6) + 'Z').style('fill', 'var(--share)');
        styleText(f.g.append('text').attr('x', f.iw + 16).attr('y', y).attr('dy', '0.32em').text('+34.6'), 10.5, 'var(--ink-2)', 600);
      } else f.g.append('circle').attr('cx', sx).attr('cy', y).attr('r', 6).style('fill', 'var(--share)').style('stroke', 'var(--surface)').style('stroke-width', 2);
      f.g.append('circle').attr('cx', fx).attr('cy', y).attr('r', 6).style('fill', 'var(--fml)').style('stroke', 'var(--surface)').style('stroke-width', 2);
      var a = T22[2 * i], b = T22[2 * i + 1];
      f.g.append('rect').attr('x', 0).attr('y', y - rh / 2).attr('width', f.iw).attr('height', rh).style('fill', 'transparent')
        .on('pointermove', function (ev) {
          tipShow(ev, 'Time step T-' + d.step + ' · tasks ' + a.id + ' and ' + b.id, [
            { c: 'var(--fml)', v: (d.fml > 0 ? '+' : '') + fmt(d.fml, 2), l: 'FML vs oracle' }, { c: 'var(--share)', v: (d.share > 0 ? '+' : '') + fmt(d.share, 2), l: 'SHARE vs oracle' },
            { v: '', l: 'task ' + a.id + ': FML ' + fmt(a.fml, 1) + ' · SHARE ' + fmt(a.share, 1) + ' · LoRA ' + fmt(a.lora, 1) },
            { v: '', l: 'task ' + b.id + ': FML ' + fmt(b.fml, 1) + ' · SHARE ' + fmt(b.share, 1) + ' · LoRA ' + fmt(b.lora, 1) }
          ]);
        }).on('pointerleave', tipHide);
    });
    styleText(f.g.append('text').attr('x', x(0) + 6).attr('y', -0).attr('dy', '0.7em').text('oracle'), 10, 'var(--ink-2)', 600);
  }
  function drawTask() {
    var box = $('#chShare'), w = Math.max(320, box.clientWidth), h = 300;
    var f = svgFrame(box, w, h, { l: 36, r: 8, t: 10, b: 52 });
    var x0 = d3.scaleBand().domain(d3.range(22)).range([0, f.iw]).paddingInner(0.22);
    var x1 = d3.scaleBand().domain([0, 1, 2]).range([0, x0.bandwidth()]).paddingInner(0.08);
    var y = d3.scaleLinear().domain([0, 100]).range([f.ih, 0]);
    gridY(f.g, y, f.iw, [0, 20, 40, 60, 80, 100]);
    f.g.append('line').attr('x1', 0).attr('x2', f.iw).attr('y1', f.ih).attr('y2', f.ih).style('stroke', 'var(--axis)');
    var cols = ['var(--share)', 'var(--fml)', 'var(--ref)'], keys = ['share', 'fml', 'lora'];
    T22.forEach(function (t, i) {
      keys.forEach(function (k, j) {
        var bw = Math.min(x1.bandwidth(), 12), xx = x0(i) + x1(j) + (x1.bandwidth() - bw) / 2, v = t[k];
        var r = Math.min(3, bw / 2);
        var y1 = y(v), path = 'M' + xx + ',' + f.ih + 'V' + (y1 + r) + 'Q' + xx + ',' + y1 + ' ' + (xx + r) + ',' + y1 + 'H' + (xx + bw - r) + 'Q' + (xx + bw) + ',' + y1 + ' ' + (xx + bw) + ',' + (y1 + r) + 'V' + f.ih + 'Z';
        f.g.append('path').attr('d', path).style('fill', cols[j]);
      });
      styleText(f.g.append('text').attr('x', x0(i) + x0.bandwidth() / 2).attr('y', f.ih + 14).attr('text-anchor', 'middle').text('T' + t.pos), 9.5, 'var(--muted)');
      styleText(f.g.append('text').attr('x', x0(i) + x0.bandwidth() / 2).attr('y', f.ih + 26).attr('text-anchor', 'middle').text(t.id), 9, 'var(--faint)');
      f.g.append('rect').attr('x', x0(i) - 2).attr('y', 0).attr('width', x0.bandwidth() + 4).attr('height', f.ih).style('fill', 'transparent')
        .on('pointermove', function (ev) { tipShow(ev, 'Task ' + t.id + ' · stream position ' + t.pos, [{ c: 'var(--fml)', v: fmt(t.fml, 1), l: 'FML' }, { c: 'var(--share)', v: fmt(t.share, 1), l: 'SHARE' }, { c: 'var(--ref)', v: fmt(t.lora, 1), l: 'task-specific LoRA' }]); })
        .on('pointerleave', tipHide);
    });
    styleText(f.g.append('text').attr('x', f.iw / 2).attr('y', f.ih + 44).attr('text-anchor', 'middle').text('task, in stream order (SNI task ID below)'), 11, 'var(--ink-2)');
  }
  function draw() { legend(); if (mode === 'step') drawStep(); else drawTask(); }
  $$('#shareView button').forEach(function (b) { b.addEventListener('click', function () { setPressed($('#shareView'), b); mode = b.getAttribute('data-v'); draw(); }); });
  watchWidth($('#figShare'), draw);
})();

// ---------------------------------------------------------------- Results Q2: vision continual learning
(function visionFig() {
  var V = PAPER_TABLES.vision, ds = 0;
  makeSeg($('#visionDS'), V.datasets.map(function (d, i) { return { v: i, label: d }; }), 0, function (v) { ds = v; draw(); });
  function table() {
    var t = el('table', { class: 'data' }), th = el('thead'), tr = el('tr');
    ['Method', '# Params'].concat(V.datasets.map(function (d) { return d + ' acc.'; })).concat(V.datasets.map(function (d) { return d + ' forg. ↓'; })).forEach(function (h) { tr.appendChild(el('th', null, h)); });
    th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody');
    var lr = el('tr'); [V.lora.name, V.lora.params].concat(V.lora.acc.map(function (a) { return fmt(a, 2); })).concat(['–', '–', '–']).forEach(function (c) { lr.appendChild(el('td', null, c)); }); tb.appendChild(lr);
    V.rows.forEach(function (r) {
      var row = el('tr', r.ours ? { class: 'ours' } : null);
      [r.name, r.params].concat(r.acc.map(function (a) { return fmt(a[0], 2) + ' ± ' + fmt(a[1], 1); })).concat(r.forg.map(function (a) { return fmt(a[0], 2) + ' ± ' + fmt(a[1], 1); })).forEach(function (c) { row.appendChild(el('td', null, c)); });
      tb.appendChild(row);
    });
    t.appendChild(tb); $('#visionTable').textContent = ''; $('#visionTable').appendChild(t);
  }
  function draw() {
    var box = $('#chVision'), w = Math.max(300, box.clientWidth), narrow = w < 480;
    var rows = V.rows, rh = narrow ? 24 : 27, labelW = narrow ? 92 : (w < 760 ? 96 : 170);
    var lv = V.lora.acc[ds];
    var panels = [
      { key: 'acc', title: 'Final accuracy (%) ↑', dom: [55, 100], ticks: [60, 70, 80, 90, 100] },
      { key: 'forg', title: 'Forgetting ↓', dom: [0, 36], ticks: [0, 10, 20, 30] }
    ];
    var blockH = rows.length * rh, h = narrow ? 2 * blockH + 150 : blockH + 64;
    var f = svgFrame(box, w, h, { l: labelW, r: 14, t: 24, b: 34 });
    var gapW = 30, pw = narrow ? f.iw : (f.iw - gapW) / 2;
    panels.forEach(function (P, pi) {
      var x0 = narrow ? 0 : pi * (pw + gapW), y0 = narrow ? pi * (blockH + 74) : 0;
      var g = f.g.append('g').attr('transform', 'translate(0,' + y0 + ')');
      var sc = d3.scaleLinear().domain(P.dom).range([x0, x0 + pw]);
      styleText(g.append('text').attr('x', x0).attr('y', -10).text(P.title), 11, 'var(--ink-2)', 600);
      rows.forEach(function (r, i) {
        var y = i * rh + rh / 2;
        if (i % 2 === 0 && (narrow || pi === 0)) g.insert('rect', ':first-child').attr('x', -labelW).attr('y', y - rh / 2).attr('width', f.iw + labelW).attr('height', rh).style('fill', 'var(--surface-2)').style('opacity', 0.45);
      });
      axisX(g, sc, blockH, P.ticks, null, { grid: true });
      if (P.key === 'acc') {
        g.append('line').attr('x1', sc(lv)).attr('x2', sc(lv)).attr('y1', -2).attr('y2', blockH).style('stroke', 'var(--ink)').style('stroke-width', 1.25);
        halo(styleText(g.append('text').attr('x', sc(lv) - 4).attr('y', blockH + 30).attr('text-anchor', 'end').text('per-task LoRA ' + fmt(lv, 2)), 10, 'var(--ink-2)', 600));
      }
      rows.forEach(function (r, i) {
        var y = i * rh + rh / 2, col = r.color || 'var(--ref)';
        if (narrow || pi === 0) {
          styleText(g.append('text').attr('x', -10).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text(r.name), narrow ? 10.5 : 11.5, r.ours ? 'var(--ink)' : 'var(--ink-2)', r.ours ? 700 : 500);
          if (!narrow && labelW > 120) styleText(g.append('text').attr('x', -labelW + 4).attr('y', y).attr('dy', '0.32em').text(r.params), 10, 'var(--faint)').style('font-family', 'var(--font-mono)');
        }
        var vv = r[P.key][ds], v = vv[0], sd = vv[1];
        var lo = sc(clamp(v - sd, P.dom[0], P.dom[1])), hi = sc(clamp(v + sd, P.dom[0], P.dom[1]));
        g.append('line').attr('x1', lo).attr('x2', hi).attr('y1', y).attr('y2', y).style('stroke', col).style('stroke-width', 1.5).style('opacity', 0.7);
        g.append('circle').attr('cx', sc(clamp(v, P.dom[0], P.dom[1]))).attr('cy', y).attr('r', r.ours ? 6 : 5).style('fill', col).style('stroke', 'var(--surface)').style('stroke-width', 2);
        if (P.key === 'acc' && !narrow && w >= 760) halo(styleText(g.append('text').attr('x', sc(clamp(v, 55, 100)) + (v > 93 ? -9 : 9)).attr('y', y - 9).attr('text-anchor', v > 93 ? 'end' : 'start').text(fmt(v, 2)), 9.5, 'var(--muted)'));
        var a = r.acc[ds], fo = r.forg[ds];
        g.append('rect').attr('x', narrow ? -labelW : (pi === 0 ? -labelW : x0 - gapW / 2)).attr('y', y - rh / 2).attr('width', narrow ? f.iw + labelW : (pi === 0 ? pw + labelW + gapW / 2 : pw + gapW / 2)).attr('height', rh).style('fill', 'transparent')
          .on('pointermove', function (ev) { tipShow(ev, r.name + ' · ' + V.datasets[ds] + ' · ' + r.params + ' params', [{ c: col, v: fmt(a[0], 2) + ' ± ' + fmt(a[1], 1), l: 'accuracy (%)' }, { c: col, v: fmt(fo[0], 2) + ' ± ' + fmt(fo[1], 1), l: 'forgetting' }]); })
          .on('pointerleave', tipHide);
      });
    });
  }
  table();
  watchWidth($('#figVision'), draw);
})();

// ---------------------------------------------------------------- Results Q3: initialization
(function initFig() {
  var I = PAPER_TABLES.init, ti = 5;
  makeSeg($('#initTask'), I.tasks.map(function (t, i) { return { v: i, label: t }; }), ti, function (v) { ti = v; draw(); });
  (function table() {
    var t = el('table', { class: 'data' }), tr = el('tr');
    ['Method', 'Target inputs at init.'].concat(I.tasks).forEach(function (h) { tr.appendChild(el('th', null, h)); });
    var th = el('thead'); th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody'), rr = el('tr');
    [I.ref.name, '0'].concat(I.ref.v.map(function (v) { return fmt(v, 1); })).forEach(function (c) { rr.appendChild(el('td', null, c)); }); tb.appendChild(rr);
    I.rows.forEach(function (r) { var row = el('tr', r.ours ? { class: 'ours' } : null); [r.name, String(r.inputs)].concat(r.v.map(function (v) { return fmt(v[0], 1) + ' ± ' + fmt(v[1], 1); })).forEach(function (c) { row.appendChild(el('td', null, c)); }); tb.appendChild(row); });
    t.appendChild(tb); $('#initTable').appendChild(t);
  })();
  function draw() {
    var box = $('#chInit'), w = Math.max(320, box.clientWidth), narrow = w < 600;
    var rows = I.rows, rh = 30, labelW = narrow ? 128 : 200, h = rows.length * rh + 2 * 18 + 44;
    var f = svgFrame(box, w, h, { l: labelW, r: 64, t: 22, b: 34 });
    var vals = rows.map(function (r) { return r.v[ti][0]; }).concat([I.ref.v[ti]]);
    var lo = Math.floor((d3.min(vals) - 4) / 5) * 5, hi = Math.ceil((d3.max(vals) + 4) / 5) * 5;
    var x = d3.scaleLinear().domain([lo, hi]).range([0, f.iw]);
    axisX(f.g, x, f.ih, x.ticks(6), null, { grid: true, label: 'test ROUGE-L after 256 steps' });
    var rv = I.ref.v[ti];
    f.g.append('line').attr('x1', x(rv)).attr('x2', x(rv)).attr('y1', 0).attr('y2', f.ih).style('stroke', 'var(--ink)').style('stroke-width', 1.25).style('stroke-dasharray', '4 3');
    styleText(f.g.append('text').attr('x', x(rv)).attr('y', -8).attr('text-anchor', x(rv) > f.iw * 0.7 ? 'end' : 'middle').text('fully trained LoRA, r = 16: ' + fmt(rv, 1)), 10, 'var(--ink-2)', 600);
    styleText(f.g.append('text').attr('x', f.iw + 56).attr('y', -8).attr('text-anchor', 'end').text('mean'), 10, 'var(--muted)', 600);
    var y = 0, lastGroup = null;
    rows.forEach(function (r) {
      if (r.group !== lastGroup) { styleText(f.g.append('text').attr('x', -labelW).attr('y', y + 13).text(r.group.toUpperCase()), 9.5, 'var(--muted)', 600).style('letter-spacing', '0.06em'); y += 18; lastGroup = r.group; }
      var yy = y + rh / 2, v = r.v[ti][0], sd = r.v[ti][1], col = r.ours ? 'var(--fml)' : 'var(--ref)';
      styleText(f.g.append('text').attr('x', -10).attr('y', yy).attr('dy', '0.32em').attr('text-anchor', 'end').text(r.name), narrow ? 10.5 : 11.5, r.ours ? 'var(--ink)' : 'var(--ink-2)', r.ours ? 700 : 500);
      if (r.inputs) styleText(f.g.append('text').attr('x', -10).attr('y', yy + 13).attr('text-anchor', 'end').text('uses ' + r.inputs + ' target inputs'), 9.5, 'var(--weight-ink)', 600);
      var a = x(clamp(v - sd, lo, hi)), b = x(clamp(v + sd, lo, hi));
      f.g.append('line').attr('x1', a).attr('x2', b).attr('y1', yy).attr('y2', yy).style('stroke', col).style('stroke-width', 1.5).style('opacity', 0.75);
      if (v + sd > hi) f.g.append('path').attr('d', 'M' + (b - 1) + ',' + (yy - 4) + 'L' + (b + 5) + ',' + yy + 'L' + (b - 1) + ',' + (yy + 4) + 'Z').style('fill', col);
      if (v - sd < lo) f.g.append('path').attr('d', 'M' + (a + 1) + ',' + (yy - 4) + 'L' + (a - 5) + ',' + yy + 'L' + (a + 1) + ',' + (yy + 4) + 'Z').style('fill', col);
      f.g.append('circle').attr('cx', x(v)).attr('cy', yy).attr('r', r.ours ? 6.5 : 5.5).style('fill', col).style('stroke', 'var(--surface)').style('stroke-width', 2);
      styleText(f.g.append('text').attr('x', f.iw + 56).attr('y', yy).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmt(v, 1)), 11, 'var(--ink)', r.ours ? 700 : 500).style('font-variant-numeric', 'tabular-nums');
      f.g.append('rect').attr('x', -labelW).attr('y', yy - rh / 2).attr('width', f.iw + labelW).attr('height', rh).style('fill', 'transparent')
        .on('pointermove', function (ev) { tipShow(ev, r.name + ' · ' + I.tasks[ti], [{ c: col, v: fmt(v, 1) + ' ± ' + fmt(sd, 1), l: 'ROUGE-L (3 seeds)' }, { v: String(r.inputs), l: 'target inputs used at initialization' }]); })
        .on('pointerleave', tipHide);
      y += rh;
    });
  }
  watchWidth($('#figInit'), draw);
})();

// ---------------------------------------------------------------- Results Q3: t-SNE of stored coefficients
(function tsneFig() {
  var P = PAPER.tsne, sel = 'Q&A';
  var cats = ['Q&A', 'Program Exec.', 'Sentiment', 'Toxicity Det.', 'Question Gen.', 'Text Cat.', 'Commonsense Cls.', 'Text Match', 'NER'];
  var counts = {}; P.forEach(function (p) { counts[p[2]] = (counts[p[2]] || 0) + 1; });
  makeChips($('#tsneCats'), cats.map(function (c) { return { v: c, label: c, small: String(counts[c]) }; }), sel, function (v) { sel = v; draw(); });
  function draw() {
    var box = $('#chTsne'), w = Math.max(260, box.clientWidth), h = Math.round(w * 0.62);
    var f = svgFrame(box, w, h, { l: 6, r: 6, t: 6, b: 6 });
    var x = d3.scaleLinear().domain([0, 1]).range([0, f.iw]), y = d3.scaleLinear().domain([0, 1]).range([f.ih, 0]);
    f.g.append('rect').attr('width', f.iw).attr('height', f.ih).attr('rx', 6).style('fill', 'var(--surface-2)').style('opacity', 0.5);
    P.forEach(function (p) { if (p[2] !== sel) f.g.append('circle').attr('cx', x(p[0])).attr('cy', y(p[1])).attr('r', 2.6).style('fill', 'var(--faint)').style('opacity', p[2] === 'Other' ? 0.45 : 0.75); });
    P.forEach(function (p) { if (p[2] === sel) f.g.append('circle').attr('cx', x(p[0])).attr('cy', y(p[1])).attr('r', 4.2).style('fill', 'var(--fml)').style('stroke', 'var(--surface)').style('stroke-width', 1.5); });
    var hit = f.g.append('rect').attr('width', f.iw).attr('height', f.ih).style('fill', 'transparent');
    var ring = f.g.append('circle').attr('r', 7).style('fill', 'none').style('stroke', 'var(--ink)').style('stroke-width', 1.5).style('display', 'none');
    hit.on('pointermove', function (ev) {
      var pt = d3.pointer(ev, f.g.node()), best = null, bd = 1e9;
      P.forEach(function (p) { var dx = x(p[0]) - pt[0], dy = y(p[1]) - pt[1], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = p; } });
      if (best && bd < 196) { ring.style('display', null).attr('cx', x(best[0])).attr('cy', y(best[1])); tipShow(ev, 'Stored SNI task', [{ c: best[2] === sel ? 'var(--fml)' : 'var(--faint)', v: best[2], l: best[2] === 'Other' ? '(not one of the 9 labelled categories)' : '' }]); }
      else { ring.style('display', 'none'); tipHide(); }
    }).on('pointerleave', function () { ring.style('display', 'none'); tipHide(); });
  }
  watchWidth($('#figTsne'), draw);
})();

// ---------------------------------------------------------------- Results Q3: experience curve
(function expFig() {
  var E = PAPER.experience;
  function draw() {
    var box = $('#chExp'), w = Math.max(260, box.clientWidth), h = Math.round(Math.max(240, w * 0.78));
    var f = svgFrame(box, w, h, { l: 40, r: 16, t: 14, b: 34 });
    var x = d3.scaleLinear().domain([30, 470]).range([0, f.iw]), y = d3.scaleLinear().domain([70.8, 75.2]).range([f.ih, 0]);
    gridY(f.g, y, f.iw, [71, 72, 73, 74, 75]);
    axisX(f.g, x, f.ih, E.x, null, { label: 'adapters in the memory' });
    E.seeds.forEach(function (sd, si) {
      sd.forEach(function (v, i) { f.g.append('circle').attr('cx', x(E.x[i]) + (si - 1) * 7).attr('cy', y(v)).attr('r', 3).style('fill', 'none').style('stroke', 'var(--muted)').style('stroke-width', 1.2); });
    });
    E.x.forEach(function (xv, i) {
      f.g.append('line').attr('x1', x(xv)).attr('x2', x(xv)).attr('y1', y(E.lo[i])).attr('y2', y(E.hi[i])).style('stroke', 'var(--fml)').style('stroke-width', 1.5).style('opacity', 0.6);
    });
    var line = d3.line().x(function (d, i) { return x(E.x[i]); }).y(function (d) { return y(d); });
    f.g.append('path').attr('d', line(E.mean)).style('fill', 'none').style('stroke', 'var(--fml)').style('stroke-width', 2);
    E.mean.forEach(function (v, i) {
      f.g.append('circle').attr('cx', x(E.x[i])).attr('cy', y(v)).attr('r', 5).style('fill', 'var(--fml)').style('stroke', 'var(--surface)').style('stroke-width', 2);
      styleText(f.g.append('text').attr('x', x(E.x[i])).attr('y', y(E.hi[i]) - 8).attr('text-anchor', 'middle').text(fmt(v, 1)), 10.5, 'var(--ink)', 600);
      f.g.append('rect').attr('x', x(E.x[i]) - 20).attr('y', 0).attr('width', 40).attr('height', f.ih).style('fill', 'transparent')
        .on('pointermove', function (ev) { tipShow(ev, 'Memory after ' + E.x[i] + ' adapters', [{ c: 'var(--fml)', v: fmt(v, 2), l: 'mean ROUGE-L' }, { v: fmt(E.lo[i], 2) + '–' + fmt(E.hi[i], 2), l: 'mean ± SD' }, { v: E.seeds.map(function (s) { return fmt(s[i], 1); }).join(' · '), l: 'seeds' }]); })
        .on('pointerleave', tipHide);
    });
  }
  watchWidth($('#figExp'), draw);
})();

// ---------------------------------------------------------------- Results Q3: description-conditioned generation
(function genFig() {
  var G = PAPER_TABLES.gen, B = PAPER_TABLES.bench, bi = 7;
  makeSeg($('#genBench'), B.map(function (b, i) { return { v: i, label: b }; }), bi, function (v) { bi = v; draw(); });
  (function table() {
    var t = el('table', { class: 'data' }), tr = el('tr');
    ['Method', 'Steps', 'Task data', 'LoRA weights', 'Base model'].concat(B).forEach(function (h) { tr.appendChild(el('th', null, h)); });
    var th = el('thead'); th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody');
    G.forEach(function (r) { var row = el('tr', r.ours ? { class: 'ours' } : null); [r.name, r.steps].concat(r.need.map(function (n) { return n === null ? '–' : (n ? '✓' : '×'); })).concat(r.v.map(function (v) { return fmt(v, 1); })).forEach(function (c) { row.appendChild(el('td', null, c)); }); tb.appendChild(row); });
    t.appendChild(tb); $('#genTable').appendChild(t);
  })();
  function draw() {
    var box = $('#chGen'), cw = box.clientWidth, w = Math.max(600, cw), narrow = false;
    box.classList.toggle('scroll', cw < 600);
    var rh = 28, nameW = narrow ? 128 : 170, colW = narrow ? 30 : 46, cols = 4, labelW = nameW + cols * colW + 10;
    var h = G.length * rh + 88;
    var f = svgFrame(box, w, h, { l: labelW, r: 46, t: 46, b: 44 });
    if (cw < 600) f.svg.style('width', w + 'px');
    var vals = G.map(function (r) { return r.v[bi]; });
    var lo = Math.floor((d3.min(vals) - 3) / 5) * 5, hi = Math.min(100, Math.ceil((d3.max(vals) + 3) / 5) * 5);
    var x = d3.scaleLinear().domain([lo, hi]).range([0, f.iw]);
    axisX(f.g, x, f.ih, x.ticks(6), null, { grid: true, label: PAPER_TABLES.benchFull[B[bi]] + ' accuracy (%)' });
    var heads = ['Steps', 'Task data', 'LoRAs', 'Base model'];
    heads.forEach(function (hd, i) {
      var cx = -labelW + nameW + i * colW + colW / 2;
      var t = styleText(f.g.append('text').attr('x', cx).attr('y', -12).attr('text-anchor', 'middle'), 9.5, 'var(--muted)', 600);
      if (narrow && hd.indexOf(' ') > 0) { t.append('tspan').attr('x', cx).attr('dy', '-0.9em').text(hd.split(' ')[0]); t.append('tspan').attr('x', cx).attr('dy', '1.1em').text(hd.split(' ')[1]); }
      else t.text(hd);
    });
    styleText(f.g.append('text').attr('x', -labelW).attr('y', -30).text('Needed to train the generator'), 10, 'var(--ink-2)', 600);
    G.forEach(function (r, i) {
      var yy = i * rh + rh / 2, col = r.ours ? 'var(--fml)' : 'var(--ref)', v = r.v[bi];
      if (i % 2 === 0) f.g.insert('rect', ':first-child').attr('x', -labelW).attr('y', yy - rh / 2).attr('width', f.iw + labelW).attr('height', rh).style('fill', 'var(--surface-2)').style('opacity', 0.45);
      styleText(f.g.append('text').attr('x', -labelW).attr('y', yy).attr('dy', '0.32em').text(r.name), narrow ? 10.5 : 11.5, r.ours ? 'var(--ink)' : 'var(--ink-2)', r.ours ? 700 : 500);
      var cells = [r.steps].concat(r.need.map(function (n) { return n === null ? '–' : (n ? '✓' : '×'); }));
      cells.forEach(function (c, j) {
        var t = styleText(f.g.append('text').attr('x', -labelW + nameW + j * colW + colW / 2).attr('y', yy).attr('dy', '0.32em').attr('text-anchor', 'middle').text(c), 11,
          j === 0 ? 'var(--ink-2)' : (c === '✓' ? 'var(--ink)' : (c === '×' ? (r.ours ? 'var(--fml-ink)' : 'var(--muted)') : 'var(--faint)')), j === 0 || c === '×' && r.ours ? 600 : 500);
        if (j === 0) t.style('font-family', 'var(--font-mono)').style('font-size', '10.5px');
      });
      f.g.append('circle').attr('cx', x(v)).attr('cy', yy).attr('r', r.ours ? 6.5 : 5).style('fill', col).style('stroke', 'var(--surface)').style('stroke-width', 2);
      styleText(f.g.append('text').attr('x', f.iw + 40).attr('y', yy).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmt(v, 1)), 11, 'var(--ink)', r.ours ? 700 : 500).style('font-variant-numeric', 'tabular-nums');
      f.g.append('rect').attr('x', -labelW).attr('y', yy - rh / 2).attr('width', f.iw + labelW).attr('height', rh).style('fill', 'transparent')
        .on('pointermove', function (ev) { tipShow(ev, r.name + ' · ' + PAPER_TABLES.benchFull[B[bi]], [{ c: col, v: fmt(v, 1) + '%', l: 'accuracy' }, { v: r.steps, l: 'optimization steps' }, { v: r.need.map(function (n, k) { return n === null ? '' : ['task data', 'LoRA weights', 'base model'][k] + (n ? ' ✓' : ' ×'); }).filter(Boolean).join(' · ') || 'no training', l: '' }]); })
        .on('pointerleave', tipHide);
    });
  }
  watchWidth($('#figGen'), draw);
})();

// ---------------------------------------------------------------- Results Q3: coefficient-only adaptation
(function adaptFig() {
  var A = PAPER_TABLES.adapt, B = PAPER_TABLES.bench, bi = 7;
  makeSeg($('#adaptBench'), B.map(function (b, i) { return { v: i, label: b }; }), bi, function (v) { bi = v; draw(); });
  function draw() {
    var box = $('#chAdapt'), w = Math.max(300, box.clientWidth), h = 280;
    var f = svgFrame(box, w, h, { l: 40, r: 120, t: 14, b: 36 });
    var x = d3.scalePoint().domain(A.shots).range([0, f.iw]).padding(0.3), y = d3.scaleLinear().domain([45, 95]).range([f.ih, 0]);
    gridY(f.g, y, f.iw, [50, 60, 70, 80, 90]);
    f.g.append('line').attr('x1', 0).attr('x2', f.iw).attr('y1', f.ih).attr('y2', f.ih).style('stroke', 'var(--axis)');
    A.shots.forEach(function (s) { styleText(f.g.append('text').attr('x', x(s)).attr('y', f.ih + 16).attr('text-anchor', 'middle').text(s), 10.5); });
    styleText(f.g.append('text').attr('x', f.iw / 2).attr('y', f.ih + 32).attr('text-anchor', 'middle').text('labelled examples used to tune the coefficients'), 11, 'var(--ink-2)');
    var line = d3.line().x(function (d, i) { return x(A.shots[i]); }).y(function (d) { return y(d); });
    for (var b = 0; b < B.length; b++) {
      if (b === bi) continue;
      var arr = A.v.map(function (row) { return row[b]; });
      f.g.append('path').attr('d', line(arr)).style('fill', 'none').style('stroke', 'var(--faint)').style('stroke-width', 1.2).style('opacity', 0.55);
    }
    var cur = A.v.map(function (row) { return row[bi]; }), orc = A.oracle[bi];
    f.g.append('line').attr('x1', 0).attr('x2', f.iw).attr('y1', y(orc)).attr('y2', y(orc)).style('stroke', 'var(--ink)').style('stroke-width', 1.25).style('stroke-dasharray', '4 3');
    styleText(f.g.append('text').attr('x', f.iw + 8).attr('y', y(orc)).attr('dy', '0.32em').text('task LoRA ' + fmt(orc, 1)), 10.5, 'var(--ink-2)', 600);
    f.g.append('path').attr('d', line(cur)).style('fill', 'none').style('stroke', 'var(--fml)').style('stroke-width', 2.5);
    cur.forEach(function (v, i) {
      f.g.append('circle').attr('cx', x(A.shots[i])).attr('cy', y(v)).attr('r', i === 0 || i === cur.length - 1 ? 5.5 : 4).style('fill', 'var(--fml)').style('stroke', 'var(--surface)').style('stroke-width', 2);
    });
    var endY = y(cur[cur.length - 1]), oY = y(orc);
    if (Math.abs(endY - oY) < 14) endY = endY < oY ? oY - 14 : oY + 14;
    styleText(f.g.append('text').attr('x', f.iw + 8).attr('y', endY).attr('dy', '0.32em').text('FML ' + fmt(cur[cur.length - 1], 1)), 11, 'var(--ink)', 700);
    styleText(f.g.append('text').attr('x', x('0')).attr('y', y(cur[0]) + 18).attr('text-anchor', 'middle').text(fmt(cur[0], 1)), 10.5, 'var(--ink-2)', 600);
    var hit = f.g.append('rect').attr('width', f.iw).attr('height', f.ih).style('fill', 'transparent');
    hit.on('pointermove', function (ev) {
      var px = d3.pointer(ev, f.g.node())[0], best = 0, bd = 1e9;
      A.shots.forEach(function (s, i) { var d = Math.abs(x(s) - px); if (d < bd) { bd = d; best = i; } });
      tipShow(ev, (best === 0 ? 'Generated coefficients, no tuning' : (A.shots[best] === 'Full' ? 'Fully adapted coefficients' : A.shots[best] + ' labelled examples')) + ' · ' + PAPER_TABLES.benchFull[B[bi]], [{ c: 'var(--fml)', v: fmt(cur[best], 1), l: 'FML accuracy (%)' }, { c: 'var(--ink)', v: fmt(orc, 1), l: 'task-specific LoRA' }]);
    }).on('pointerleave', tipHide);
  }
  watchWidth($('#figAdapt'), draw);
})();

// ---------------------------------------------------------------- Ablations
(function compFig() {
  var C = PAPER_TABLES.components, wrap = $('#compCharts');
  var boxes = C.panels.map(function (p) {
    var d = el('div'); d.appendChild(el('div', { class: 'panel-title' }, p.title)); var c = el('div', { class: 'chart' }); d.appendChild(c); wrap.appendChild(d); return c;
  });
  function draw() {
    C.panels.forEach(function (p, pi) {
      var box = boxes[pi], w = Math.max(220, box.clientWidth), bh = 18, gap = 14, h = 3 * (bh + gap) + 8;
      var f = svgFrame(box, w, h, { l: 116, r: 50, t: 4, b: 4 });
      var x = d3.scaleLinear().domain([0, d3.max(p.v) * 1.05]).range([0, f.iw]);
      p.v.forEach(function (v, i) {
        var y = i * (bh + gap), col = i === 0 ? 'var(--fml)' : 'var(--ref)';
        styleText(f.g.append('text').attr('x', -8).attr('y', y + bh / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text(C.names[i]), 11, i === 0 ? 'var(--ink)' : 'var(--ink-2)', i === 0 ? 600 : 500);
        f.g.append('rect').attr('x', 0).attr('y', y).attr('width', x(v)).attr('height', bh).attr('rx', 3).style('fill', col);
        styleText(f.g.append('text').attr('x', x(v) + 6).attr('y', y + bh / 2).attr('dy', '0.32em').text(p.fmt(v)), 11, 'var(--ink)', 600);
      });
    });
  }
  watchWidth($('#figComp'), draw);
})();

(function sweepFig() {
  var A = PAPER.ablations, which = 'threshold';
  var meta = {
    threshold: { label: 'Threshold τ', full: 0.98, tick: function (v) { return fmt(v, 2); } },
    probes: { label: 'Probes Q', full: 256, tick: function (v) { return String(v); } },
    inputs: { label: 'Unlabelled inputs', full: 40, tick: function (v) { return String(v); } }
  };
  makeSeg($('#sweepSel'), [{ v: 'threshold', label: 'Threshold τ' }, { v: 'probes', label: 'Probes Q' }, { v: 'inputs', label: 'Unlabelled inputs' }], which, function (v) { which = v; draw(); });
  var wrap = $('#sweepCharts'), panels = [['basis', 'Basis directions', function (v) { return fmtK(v); }], ['rouge', 'Average ROUGE-L', function (v) { return fmt(v, 1); }], ['recovery', 'Recovery', function (v) { return fmt(v, 3); }]];
  var boxes = panels.map(function (p) { var d = el('div'); d.appendChild(el('div', { class: 'panel-title' }, p[1])); var c = el('div', { class: 'chart' }); d.appendChild(c); wrap.appendChild(d); return c; });
  function draw() {
    var S = A[which], m = meta[which];
    panels.forEach(function (p, pi) {
      var box = boxes[pi], w = Math.max(220, box.clientWidth), h = 170;
      var f = svgFrame(box, w, h, { l: 46, r: 20, t: 18, b: 34 });
      var vals = S[p[0]], xs = S.x;
      var x = d3.scaleLinear().domain([xs[0], xs[2]]).range([10, f.iw - 10]);
      var lo = d3.min(vals), hi = d3.max(vals), pad = (hi - lo) * 0.35 || hi * 0.02;
      var y = d3.scaleLinear().domain([lo - pad, hi + pad]).range([f.ih, 0]).nice(4);
      gridY(f.g, y, f.iw, 4, p[2]);
      axisX(f.g, x, f.ih, xs, m.tick, { label: m.label });
      var line = d3.line().x(function (d, i) { return x(xs[i]); }).y(function (d) { return y(d); });
      f.g.append('path').attr('d', line(vals)).style('fill', 'none').style('stroke', 'var(--fml)').style('stroke-width', 2);
      vals.forEach(function (v, i) {
        var isFull = xs[i] === m.full;
        f.g.append('circle').attr('cx', x(xs[i])).attr('cy', y(v)).attr('r', isFull ? 6 : 4.5).style('fill', isFull ? 'var(--fml)' : 'var(--surface)').style('stroke', 'var(--fml)').style('stroke-width', 2);
        styleText(f.g.append('text').attr('x', x(xs[i])).attr('y', y(v) - 11).attr('text-anchor', i === 0 ? 'start' : (i === 2 ? 'end' : 'middle')).text(p[2](v)), 10.5, 'var(--ink)', isFull ? 700 : 500);
      });
    });
  }
  watchWidth($('#figSweep'), draw);
})();

// ---------------------------------------------------------------- citation copy
(function bib() {
  var btn = $('#bibCopy');
  btn.addEventListener('click', function () {
    var txt = $('#bib').textContent;
    function selectIt() { var r = document.createRange(); r.selectNodeContents($('#bib')); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || ''; btn.textContent = 'Selected, press ' + (/Mac|iPhone|iPad/.test(platform) ? '⌘C' : 'Ctrl+C'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy BibTeX'; }, 1600); }, selectIt);
    else selectIt();
  });
})();

if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fireTheme(); });
})();
