/* FML visual companion. Schematic motion; no model inference or measured data.
   Theme colours inherit the host site palette. */
(function () {
  'use strict';
  const INK = 'var(--ink)', BLUE = 'var(--fml)', RULE = 'var(--axis)', PAPER = 'var(--surface)';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const chapters = [
    { short: 'Experience', title: 'Task experience as a functional memory', description: 'Independently trained LoRAs record completed task experience. FML continually consolidates adapters from the same base model into shared bases, task coefficients and a global scale for each task.', note: 'All adapters share the same base model.' },
    { short: 'Scale', title: 'Projection and global norm matching', description: 'Project the incoming update into the shared basis, then restore its global magnitude. Correcting scale often recovers behaviour before any new directions are added.', note: 'Norm matching restores update magnitude. It does not rotate a projection or guarantee functional recovery.' },
    { short: 'Function', title: 'Functional ranking and admission', description: 'Unlabelled task inputs reveal how residual directions affect model outputs. CPQR ranks unexplained functional variation, and capture checks determine how many directions to admit.', note: 'Admission requires no gradient-based optimization.' },
    { short: 'Preserve', title: 'Preservation under basis expansion', description: 'Append orthogonal directions while leaving the existing bases fixed. Zero-pad each old task’s coefficients so its admitted reconstructed update remains unchanged as memory grows.', note: 'The guarantee preserves admitted reconstructions. Approximation made at admission can still differ from the original adapter.' },
    { short: 'Reuse', title: 'Reuse for subsequent adaptation', description: 'The functional memory supports target-data-free LoRA initialization and description-conditioned coefficient generation. Generated coefficients can subsequently be adapted with the shared basis frozen.', note: 'Initialization and coefficient generation reuse the same functional basis.' }
  ];
  const state = { hero: null, dialog: null, heroPlaying: !reducedMotion.matches, heroTime: 0, heroVisible: true, storyOpen: false, playing: false, time: 0, chapter: -1, mobile: false, lastFrame: 0, lastPaint: 0, previousFocus: null, previousOverflow: '', frame: null, reuseManualRoute: null, reuseShownRoute: -1, reuseTask: 0, reuseRefined: false };
  const icons = {
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.5 13 8 4 13.5z"/></svg>',
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.5h2.8v11H4zm5.2 0H12v11H9.2z"/></svg>',
    prev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 3h2v10H3zm10 0v10L5 8z"/></svg>',
    next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M11 3h2v10h-2zM3 3l8 5-8 5z"/></svg>'
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = v => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
  const fmt = v => '0:' + String(Math.floor(v)).padStart(2, '0');
  const t = (text, x, y, size = 15, cls = '', anchor = 'start') => `<text x="${x}" y="${y}" font-size="${size}" class="${cls}" text-anchor="${anchor}">${text}</text>`;
  const path = (d, stroke = RULE, width = 1.3, extra = '') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" ${extra}/>`;
  function grid(x, y, w, h, cols, rows, seed = 1, colour = BLUE, attrs = '') {
    let s = `<g ${attrs}>`;
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const opacity = .25 + (((r * 7 + c * 3 + seed * 11) % 10) / 10) * .55;
      s += `<rect x="${x + c * cw + 1.4}" y="${y + r * ch + 1.4}" width="${cw - 2.8}" height="${ch - 2.8}" rx=".6" fill="${colour}" opacity="${opacity.toFixed(2)}"/>`;
    }
    return s + '</g>';
  }
  function arrow(x1, y1, x2, y2, colour, extra = '') { return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colour}" stroke-width="2.5" marker-end="url(#story-arrow-${colour === BLUE ? 'blue' : 'ink'})" ${extra}/>`; }
  const storyDefs = `<defs><marker id="story-arrow-blue" viewBox="0 0 8 8" refX="6.7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 8 4 0 8z" fill="${BLUE}"/></marker><marker id="story-arrow-ink" viewBox="0 0 8 8" refX="6.7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 8 4 0 8z" fill="${INK}"/></marker></defs>`;

  function mobileHeroMarkup() {
    const point=(u,v,dy=0)=>[104+u*19+v*12,185-u*10+v*13+dy];
    const poly=(u0,v0,u1,v1,dy=0)=>[point(u0,v0,dy),point(u1,v0,dy),point(u1,v1,dy),point(u0,v1,dy)].map(p=>p.join(',')).join(' ');
    let planes='';
    [20,10,0].forEach((dy,i)=>{
      planes+=`<polygon points="${poly(0,0,6,6,dy)}" fill="${i===2?'var(--surface-2)':'var(--surface)'}" stroke="${i===2?'var(--fml-ink)':'var(--axis)'}" stroke-width="1.2"/>`;
      if(i<2)for(let j=1;j<6;j++)planes+=path(`M${point(j,0,dy)} L${point(j,6,dy)}`,'var(--rule)',.7);
    });
    for(let col=0;col<6;col++){
      planes+=`<polygon data-basis-column="${col}" points="${poly(col+.07,.07,col+.93,5.93)}" fill="${BLUE}" opacity=".24"/>`;
      for(let row=1;row<6;row++)planes+=path(`M${point(col,row)} L${point(col+1,row)}`,'var(--axis)',.75);
    }
    const incoming=[20,85,150].map((x,i)=>`${grid(x,53,44,34,4,3,i+2)}${t('t'+(i+1),x+22,104,15,'motion-major','middle')}${path(`M${x+22} 111 C${x+22} 136,${142+i*18} 130,${142+i*18} ${165-i*9}`,'var(--axis)',1.1)}<rect data-packet="${i}" width="5" height="5" rx=".6" fill="${BLUE}"/>`).join('');
    return `<svg class="memory-scene__drawing" viewBox="0 0 400 350" role="img" aria-label="Schematic: completed task adapters form a shared functional memory, which supports initialization and coefficient generation for new tasks.">
      ${t('Completed tasks',20,29,16,'motion-major')}${t('New tasks',303,76,15,'motion-major')}
      ${incoming}${planes}
      ${path('M290 203 C312 203,298 141,322 141','var(--axis)',1.2)}${path('M290 203 C312 203,298 239,322 239','var(--axis)',1.2)}
      ${grid(325,122,54,38,4,3,6)}${t('Initialize',352,183,15,'motion-major','middle')}
      ${grid(325,220,54,38,4,3,11)}${t('Generate',352,282,15,'motion-major','middle')}
      <circle data-output-packet="0" cx="322" cy="141" r="3" fill="${BLUE}"/><circle data-output-packet="1" cx="322" cy="239" r="3" fill="${BLUE}"/>
      ${t('Functional memory',185,311,21,'motion-accent','middle')}
      ${t('Shared bases · coefficients · scale',200,338,15,'','middle')}
    </svg><button class="memory-scene__pause" type="button" aria-label="${state.heroPlaying?'Pause':'Play'} schematic animation" aria-pressed="${!state.heroPlaying}">${state.heroPlaying?icons.pause:icons.play}<span>${state.heroPlaying?'Pause':'Play'}</span></button>`;
  }
  function heroMarkup() {
    if(state.heroMobile)return mobileHeroMarkup();
    const point = (u, v, dy = 0) => [220 + u * 26 + v * 15, 226 - u * 14 + v * 18 + dy];
    const poly = (u0, v0, u1, v1, dy = 0) => [point(u0,v0,dy),point(u1,v0,dy),point(u1,v1,dy),point(u0,v1,dy)].map(p=>p.join(',')).join(' ');
    let planes = '';
    [30,15,0].forEach((dy,i)=>{
      planes += `<polygon points="${poly(0,0,6,6,dy)}" fill="${i===2?'var(--surface-2)':'var(--surface)'}" stroke="${i===2?'var(--fml-ink)':'var(--axis)'}" stroke-width="1.2"/>`;
      if(i<2) for(let j=1;j<6;j++) planes += path(`M${point(j,0,dy)} L${point(j,6,dy)}`, 'var(--rule)',.7);
    });
    for(let col=0;col<6;col++) {
      planes += `<polygon data-basis-column="${col}" points="${poly(col+.07,.07,col+.93,5.93)}" fill="${BLUE}" opacity="${(.18+col*.025).toFixed(3)}"/>`;
      for(let row=1;row<6;row++) planes += path(`M${point(col,row)} L${point(col+1,row)}`,'var(--axis)',.75);
    }
    const incoming = [84,178,272].map((y,i)=>`${t('Task '+String(i+1).padStart(2,'0'),24,y-9,13,'motion-major')}${grid(24,y,70,49,5,4,i+2)}${path(`M105 ${y+25} C156 ${y+25},161 221,220 226`, 'var(--axis)',1.1)}<rect data-packet="${i}" width="6" height="6" rx=".6" fill="${BLUE}"/>`).join('');
    return `<svg class="memory-scene__drawing" viewBox="0 0 620 450" role="img" aria-label="Schematic: task adapters arrive from one base model, shared functional directions accumulate, and the memory supports new tasks.">
      ${t('COMPLETED TASKS',24,36,11)}${t('NEW TASKS',501,36,11)}
      ${incoming}${planes}
      ${path('M466 250 C508 250,487 114,522 114','var(--axis)',1.2)}
      ${path('M466 250 C508 250,489 305,522 305','var(--axis)',1.2)}
      ${grid(529,91,58,46,4,4,6)}${t('Initialize',558,161,13,'motion-major','middle')}
      ${grid(529,282,58,46,4,4,11)}${t('Generate',558,352,13,'motion-major','middle')}
      <circle data-output-packet="0" cx="522" cy="114" r="3.5" fill="${BLUE}"/><circle data-output-packet="1" cx="522" cy="305" r="3.5" fill="${BLUE}"/>
      ${path('M342 369 L342 391','var(--fml-ink)',1)}${t('Functional memory',342,413,19,'motion-accent','middle')}
      ${t('Shared bases · task coefficients · scale',342,435,12,'','middle')}
      ${t('Same base model',24,354,12)}
    </svg><button class="memory-scene__pause" type="button" aria-label="${state.heroPlaying?'Pause':'Play'} schematic animation" aria-pressed="${!state.heroPlaying}">${state.heroPlaying?icons.pause:icons.play}<span>${state.heroPlaying?'Pause':'Play'}</span></button>`;
  }
  function bezier(a,b,c,d,p) { const q=1-p;return [q*q*q*a[0]+3*q*q*p*b[0]+3*q*p*p*c[0]+p*p*p*d[0],q*q*q*a[1]+3*q*q*p*b[1]+3*q*p*p*c[1]+p*p*p*d[1]]; }
  function paintHero() {
    if(!state.hero)return;
    const phase=state.heroTime/5.5;
    state.hero.querySelectorAll('[data-packet]').forEach((node,i)=>{
      const y=[109,203,297][i],p=(phase+i/3)%1;
      const x=42+i*65,tx=142+i*18,ty=165-i*9;
      const xy=state.heroMobile?bezier([x,111],[x,136],[tx,130],[tx,ty],p):bezier([105,y],[156,y],[161,221],[220,226],p);
      node.setAttribute('x',(xy[0]-3).toFixed(2));node.setAttribute('y',(xy[1]-3).toFixed(2));node.setAttribute('opacity',String(Math.sin(p*Math.PI)*.9));
    });
    state.hero.querySelectorAll('[data-basis-column]').forEach((node,i)=>{
      const pulse=(Math.sin(phase*3.5-i*.7)+1)/2;
      node.setAttribute('opacity',(.19+.19*pulse).toFixed(3));
    });
    state.hero.querySelectorAll('[data-output-packet]').forEach((node,i)=>{
      const p=(phase*.65+i*.5)%1,y=i?305:114;
      const my=i?239:141;
      const xy=state.heroMobile?bezier([290,203],[312,203],[298,my],[322,my],p):bezier([466,250],[508,250],[i?489:487,y],[522,y],p);
      node.setAttribute('cx',xy[0].toFixed(2));node.setAttribute('cy',xy[1].toFixed(2));node.setAttribute('opacity',String(Math.sin(p*Math.PI)*.9));
    });
  }
  function setHeroPlaying(value) {
    state.heroPlaying=!!value;
    const b=state.hero?.querySelector('.memory-scene__pause');
    if(b){b.innerHTML=(value?icons.pause:icons.play)+`<span>${value?'Pause':'Play'}</span>`;b.setAttribute('aria-label',`${value?'Pause':'Play'} schematic animation`);b.setAttribute('aria-pressed',String(!value));}
  }

  function experienceScene(m) {
    const W=m?420:820, n=m?3:5, width=m?72:88, gap=m?66:52, start=m?36:72, y=m?49:63;
    let s='';
    for(let i=0;i<n;i++){
      const x=start+i*(width+gap);
      s+=`<g data-story-adapter="${i}">${t('Task '+String(i+1).padStart(2,'0'),x+width/2,y-15,m?13:15,'motion-major','middle')}${grid(x,y,width,76,5,5,i+1)}${path(`M${x+width/2} ${y+89} V${m?181:210}`,'var(--axis)',1)}</g>`;
    }
    s+=`<rect x="${m?36:72}" y="${m?185:214}" width="${m?348:648}" height="43" rx="2" fill="var(--surface-2)" stroke="${RULE}"/>${t('One frozen base model',W/2,m?212:241,m?15:17,'motion-accent','middle')}`;
    return s;
  }
  function scaleScene(m) {
    const ox=m?65:235,oy=m?225:255,dx=m?112:139,dy=m?151:184,r=Math.sqrt(dx*dx+dy*dy),ex=ox+dx,ey=oy-dy;
    return `<ellipse cx="${ox+130}" cy="${oy}" rx="${m?152:220}" ry="${m?25:31}" fill="var(--surface-2)" stroke="var(--axis)"/>
      ${path(`M${ox+r} ${oy} A${r} ${r} 0 0 0 ${ex} ${ey}`,'var(--axis)',1,'stroke-dasharray="3 5"')}
      ${path(`M${ex} ${ey} V${oy}`,'var(--axis)',1.2,'stroke-dasharray="4 5"')}
      ${arrow(ox,oy,ex,ey,INK)}
      ${arrow(ox,oy,ex,oy,'var(--muted)')}
      ${arrow(ox,oy,ex,oy,BLUE,'data-scale-vector="true"')}
      <circle cx="${ox}" cy="${oy}" r="4" fill="${INK}"/>
      ${t('Incoming LoRA',ex+13,ey-6,m?14:17,'motion-major')}
      ${t('Projection',ex-9,oy+43,m?12:15,'','middle')}
      ${t('Norm-matched',ox+r+13,oy-16,m?13:16,'motion-accent','middle')}
      ${t('Shared directions',m?282:600,oy+44,m?12:15,'','middle')}`;
  }
  function functionScene(m) {
    const start=m?64:192,y=m?63:53,cw=m?54:76,ch=m?26:32,n=5;
    const values=[[.2,.7,.4,.2],[.18,.67,.42,.22],[.78,.22,.86,.53],[.19,.69,.43,.25],[.58,.61,.13,.86]];
    let s=t('Functional signatures',start+cw*n/2,m?25:18,m?15:18,'motion-major','middle');
    for(let c=0;c<n;c++){
      s+=`<g data-signature="${c}"><rect data-signature-outline="${c}" x="${start+c*cw-3}" y="${y-3}" width="${cw-6}" height="${ch*4+6}" fill="none" stroke="${BLUE}" opacity="0" stroke-width="2"/>`;
      for(let r=0;r<4;r++)s+=`<rect x="${start+c*cw}" y="${y+r*ch}" width="${cw-12}" height="${ch-5}" fill="${BLUE}" opacity="${values[c][r]}"/>`;
      s+=t('c'+(c+1),start+c*cw+(cw-12)/2,y+ch*4+24,m?13:16,'','middle')+'</g>';
    }
    s+=m ? t('Input',9,103,14)+t('probes',9,121,14) : t('Unlabelled',85,109,13)+t('input',85,125,13)+t('probes',85,141,13);
    s+=`${t('Rank',m?66:226,m?249:285,m?13:15,'','middle')}<g data-rank-step="0" opacity="0">${t('c3',m?131:330,m?249:285,m?18:22,'motion-accent','middle')}</g><g data-rank-step="1" opacity="0">${t('→',m?173:400,m?249:285,m?18:22,'','middle')}${t('c5',m?215:470,m?249:285,m?18:22,'motion-accent','middle')}</g><g data-rank-step="2" opacity="0">${t('→',m?257:540,m?249:285,m?18:22,'','middle')}${t('c1',m?299:610,m?249:285,m?18:22,'motion-accent','middle')}</g>`;
    return s;
  }
  function retainScene(m) {
    const x=m?48:173,y=m?63:40,size=m?150:190,cell=size/5;
    let s=t('Stored task coefficients',x+size/2,m?30:17,m?14:17,'motion-major','middle');
    for(let r=0;r<5;r++)for(let c=0;c<5;c++){
      const isNew=r>=3||c>=3;
      s+=`<g ${isNew?'data-new-zero="true"':''}><rect x="${x+c*cell}" y="${y+r*cell}" width="${cell-3}" height="${cell-3}" fill="${isNew?'var(--surface-3)':BLUE}" opacity="${isNew?1:.28+((r*3+c*2)%7)*.08}"/>${isNew?t('0',x+c*cell+(cell-3)/2,y+r*cell+cell*.66,m?12:16,'','middle'):''}</g>`;
    }
    s+=path(`M${x+3*cell-2} ${y-8} V${y+size+3}`,'var(--fml-ink)',1,'stroke-dasharray="3 4"')+path(`M${x-8} ${y+3*cell-2} H${x+size+3}`,'var(--fml-ink)',1,'stroke-dasharray="3 4"');
    s+=t('Old core',x+cell*1.5,y+size+29,m?12:15,'motion-accent','middle')+t('+ zeros',x+cell*4.1,y+size+29,m?12:15,'','middle');
    const ax=m?225:418, ay=m?135:143;
    s+=arrow(ax,ay,ax+(m?43:69),ay,BLUE);
    const cx=m?329:600,cy=m?132:141,r=m?35:61;
    s+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--surface-2)" stroke="var(--fml-ink)"/>${path(`M${cx-r*.35} ${cy} l${r*.25} ${r*.25} ${r*.5} -${r*.55}`,BLUE,2.5)}${t('Same admitted',cx,cy+r+28,m?13:17,'motion-major','middle')}${t('update',cx,cy+r+47,m?13:17,'motion-major','middle')}`;
    return s;
  }
  // The fixed patterns below are teaching glyphs. They are not learned model weights.
  const reusePatterns=Array.from({length:4},(_,k)=>Array.from({length:30},(_,j)=>{
    const r=Math.floor(j/6),c=j%6;
    return k===0?(c-2.5)/2.5:k===1?(r-2)/2:k===2?((r+c)%3===0?.95:-.35):Math.sin((r+1)*(c+1)*.63);
  }));
  const reuseTasks=[
    {name:'Sentiment',lines:['Classify the','sentiment of','this review.'],weights:[.78,-.28,.48,.64],scale:1.08},
    {name:'Question answering',lines:['Answer from','the supplied','passage.'],weights:[.25,.70,-.55,.38],scale:.85}
  ];
  function directionTile(x,y,w,h,k,extra='') {
    let s=`<g ${extra}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="var(--surface-2)" stroke="var(--axis)"/>`;
    for(let r=0;r<5;r++)s+=`<rect x="${x+4}" y="${y+5+r*(h-10)/5}" width="${w-8}" height="${(h-10)/5-3}" fill="${BLUE}" opacity="${(.28+Math.abs(reusePatterns[k%4][r*6+2])*.58).toFixed(2)}"/>`;
    return s+'</g>';
  }
  function factorGlyph(x,y,w,h,adapted=false) {
    let s=`<g ${adapted?'data-adapted-factors="true"':''}>`;
    const bx=x,by=y,bw=w*.29,bh=h,ax=x+w*.41,ay=y+h*.31,aw=w*.59,ah=h*.37;
    s+=`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="2" fill="var(--surface-2)" stroke="var(--axis)"/><rect x="${ax}" y="${ay}" width="${aw}" height="${ah}" rx="2" fill="var(--surface-2)" stroke="var(--axis)"/>`;
    [[bx,by,bw,bh,3,6],[ax,ay,aw,ah,6,3]].forEach(([gx,gy,gw,gh,cols,rows],a)=>{
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const value=.25+((r*3+c*5+a)%7)*.075;
        s+=`<rect x="${gx+3+c*(gw-6)/cols}" y="${gy+3+r*(gh-6)/rows}" width="${(gw-6)/cols-1.8}" height="${(gh-6)/rows-1.8}" fill="${BLUE}" opacity="${value}" ${adapted?`data-tune-cell="${r*cols+c+a*20}" data-base-opacity="${value}"`:''}/>`;
      }
    });
    return s+'</g>';
  }
  function exampleSheets(x,y,w,h) {
    return `<g><rect x="${x+9}" y="${y-8}" width="${w}" height="${h}" rx="2" fill="var(--surface)" stroke="var(--axis)"/><rect x="${x+4}" y="${y-4}" width="${w}" height="${h}" rx="2" fill="var(--surface-2)" stroke="var(--axis)"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="var(--surface)" stroke="var(--fml-ink)"/>${[.25,.47,.7].map((v,i)=>path(`M${x+9} ${y+h*v} h${w*(i===2?.43:.67)}`,'var(--fml-ink)',1.5)).join('')}</g>`;
  }
  function initReuseScene(m) {
    const sx=m?21:35,sy=m?57:86,tw=m?21:24,th=m?71:96,gap=m?5:7;
    let s=t(m?'Past directions':'Useful directions from memory',m?96:125,m?28:45,m?18:17,'motion-major','middle');
    for(let i=0;i<6;i++)s+=directionTile(sx+i*(tw+gap),sy,tw,th,i,`data-source-direction="${i}"`);
    [0,2,4].forEach((i,k)=>{s+=`<rect data-direction-selection="${k}" x="${sx+i*(tw+gap)-3}" y="${sy-4}" width="${tw+6}" height="${th+8}" rx="3" fill="none" stroke="${BLUE}" stroke-width="1.6"/><g data-direction-transfer="${k}">${directionTile(0,0,m?13:17,m?39:52,i)}</g>`;});
    if(m){
      s+=arrow(184,94,236,94,BLUE)+t('Select',210,76,17,'','middle');
      s+=factorGlyph(264,60,109,72)+t('New LoRA',318,28,18,'motion-major','middle')+t('No target inputs',95,161,17,'','middle');
      s+=arrow(317,148,317,224,BLUE)+t('Fine-tune',298,193,18,'motion-accent','end');
      s+=exampleSheets(41,252,64,53)+arrow(137,278,239,278,BLUE)+t('Train',187,260,17,'','middle');
      s+=factorGlyph(264,244,109,72,true)+t('Task examples',78,345,18,'','middle')+t('Adapted LoRA',318,345,18,'motion-major','middle');
      s+='<rect data-training-packet="true" x="138" y="274" width="8" height="8" rx="1" fill="'+BLUE+'"/>';
    }else{
      s+=arrow(240,132,318,132,BLUE)+t('Select &amp; allocate',280,108,14,'','middle');
      s+=factorGlyph(347,82,132,99)+t('Initialize a new LoRA',413,45,17,'motion-major','middle')+t('No target-task inputs',413,215,14,'','middle');
      s+=arrow(516,132,609,132,BLUE)+t('Fine-tune',562,108,15,'motion-accent','middle');
      s+=factorGlyph(650,82,132,99,true)+t('Adapted LoRA',716,45,17,'motion-major','middle');
      s+=exampleSheets(527,240,48,39)+path('M590 258 H715 V199',BLUE,1.5,'marker-end="url(#story-arrow-blue)"')+t('Target-task examples',507,301,14,'','middle');
      s+='<rect data-training-packet="true" x="590" y="254" width="8" height="8" rx="1" fill="'+BLUE+'"/>';
    }
    return s;
  }
  function generatorGlyph(x,y,w,h) {
    const levels=[[.15,.5,.85],[.05,.35,.65,.95],[.25,.75]],xs=[x,x+w/2,x+w];
    let s='';for(let l=0;l<2;l++)for(const a of levels[l])for(const b of levels[l+1])s+=path(`M${xs[l]} ${y+a*h} L${xs[l+1]} ${y+b*h}`,'var(--axis)',1);
    levels.forEach((arr,l)=>arr.forEach((v,i)=>{s+=`<circle data-generator-node="${l*4+i}" cx="${xs[l]}" cy="${y+v*h}" r="${w<85?4.5:5}" fill="${l===1?'var(--fml-soft)':'var(--surface-3)'}" stroke="var(--fml-ink)" stroke-width="1.2"/>`;}));return s;
  }
  function currentReuseWeights() {
    const task=reuseTasks[state.reuseTask],delta=state.reuseTask?[.13,-.08,.13,.12]:[.08,.15,-.12,.09];
    return task.weights.map((v,i)=>state.reuseRefined?clamp(v+delta[i],-.95,.95):v);
  }
  function generationReuseScene(m) {
    const task=reuseTasks[state.reuseTask],weights=currentReuseWeights();
    const px=m?15:15,py=m?34:72,pw=m?151:154,ph=m?81:103;
    let s=`<path d="M${px} ${py} H${px+pw-15} L${px+pw} ${py+15} V${py+ph} H${px}Z" fill="var(--surface)" stroke="var(--axis)"/>${path(`M${px+pw-15} ${py} V${py+15} H${px+pw}`,'var(--axis)',1)}${task.lines.map((line,i)=>t(line,px+13,py+24+i*(m?21:24),m?17:16,'motion-major')).join('')}`;
    const gx=m?237:220,gy=m?42:87,gw=m?77:81,gh=m?58:66;
    s+=generatorGlyph(gx,gy,gw,gh)+arrow(m?180:180,m?75:123,m?219:205,m?75:123,BLUE)+t('Trained generator',gx+gw/2,m?128:58,m?17:16,'motion-major','middle');
    if(m)s+=path('M276 142 V150 H205 V198 H185',BLUE,1.3,'marker-end="url(#story-arrow-blue)"')+path('M276 150 H288 V218 H275',BLUE,1.3,'marker-end="url(#story-arrow-blue)"');
    else s+=arrow(320,123,342,123,BLUE);
    const centers=m?[62,98,134,170]:[365,401,437,473],base=m?225:134,max=m?46:54,by=m?274:204;
    s+=t('Coefficients',m?120:418,m?169:58,m?18:17,'motion-major','middle')+path(`M${centers[0]-14} ${base} H${centers[3]+14}`,'var(--muted)',1);
    centers.forEach((cx,i)=>{
      const barh=Math.abs(weights[i])*max,y=weights[i]>=0?base-barh:base;
      s+=`<rect data-coefficient-bar="${i}" data-baseline="${base}" data-maxheight="${max}" x="${cx-9}" y="${y}" width="18" height="${barh}" rx="1" fill="${weights[i]>=0?BLUE:'var(--muted)'}"/>${path(`M${cx} ${base+26} V${by-8}`,'var(--axis)',1)}${directionTile(cx-14,by,28,m?51:54,i,`data-fixed-basis="${i}"`)}`;
      s+=path(`M${cx+15} ${by+27} C${m?220:555} ${by+27},${m?255:553} ${m?303:159},${m?300:619} ${m?303:159}`,'var(--axis)',1);
    });
    const kx=m?247:552,ky=m?218:121,kr=m?22:21;
    s+=t('Scale',kx,m?180:58,m?17:16,'','middle')+`<circle cx="${kx}" cy="${ky}" r="${kr}" fill="var(--surface-2)" stroke="var(--axis)"/>`;
    for(let i=0;i<5;i++){const angle=(-145+i*72)*Math.PI/180;s+=path(`M${kx+Math.sin(angle)*(kr-2)} ${ky-Math.cos(angle)*(kr-2)} l${Math.sin(angle)*-3.5} ${Math.cos(angle)*3.5}`,'var(--fml-ink)',1);}
    s+=`<g data-scale-dial="true" transform="rotate(${task.scale*80-65} ${kx} ${ky})">${path(`M${kx} ${ky} V${ky-kr+6}`,BLUE,2)}</g><circle cx="${kx}" cy="${ky}" r="2.5" fill="${BLUE}"/>`;
    const ox=m?310:634,oy=m?266:105,ow=m?91:144,oh=m?77:118;
    s+=`<rect x="${ox-4}" y="${oy-4}" width="${ow+8}" height="${oh+8}" rx="2" fill="var(--surface)" stroke="var(--fml-ink)"/>`;
    for(let r=0;r<5;r++)for(let c=0;c<6;c++)s+=`<rect data-combined-cell="${r*6+c}" x="${ox+c*ow/6+1}" y="${oy+r*oh/5+1}" width="${ow/6-2}" height="${oh/5-2}" fill="${BLUE}" opacity=".2"/>`;
    s+=t(m?'Task update':'Task-specific update',ox+ow/2,m?247:58,m?18:17,'motion-major','middle');
    const lx=m?35:339,ly=m?354:282;
    s+=`<rect x="${lx}" y="${ly-9}" width="11" height="9" rx="1" fill="none" stroke="${BLUE}" stroke-width="1.4"/>${path(`M${lx+2} ${ly-9} v-4 a3.5 3.5 0 0 1 7 0 v4`,BLUE,1.4)}${t('Fixed shared directions',lx+18,ly,m?17:15,'motion-accent')}`;
    if(!m)s+=t(state.reuseRefined?'Refined mixture':'Weighted mixture',706,259,14,'','middle');
    return s;
  }
  function reuseScene() { return ''; }
  function reuseMarkup() {
    return `<div class="fml-story__reuse-nav" role="group" aria-label="Choose a reuse mechanism"><button type="button" data-reuse-route="0" aria-pressed="true">Initialize a LoRA</button><button type="button" data-reuse-route="1" aria-pressed="false">Generate from a description</button></div><div class="fml-story__reuse-canvas"></div><div class="fml-story__reuse-tools"></div>`;
  }
  function renderReuse(force=false) {
    if(!state.dialog||state.chapter!==4)return;
    const route=state.reuseManualRoute===null?(state.time<63?0:1):state.reuseManualRoute;
    if(!force&&route===state.reuseShownRoute)return;
    state.reuseShownRoute=route;const d=state.dialog,m=state.mobile;
    const title=route?'Generate a task-specific update from a description':'Initialize and fine-tune a new LoRA';
    const description=route?'A task description enters an already trained coefficient generator. The generator predicts coefficients and a separate scale. Four illustrative coefficient bars weight four fixed shared direction tiles, combining them into the task-specific update shown on the right. Change the example task to change its weights and scale. Refine coefficients to illustrate adaptation on target-task examples: the weights and resulting update change while the basis stays fixed. This is a schematic demonstration with illustrative values, without live model inference.':'Useful directions from previous tasks are selected and allocated into the factors of a new LoRA. Target-task data is not needed at this initialization stage. Labelled task examples then train the ordinary LoRA factors, illustrated by their changing pattern. The new LoRA is free to move beyond the memory span. The pattern tiles and allocation shown are schematic.';
    d.querySelectorAll('[data-reuse-route]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.reuseRoute)===route)));
    d.querySelector('.fml-story__reuse-canvas').innerHTML=`<svg viewBox="0 0 ${m?420:820} ${m?380:320}" role="img" aria-labelledby="fml-reuse-title fml-reuse-desc" preserveAspectRatio="xMidYMid meet"><title id="fml-reuse-title">${title}</title><desc id="fml-reuse-desc">${description}</desc>${storyDefs}${route?generationReuseScene(m):initReuseScene(m)}</svg>`;
    d.querySelector('.fml-story__reuse-tools').innerHTML=route?`<div class="fml-story__reuse-actions"><button type="button" data-reuse-action="example" aria-label="Change illustrative task description; currently ${reuseTasks[state.reuseTask].name}">↻ Example: ${reuseTasks[state.reuseTask].name}</button><button type="button" data-reuse-action="refine" aria-pressed="${state.reuseRefined}">${state.reuseRefined?'Reset refinement':'Refine coefficients'}</button></div><p class="fml-story__reuse-caption">${state.reuseRefined?'Only the coefficient bars and their mixture changed. The shared directions stayed fixed.':'Task descriptions determine the coefficients within a shared basis.'}</p>`:`<p class="fml-story__reuse-caption">Memory directions initialize the LoRA factors without target inputs. Subsequent fine-tuning is not restricted to the memory span.</p>`;
    d.querySelector('.fml-story__footnote').textContent=route?'A generator predicts coefficients and scale. Adaptation updates coefficients within the frozen basis.':'Initialization uses past tasks. Fine-tuning uses target examples.';
  }
  function paintReuse() {
    renderReuse();const m=state.mobile,route=state.reuseShownRoute,svg=state.dialog.querySelector('.fml-story__reuse-canvas svg');
    const local=state.reuseManualRoute!==null||reducedMotion.matches?1:clamp((state.time-(route?63:56))/7,0,1);
    if(route===0){
      svg.querySelectorAll('[data-direction-selection]').forEach((n,k)=>n.setAttribute('opacity',String(.35+.65*ease(local*3-k*.2))));
      svg.querySelectorAll('[data-direction-transfer]').forEach((n,k)=>{
        const q=ease((local-.08-k*.055)/.48),i=[0,2,4][k],x0=(m?21:35)+i*(m?26:31),y0=m?65:99,x1=(m?264:347)+k*(m?11:15),y1=m?69:95;
        n.setAttribute('transform',`translate(${x0+(x1-x0)*q} ${y0+(y1-y0)*q-Math.sin(q*Math.PI)*(m?20:26)})`);n.setAttribute('opacity',String(Math.sin(q*Math.PI)*.9));
      });
      const change=ease((local-.48)/.52);
      svg.querySelectorAll('[data-tune-cell]').forEach(n=>n.setAttribute('opacity',String(clamp(Number(n.dataset.baseOpacity)+Math.sin(Number(n.dataset.tuneCell)*1.67)*.29*change,.1,.9))));
      const packet=svg.querySelector('[data-training-packet]'),p=ease((local-.42)/.58);
      const xy=m?[137+102*p,278]:p<.65?[590+125*p/.65,258]:[715,258-59*(p-.65)/.35];
      packet.setAttribute('x',String(xy[0]-4));packet.setAttribute('y',String(xy[1]-4));packet.setAttribute('opacity',String(Math.sin(p*Math.PI)*.9));
    }else{
      const weights=currentReuseWeights(),task=reuseTasks[state.reuseTask],growth=.35+.65*ease(local*2.2);
      svg.querySelectorAll('[data-coefficient-bar]').forEach(n=>{const v=weights[Number(n.dataset.coefficientBar)]*growth,base=Number(n.dataset.baseline),h=Math.abs(v)*Number(n.dataset.maxheight);n.setAttribute('y',String(v>=0?base-h:base));n.setAttribute('height',String(h));});
      svg.querySelectorAll('[data-combined-cell]').forEach(n=>{const j=Number(n.dataset.combinedCell),v=weights.reduce((sum,w,k)=>sum+w*reusePatterns[k][j],0)*task.scale; n.setAttribute('fill',v>=0?BLUE:'var(--muted)');n.setAttribute('opacity',String(.08+.82*clamp(Math.abs(v)/1.8,0,1)*(.55+.45*ease(local*2))));});
      svg.querySelectorAll('[data-generator-node]').forEach(n=>n.setAttribute('fill',Number(n.dataset.generatorNode)>=4&&Number(n.dataset.generatorNode)<8&&local>.12?'var(--fml-soft)':'var(--surface-2)'));
    }
  }
  const sceneGenerators=[experienceScene,scaleScene,functionScene,retainScene,reuseScene];

  function storyMarkup() {
    return `<div class="fml-story">
      <div class="fml-story__top"><div class="fml-story__brand">FML <span>Method overview · 70 seconds</span></div><button class="fml-story__close" type="button" aria-label="Close story">×</button></div>
      <div class="fml-story__head"><p class="fml-story__number"></p><h2 class="fml-story__title" id="fml-story-title"></h2><p class="fml-story__description" id="fml-story-description"></p></div>
      <div class="fml-story__diagram"></div><p class="fml-story__footnote"></p>
      <div class="fml-story__chapters" role="group" aria-label="Story chapters">${chapters.map((c,i)=>`<button class="fml-story__chapter" data-chapter="${i}" type="button"><strong>0${i+1}</strong>${c.short}</button>`).join('')}</div>
      <div class="fml-story__controls"><div class="fml-story__transport"><button type="button" class="fml-story__control" data-action="prev" aria-label="Previous chapter">${icons.prev}</button><button type="button" class="fml-story__control fml-story__control--play" data-action="play" aria-label="Pause story">${icons.pause}</button><button type="button" class="fml-story__control" data-action="next" aria-label="Next chapter">${icons.next}</button></div><label class="fml-story__sr" for="fml-story-progress">Story progress in seconds</label><input class="fml-story__seek" id="fml-story-progress" type="range" min="0" max="70" step="0.1" value="0" aria-label="Story progress in seconds"><div class="fml-story__time"><span data-elapsed>0:00</span> / 1:10<button class="fml-story__restart" type="button" data-action="restart">↺ Restart</button></div></div>
    </div>`;
  }
  function renderChapter(force=false) {
    if(!state.dialog)return;
    const i=Math.min(4,Math.floor(state.time/14)),m=state.dialog.clientWidth<650;
    if(!force&&i===state.chapter&&m===state.mobile)return;
    state.chapter=i;state.mobile=m;const c=chapters[i],d=state.dialog;
    d.querySelector('.fml-story__number').textContent=`Chapter 0${i+1} / 05 · ${c.short}`;
    d.querySelector('.fml-story__title').textContent=c.title;
    d.querySelector('.fml-story__description').textContent=c.description;
    d.querySelector('.fml-story__footnote').textContent=c.note;
    const diagram=d.querySelector('.fml-story__diagram');diagram.classList.toggle('fml-story__diagram--reuse',i===4);
    if(i===4){diagram.innerHTML=reuseMarkup();state.reuseShownRoute=-1;renderReuse(true);}
    else diagram.innerHTML=`<svg viewBox="0 0 ${m?420:820} ${m?290:320}" role="img" aria-label="${c.title}" preserveAspectRatio="xMidYMid meet">${storyDefs}${sceneGenerators[i](m)}</svg>`;
    d.querySelectorAll('[data-chapter]').forEach(b=>{ if(Number(b.dataset.chapter)===i)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current'); });
    d.querySelector('[data-action="prev"]').disabled=i===0;
    d.querySelector('[data-action="next"]').disabled=i===4;
  }
  function paintStory() {
    if(!state.dialog)return;
    renderChapter();const d=state.dialog,p=(state.time-state.chapter*14)/14;
    const seek=d.querySelector('.fml-story__seek');seek.value=String(state.time);seek.style.setProperty('--progress',`${state.time/70*100}%`);seek.setAttribute('aria-valuetext',`${Math.floor(state.time)} seconds of 70; ${chapters[state.chapter].short}`);
    d.querySelector('[data-elapsed]').textContent=state.time<60?fmt(state.time):'1:'+String(Math.floor(state.time-60)).padStart(2,'0');
    const svg=d.querySelector('.fml-story__diagram svg');
    if(state.chapter===0) svg.querySelectorAll('[data-story-adapter]').forEach((n,i)=>n.setAttribute('opacity',(.38+.62*ease(p*3-i*.25)).toFixed(2)));
    if(state.chapter===1){const ox=state.mobile?65:235,dx=state.mobile?112:139,dy=state.mobile?151:184,r=Math.sqrt(dx*dx+dy*dy);svg.querySelector('[data-scale-vector]').setAttribute('x2',String(ox+dx+(r-dx)*ease((p-.15)*2.1)));}
    if(state.chapter===2){const active=p<.33?2:p<.68?4:0;svg.querySelectorAll('[data-signature-outline]').forEach(n=>n.setAttribute('opacity',Number(n.dataset.signatureOutline)===active?'1':'0'));svg.querySelectorAll('[data-rank-step]').forEach(n=>n.setAttribute('opacity',p>Number(n.dataset.rankStep)*.32?'1':'0'));svg.querySelectorAll('[data-signature]').forEach(n=>n.setAttribute('opacity',(Number(n.dataset.signature)===1||Number(n.dataset.signature)===3)&&p>.65?'.35':'1'));}
    if(state.chapter===3)svg.querySelectorAll('[data-new-zero]').forEach(n=>n.setAttribute('opacity',String(.18+.82*ease(p*2.2))));
    if(state.chapter===4)paintReuse();
  }
  function updatePlaying() {
    const b=state.dialog?.querySelector('[data-action="play"]');if(!b)return;
    b.innerHTML=state.playing?icons.pause:icons.play;b.setAttribute('aria-label',state.playing?'Pause story':state.time>=70?'Replay story':'Play story');b.setAttribute('aria-pressed',String(state.playing));
  }
  function seekTo(seconds) { state.reuseManualRoute=null;state.time=clamp(seconds,0,70);if(state.time===70)state.playing=false;renderChapter();paintStory();updatePlaying(); }
  function closeStory() {
    if(!state.storyOpen)return;
    state.storyOpen=false;state.playing=false;
    if(state.dialog.open)state.dialog.close();
    document.body.style.overflow=state.previousOverflow;
    updatePlaying();state.previousFocus?.focus?.({preventScroll:true});
  }
  function openStory() {
    if(!state.dialog||state.storyOpen)return;
    state.previousFocus=document.activeElement;state.previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    state.storyOpen=true;state.playing=!reducedMotion.matches;state.time=0;state.chapter=-1;state.reuseManualRoute=null;state.reuseTask=0;state.reuseRefined=false;state.dialog.showModal();renderChapter(true);paintStory();updatePlaying();
    state.dialog.querySelector('.fml-story__close').focus({preventScroll:true});
  }
  function loop(now) {
    const dt=state.lastFrame?Math.min(.15,(now-state.lastFrame)/1000):0;state.lastFrame=now;
    if(!document.hidden){
      if(state.heroPlaying&&state.heroVisible&&!state.storyOpen)state.heroTime+=dt;
      if(state.storyOpen&&state.playing){state.time=Math.min(70,state.time+dt);if(state.time>=70){state.playing=false;updatePlaying();}}
      if(now-state.lastPaint>32){if(state.heroVisible&&!state.storyOpen&&state.heroPlaying)paintHero();if(state.storyOpen)paintStory();state.lastPaint=now;}
    }
    state.frame=requestAnimationFrame(loop);
  }
  function init({hero,story}) {
    if(state.frame)cancelAnimationFrame(state.frame);
    state.hero=hero;state.dialog=story;
    if(hero){
      hero.classList.add('memory-scene');
      const renderHero=()=>{state.heroMobile=hero.clientWidth<500;hero.innerHTML=heroMarkup();hero.querySelector('.memory-scene__pause').addEventListener('click',()=>setHeroPlaying(!state.heroPlaying));paintHero();};
      renderHero();
      if('ResizeObserver'in window)new ResizeObserver(()=>{if((hero.clientWidth<500)!==state.heroMobile)renderHero();}).observe(hero);
      if('IntersectionObserver'in window){const obs=new IntersectionObserver(entries=>{state.heroVisible=entries[0].isIntersecting;},{rootMargin:'120px'});obs.observe(hero);}
    }
    if(story){
      story.innerHTML=storyMarkup();story.setAttribute('aria-labelledby','fml-story-title');story.setAttribute('aria-describedby','fml-story-description');
      story.querySelector('.fml-story__close').addEventListener('click',closeStory);
      story.addEventListener('cancel',e=>{e.preventDefault();closeStory();});story.addEventListener('close',()=>{if(state.storyOpen)closeStory();});
      story.addEventListener('click',e=>{if(e.target===story){const r=story.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeStory();}});
      story.querySelectorAll('[data-chapter]').forEach(b=>b.addEventListener('click',()=>seekTo(Number(b.dataset.chapter)*14)));
      story.querySelector('[data-action="prev"]').addEventListener('click',()=>seekTo(Math.max(0,state.chapter-1)*14));
      story.querySelector('[data-action="next"]').addEventListener('click',()=>seekTo(Math.min(4,state.chapter+1)*14));
      story.querySelector('[data-action="play"]').addEventListener('click',()=>{if(state.time>=70)seekTo(0);state.reuseManualRoute=null;state.playing=!state.playing;updatePlaying();});
      story.querySelector('[data-action="restart"]').addEventListener('click',()=>{seekTo(0);state.playing=true;updatePlaying();});
      story.addEventListener('click',e=>{
        const route=e.target.closest('[data-reuse-route]'),action=e.target.closest('[data-reuse-action]');
        if(!route&&!action)return;
        state.playing=false;state.reuseManualRoute=route?Number(route.dataset.reuseRoute):1;
        if(route)state.time=state.reuseManualRoute===0?56:63;
        if(action?.dataset.reuseAction==='example'){state.reuseTask=(state.reuseTask+1)%reuseTasks.length;state.reuseRefined=false;}
        if(action?.dataset.reuseAction==='refine')state.reuseRefined=!state.reuseRefined;
        renderReuse(true);paintStory();updatePlaying();
        if(action)story.querySelector(`[data-reuse-action="${action.dataset.reuseAction}"]`)?.focus({preventScroll:true});
      });
      story.querySelector('.fml-story__seek').addEventListener('input',e=>seekTo(Number(e.target.value)));
      story.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target===story){e.preventDefault();state.playing=!state.playing;updatePlaying();}if(e.key==='ArrowRight'&&e.target.tagName!=='INPUT'){e.preventDefault();seekTo(state.time+5);}if(e.key==='ArrowLeft'&&e.target.tagName!=='INPUT'){e.preventDefault();seekTo(state.time-5);}});
      if('ResizeObserver'in window)new ResizeObserver(()=>{if(state.storyOpen)renderChapter();}).observe(story);
    }
    reducedMotion.addEventListener('change',e=>{if(e.matches){setHeroPlaying(false);state.playing=false;updatePlaying();}});
    state.lastFrame=0;state.frame=requestAnimationFrame(loop);
  }
  window.FMLMotion={init,openStory,closeStory,seek:seekTo,getState:()=>({heroPlaying:state.heroPlaying,storyOpen:state.storyOpen,playing:state.playing,time:state.time,chapter:state.chapter,reuseRoute:state.reuseShownRoute,reuseTask:reuseTasks[state.reuseTask].name,reuseRefined:state.reuseRefined})};
})();
