/**
 * app.js
 * EO Visual Complexity Experiment
 * ─────────────────────────────────────────
 * Entry point: boot() is called on DOMContentLoaded.
 * Config is loaded from config.json (repo root).
 *
 * Module overview:
 *   boot()            – loads config.json, shows start screen
 *   startExperiment() – initialises mouse events, loads first level
 *   loadLevel(i)      – fetches image + GeoJSON, runs ready overlay
 *   buildZones()      – converts GeoJSON → fraction coords (Mercator)
 *   handleStageDrop() – hit-tests drop point against zone polygons
 *   handleTrashDrop() – validates absent / absent_optional logic
 *   toggleDebug()     – D-key debug overlay with per-class checkboxes
 */

// ── Constants ───────────────────────────────────────────────
const LOUPE_D    = 250;
const LOUPE_ZOOM = 3;
const HIT_TOLERANCE = 0.008;

// Distinct colours per klasse (index maps to sorted klasse list)
const DEBUG_COLOURS = [
  {fill:'rgba(255,77,109,0.45)',  stroke:'#ff4d6d'},
  {fill:'rgba(0,212,255,0.45)',   stroke:'#00d4ff'},
  {fill:'rgba(0,255,157,0.45)',   stroke:'#00ff9d'},
  {fill:'rgba(255,200,0,0.45)',   stroke:'#ffc800'},
  {fill:'rgba(200,100,255,0.45)', stroke:'#c864ff'},
  {fill:'rgba(255,140,0,0.45)',   stroke:'#ff8c00'},
  {fill:'rgba(80,220,255,0.45)',  stroke:'#50dcff'},
  {fill:'rgba(255,80,200,0.45)',  stroke:'#ff50c8'},
];

// ── State ───────────────────────────────────────────────────
let CONFIG = null;
let zones = [], zoneFilled = {}, trashFilled = {};
let currentErrors = 0, levelStartTime = null, timerInterval = null;
let currentLevel = 0, results = [];
let draggingId = null, feedbackTimer = null;

// Debug state
let debugMode   = false;
let debugActive = {};   // klasse → boolean (checkbox state)
let klasseColour = {};  // klasse → {fill, stroke}

// DOM refs
let elStage, elSatImg, elLoupe, elLoupeCanvas, elLoupeCtx,
    elPin, elFloatChip, elTrash, elDebugCanvas, elDebugCtx;

// ── Boot ────────────────────────────────────────────────────
async function boot(){
  elStage       = document.getElementById('stage');
  elSatImg      = document.getElementById('sat-img');
  elLoupe       = document.getElementById('loupe');
  elLoupeCanvas = document.getElementById('loupe-canvas');
  elLoupeCtx    = elLoupeCanvas.getContext('2d');
  elPin         = document.getElementById('pin');
  elFloatChip   = document.getElementById('float-chip');
  elTrash       = document.getElementById('trash');
  elDebugCanvas = document.getElementById('debug-canvas');
  elDebugCtx    = elDebugCanvas.getContext('2d');

  try{
    const res = await fetch('./data/config.json');
    if(!res.ok) throw new Error('HTTP '+res.status);
    CONFIG = await res.json();
  }catch(e){
    document.getElementById('loading-text').textContent =
      '⚠ config.json nicht gefunden!';
    console.error(e); return;
  }

  document.getElementById('loading').remove();
  const ss = document.getElementById('start-screen');
  ss.style.display = 'flex';
  document.getElementById('level-count-text').textContent =
    CONFIG.levels.length + ' Level';
}

// ── Start ───────────────────────────────────────────────────
function startExperiment(){
  const ss = document.getElementById('start-screen');
  ss.classList.add('hidden');
  setTimeout(()=> ss.remove(), 400);
  setupMouseEvents();
  loadLevel(0);
}

