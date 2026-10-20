/* Restored four-stage Build a memory teaching lab; synthetic geometry and sketches only. */
(function () {
  'use strict';

  const INK = 'var(--lab-ink)';
  const TEAL = 'var(--lab-teal)';
  const GREY = 'var(--ref)';
  const names = ['A', 'B', 'C', 'D', 'E'];
  const signatures = [
    [0.90, 0.75, 0.35, 0.10],
    [0.88, 0.71, 0.38, 0.12],
    [0.10, -0.20, 0.90, 0.50],
    [0.20, -0.80, 0.05, 0.20],
    [0.08, -0.12, 0.45, 0.27]
  ];
  const taskCoefficients = [[0.8, -0.3], [0.2, 0.7]];
  const copy = [
    {
      eyebrow: '01 / Projection',
      title: 'Projection into the shared basis',
      body: 'Projection expresses the incoming adapter in directions accumulated from previous tasks.',
      takeaway: 'Projection can reduce update magnitude as well as remove weight directions.',
      page: 4, source: 'Section 3.3'
    },
    {
      eyebrow: '02 / Norm matching',
      title: 'Global norm matching',
      body: 'A single global scale matches the original adapter’s Frobenius norm across modules.',
      takeaway: 'Matching the norm restores magnitude. It does not rotate the projection or guarantee recovery.',
      page: 4, source: 'Section 3.3'
    },
    {
      eyebrow: '03 / Functional ranking',
      title: 'Functional ranking of residual directions',
      body: 'CPQR ranks residual directions by the functional variation not explained by earlier selections.',
      takeaway: 'A and B have similar signatures. After choosing A, most of B’s effect is already explained.',
      page: 16, source: 'Sections 3.4–3.5 · Appendix B.4'
    },
    {
      eyebrow: '04 / Preservation',
      title: 'Preservation under basis expansion',
      body: 'Appending basis directions and zero-padding stored coefficients preserves previously admitted updates.',
      takeaway: 'The approximation made at admission stays fixed. Later arrivals add no further representation error.',
      page: 15, source: 'Appendix B.2'
    }
  ];

  let root;
  let stage = 0;
  let angle = 48;
  let normOn = true;
  let chosen = [];
  let basisCount = 2;
  let storedTask = 0;
  let observer;

  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const norm = a => Math.sqrt(dot(a, a));
  const fmt = (n, d) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(d == null ? 2 : d).replace('-', '−');

  function residuals() {
    const q = [];
    chosen.forEach(j => {
      let v = signatures[j].slice();
      q.forEach(u => { const p = dot(v, u); v = v.map((x, i) => x - p * u[i]); });
      const size = norm(v);
      if (size > 1e-10) q.push(v.map(x => x / size));
    });
    return signatures.map((column, j) => {
      if (chosen.includes(j)) return [0, 0, 0, 0];
      let v = column.slice();
      q.forEach(u => { const p = dot(v, u); v = v.map((x, i) => x - p * u[i]); });
      return v;
    });
  }

  function nextPivot() {
    const values = residuals().map((r, j) => chosen.includes(j) ? -1 : norm(r));
    const highest = Math.max.apply(null, values);
    return highest > 1e-10 ? values.indexOf(highest) : -1;
  }

  function setStage(n, focus) {
    stage = Math.max(0, Math.min(3, n));
    render();
    if (focus) root.querySelector('[data-stage="' + stage + '"]').focus();
  }

  function sliderMarkup() {
    return '<div class="fml-lab-control"><div class="fml-lab-labelrow"><label for="fml-angle">Angle to the shared direction</label><output id="fml-angle-value" for="fml-angle">' + angle + '°</output></div>' +
      '<input id="fml-angle" type="range" min="15" max="75" step="1" value="' + angle + '" aria-describedby="fml-angle-help"><div class="fml-lab-range-ends"><span>15° · more aligned</span><span>75° · less aligned</span></div>' +
      '<p class="fml-lab-help" id="fml-angle-help">Drag to change how much the projection retains.</p></div>';
  }

  function controlsMarkup() {
    if (stage === 0) return sliderMarkup() + '<button class="fml-lab-action" type="button" data-action="match">Apply norm matching <span aria-hidden="true">↗</span></button>';
    if (stage === 1) return sliderMarkup() + '<button class="fml-lab-switch" type="button" data-action="toggle" aria-pressed="' + normOn + '"><span class="fml-lab-switch-track" aria-hidden="true"><i></i></span><span>Norm matching <strong>' + (normOn ? 'on' : 'off') + '</strong></span></button>';
    if (stage === 2) {
      const next = nextPivot();
      return '<div class="fml-lab-controls-inline"><button class="fml-lab-action" type="button" data-action="pivot"' + (next < 0 ? ' disabled' : '') + '>' + (next < 0 ? 'Sketch fully spanned' : 'Select direction ' + names[next]) + (next < 0 ? '' : ' <span aria-hidden="true">→</span>') + '</button><button class="fml-lab-reset" type="button" data-action="reset-rank"' + (!chosen.length ? ' disabled' : '') + '>Reset</button></div><p class="fml-lab-help">Each selection removes its explained effect from the other signatures.</p>';
    }
    return '<div class="fml-lab-task-toggle" role="group" aria-label="Inspect a stored task"><button type="button" data-task="0" aria-pressed="' + (storedTask === 0) + '">Stored task A</button><button type="button" data-task="1" aria-pressed="' + (storedTask === 1) + '">Stored task B</button></div><div class="fml-lab-controls-inline"><button class="fml-lab-action" type="button" data-action="append"' + (basisCount >= 6 ? ' disabled' : '') + '>' + (basisCount >= 6 ? 'Six directions in memory' : 'Append a direction') + (basisCount >= 6 ? '' : ' <span aria-hidden="true">+</span>') + '</button><button class="fml-lab-reset" type="button" data-action="reset-basis"' + (basisCount === 2 ? ' disabled' : '') + '>Reset</button></div>';
  }

  function render() {
    if (!root) return;
    const c = copy[stage];
    const previousActive = document.activeElement;
    const activeAction = previousActive && root.contains(previousActive) ? previousActive.dataset.action : null;
    root.classList.add('fml-lab');
    root.innerHTML = '<div class="fml-lab-tabs" role="tablist" aria-label="Explore the FML method">' +
      ['Project', 'Match scale', 'Rank residuals', 'Preserve'].map((name, i) => '<button type="button" id="fml-tab-' + i + '" role="tab" aria-selected="' + (i === stage) + '" aria-controls="fml-lab-panel" tabindex="' + (i === stage ? '0' : '-1') + '" data-stage="' + i + '"><span class="fml-lab-tabnumber">0' + (i + 1) + '</span><span>' + name + '</span></button>').join('') + '</div>' +
      '<div class="fml-lab-panel" id="fml-lab-panel" role="tabpanel" aria-labelledby="fml-tab-' + stage + '"><div class="fml-lab-figure"><div class="fml-lab-figure-head"><span>' + (stage < 2 ? 'Projection geometry' : stage === 2 ? 'Functional sketches' : 'Coefficient storage') + '</span><span class="fml-lab-live-tag">' + (stage < 2 ? 'Drag to explore' : stage === 2 ? 'Choose a pivot' : 'Grow the basis') + '</span></div><div class="fml-lab-visual" id="fml-lab-visual"></div><div class="fml-lab-figure-note" id="fml-lab-figure-note"></div></div><div class="fml-lab-explanation"><span class="fml-lab-eyebrow">' + c.eyebrow + '</span><h3>' + c.title + '</h3><p>' + c.body + '</p><div class="fml-lab-controls">' + controlsMarkup() + '</div><div class="fml-lab-takeaway"><span class="fml-lab-takeaway-mark" aria-hidden="true">↳</span><p>' + c.takeaway + '</p></div></div></div>' +
      '<div class="fml-lab-bottom"><span class="paper-link-unavailable" role="link" aria-disabled="true" title="Paper coming soon">' + c.source + ' <small>Coming soon</small></span></div>';
    draw();
    bind();
    if (activeAction) {
      const b = root.querySelector('[data-action="' + activeAction + '"]');
      if (b && !b.disabled) b.focus({preventScroll: true});
      else if (activeAction === 'pivot' || activeAction === 'append') {
        const reset = root.querySelector('[data-action="' + (activeAction === 'pivot' ? 'reset-rank' : 'reset-basis') + '"]');
        if (reset) reset.focus({preventScroll: true});
      }
    }
  }

  function bind() {
    root.querySelectorAll('[data-stage]').forEach(button => {
      button.addEventListener('click', () => setStage(Number(button.dataset.stage), true));
      button.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (stage + 1) % 4;
        if (event.key === 'ArrowLeft') next = (stage + 3) % 4;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = 3;
        if (next !== undefined) { event.preventDefault(); setStage(next, true); }
      });
    });
    const slider = root.querySelector('#fml-angle');
    if (slider) slider.addEventListener('input', event => {
      angle = Number(event.target.value);
      root.querySelector('#fml-angle-value').textContent = angle + '°';
      draw();
    });
    root.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'match') { normOn = true; setStage(1, true); return; }
      if (action === 'toggle') normOn = !normOn;
      if (action === 'pivot') { const next = nextPivot(); if (next >= 0) chosen.push(next); }
      if (action === 'reset-rank') chosen = [];
      if (action === 'append') basisCount = Math.min(6, basisCount + 1);
      if (action === 'reset-basis') basisCount = 2;
      render();
    }));
    root.querySelectorAll('[data-task]').forEach(button => button.addEventListener('click', () => {
      storedTask = Number(button.dataset.task);
      render();
      root.querySelector('[data-task="' + storedTask + '"]').focus({preventScroll: true});
    }));
  }

  function draw() {
    if (!root) return;
    const visual = root.querySelector('#fml-lab-visual');
    if (!visual) return;
    if (stage < 2) drawGeometry(visual);
    if (stage === 2) drawRanking(visual);
    if (stage === 3) drawPreservation(visual);
  }

  function drawGeometry(visual) {
    const w = Math.max(270, Math.round(visual.clientWidth || 560));
    const h = 300;
    const ox = Math.max(43, Math.min(82, w * 0.15));
    const oy = 224;
    const radius = Math.min(171, w * 0.49);
    const theta = angle * Math.PI / 180;
    const tx = ox + radius * Math.cos(theta);
    const ty = oy - radius * Math.sin(theta);
    const projected = Math.cos(theta);
    const matched = stage === 1 && normOn;
    const showScale = stage === 1;
    const labelX = Math.min(w - 14, tx + 16);
    const matchedLabelX = Math.min(w - 14, ox + radius + 14);
    const arcX = ox + 32 * Math.cos(theta);
    const arcY = oy - 32 * Math.sin(theta);
    visual.innerHTML = '<div class="fml-lab-legend"><span><i style="background:' + INK + '"></i>Incoming update</span><span><i style="background:' + GREY + '"></i>Projection</span>' + (showScale ? '<span><i style="background:' + TEAL + '"></i>Norm-matched</span>' : '') + '</div>' +
      '<svg class="fml-lab-geometry" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="A unit incoming vector at ' + angle + ' degrees projects to magnitude ' + fmt(projected) + ' on the shared direction.' + (matched ? ' Norm matching extends that projection to magnitude one.' : '') + '">' +
      '<defs><marker id="fml-arrow-ink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="' + INK + '"/></marker><marker id="fml-arrow-teal" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="' + TEAL + '"/></marker><marker id="fml-arrow-grey" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="' + GREY + '"/></marker></defs>' +
      '<rect x="22" y="' + (oy - 9) + '" width="' + (w - 44) + '" height="18" fill="var(--surface-2)" rx="9"/>' +
      '<line x1="22" x2="' + (w - 22) + '" y1="' + oy + '" y2="' + oy + '" stroke="var(--axis)"/>' +
      '<path d="M ' + ox + ' ' + (oy - radius) + ' A ' + radius + ' ' + radius + ' 0 0 1 ' + (ox + radius) + ' ' + oy + '" fill="none" stroke="var(--axis)" stroke-width="1.3" stroke-dasharray="4 5"/>' +
      '<line x1="' + tx + '" x2="' + tx + '" y1="' + ty + '" y2="' + oy + '" stroke="var(--muted)" stroke-width="1.3" stroke-dasharray="4 5"/>' +
      '<path d="M ' + (ox + 32) + ' ' + oy + ' A 32 32 0 0 0 ' + arcX + ' ' + arcY + '" fill="none" stroke="var(--muted)"/>' +
      '<text x="' + (ox + 41) + '" y="' + (oy - 10) + '" fill="var(--ink-2)" font-size="13">' + angle + '°</text>' +
      '<line x1="' + ox + '" x2="' + tx + '" y1="' + oy + '" y2="' + oy + '" stroke="' + GREY + '" stroke-width="' + (matched ? '7' : '3') + '" stroke-opacity="' + (matched ? '.45' : '1') + '" marker-end="url(#fml-arrow-grey)"/>' +
      (matched ? '<line x1="' + ox + '" x2="' + (ox + radius) + '" y1="' + oy + '" y2="' + oy + '" stroke="' + TEAL + '" stroke-width="3" marker-end="url(#fml-arrow-teal)"/><text x="' + matchedLabelX + '" y="' + (oy - 14) + '" text-anchor="' + (matchedLabelX > w - 60 ? 'end' : 'start') + '" fill="' + TEAL + '" font-size="14">1.00</text>' : '') +
      '<line x1="' + ox + '" x2="' + tx + '" y1="' + oy + '" y2="' + ty + '" stroke="' + INK + '" stroke-width="3" marker-end="url(#fml-arrow-ink)"/>' +
      '<text x="' + labelX + '" y="' + (ty - 4) + '" fill="' + INK + '" font-size="14">norm 1.00</text>' +
      '<circle cx="' + ox + '" cy="' + oy + '" r="4" fill="' + INK + '"/>' +
      '<text x="' + (w - 22) + '" y="' + (oy + 33) + '" text-anchor="end" fill="var(--ink-2)" font-size="13">Shared direction</text>' +
      '</svg>' +
      '<div class="fml-lab-metrics"><div><span>Projected magnitude</span><strong>' + fmt(projected) + '</strong></div><div><span>' + (showScale ? 'Global scale α' : 'Original magnitude') + '</span><strong class="' + (showScale && matched ? 'fml-lab-teal' : '') + '">' + (showScale ? fmt(matched ? 1 / projected : 1) + '×' : '1.00') + '</strong></div><div><span>Reconstructed magnitude</span><strong class="' + (matched ? 'fml-lab-teal' : '') + '">' + fmt(matched ? 1 : projected) + '</strong></div></div>';
    root.querySelector('#fml-lab-figure-note').innerHTML = '<span class="fml-lab-math">' + (matched ? 'α = 1 / cos θ &nbsp; · &nbsp; α ‖projection‖ = 1' : '‖projection‖ = cos θ') + '</span>';
  }

  function colour(value, selected) {
    if (selected) return 'var(--surface-2)';
    const amount = Math.min(1, Math.abs(value));
    const target = value < 0 ? 'var(--ref)' : 'var(--fml)';
    return 'color-mix(in srgb, ' + target + ' ' + Math.round(40 * amount) + '%, var(--surface))';
  }

  function drawRanking(visual) {
    const residual = residuals();
    const next = nextPivot();
    let html = '<div class="fml-lab-rank-head"><span>Unexplained signature</span><span>' + chosen.length + ' selected</span></div><div class="fml-lab-sketch" role="table" aria-label="Functional sketch residuals"><div class="fml-lab-sketch-row fml-lab-sketch-header" role="row"><span role="columnheader">Probe</span>';
    names.forEach((name, j) => { html += '<span role="columnheader" class="' + (chosen.includes(j) ? 'is-selected' : j === next ? 'is-next' : '') + '">' + name + (chosen.includes(j) ? '<small>✓</small>' : j === next ? '<small>next</small>' : '') + '</span>'; });
    html += '</div>';
    for (let i = 0; i < 4; i++) {
      html += '<div class="fml-lab-sketch-row" role="row"><span class="fml-lab-probe" role="rowheader">' + (i + 1) + '</span>';
      residual.forEach((column, j) => {
        const value = column[i];
        html += '<span class="fml-lab-sketch-cell' + (j === next ? ' is-next' : '') + (chosen.includes(j) ? ' is-selected' : '') + '" role="cell" style="background:' + colour(value, chosen.includes(j)) + ';color:' + INK + '">' + fmt(value) + '</span>';
      });
      html += '</div>';
    }
    html += '<div class="fml-lab-sketch-row fml-lab-sketch-norm" role="row"><span role="rowheader">Norm</span>';
    residual.forEach((column, j) => { html += '<span role="cell" class="' + (j === next ? 'is-next' : '') + '">' + fmt(norm(column)) + '</span>'; });
    html += '</div></div><div class="fml-lab-pivot-order"><span>Pivot order</span><strong>' + (chosen.length ? chosen.map(i => names[i]).join(' <i aria-hidden="true">→</i> ') : 'Waiting for the first selection') + '</strong></div>';
    visual.innerHTML = html;
    const note = chosen.length === 0 ? 'A and B start with similar output effects.' : chosen.length === 1 ? 'Selecting A sharply reduces B’s unexplained signature.' : next < 0 ? 'Four pivots span the sketch. The remaining candidate adds no new direction.' : 'The next pivot has the largest remaining signature norm.';
    root.querySelector('#fml-lab-figure-note').innerHTML = '<span>' + note + '</span>';
  }

  function drawPreservation(visual) {
    const coefficients = taskCoefficients[storedTask];
    let html = '<div class="fml-lab-preserve-top"><span>Shared basis · ' + basisCount + ' directions</span><span class="fml-lab-stable"><i aria-hidden="true">✓</i> Earlier update unchanged</span></div><div class="fml-lab-basis-grid" style="--basis-count:' + basisCount + '">';
    for (let j = 0; j < basisCount; j++) {
      html += '<div class="fml-lab-basis-column' + (j > 1 ? ' is-added' : '') + '"><span class="fml-lab-basis-name">u<sub>' + (j + 1) + '</sub></span><div class="fml-lab-basis-vector">';
      for (let i = 0; i < 6; i++) html += '<span class="' + (j === i ? 'is-one' : '') + '">' + (j === i ? '1' : '0') + '</span>';
      html += '</div><span class="fml-lab-coefficient">' + (j < 2 ? fmt(coefficients[j], 1) : '0') + '</span><span class="fml-lab-basis-caption">' + (j < 2 ? 'retained' : 'appended') + '</span></div>';
    }
    html += '</div><div class="fml-lab-reconstruction"><span>Stored task ' + (storedTask ? 'B' : 'A') + '</span><strong>' + fmt(coefficients[0], 1) + 'u<sub>1</sub> ' + (coefficients[1] < 0 ? '−' : '+') + ' ' + fmt(Math.abs(coefficients[1]), 1) + 'u<sub>2</sub></strong><span>Same before and after expansion</span></div>';
    visual.innerHTML = html;
    root.querySelector('#fml-lab-figure-note').innerHTML = '<span>Numbers below each basis vector are the stored coefficients.</span><span>New directions receive zeros for earlier tasks.</span>';
  }

  window.FMLLab = {
    init: function (element) {
      if (!element) return;
      if (observer) observer.disconnect();
      root = element;
      render();
      if (window.ResizeObserver) {
        let lastWidth = root.clientWidth;
        observer = new ResizeObserver(() => {
          const width = root.clientWidth;
          if (Math.abs(width - lastWidth) > 1) { lastWidth = width; draw(); }
        });
        observer.observe(root);
      }
    },
    setStage: function (n) { setStage(n, false); },
    getState: function () {
      return {stage: stage, angle: angle, normMatching: normOn, selectedDirections: chosen.map(i => names[i]), nextPivot: nextPivot() >= 0 ? names[nextPivot()] : null, basisCount: basisCount, storedTask: storedTask ? 'B' : 'A', coefficients: taskCoefficients[storedTask].concat(Array(basisCount - 2).fill(0)), projectionNorm: Math.cos(angle * Math.PI / 180)};
    }
  };
})();
