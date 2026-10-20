/* Original fml-experience paired-bar explorer, themed for the current site.
   All scores are read from the existing manuscript table arrays. */
(function () {
  'use strict';
  const A = PAPER_TABLES.adapt;
  const DATA = {
    benchmarks: ['ARC-Challenge', 'ARC-Easy', 'BoolQ', 'HellaSwag', 'OpenBookQA', 'PIQA', 'WinoGrande'],
    budgets: A.shots.map((s, i) => ({
      label: i === 0 ? 'Description only' : s === 'Full' ? 'Fully adapted' : s + '-shot',
      short: i === 0 ? 'Description only' : s === 'Full' ? 'Fully adapted' : s + '-shot',
      scores: A.v[i].slice(0, 7), mean: A.v[i][7]
    })),
    oracle: A.oracle.slice(0, 7)
  };
  let serial = 0;
  const safe = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const score = (value, places) => Number(value).toFixed(places === undefined ? 1 : places);

  function citation(label) {
    return '<span class="ev-source paper-link-unavailable" role="link" aria-disabled="true" title="Paper coming soon">' + safe(label) + ' <small>Coming soon</small></span>';
  }

  function scale() {
    return '<div class="ev-scale" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>';
  }

  function pairBar(baseline, value, oracle, showOracle) {
    return '<svg class="ev-pair-vector" viewBox="0 0 1000 34" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      '<line x1="0" x2="1000" y1="33.5" y2="33.5" class="ev-bar-rule" />' +
      '<rect x="0" y="0" width="' + baseline * 10 + '" height="10" class="ev-mark-baseline" />' +
      '<rect x="0" y="16" width="' + value * 10 + '" height="14" class="ev-mark-focal" />' +
      (showOracle ? '<line x1="' + oracle * 10 + '" x2="' + oracle * 10 + '" y1="0" y2="32" class="ev-oracle-line" />' : '') + '</svg>';
  }

  function reuseTable(index, showOracle) {
    const budget = DATA.budgets[index];
    const selectedClass = 'ev-col-score' + (showOracle ? '' : ' ev-col-end');
    return '<table class="ev-table"><caption>Reported benchmark accuracy (%)</caption><thead><tr><th class="ev-col-benchmark ev-col-start" scope="col">Benchmark</th><th class="ev-col-score" scope="col">Description only</th><th class="' + selectedClass + '" scope="col">' + safe(budget.short) + (index === 0 ? ' (selected)' : '') + '</th>' +
      (showOracle ? '<th class="ev-col-score ev-col-end" scope="col">Task-specific LoRA</th>' : '') + '</tr></thead><tbody>' + DATA.benchmarks.map((name, i) =>
        '<tr><th class="ev-col-benchmark ev-col-start" scope="row">' + name + '</th><td class="ev-col-score">' + score(DATA.budgets[0].scores[i]) + '</td><td class="' + selectedClass + ' ev-focal-cell">' + score(budget.scores[i]) + '</td>' + (showOracle ? '<td class="ev-col-score ev-col-end">' + score(DATA.oracle[i]) + '</td>' : '') + '</tr>'
      ).join('') + '<tr class="ev-table-total"><th class="ev-col-benchmark ev-col-start" scope="row">Reported average</th><td class="ev-col-score">73.5</td><td class="' + selectedClass + ' ev-focal-cell">' + score(budget.mean) + '</td>' + (showOracle ? '<td class="ev-col-score ev-col-end">79.2</td>' : '') + '</tr></tbody></table>';
  }

  function trajectoryChart(benchmark, selected, showOracle, width) {
    const shots=[0,8,64,128,256,512];
    const values=DATA.budgets.slice(0,6).map(b=>benchmark==='average'?b.mean:b.scores[Number(benchmark)]);
    const endpoint=benchmark==='average'?DATA.budgets[6].mean:DATA.budgets[6].scores[Number(benchmark)];
    const reference=benchmark==='average'?79.2:DATA.oracle[Number(benchmark)];
    const w=Math.max(260,Math.round(width||600)),h=265,left=38,right=15,top=18,bottom=40;
    // Focus the line-chart scale on observed values, with padding and at least
    // ten percentage points of range. Include the optional reference in view.
    const plotted=showOracle?values.concat(reference):values;
    let lo=Math.max(0,Math.floor((Math.min(...plotted)-2)/5)*5);
    let hi=Math.min(100,Math.ceil((Math.max(...plotted)+2)/5)*5);
    if(hi-lo<10){lo=Math.max(0,hi-10);hi=Math.min(100,lo+10);}
    const ticks=[];
    for(let v=lo;v<=hi;v+=5)ticks.push(v);
    const delta=values[values.length-1]-values[0];
    const x=v=>left+v/512*(w-left-right),y=v=>top+(hi-v)/(hi-lo)*(h-top-bottom);
    const line=values.map((v,i)=>(i?'L':'M')+x(shots[i]).toFixed(2)+','+y(v).toFixed(2)).join(' ');
    return '<div class="ev-trajectory"><p class="ev-metric">Accuracy across target-example budgets<span>Focused y-axis: '+lo+'–'+hi+'%</span></p>' +
      '<p class="ev-trajectory-change">'+score(values[0])+'% → '+score(values[values.length-1])+'% <span>· '+(delta>0?'+':'')+score(delta)+' percentage points at 512 examples</span></p>' +
      '<svg class="ev-trajectory-svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Reported accuracy at 0, 8, 64, 128, 256 and 512 target examples; focused accuracy axis from '+lo+' to '+hi+' percent"><title>Reported coefficient adaptation accuracy</title>' +
      ticks.map(v=>'<line x1="'+left+'" y1="'+y(v)+'" x2="'+(w-right)+'" y2="'+y(v)+'" stroke="var(--rule)"/><text x="'+(left-9)+'" y="'+(y(v)+4)+'" text-anchor="end">'+v+'</text>').join('') +
      [0,128,256,512].map(v=>'<text x="'+x(v)+'" y="'+(h-18)+'" text-anchor="'+(v===0?'start':v===512?'end':'middle')+'">'+v+'</text>').join('') +
      (showOracle?'<line x1="'+left+'" x2="'+(w-right)+'" y1="'+y(reference)+'" y2="'+y(reference)+'" class="ev-oracle-line"/>':'') +
      '<path d="'+line+'" class="ev-trajectory-line"/>'+values.map((v,i)=>'<circle cx="'+x(shots[i])+'" cy="'+y(v)+'" r="'+(i===selected?5:3.5)+'" class="ev-trajectory-point'+(i===selected?' is-selected':'')+'"><title>'+shots[i]+' examples: '+score(v)+'%</title></circle>').join('')+'</svg>'+
      '<p class="ev-note">Target examples · 0 = description-only generation.'+(showOracle?' Dashed line: independent task-LoRA reference ('+score(reference)+'%).':'')+'</p>'+
      '<div class="ev-trajectory-data">'+values.map((v,i)=>'<span>'+shots[i]+' examples<b>'+score(v)+'%</b></span>').join('')+'</div>'+
      '<div class="ev-adapt-endpoint"><span>Fully adapted<small>Separate validation-selected endpoint</small></span><strong>'+score(endpoint)+'%</strong></div></div>';
  }

  function trajectoryTable(benchmark) {
    const title=benchmark==='average'?'Average across seven benchmarks':DATA.benchmarks[Number(benchmark)];
    return '<table class="ev-table"><caption>'+safe(title)+' · reported accuracy by adaptation setting</caption><thead><tr><th class="ev-col-benchmark ev-col-start" scope="col">Target supervision</th><th class="ev-col-score ev-col-end" scope="col">Accuracy (%) ↑</th></tr></thead><tbody>'+DATA.budgets.map(b=>'<tr><th class="ev-col-benchmark ev-col-start" scope="row">'+b.label+'</th><td class="ev-col-score ev-col-end">'+score(benchmark==='average'?b.mean:b.scores[Number(benchmark)])+'</td></tr>').join('')+'</tbody></table>';
  }

  function initReuse(element) {
    if (!element) return;
    const id = 'fml-reuse-' + (++serial);
    let selected = 4;
    let showOracle = false;
    let benchmark = 'all';
    element.classList.add('fml-reuse');
    element.innerHTML = '<div class="ev-reuse-layout"><div class="ev-reuse-intro"><h3>Adaptation within<br>a frozen basis</h3><p class="ev-context">Task descriptions generate the initial coefficients, which target examples refine within the shared basis.</p>' +
      '<label class="ev-select-label" for="' + id + '-budget">Target supervision</label><select class="ev-budget-select" id="' + id + '-budget">' + DATA.budgets.map((budget, i) => '<option value="' + i + '">' + budget.label + '</option>').join('') + '</select>' +
      '<div class="ev-average" aria-live="polite" aria-atomic="true"><div class="ev-average-number"><span data-average>73.5</span><span>%</span></div><p data-average-caption>average accuracy<br><span>across seven language benchmarks</span></p></div>' +
      '<p class="ev-stage-note" data-stage-note></p><label class="ev-reference-toggle"><input type="checkbox" data-reference><span>Show task-specific LoRA reference</span></label>' +
      '<p class="ev-note ev-reuse-citation">' + citation('Tables 3–4 · Paper, p. 9') + '</p></div>' +
      '<div class="ev-reuse-data"><label class="ev-benchmark-control" for="' + id + '-benchmark">Explore a benchmark<select id="' + id + '-benchmark" class="ev-benchmark-select" data-benchmark><option value="all">All benchmarks · selected budget</option><option value="average">Average · across budgets</option>' + DATA.benchmarks.map((name,i)=>'<option value="'+i+'">'+name+' · across budgets</option>').join('') + '</select></label><div class="ev-pair-title"><p class="ev-metric">Benchmark accuracy (%) <span>Higher is better</span></p><div class="ev-legend"><span><i class="ev-legend-baseline" aria-hidden="true"></i>Description only</span><span><i class="ev-legend-focal" aria-hidden="true"></i><span data-budget-label>Description only (selected)</span></span><span data-oracle-legend hidden><i class="ev-legend-oracle" aria-hidden="true"></i>Task-specific LoRA</span></div></div><div class="ev-pair-chart" data-pair-chart></div>' +
      '<details class="ev-values-details"><summary>View exact values</summary><div class="ev-table-scroll" role="region" aria-label="Exact coefficient adaptation results" tabindex="0" data-values></div></details>' +
      '<p class="ev-note">Full adaptation uses validation-selected endpoints. Task-LoRA references use a different training budget.</p></div></div>';

    const select = element.querySelector('.ev-budget-select');
    const reference = element.querySelector('[data-reference]');
    select.value = String(selected);
    function render() {
      const budget = DATA.budgets[selected];
      const selectedValue=benchmark==='all'||benchmark==='average'?budget.mean:budget.scores[Number(benchmark)];
      const startValue=benchmark==='all'||benchmark==='average'?73.5:DATA.budgets[0].scores[Number(benchmark)];
      element.querySelector('[data-average]').textContent = score(selectedValue);
      element.querySelector('[data-average-caption]').innerHTML=benchmark==='all'||benchmark==='average'?'average accuracy<br><span>across seven language benchmarks</span>':'accuracy<br><span>'+safe(DATA.benchmarks[Number(benchmark)])+'</span>';
      element.querySelector('.ev-pair-title').hidden=benchmark!=='all';
      element.querySelector('[data-budget-label]').textContent = selected === 0 ? 'Description only (selected)' : budget.short;
      element.querySelector('[data-oracle-legend]').hidden = !showOracle;
      element.querySelector('[data-stage-note]').textContent = selected === 0
        ? 'Coefficients are generated without target-task examples.'
        : selected === 6
          ? 'Validation-selected endpoints are reached within 288–800 coefficient updates.'
          : 'Coefficients are adapted using ' + budget.label.replace('-shot', '') + ' target-task examples.';
      element.querySelector('[data-pair-chart]').innerHTML = benchmark==='all'?DATA.benchmarks.map((name, i) =>
        '<div class="ev-pair-row"><div class="ev-pair-label">' + name + '</div><div class="ev-pair-marks">' + pairBar(DATA.budgets[0].scores[i], budget.scores[i], DATA.oracle[i], showOracle) + '</div><div class="ev-pair-values"><span><span class="ev-sr-only">Description only: </span>' + score(DATA.budgets[0].scores[i]) + '</span><span><span class="ev-sr-only">' + safe(budget.short) + ': </span>' + score(budget.scores[i]) + '</span>' + (showOracle ? '<small>LoRA ' + score(DATA.oracle[i]) + '</small>' : '') + '</div></div>'
      ).join('') + '<div class="ev-pair-axis"><span></span>' + scale() + '<span></span></div>':trajectoryChart(benchmark,selected,showOracle,element.querySelector('[data-pair-chart]').getBoundingClientRect().width);
      element.querySelector('[data-values]').innerHTML = benchmark==='all'?reuseTable(selected, showOracle):trajectoryTable(benchmark);
    }
    select.addEventListener('change', () => { selected = Number(select.value); render(); });
    reference.addEventListener('change', () => { showOracle = reference.checked; render(); });
    element.querySelector('[data-benchmark]').addEventListener('change',event=>{benchmark=event.target.value;render();});
    if('ResizeObserver' in window){let lastWidth=0;const observer=new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(Math.abs(width-lastWidth)>1){lastWidth=width;if(benchmark!=='all')render();}});observer.observe(element.querySelector('.ev-reuse-data'));}
    render();
  }


  initReuse(document.getElementById('adaptation-explorer'));
}());