// ── Load level ──────────────────────────────────────────────
async function loadLevel(i){
  currentLevel=i; currentErrors=0;
  zones=[]; zoneFilled={}; trashFilled={}; draggingId=null;
  stopTimer();
  document.getElementById('stat-err-val').textContent='0';
  document.getElementById('stat-time').textContent='0.00';
  document.getElementById('btn-next').style.display='none';
  document.getElementById('trash-count').textContent='';
  elLoupe.style.display=elPin.style.display=elFloatChip.style.display='none';
  elStage.querySelectorAll('.zone-ok').forEach(el=>el.remove());

  const lv=CONFIG.levels[i], tot=CONFIG.levels.length;
  const pct=Math.round((i/tot)*100);
  document.getElementById('progress-fill').style.width=pct+'%';
  document.getElementById('prog-text').textContent=`LEVEL ${i+1} / ${tot}`;
  document.getElementById('prog-pct').textContent=pct+' %';

  await new Promise(resolve=>{
    elSatImg.onload=elSatImg.onerror=resolve;
    elSatImg.src=lv.imgSrc;
  });

  let geojson;
  try{
    const res=await fetch(lv.geojsonSrc);
    if(!res.ok) throw new Error('HTTP '+res.status);
    geojson=await res.json();
  }catch(e){
    showFeedback('⚠ GeoJSON nicht geladen: '+lv.geojsonSrc,'err');
    console.error(e); return;
  }

  buildZones(geojson, lv.bounds);
  buildDebugPanel();
  if(debugMode) redrawDebug();

  renderLabels(lv);

  // Show "Bereit" overlay – timer starts only after countdown
  showReadyOverlay(lv);
}

// ── Build zones ─────────────────────────────────────────────
function toMercator(lon, lat){
  const R=6378137, x=lon*Math.PI/180*R;
  const sinL=Math.sin(lat*Math.PI/180);
  const y=R*Math.log((1+sinL)/(1-sinL))/2;
  return [x,y];
}

function buildZones(geojson, bounds){
  const [mxW,myS]=toMercator(bounds[0][1],bounds[0][0]);
  const [mxE,myN]=toMercator(bounds[1][1],bounds[1][0]);
  const mxSpan=mxE-mxW, mySpan=myN-myS;

  function geoToFrac(lon,lat){
    const [mx,my]=toMercator(lon,lat);
    return [(mx-mxW)/mxSpan, (myN-my)/mySpan];
  }
  function extractRings(geom){
    if(geom.type==='Polygon') return [geom.coordinates[0]];
    if(geom.type==='MultiPolygon') return geom.coordinates.map(p=>p[0]);
    return [];
  }

  zones=[];
  geojson.features.forEach(feat=>{
    const klasse=feat.properties&&feat.properties.klasse;
    if(!klasse) return;
    extractRings(feat.geometry).forEach(ring=>{
      zones.push({klasse, fracRing:ring.map(([lon,lat])=>geoToFrac(lon,lat))});
    });
  });

  // Assign stable colours to ALL config labels (not just those in this GeoJSON)
  // so colours are consistent across levels.
  klasseColour={};
  CONFIG.labels.forEach((l,i)=>{ klasseColour[l.id]=DEBUG_COLOURS[i%DEBUG_COLOURS.length]; });
}

// ── Debug panel ─────────────────────────────────────────────
function buildDebugPanel(){
  // Always show ALL labels from config, not just those present in current GeoJSON.
  // Labels not present in this level's GeoJSON are shown greyed out.
  const allLabels = CONFIG.labels.map(l => l.id);
  const presentKlassen = new Set(zones.map(z => z.klasse));

  // Preserve existing checkbox states; default new ones to true
  const prev={...debugActive};
  debugActive={};
  allLabels.forEach(k=>{ debugActive[k]= k in prev ? prev[k] : true; });

  const container=document.getElementById('debug-checks');
  container.innerHTML='';

  const lv       = CONFIG.levels[currentLevel];
  const areas     = lv.areas || {};
  const absentOpt = lv.absent_optional || [];

  allLabels.forEach(k=>{
    const col     = klasseColour[k] || {stroke:'#4a6080', fill:'rgba(74,96,128,0.35)'};
    const present = presentKlassen.has(k);
    const ratio   = areas[k];  // 0–1 or undefined
    const isOpt   = absentOpt.includes(k);
    const isTruly = lv.absent.includes(k);

    const row = document.createElement('label');
    row.className = 'debug-check-row';
    if(!present) row.style.opacity = '0.38';

    const cb = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = debugActive[k];
    cb.disabled = !present;
    cb.addEventListener('change', ()=>{
      debugActive[k] = cb.checked;
      if(debugMode) redrawDebug();
    });

    const swatch = document.createElement('div');
    swatch.className    = 'debug-swatch';
    swatch.style.background = col.stroke;

    // Label: name + area% + status badge
    const lbl = document.createElement('span');
    lbl.className = 'debug-check-label';
    lbl.style.display    = 'flex';
    lbl.style.justifyContent = 'space-between';
    lbl.style.gap        = '6px';
    lbl.style.width      = '100%';

    const name = document.createElement('span');
    name.textContent = k;

    const right = document.createElement('span');
    right.style.fontFamily = 'inherit';
    right.style.fontSize   = '9px';
    right.style.letterSpacing = '0';

    if(isTruly){
      right.textContent  = '—';
      right.style.color  = '#4a6080';
    } else if(ratio !== undefined){
      const pct = (ratio * 100).toFixed(1) + ' %';
      if(isOpt){
        // Below threshold: show % in warn colour + asterisk
        right.textContent = pct + ' *';
        right.style.color = 'var(--warn)';
        right.title       = 'Unter Schwellenwert → absent_optional';
      } else {
        right.textContent = pct;
        right.style.color = '#4a6080';
      }
    } else {
      right.textContent = '—';
      right.style.color = '#4a6080';
    }

    lbl.appendChild(name);
    lbl.appendChild(right);

    row.appendChild(cb);
    row.appendChild(swatch);
    row.appendChild(lbl);
    container.appendChild(row);
  });

  debugUpdateNav();
}

function debugSelectAll(val){
  Object.keys(debugActive).forEach(k=>{ debugActive[k]=val; });
  document.querySelectorAll('#debug-checks input[type=checkbox]')
    .forEach(cb=>{ if(!cb.disabled) cb.checked=val; });
  if(debugMode) redrawDebug();
}

function debugUpdateNav(){
  const tot=CONFIG?CONFIG.levels.length:0;
  const el=document.getElementById('debug-level-info');
  if(el) el.textContent=`LEVEL ${currentLevel+1} / ${tot}`;
  const prev=document.getElementById('debug-btn-prev');
  const next=document.getElementById('debug-btn-next');
  if(prev) prev.style.opacity=currentLevel===0?'0.3':'1';
  if(next) next.style.opacity=currentLevel===tot-1?'0.3':'1';
}

function debugPrevLevel(){
  if(currentLevel>0) loadLevel(currentLevel-1);
}
function debugNextLevel(){
  if(CONFIG&&currentLevel<CONFIG.levels.length-1) loadLevel(currentLevel+1);
}

// ── Debug draw ───────────────────────────────────────────────
function redrawDebug(){
  const w=elStage.offsetWidth, h=elStage.offsetHeight;
  elDebugCanvas.width=w; elDebugCanvas.height=h;
  elDebugCanvas.style.width='100%'; elDebugCanvas.style.height='100%';
  elDebugCtx.clearRect(0,0,w,h);

  zones.forEach(zone=>{
    if(!debugActive[zone.klasse]) return;
    const col=klasseColour[zone.klasse];
    const ring=zone.fracRing;
    if(!ring||ring.length<2) return;

    elDebugCtx.beginPath();
    elDebugCtx.moveTo(ring[0][0]*w, ring[0][1]*h);
    for(let i=1;i<ring.length;i++) elDebugCtx.lineTo(ring[i][0]*w, ring[i][1]*h);
    elDebugCtx.closePath();
    elDebugCtx.fillStyle=col.fill;
    elDebugCtx.strokeStyle=col.stroke;
    elDebugCtx.lineWidth=2;
    elDebugCtx.fill();
    elDebugCtx.stroke();

    // Centroid label
    const cx=ring.reduce((s,p)=>s+p[0],0)/ring.length*w;
    const cy=ring.reduce((s,p)=>s+p[1],0)/ring.length*h;
    elDebugCtx.font='bold 11px "Segoe UI",system-ui,sans-serif';
    elDebugCtx.textAlign='center';
    elDebugCtx.textBaseline='middle';
    elDebugCtx.strokeStyle='rgba(0,0,0,0.85)';
    elDebugCtx.lineWidth=3;
    elDebugCtx.strokeText(zone.klasse,cx,cy);
    elDebugCtx.fillStyle='#fff';
    elDebugCtx.fillText(zone.klasse,cx,cy);
  });
}

function toggleDebug(){
  debugMode=!debugMode;
  document.getElementById('debug-panel').style.display=debugMode?'block':'none';
  elDebugCanvas.style.display=debugMode?'block':'none';
  if(debugMode) redrawDebug();
}

document.addEventListener('keydown',e=>{
  if(e.key==='d'||e.key==='D') toggleDebug();
});

// ── Render labels ───────────────────────────────────────────
function renderLabels(lv){
  const bar=document.getElementById('label-bar');
  bar.innerHTML='<span id="label-bar-title">LABELS ZIEHEN ›</span>';
  CONFIG.labels.forEach(lb=>{
    const chip=document.createElement('div');
    chip.className='label-chip'; chip.id='chip-'+lb.id;
    chip.dataset.id=lb.id; chip.textContent=lb.icon+' '+lb.text;
    chip.addEventListener('mousedown',e=>{
      if(chip.classList.contains('used')) return;
      e.preventDefault();
      beginDrag(lb.id, lb.icon+' '+lb.text, chip, e);
    });
    bar.appendChild(chip);
  });
}

// ── Drag ────────────────────────────────────────────────────
function beginDrag(id,label,chipEl,e){
  draggingId=id; chipEl.classList.add('lifting');
  elFloatChip.textContent=label; elFloatChip.style.display='block';
  positionFloatChip(e.clientX,e.clientY);
}
function endDrag(){
  if(draggingId){ const c=document.getElementById('chip-'+draggingId); if(c) c.classList.remove('lifting'); }
  draggingId=null; elFloatChip.style.display='none'; elPin.style.display='none';
}
function positionFloatChip(cx,cy){
  elFloatChip.style.left=cx+'px'; elFloatChip.style.top=cy+'px';
}


// Returns the bounding rect of the satellite image (4:3 box),
// which may be smaller than the stage if the stage has a different ratio.
function getImageRect(){
  return elSatImg.getBoundingClientRect();
}

// ── Mouse events ─────────────────────────────────────────────
function setupMouseEvents(){
  document.addEventListener('mousemove',e=>{
    if(draggingId) positionFloatChip(e.clientX,e.clientY);
    const rect=getImageRect();
    const inStage=e.clientX>=rect.left&&e.clientX<=rect.right
               &&e.clientY>=rect.top&&e.clientY<=rect.bottom;
    if(inStage){
      const lx=e.clientX-rect.left, ly=e.clientY-rect.top;
      // Offset of image rect within stage (for positioning loupe/pin)
      const stageRect=elStage.getBoundingClientRect();
      const imgOffX=rect.left-stageRect.left;
      const imgOffY=rect.top-stageRect.top;
      const slx=lx+imgOffX, sly=ly+imgOffY;  // stage-relative coords

      updateLoupe(lx,ly,rect.width,rect.height);

      const LOUPE_R = LOUPE_D / 2;
      const OFFSET  = 30;
      if(draggingId){
        const stageW2=stageRect.width, stageH2=stageRect.height;
        let ox = slx - LOUPE_R - OFFSET;
        let oy = sly - LOUPE_R - OFFSET;
        if(ox - LOUPE_R < 0) ox = slx + LOUPE_R + OFFSET;
        if(oy - LOUPE_R < 0) oy = sly + LOUPE_R + OFFSET;
        ox = Math.max(LOUPE_R, Math.min(stageW2 - LOUPE_R, ox));
        oy = Math.max(LOUPE_R, Math.min(stageH2 - LOUPE_R, oy));
        elLoupe.style.left = ox + 'px';
        elLoupe.style.top  = oy + 'px';
      } else {
        elLoupe.style.left = slx + 'px';
        elLoupe.style.top  = sly + 'px';
      }
      elLoupe.style.display='block';
      if(draggingId){
        elPin.style.left=slx+'px'; elPin.style.top=sly+'px';
        elPin.style.display='block';
      } else { elPin.style.display='none'; }
    } else {
      elLoupe.style.display='none'; elPin.style.display='none';
    }
    if(draggingId){
      const tr=elTrash.getBoundingClientRect();
      elTrash.classList.toggle('drag-over',
        e.clientX>=tr.left&&e.clientX<=tr.right&&e.clientY>=tr.top&&e.clientY<=tr.bottom);
    }
  });

  document.addEventListener('mouseup',e=>{
    if(!draggingId){ endDrag(); return; }
    const rect=getImageRect();
    const tipX=e.clientX, tipY=e.clientY;
    const inStage=tipX>=rect.left&&tipX<=rect.right&&tipY>=rect.top&&tipY<=rect.bottom;
    if(inStage){
      const fx=(tipX-rect.left)/rect.width, fy=(tipY-rect.top)/rect.height;
      handleStageDrop(fx,fy,tipX-rect.left,tipY-rect.top);
    } else {
      const tr=elTrash.getBoundingClientRect();
      if(tipX>=tr.left&&tipX<=tr.right&&tipY>=tr.top&&tipY<=tr.bottom) handleTrashDrop();
    }
    elTrash.classList.remove('drag-over');
    endDrag();
  });

  elStage.addEventListener('mouseleave',()=>{
    elLoupe.style.display='none'; elPin.style.display='none';
  });
}

// ── Loupe ───────────────────────────────────────────────────
// Current loupe centre in stage fractions (needed for debug overlay in loupe)
let _loupeFx=0, _loupeFy=0;

function updateLoupe(lx,ly,stageW,stageH){
  if(!elSatImg.naturalWidth) return;
  _loupeFx=lx/stageW; _loupeFy=ly/stageH;

  const scaleX=elSatImg.naturalWidth/stageW, scaleY=elSatImg.naturalHeight/stageH;
  const srcW=(LOUPE_D/LOUPE_ZOOM)*scaleX, srcH=(LOUPE_D/LOUPE_ZOOM)*scaleY;

  // Draw satellite image
  elLoupeCtx.clearRect(0,0,LOUPE_D,LOUPE_D);
  elLoupeCtx.drawImage(elSatImg, lx*scaleX-srcW/2, ly*scaleY-srcH/2, srcW, srcH, 0,0,LOUPE_D,LOUPE_D);

  // Overlay debug zones inside loupe if debug mode is on
  if(debugMode) drawDebugInLoupe(lx/stageW, ly/stageH, stageW, stageH);
}

// Draw the visible debug zones clipped to the loupe, at loupe zoom level.
// We project each fracRing point into loupe-canvas pixel space.
function drawDebugInLoupe(cfx, cfy, stageW, stageH){
  // The loupe shows a (LOUPE_D/LOUPE_ZOOM) × (LOUPE_D/LOUPE_ZOOM) px window
  // centred on (cfx,cfy) in stage-fraction space.
  const halfW = (LOUPE_D/LOUPE_ZOOM) / stageW / 2;   // half-window in frac X
  const halfH = (LOUPE_D/LOUPE_ZOOM) / stageH / 2;   // half-window in frac Y

  // Convert a stage-fraction point to loupe-canvas pixel
  function fracToLoupePx(fx, fy){
    return [
      ((fx - cfx) / halfW / 2 + 0.5) * LOUPE_D,
      ((fy - cfy) / halfH / 2 + 0.5) * LOUPE_D,
    ];
  }

  zones.forEach(zone=>{
    if(!debugActive[zone.klasse]) return;
    const col = klasseColour[zone.klasse] || {stroke:'#4a6080',fill:'rgba(74,96,128,0.35)'};
    const ring = zone.fracRing;
    if(!ring||ring.length<2) return;

    elLoupeCtx.beginPath();
    const [x0,y0]=fracToLoupePx(ring[0][0],ring[0][1]);
    elLoupeCtx.moveTo(x0,y0);
    for(let i=1;i<ring.length;i++){
      const [xi,yi]=fracToLoupePx(ring[i][0],ring[i][1]);
      elLoupeCtx.lineTo(xi,yi);
    }
    elLoupeCtx.closePath();
    elLoupeCtx.fillStyle=col.fill;
    elLoupeCtx.strokeStyle=col.stroke;
    elLoupeCtx.lineWidth=1.5;
    elLoupeCtx.fill();
    elLoupeCtx.stroke();
  });
}

// ── Hit test ─────────────────────────────────────────────────
function pointInRing(fx,fy,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    if(((yi>fy)!==(yj>fy))&&(fx<(xj-xi)*(fy-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}
function pointHitsZone(fx,fy,ring){
  const t=HIT_TOLERANCE;
  return [[fx,fy],[fx+t,fy],[fx-t,fy],[fx,fy+t],[fx,fy-t],
          [fx+t,fy+t],[fx-t,fy-t],[fx+t,fy-t],[fx-t,fy+t]]
    .some(([sx,sy])=>pointInRing(sx,sy,ring));
}

// ── Drop on stage ────────────────────────────────────────────
function handleStageDrop(fx,fy,localX,localY){
  const hitKlassen=new Set();
  for(const zone of zones){
    if(zoneFilled[zone.klasse]) continue;
    if(pointHitsZone(fx,fy,zone.fracRing)) hitKlassen.add(zone.klasse);
  }
  if(hitKlassen.size===0){
    currentErrors++;
    document.getElementById('stat-err-val').textContent=currentErrors;
    showFeedback('✗ Kein Bereich getroffen – erneut versuchen','err');
    return;
  }
  if(hitKlassen.has(draggingId)){
    const lv2 = CONFIG.levels[currentLevel];
    const absentOpt = lv2.absent_optional || [];
    const isOptional = absentOpt.includes(draggingId);

    // Mark as zone-filled (so level-complete check works)
    zoneFilled[draggingId] = true;
    // Also mark trash as filled so it doesn't block completion
    if(isOptional) trashFilled[draggingId] = true;

    const lbl = CONFIG.labels.find(l => l.id === draggingId);
    const txt  = '✓ ' + (lbl ? lbl.icon + ' ' + lbl.text : draggingId);
    const ok   = document.createElement('div');
    ok.className = 'zone-ok'; ok.textContent = txt;
    ok.style.left = localX + 'px'; ok.style.top = localY + 'px';
    elStage.appendChild(ok);
    markChipUsed(draggingId);
    showFeedback('✓ Korrekt', 'ok');
    if(debugMode) redrawDebug();
    checkLevelComplete();
  } else {
    currentErrors++;
    document.getElementById('stat-err-val').textContent = currentErrors;
    showFeedback('✗ Falsches Label für diesen Bereich', 'err');
  }
}

// ── Trash drop ───────────────────────────────────────────────
function handleTrashDrop(){
  const lv = CONFIG.levels[currentLevel];
  const absentOpt = lv.absent_optional || [];
  // Accept: truly absent OR too small (absent_optional)
  if(lv.absent.includes(draggingId) || absentOpt.includes(draggingId)){
    trashFilled[draggingId] = true;
    markChipUsed(draggingId);
    const totalTrash = lv.absent.length + absentOpt.length;
    const done = Object.keys(trashFilled).length;
    document.getElementById('trash-count').textContent = done + ' / ' + totalTrash;
    showFeedback('✓ Korrekt entfernt', 'ok');
    checkLevelComplete();
  } else {
    currentErrors++;
    document.getElementById('stat-err-val').textContent = currentErrors;
    showFeedback('✗ Element ist sichtbar – auf die Karte ziehen', 'err');
  }
}

// ── Level complete ───────────────────────────────────────────
function checkLevelComplete(){
  const lv = CONFIG.levels[currentLevel];
  const absentOpt = lv.absent_optional || [];

  // Zones that must be placed on the map:
  // all klassen that are present (not in absent, not in absent_optional)
  const mustPlace = [...new Set(zones.map(z => z.klasse))]
    .filter(k => !absentOpt.includes(k));

  // Items that must be trashed: truly absent + absent_optional
  // (absent_optional can also be resolved via map, handled in handleStageDrop)
  const mustTrash = [
    ...lv.absent,
    ...absentOpt.filter(k => !zoneFilled[k]), // only if not already placed on map
  ];

  const zonesOk = mustPlace.every(k => zoneFilled[k]);
  const trashOk = lv.absent.every(a => trashFilled[a])
               && absentOpt.every(a => trashFilled[a] || zoneFilled[a]);

  if(zonesOk && trashOk){
    stopTimer();
    results.push({image:lv.id, time:Date.now()-levelStartTime, errors:currentErrors});
    document.getElementById('btn-next').style.display='block';
  }
}
function nextLevel(){
  if(currentLevel+1<CONFIG.levels.length) loadLevel(currentLevel+1);
  else showResults();
}

// ── Ready / Countdown ───────────────────────────────────────
function showReadyOverlay(lv){
  // Hide image and labels until countdown ends
  elSatImg.style.visibility    = 'hidden';
  document.getElementById('label-bar').style.visibility = 'hidden';
  elTrash.style.visibility     = 'hidden';

  const overlay = document.getElementById('ready-overlay');
  document.getElementById('ready-level-tag').textContent =
    `LEVEL ${currentLevel + 1} / ${CONFIG.levels.length}  —  ${lv.id}`;

  // Reset to "Bereit" state (hide countdown, show button)
  document.getElementById('ready-btn-wrap').style.display  = 'flex';
  document.getElementById('countdown-wrap').style.display  = 'none';
  document.getElementById('countdown-num').textContent     = '3';

  overlay.classList.add('active');
}

function onReadyClick(){
  // Switch to countdown
  document.getElementById('ready-btn-wrap').style.display = 'none';
  document.getElementById('countdown-wrap').style.display = 'flex';
  runCountdown(3);
}

function runCountdown(n){
  const numEl = document.getElementById('countdown-num');
  numEl.textContent = n;

  if(n === 0){
    // Countdown done – reveal image and start
    const overlay = document.getElementById('ready-overlay');
    overlay.classList.remove('active');
    elSatImg.style.visibility    = 'visible';
    document.getElementById('label-bar').style.visibility = 'visible';
    elTrash.style.visibility     = 'visible';
    startTimer();
    return;
  }
  setTimeout(() => runCountdown(n - 1), 1000);
}

// ── Timer ────────────────────────────────────────────────────
function startTimer(){
  stopTimer(); levelStartTime=Date.now();
  timerInterval=setInterval(()=>{
    document.getElementById('stat-time').textContent=
      ((Date.now()-levelStartTime)/1000).toFixed(2);
  },50);
}
function stopTimer(){ clearInterval(timerInterval); }

// ── Helpers ──────────────────────────────────────────────────
function markChipUsed(id){
  const c=document.getElementById('chip-'+id);
  if(c){ c.classList.remove('lifting'); c.classList.add('used'); }
}
function showFeedback(msg,type){
  const f=document.getElementById('feedback');
  f.textContent=msg; f.className='show '+type;
  clearTimeout(feedbackTimer); feedbackTimer=setTimeout(()=>f.className='',1500);
}

// ── Results ──────────────────────────────────────────────────
function showResults(){
  stopTimer();
  const body=document.getElementById('results-body'); body.innerHTML='';
  let tm=0,te=0;
  results.forEach(r=>{
    tm+=r.time; te+=r.errors;
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r.image}</td><td>${r.time}</td><td>${(r.time/1000).toFixed(2)}</td><td>${r.errors}</td>`;
    body.appendChild(tr);
  });
  const s=document.createElement('tr');
  s.innerHTML=`<td>GESAMT</td><td>${tm}</td><td>${(tm/1000).toFixed(2)}</td><td>${te}</td>`;
  body.appendChild(s);
  document.getElementById('results-screen').classList.add('active');
}
function exportCSV(){
  download('eo_results.csv',
    ['image,time_ms,time_s,errors',...results.map(r=>
      `${r.image},${r.time},${(r.time/1000).toFixed(3)},${r.errors}`)].join('\n'),'text/csv');
}
function exportJSON(){ download('eo_results.json',JSON.stringify(results,null,2),'application/json'); }
function download(name,content,type){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([content],{type}));
  a.download=name; a.click();
}

document.addEventListener('DOMContentLoaded', boot);