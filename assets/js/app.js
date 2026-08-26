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
let levelOrder = [], orderPos = 0;
let draggingId = null, feedbackTimer = null;

// Telemetrie pro Level (siehe telemetry.js für die Übertragung ans Backend).
// null solange kein "echtes" Level läuft (Übungsrunde nutzt loadLevelSilent()
// statt loadLevel() und initialisiert dies bewusst nicht – siehe
// resetLevelTelemetry()/handleStageDrop()).
let levelTelemetry = null;
let _lastMouseX = null, _lastMouseY = null;

function resetLevelTelemetry(){
  const attempts = {};
  CONFIG.labels.forEach(l => { attempts[l.id] = {count:0, misKarte:0, misPapierkorb:0, doneTime:null}; });
  levelTelemetry = {
    attempts,
    dropLog: [],
    assignmentOrder: [],
    tabSwitches: 0,
    mouseDistance: 0,
    debugTriggered: false,
    hintUsed: false,
  };
  _lastMouseX = null; _lastMouseY = null;
}

document.addEventListener('visibilitychange', () => {
  if(document.hidden && levelTelemetry) levelTelemetry.tabSwitches++;
});

// Debug state
let debugMode   = false;
let debugActive = {};   // klasse → boolean (checkbox state)
let klasseColour = {};  // klasse → {fill, stroke}

// Hint-Overlay-Ebenenumschaltung ("Ich komme nicht weiter" – siehe showHint()):
// nutzt dieselbe debugActive-Klassenauswahl wie der Debug-Modus, zeigt aber
// nur die Checkboxen (kein QA-Bedienfeld) und ist eigenstaendig vom D-Modus.
let hintActive = false;

// Familiarity-Check + Post-Abfrage + Feedback am Spielende (siehe finishExperiment())
let familiarityStatus = null;     // 'ja' | 'nein' | null
let familiarityMarks = {};        // level id → {name}
let familiarityEditingLevel = null;
const POST_SURVEY_LIKERT_QUESTIONS = ['konzentration', 'ablenkung', 'wachheit'];

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

  // Size the stage to 4:3 now that DOM is ready

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

  setupImagePreview();
}

// ── Start ───────────────────────────────────────────────────
// setupMouseEvents guard – only run once
let _mouseEventsReady = false;
function ensureMouseEvents(){
  if(_mouseEventsReady) return;
  _mouseEventsReady = true;
  setupMouseEvents();
}

function startExperiment(){
  // btn-start now calls startTutorial() from tutorial.js
  // This function is kept for compatibility (skip/finish tutorial calls it)
  const ss = document.getElementById('start-screen');
  if(ss){ ss.classList.add('hidden'); setTimeout(()=> ss.remove(), 420); }
  ensureMouseEvents();
  // Tutorial takes over from here via startTutorial()
}

// ── Load level ──────────────────────────────────────────────
async function loadLevel(i){
  currentLevel=i; currentErrors=0;
  zones=[]; zoneFilled={}; trashFilled={}; draggingId=null;
  resetLevelTelemetry();
  stopTimer();
  document.getElementById('stat-err-val').textContent='0';
  document.getElementById('stat-time').textContent='0.00';
  document.getElementById('btn-next').style.display='none';
  document.getElementById('trash-count').textContent='';
  elLoupe.style.display=elPin.style.display=elFloatChip.style.display='none';
  elStage.querySelectorAll('.zone-ok').forEach(el=>el.remove());
  elDebugCanvas.style.display = debugMode ? 'block' : 'none';
  hintActive = false;
  updateHintLayersVisibility();

  const lv=CONFIG.levels[i];
  // Progress display follows the shuffled play position, not the raw config
  // index, so it counts up 1..N in the order the player actually sees them.
  const tot  = levelOrder.length || CONFIG.levels.length;
  const pos  = levelOrder.length ? orderPos+1 : i+1;
  const pct  = Math.round(((pos-1)/tot)*100);
  document.getElementById('progress-fill').style.width=pct+'%';
  document.getElementById('prog-text').textContent=`LEVEL ${pos} / ${tot}`;
  document.getElementById('prog-pct').textContent=pct+' %';

  await new Promise(resolve=>{
    elSatImg.onload=elSatImg.onerror=resolve;
    elSatImg.src=lv.imgSrc;
  });

  // Normalfall: bereits von preloadSessionLevels() geladen+verifiziert, kein
  // erneuter Fetch noetig. Fallback-Fetch bleibt als Sicherheitsnetz fuer
  // Pfade, die preloadSessionLevels() nicht durchlaufen (Uebungsrunde via
  // loadLevelSilent(), Debug-Panel-Levelnavigation auf beliebige Rohindizes).
  let geojson = _preloadedGeojson[i];
  if(!geojson){
    try{
      const res=await fetch(lv.geojsonSrc);
      if(!res.ok) throw new Error('HTTP '+res.status);
      geojson=await res.json();
    }catch(e){
      showFeedback('⚠ GeoJSON nicht geladen: '+lv.geojsonSrc,'err');
      console.error(e); return;
    }
  }

  buildZones(geojson, lv.bounds);
  buildDebugPanel();
  buildHintLayerChecks();
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
    // Clamp to [0,1] so polygons stay strictly within image bounds
    const fx=Math.max(0,Math.min(1,(mx-mxW)/mxSpan));
    const fy=Math.max(0,Math.min(1,(myN-my)/mySpan));
    return [fx,fy];
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

// Vereinfachte Variante von buildDebugPanel() fuer die Ebenenumschaltung im
// Hinweis-Overlay: nur Farb-Swatch + Name + Checkbox, keine Flaechen-% oder
// QA-Steuerung. Teilt sich debugActive/klasseColour mit dem Debug-Modus, so
// dass beide Ansichten immer denselben Ebenen-Zustand zeigen.
function buildHintLayerChecks(){
  const allLabels = CONFIG.labels.map(l => l.id);
  const presentKlassen = new Set(zones.map(z => z.klasse));
  const container = document.getElementById('hint-layers-checks');
  if(!container) return;
  container.innerHTML = '';

  allLabels.forEach(k=>{
    const col     = klasseColour[k] || {stroke:'#4a6080'};
    const present = presentKlassen.has(k);

    const row = document.createElement('label');
    row.className = 'debug-check-row';
    if(!present) row.style.opacity = '0.38';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = debugActive[k];
    cb.disabled = !present;
    cb.addEventListener('change', ()=>{
      debugActive[k] = cb.checked;
      if(hintActive || debugMode) redrawDebug();
    });

    const swatch = document.createElement('div');
    swatch.className = 'debug-swatch';
    swatch.style.background = col.stroke;

    const name = document.createElement('span');
    name.textContent = k;

    row.appendChild(cb);
    row.appendChild(swatch);
    row.appendChild(name);
    container.appendChild(row);
  });
}

function updateHintLayersVisibility(){
  const panel = document.getElementById('hint-layers-panel');
  if(panel) panel.style.display = (hintActive && !debugMode) ? 'block' : 'none';
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

// Advance the actual (possibly shuffled) experiment sequence regardless of
// whether the current task's zones are actually solved – lets QA reach any
// point in the flow without dragging every label correctly.
function debugSkipTask(){
  if(levelOrder.length) nextLevel();
  else if(CONFIG && currentLevel<CONFIG.levels.length-1) loadLevel(currentLevel+1);
}
function debugJumpToResults(){
  showResults();
}

// ── Debug draw ───────────────────────────────────────────────
function redrawDebug(){
  // Stage is now exactly 4:3, so we use it directly
  const w = elStage.offsetWidth;
  const h = elStage.offsetHeight;

  elDebugCanvas.width  = w;
  elDebugCanvas.height = h;
  elDebugCanvas.style.width  = '100%';
  elDebugCanvas.style.height = '100%';
  elDebugCanvas.style.left   = '0';
  elDebugCanvas.style.top    = '0';
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
  if(levelTelemetry) levelTelemetry.debugTriggered = true;
  debugMode=!debugMode;
  document.getElementById('debug-panel').style.display=debugMode?'block':'none';
  elDebugCanvas.style.display=debugMode?'block':'none';
  if(debugMode) redrawDebug();
  updateHintLayersVisibility();
}

// "Ich komme nicht weiter"-Knopf: zeigt die Hitbox-Overlay-Zeichnung plus eine
// schlanke Ebenenumschaltung (Checkboxen ohne QA-Steuerung/Level-Navigation,
// die für Teilnehmende nicht gedacht ist). Wird separat von debugTriggered
// erfasst, da eine genutzte Lösungshilfe inhaltlich etwas anderes ist als
// versehentlich ausgelöster Debug-Modus (siehe CLAUDE.md).
function showHint(){
  if(levelTelemetry) levelTelemetry.hintUsed = true;
  hintActive = true;
  elDebugCanvas.style.display = 'block';
  redrawDebug();
  updateHintLayersVisibility();
  showFeedback('Lösung wird angezeigt', 'ok');
}

function isTypingTarget_(target){
  if(!target) return false;
  const tag = target.tagName;
  return tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT' || target.isContentEditable;
}

document.addEventListener('keydown',e=>{
  if(e.key==='d'||e.key==='D') toggleDebug();
  if((e.key==='t'||e.key==='T') && !isTypingTarget_(e.target)) toggleTestMode();
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
// ── Mouse events ─────────────────────────────────────────────
function setupMouseEvents(){
  document.addEventListener('mousemove',e=>{
    if(levelTelemetry){
      if(_lastMouseX!==null){
        levelTelemetry.mouseDistance += Math.hypot(e.clientX-_lastMouseX, e.clientY-_lastMouseY);
      }
      _lastMouseX=e.clientX; _lastMouseY=e.clientY;
    }
    if(draggingId) positionFloatChip(e.clientX,e.clientY);
    // imgRect: actual rendered image position (accounts for black bars)
    // stageRect: full #stage container
    const imgRect  = elSatImg.getBoundingClientRect();
    const stageRect= elStage.getBoundingClientRect();
    const inStage  = e.clientX>=imgRect.left&&e.clientX<=imgRect.right
                  && e.clientY>=imgRect.top &&e.clientY<=imgRect.bottom;
    if(inStage){
      // lx,ly relative to image → used for loupe sampling and hit-test fractions
      const lx=e.clientX-imgRect.left, ly=e.clientY-imgRect.top;
      // slx,sly relative to #stage → used for positioning loupe/pin elements
      const slx=e.clientX-stageRect.left, sly=e.clientY-stageRect.top;

      updateLoupe(lx,ly,imgRect.width,imgRect.height);

      const LOUPE_R=LOUPE_D/2, OFFSET=30;
      const sw=stageRect.width, sh=stageRect.height;
      if(draggingId){
        let ox=slx-LOUPE_R-OFFSET, oy=sly-LOUPE_R-OFFSET;
        if(ox-LOUPE_R<0) ox=slx+LOUPE_R+OFFSET;
        if(oy-LOUPE_R<0) oy=sly+LOUPE_R+OFFSET;
        ox=Math.max(LOUPE_R,Math.min(sw-LOUPE_R,ox));
        oy=Math.max(LOUPE_R,Math.min(sh-LOUPE_R,oy));
        elLoupe.style.left=ox+'px'; elLoupe.style.top=oy+'px';
      } else {
        elLoupe.style.left=slx+'px'; elLoupe.style.top=sly+'px';
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
    const imgRect2=elSatImg.getBoundingClientRect();
    const stgRect2=elStage.getBoundingClientRect();
    const tipX=e.clientX, tipY=e.clientY;
    const inStage=tipX>=imgRect2.left&&tipX<=imgRect2.right
               &&tipY>=imgRect2.top&&tipY<=imgRect2.bottom;
    if(inStage){
      const fx=(tipX-imgRect2.left)/imgRect2.width;
      const fy=(tipY-imgRect2.top)/imgRect2.height;
      // localX/Y for zone-ok label positioning: relative to stage
      const localX=tipX-stgRect2.left, localY=tipY-stgRect2.top;
      handleStageDrop(fx,fy,localX,localY);
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
let _loupeFx=0, _loupeFy=0;

function updateLoupe(lx,ly,stageW,stageH){
  if(!elSatImg.naturalWidth) return;

  // Stage = image (same 4:3), so lx/ly are already image-relative
  const scaleX = elSatImg.naturalWidth  / elStage.offsetWidth;
  const scaleY = elSatImg.naturalHeight / elStage.offsetHeight;
  const srcW   = (LOUPE_D / LOUPE_ZOOM) * scaleX;
  const srcH   = (LOUPE_D / LOUPE_ZOOM) * scaleY;

  _loupeFx = lx / elStage.offsetWidth;
  _loupeFy = ly / elStage.offsetHeight;

  elLoupeCtx.clearRect(0, 0, LOUPE_D, LOUPE_D);
  elLoupeCtx.drawImage(elSatImg,
    lx * scaleX - srcW/2,
    ly * scaleY - srcH/2,
    srcW, srcH,
    0, 0, LOUPE_D, LOUPE_D);

  if(debugMode) drawDebugInLoupe(_loupeFx, _loupeFy, elStage.offsetWidth, elStage.offsetHeight);
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

// ── Telemetrie: ein Ablage-Versuch (korrekt oder nicht) ────────
// Wird für "echte" Level (levelTelemetry != null) je Drop protokolliert;
// die Übungsrunde (loadLevelSilent() statt loadLevel()) initialisiert
// levelTelemetry bewusst nicht und wird dadurch automatisch ausgeklammert.
function logDropAttempt(label, ziel, xFrac, yFrac, getroffeneKlassenArr, korrekt){
  if(!levelTelemetry) return;
  const a = levelTelemetry.attempts[label];
  if(!a) return;
  a.count++;
  if(korrekt){
    a.doneTime = Date.now()-levelStartTime;
    levelTelemetry.assignmentOrder.push(label);
  } else if(ziel==='karte'){
    a.misKarte++;
  } else {
    a.misPapierkorb++;
  }
  levelTelemetry.dropLog.push({
    label, ziel,
    xFrac: ziel==='karte' ? xFrac : null,
    yFrac: ziel==='karte' ? yFrac : null,
    getroffeneKlassen: getroffeneKlassenArr,
    korrekt,
    versuchNrFuerLabel: a.count,
    zeitSeitLevelstartMs: Date.now()-levelStartTime,
  });
}

// ── Drop on stage ────────────────────────────────────────────
function handleStageDrop(fx,fy,localX,localY){
  const hitKlassen=new Set();
  for(const zone of zones){
    if(zoneFilled[zone.klasse]) continue;
    if(pointHitsZone(fx,fy,zone.fracRing)) hitKlassen.add(zone.klasse);
  }

  // Tutorial practice intercept
  if(window._tutPracticeActive && typeof tutPracticeCheck === 'function'){
    // Pass the full hit set, not just its first element – zones can overlap
    // slightly (OSM+WorldCover), so the "first" class in iteration order
    // isn't necessarily the one the player actually needs to hit.
    const consumed = tutPracticeCheck(draggingId, hitKlassen);
    if(consumed) return;
  }

  if(hitKlassen.size===0){
    logDropAttempt(draggingId, 'karte', fx, fy, [], false);
    currentErrors++;
    document.getElementById('stat-err-val').textContent=currentErrors;
    showFeedback('✗ Kein Bereich getroffen – erneut versuchen','err');
    return;
  }
  if(hitKlassen.has(draggingId)){
    logDropAttempt(draggingId, 'karte', fx, fy, [...hitKlassen], true);
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
    logDropAttempt(draggingId, 'karte', fx, fy, [...hitKlassen], false);
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
    logDropAttempt(draggingId, 'papierkorb', null, null, [], true);
    trashFilled[draggingId] = true;
    markChipUsed(draggingId);
    showFeedback('✓ Korrekt entfernt', 'ok');
    checkLevelComplete();
  } else {
    logDropAttempt(draggingId, 'papierkorb', null, null, [], false);
    currentErrors++;
    document.getElementById('stat-err-val').textContent = currentErrors;
    showFeedback('✗ Element ist sichtbar – auf die Karte ziehen', 'err');
  }
}

// ── Level complete ───────────────────────────────────────────
function checkLevelComplete(){
  const lv = CONFIG.levels[currentLevel];
  const absentOpt = lv.absent_optional || [];

  // Klassen die auf der Karte platziert werden müssen:
  // alle die in den Zonen vorkommen UND nicht in absent_optional sind
  const zoneKlassen = [...new Set(zones.map(z => z.klasse))];
  const mustPlace   = zoneKlassen.filter(k => !absentOpt.includes(k));

  const zonesOk = mustPlace.length === 0 || mustPlace.every(k => zoneFilled[k]);
  // absent: must be in trash
  // absent_optional: resolved by trash OR map
  // If absent/absentOpt are empty arrays, every() returns true automatically
  const trashOk = lv.absent.every(a => trashFilled[a])
               && absentOpt.every(a => trashFilled[a] || zoneFilled[a]);

  console.log('[checkLevelComplete]',
    'mustPlace:', mustPlace, 'zoneFilled:', {...zoneFilled},
    'absent:', lv.absent, 'absentOpt:', absentOpt,
    'trashFilled:', {...trashFilled},
    'zonesOk:', zonesOk, 'trashOk:', trashOk);

  if(zonesOk && trashOk){
    stopTimer();
    results.push({image:lv.id, imgSrc:lv.imgSrc, time:Date.now()-levelStartTime, errors:currentErrors});
    submitLevelTelemetry(lv.id);
    document.getElementById('btn-next').style.display='block';
  }
}

// Baut aus dem levelTelemetry-Zustand die Level_Ergebnisse-Zeilen (1 je
// Label) und übergibt sie zusammen mit den rohen Drop_Versuche-Zeilen an
// telemetry.js – wird automatisch nach jedem gelösten Level gesendet
// (siehe Q8: robust gegen Abbruch, kein gesammeltes Absenden am Ende).
function submitLevelTelemetry(levelId){
  if(!levelTelemetry) return;
  const labelResults = CONFIG.labels.map(l=>{
    const a = levelTelemetry.attempts[l.id];
    return {
      label: l.id,
      gesamtzeitMs: a.doneTime,
      versuche: a.count,
      reihenfolgePosition: levelTelemetry.assignmentOrder.indexOf(l.id)+1,
      fehlwuerfeKarte: a.misKarte,
      fehlwuerfePapierkorb: a.misPapierkorb,
    };
  });
  submitLevelResult({
    level: levelId,
    tabWechsel: levelTelemetry.tabSwitches,
    gesamtMausweg: Math.round(levelTelemetry.mouseDistance),
    debugAusgeloest: levelTelemetry.debugTriggered,
    hinweisGenutzt: levelTelemetry.hintUsed,
    labelResults,
    dropVersuche: levelTelemetry.dropLog,
  });
}
function nextLevel(){
  orderPos++;
  if(orderPos < levelOrder.length) loadLevel(levelOrder[orderPos]);
  else finishExperiment();
}

// ── Randomised level order ───────────────────────────────────
// Index 0 is reserved for the tutorial's silent preload/practice round and
// never appears in the timed experiment. Since 2026-08-26 (Umstieg auf
// echte Sentinel-2-Bilder, siehe CLAUDE.md/Memory project_geogame_real_
// imagery): data/config.json haelt den vollen Bilderpool (Ziel: 60 Level),
// nicht mehr nur die pro Durchlauf gezeigten - bei jedem App-Start werden
// LEVELS_PER_SESSION rein zufaellig daraus gezogen (kein Gedaechtnis ueber
// Sessions hinweg, bewusste Entscheidung, siehe Memory). Ein vollstaendiger
// Fisher-Yates-Shuffle von 1..N-1, danach auf die ersten LEVELS_PER_SESSION
// zugeschnitten, ist aequivalent zu einer zufaelligen K-Teilmenge in
// zufaelliger Reihenfolge - kein separater Auswahlschritt noetig.
const LEVELS_PER_SESSION = 8;
let _fullShuffledPool = []; // voller Pool in Zufallsreihenfolge, ueber LEVELS_PER_SESSION
                             // hinaus als Ersatzreserve fuer preloadSessionLevels()
function buildLevelOrder(){
  const pool = CONFIG.levels.map((_, i) => i).slice(1);
  for(let i=pool.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [pool[i],pool[j]] = [pool[j],pool[i]];
  }
  _fullShuffledPool = pool;
  levelOrder = pool.slice(0, LEVELS_PER_SESSION);
  orderPos = 0;
}
async function startShuffledExperiment(){
  buildLevelOrder();
  await preloadSessionLevels();
  loadLevel(levelOrder[orderPos]);
}

// ── Vorladen der Session-Level (seit 2026-08-26) ────────────────
// Laedt Bild + GeoJSON aller levelOrder-Eintraege VOR Spielbeginn und
// verifiziert sie, statt das erst waehrend loadLevel() je Level zu tun -
// verhindert eine Ladefehler-Meldung MITTEN im Durchlauf (Julians Testfund
// 2026-08-26, siehe CLAUDE.md). Ein Level, das nach mehreren Versuchen
// nicht laedt, wird durch ein anderes, noch nicht gezogenes Pool-Bild aus
// _fullShuffledPool ersetzt; erst wenn auch der Ersatzvorrat erschoepft
// ist, wird der Slot ersatzlos aus levelOrder entfernt (lieber ein Level
// weniger als ein defekter Durchlauf).
const _preloadedGeojson = {}; // level-index -> bereits geparstes GeoJSON (spart erneuten Fetch in loadLevel())

function preloadImage_(src){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Bild fehlgeschlagen: '+src));
    img.src = src;
  });
}

async function preloadOneLevel_(levelIdx){
  const lv = CONFIG.levels[levelIdx];
  const maxAttempts = 3;
  for(let attempt=1; attempt<=maxAttempts; attempt++){
    try{
      const [geojson] = await Promise.all([
        fetch(lv.geojsonSrc).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }),
        preloadImage_(lv.imgSrc),
      ]);
      _preloadedGeojson[levelIdx] = geojson;
      return true;
    }catch(e){
      console.warn(`[preload] ${lv.id}: Versuch ${attempt}/${maxAttempts} fehlgeschlagen -`, e);
      if(attempt < maxAttempts) await new Promise(r=>setTimeout(r, 600));
    }
  }
  return false;
}

async function preloadSessionLevels(){
  const overlay = document.getElementById('preload-overlay');
  overlay.classList.add('active');
  updatePreloadProgress_(0, levelOrder.length);

  const replacementPool = _fullShuffledPool.slice(LEVELS_PER_SESSION);
  let pos = 0;
  while(pos < levelOrder.length){
    const ok = await preloadOneLevel_(levelOrder[pos]);
    if(ok){
      pos++;
      updatePreloadProgress_(pos, levelOrder.length);
      continue;
    }
    if(replacementPool.length){
      levelOrder[pos] = replacementPool.shift(); // gleicher Slot, neuer Versuch mit Ersatz-Level
    } else {
      levelOrder.splice(pos, 1); // kein Ersatz mehr da, Slot ersatzlos entfernen
      updatePreloadProgress_(pos, levelOrder.length);
    }
  }

  overlay.classList.remove('active');
}

function updatePreloadProgress_(done, total){
  document.getElementById('preload-text').textContent =
    `Level werden vorbereitet … (${done}/${total})`;
  document.getElementById('preload-bar').style.width =
    (total ? Math.round(done/total*100) : 0) + '%';
}

// ── Ready / Countdown ───────────────────────────────────────
function showReadyOverlay(lv){
  // Hide image and labels until countdown ends
  elSatImg.style.visibility    = 'hidden';
  document.getElementById('label-bar').style.visibility = 'hidden';
  elTrash.style.visibility     = 'hidden';
  document.getElementById('btn-hint').style.visibility = 'hidden';

  const overlay = document.getElementById('ready-overlay');
  const tot = levelOrder.length || CONFIG.levels.length;
  const pos = levelOrder.length ? orderPos+1 : currentLevel+1;
  document.getElementById('ready-level-tag').textContent =
    `LEVEL ${pos} / ${tot}  —  ${lv.id}`;

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
    document.getElementById('btn-hint').style.visibility = 'visible';
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

// ── Familiarity-Check (Wiedererkennung bekannter Landschaften) ──────────────
// Läuft nach dem letzten Level, bevor das eigentliche Abschlusspopup
// (results-screen) erscheint. debugJumpToResults() (QA-Shortcut) umgeht das
// bewusst und ruft showResults() direkt auf.
function finishExperiment(){
  stopTimer();
  document.querySelectorAll('#familiarity-modal input[type=radio]').forEach(r=>{ r.checked = false; });
  document.getElementById('pq-ort').value = '';
  document.getElementById('familiarity-modal').classList.add('active');
}

// Liest die 4 Platzhalterfragen aus (siehe HTML-Kommentar bei #familiarity-modal:
// austauschbar angelegt) und liefert sie zusammen mit dem Bekanntheits-Status an
// submitPostSurvey() (telemetry.js) - fest an den Klick auf Nein/Ja gekoppelt,
// da das dieselbe "Post-Abfrage" ist wie der Familiarity-Check.
function readPostSurveyAnswers_(){
  const answers = { ort: document.getElementById('pq-ort').value.trim() };
  POST_SURVEY_LIKERT_QUESTIONS.forEach(q=>{
    const checked = document.querySelector(`input[name="pq-${q}"]:checked`);
    answers[q] = checked ? checked.value : '';
  });
  return answers;
}

function familiarityAnswer(yes){
  const postSurveyAnswers = readPostSurveyAnswers_();
  submitPostSurvey(postSurveyAnswers);
  document.getElementById('familiarity-modal').classList.remove('active');
  if(yes){
    familiarityStatus = 'ja';
    openFamiliarityGallery();
  } else {
    familiarityStatus = 'nein';
    finalizeFamiliarityAndShowResults();
  }
}

function openFamiliarityGallery(){
  const grid = document.getElementById('familiarity-gallery-grid');
  grid.innerHTML = '';
  results.forEach(r=>{
    const cell = document.createElement('div');
    cell.className = 'familiarity-cell';
    cell.id = 'familiarity-cell-'+r.image;

    const img = document.createElement('img');
    img.src = r.imgSrc; img.alt = r.image; img.draggable = false;

    const zoomBtn = document.createElement('button');
    zoomBtn.className = 'familiarity-zoom-btn';
    zoomBtn.type = 'button'; zoomBtn.title = 'Vergrößern';
    zoomBtn.textContent = '🔍';
    zoomBtn.addEventListener('click', ()=>openImagePreview(r.imgSrc, r.image));

    const markBtn = document.createElement('button');
    markBtn.className = 'familiarity-mark-btn';
    markBtn.type = 'button'; markBtn.title = 'Als bekannt markieren';
    markBtn.textContent = '✓';
    markBtn.addEventListener('click', ()=>openFamiliarityNaming(r.image));

    cell.appendChild(img);
    cell.appendChild(zoomBtn);
    cell.appendChild(markBtn);
    grid.appendChild(cell);
    refreshFamiliarityCellState(r.image);
  });
  document.getElementById('familiarity-gallery-screen').classList.add('active');
}

function refreshFamiliarityCellState(levelId){
  const cell = document.getElementById('familiarity-cell-'+levelId);
  if(!cell) return;
  cell.classList.toggle('marked', !!familiarityMarks[levelId]);
}

function openFamiliarityNaming(levelId){
  familiarityEditingLevel = levelId;
  const existing = familiarityMarks[levelId];
  document.getElementById('familiarity-name-input').value = existing ? existing.name : '';
  document.getElementById('familiarity-name-remove').style.display = existing ? 'inline-block' : 'none';
  document.getElementById('familiarity-name-modal').classList.add('active');
  document.getElementById('familiarity-name-input').focus();
}
function closeFamiliarityNaming(){
  document.getElementById('familiarity-name-modal').classList.remove('active');
  familiarityEditingLevel = null;
}
function confirmFamiliarityName(){
  const name = document.getElementById('familiarity-name-input').value.trim();
  if(!name) return;
  familiarityMarks[familiarityEditingLevel] = {name};
  const levelId = familiarityEditingLevel;
  closeFamiliarityNaming();
  refreshFamiliarityCellState(levelId);
}
function removeFamiliarityMark(){
  const levelId = familiarityEditingLevel;
  delete familiarityMarks[levelId];
  closeFamiliarityNaming();
  refreshFamiliarityCellState(levelId);
}

function finishFamiliarityGallery(){
  document.getElementById('familiarity-gallery-screen').classList.remove('active');
  finalizeFamiliarityAndShowResults();
}

function finalizeFamiliarityAndShowResults(){
  const markedImages = Object.keys(familiarityMarks).map(level=>({level, name:familiarityMarks[level].name}));
  submitFamiliarity(familiarityStatus, markedImages);
  showResults();
}

// ── Feedback (aus dem Abschlusspopup) ───────────────────────────────────────
function openFeedbackModal(){
  document.getElementById('feedback-text').value = '';
  document.getElementById('feedback-modal-body').style.display = 'block';
  document.getElementById('feedback-modal-thanks').style.display = 'none';
  document.getElementById('feedback-modal').classList.add('active');
}
function closeFeedbackModal(){
  document.getElementById('feedback-modal').classList.remove('active');
}
function submitFeedbackForm(){
  const text = document.getElementById('feedback-text').value.trim();
  if(!text) return;
  submitFeedback(text);
  document.getElementById('feedback-modal-body').style.display = 'none';
  document.getElementById('feedback-modal-thanks').style.display = 'block';
}

// ── Results ──────────────────────────────────────────────────
const DISQUALIFY_ERROR_THRESHOLD = 5; // muss mit Code.gs (Server) uebereinstimmen

function showResults(){
  stopTimer();
  const body=document.getElementById('results-body'); body.innerHTML='';
  let tm=0,te=0;
  const percentileCells = {}; // level id -> <td>, zum spaeteren Befuellen
  results.forEach(r=>{
    tm+=r.time; te+=r.errors;
    const tr=document.createElement('tr');
    tr.className='results-row';
    tr.title='Klicken für Bildvorschau';
    tr.innerHTML=`<td>${r.image}</td><td class="num">${(r.time/1000).toFixed(2)}</td><td class="num">${r.errors}</td><td class="num percentile-cell">…</td>`;
    tr.addEventListener('click', ()=>openImagePreview(r.imgSrc, r.image));
    body.appendChild(tr);
    percentileCells[r.image] = tr.querySelector('.percentile-cell');
  });
  const s=document.createElement('tr');
  s.innerHTML=`<td>GESAMT</td><td class="num">${(tm/1000).toFixed(2)}</td><td class="num">${te}</td><td></td>`;
  body.appendChild(s);
  document.getElementById('results-screen').classList.add('active');

  submitRunSummary(tm, te);
  loadLeaderboard_(percentileCells, te);
}

// ── Bestenliste (seit 2026-08-26) ───────────────────────────────
function loadLeaderboard_(percentileCells, totalErrors){
  const disqualified = totalErrors > DISQUALIFY_ERROR_THRESHOLD;
  document.getElementById('leaderboard-disqualified-note').style.display = disqualified ? 'block' : 'none';

  // Sichtbarer Ladezustand statt stiller Wartezeit (Julians Testfund
  // 2026-08-26: die Bestenliste laedt spuerbar nach - Apps-Script-Latenz
  // laesst sich nicht wegzaubern, aber ohne Hinweis wirkt das wie ein Fehler).
  const ownRankEl = document.getElementById('leaderboard-own-rank');
  ownRankEl.textContent = disqualified ? '' : 'Bestenliste wird geladen …';
  document.getElementById('leaderboard-body').innerHTML =
    '<tr><td colspan="4" class="leaderboard-loading">Lädt …</td></tr>';

  const levelTimes = results.map(r => ({level: r.image, timeMs: r.time}));
  fetchLeaderboard(levelTimes).then(data => {
    if(!data || !data.ok){
      document.getElementById('leaderboard-body').innerHTML =
        '<tr><td colspan="4" class="leaderboard-loading">Bestenliste konnte nicht geladen werden.</td></tr>';
      if(!disqualified) ownRankEl.textContent = '';
      return;
    }

    Object.keys(data.percentiles || {}).forEach(level=>{
      const cell = percentileCells[level];
      if(!cell) return;
      const pct = data.percentiles[level];
      cell.textContent = (pct == null) ? '–' : `schneller als ${pct}%`;
    });

    renderLeaderboardRows_('leaderboard-body', data.top10 || []);

    if(disqualified){
      ownRankEl.textContent = '';
    } else if(data.myRank){
      ownRankEl.textContent = `Deine Platzierung: ${data.myRank.rank}. von ${data.fullCount} (${(data.myRank.totalTimeMs/1000).toFixed(2)} s, ${data.myRank.totalErrors} Fehler)`;
      _lastMyRank = data.myRank;
    } else {
      ownRankEl.textContent = '';
    }
  });
}

// ── "Freund herausfordern" (seit 2026-08-26) ────────────────────
// _lastMyRank wird in loadLeaderboard_() gesetzt, sobald ein gueltiger
// (nicht disqualifizierter) eigener Bestwert vom Server zurueckkommt -
// bleibt null, wenn noch keiner existiert (z. B. erster, disqualifizierter
// Durchlauf) - dann faellt buildShareText_() bewusst auf eine generische
// Nachricht ohne Zeitangabe zurueck (Julians Entscheidung), statt den
// Button ganz zu verstecken.
let _lastMyRank = null;

// tutLang (aus tutorial.js, globale Variable) bestimmt die Sprache - so
// bekommt ein Teilnehmer, der die englische Version gespielt hat, auch eine
// englische Teilen-Nachricht statt hartkodiertem Deutsch. Zweiter Absatz mit
// Studien-/rgeo-Kontext auf Julians Wunsch (2026-08-26) ergaenzt, damit die
// Nachricht seriöser wirkt statt wie eine reine Spiele-Einladung - Fakten
// (rgeo, PH Heidelberg, Promotion) decken sich bewusst mit dem Consent-Text
// in tutorial.js (TUT_TEXTS.consentBody), nicht neu erfunden.
//
// whatsapp=true nutzt WhatsApps eigene *fett*/_kursiv_-Textsyntax (rendert
// NUR bei WhatsApp, ueberall sonst blieben die Sternchen/Unterstriche als
// literale Zeichen sichtbar, siehe unten) - UND laesst Emojis bewusst WEG.
// Grund (Diagnose 2026-08-26): WhatsApps eigener wa.me/?text=-Link ist der
// EINZIGE Weg, der beim Klick direkt die Kontaktauswahl mit bereits
// eingetipptem Text oeffnet (von Julian live bestaetigt) - ein Umweg ueber
// "Text kopieren + WhatsApp Web oeffnen" verlangt vom Nutzer stattdessen,
// selbst einen Chat zu suchen und manuell einzufuegen, klar schlechter.
// Dieser ?text=-Link hat aber einen bestaetigten Bug: Emojis kommen dort
// als "�" an, selbst bei nachweislich korrektem UTF-8-Encoding (auf
// WhatsApps eigener Seite direkt reproduziert) - *fett*/_kursiv_-Markdown
// und Umlaute funktionieren im selben Link einwandfrei. Deshalb: fuer
// WhatsApp Emojis weglassen, Markdown behalten - der bessere Kompromiss
// als der volle Funktionsverlust der Kontaktauswahl.
// Echtes Unterstreichen gibt es in keinem der Kanaele als reiner Text -
// technisch nicht moeglich, nicht umgesetzt.
function buildShareText_(whatsapp){
  const en = (typeof tutLang !== 'undefined' && tutLang === 'en');
  const b = whatsapp ? '*' : '';   // WhatsApp-"fett"
  const i = whatsapp ? '_' : '';   // WhatsApp-"kursiv"
  const e = whatsapp ? {wave:'',sat:'',watch:'',flex:'',lab:'',pray:''}
                      : {wave:' 👋',sat:' 🛰️',watch:' ⏱️',flex:' 💪',lab:' 🔬',pray:' 🙏'};

  const intro = _lastMyRank
    ? (en
        ? `Hey!${e.wave} I just set a ${b}personal best${b} in SCOPE${e.sat}: ${b}${(_lastMyRank.totalTimeMs/1000).toFixed(2)} seconds${b}${e.watch}. Think you can beat it?${e.flex}`
        : `Hi!${e.wave} Ich habe gerade bei SCOPE${e.sat} einen ${b}persönlichen Bestwert${b} aufgestellt: ${b}${(_lastMyRank.totalTimeMs/1000).toFixed(2)} Sekunden${b}${e.watch}. Schaffst du das auch?${e.flex}`)
    : (en
        ? `Hey!${e.wave} I just played SCOPE${e.sat} – give it a try!`
        : `Hi!${e.wave} Ich habe gerade SCOPE${e.sat} gespielt – probier's auch mal aus!`);
  const about = en
    ? `${i}SCOPE${i} is an online game and part of a scientific study${e.lab} run by the Research Group for Earth Observation (rgeo) at Heidelberg University of Education, as part of a doctoral thesis. It investigates how people perceive and recognise different landscape features in satellite imagery. By playing, you support ${b}real research${b}${e.pray} – and it only takes a few minutes.`
    : `${i}SCOPE${i} ist ein Online-Spiel und Teil einer wissenschaftlichen Studie${e.lab} der Research Group for Earth Observation (rgeo) an der Pädagogischen Hochschule Heidelberg, im Rahmen einer Promotion. Untersucht wird, wie Menschen unterschiedliche Landschaftselemente in Satellitenbildern wahrnehmen und erkennen. Mit deiner Teilnahme unterstützt du ${b}echte Forschung${b}${e.pray} – und es dauert nur wenige Minuten.`;
  return intro + '\n\n' + about;
}

function shareChallenge(){
  const text = buildShareText_(false);
  const url = location.origin + location.pathname;
  if(navigator.share){
    navigator.share({title:'SCOPE', text, url}).catch(()=>{}); // AbortError bei Nutzerabbruch bewusst ignoriert
  } else {
    openShareFallbackModal_(text, url);
  }
}

function openShareFallbackModal_(text, url){
  document.getElementById('share-fallback-text').textContent = text;
  document.getElementById('share-whatsapp').href =
    'https://wa.me/?text=' + encodeURIComponent(buildShareText_(true) + '\n\n👉 ' + url);
  document.getElementById('share-twitter').href =
    'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
  // mailto: kann keine Link-Vorschaukarte zeigen (reiner Text) - Link daher
  // wenigstens klar mit Hinweistext eingerahmt statt "nackt" im Body.
  const emailIntro = (typeof tutLang !== 'undefined' && tutLang === 'en') ? 'Play here:' : 'Hier geht’s zum Spiel:';
  document.getElementById('share-email').href =
    'mailto:?subject=' + encodeURIComponent('SCOPE – mach mit!') +
    '&body=' + encodeURIComponent(text + '\n\n👉 ' + emailIntro + ' ' + url);

  // Instagram/TikTok haben keine oeffentliche Web-Share-URL mit vorausgefuelltem
  // Text (anders als WhatsApp/Twitter/E-Mail) - stattdessen Text in die
  // Zwischenablage kopieren und die Plattform in einem neuen Tab oeffnen, statt
  // eines Buttons, der nichts vorausfuellen kann.
  const clipboardText = text + '\n\n👉 ' + emailIntro + ' ' + url;
  document.getElementById('share-instagram').onclick = () => copyThenOpen_(clipboardText, 'https://www.instagram.com/direct/inbox/', 'Instagram');
  document.getElementById('share-tiktok').onclick = () => copyThenOpen_(clipboardText, 'https://www.tiktok.com/', 'TikTok');
  document.getElementById('share-copy-hint').style.display = 'none';

  document.getElementById('share-fallback-modal').classList.add('active');
}

function copyThenOpen_(text, platformUrl, platformName){
  const done = () => {
    const hint = document.getElementById('share-copy-hint');
    hint.textContent = `Text in die Zwischenablage kopiert – beim Einfügen in ${platformName} bereit.`;
    hint.style.display = 'block';
    window.open(platformUrl, '_blank', 'noopener');
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(done);
  } else {
    done();
  }
}
function closeShareFallbackModal(){
  document.getElementById('share-fallback-modal').classList.remove('active');
}

function renderLeaderboardRows_(tbodyId, rows){
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = '';
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="num">${r.rank}</td><td>${escapeHtml_(r.alias)}</td><td class="num">${(r.totalTimeMs/1000).toFixed(2)}</td><td class="num">${r.totalErrors}</td>`;
    tbody.appendChild(tr);
  });
}
function escapeHtml_(s){
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function openFullLeaderboard(){
  document.getElementById('leaderboard-full-modal').classList.add('active');
  fetchLeaderboardFull().then(data=>{
    if(data && data.ok) renderLeaderboardRows_('leaderboard-full-body', data.full || []);
  });
}
function closeFullLeaderboard(){
  document.getElementById('leaderboard-full-modal').classList.remove('active');
}

// ── Image preview / zoom (results table) ──────────────────────
const PREVIEW_MIN_ZOOM = 1, PREVIEW_MAX_ZOOM = 8;
let previewZoom = 1, previewX = 0, previewY = 0;
let previewDragging = false, previewDragStart = null;
let elPreviewModal, elPreviewViewport, elPreviewImg, elPreviewTitle;

function setupImagePreview(){
  elPreviewModal    = document.getElementById('image-preview-modal');
  elPreviewViewport = document.getElementById('image-preview-viewport');
  elPreviewImg      = document.getElementById('image-preview-img');
  elPreviewTitle    = document.getElementById('image-preview-title');

  elPreviewViewport.addEventListener('wheel', onPreviewWheel, {passive:false});
  elPreviewImg.addEventListener('mousedown', onPreviewDragStart);
  document.addEventListener('mousemove', onPreviewDragMove);
  document.addEventListener('mouseup', onPreviewDragEnd);
  elPreviewImg.addEventListener('dblclick', resetPreviewZoom);
  elPreviewModal.addEventListener('click', e=>{
    if(e.target === elPreviewModal) closeImagePreview();
  });
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && elPreviewModal.classList.contains('active')) closeImagePreview();
  });
}

function openImagePreview(src, label){
  elPreviewImg.src = src;
  elPreviewTitle.textContent = label;
  resetPreviewZoom();
  elPreviewModal.classList.add('active');
}
function closeImagePreview(){
  elPreviewModal.classList.remove('active');
}
function resetPreviewZoom(){
  previewZoom = 1; previewX = 0; previewY = 0;
  applyPreviewTransform();
}
function applyPreviewTransform(){
  elPreviewImg.style.transform = `translate(${previewX}px, ${previewY}px) scale(${previewZoom})`;
  elPreviewImg.style.cursor = previewZoom > 1 ? 'grab' : 'zoom-in';
}
function onPreviewWheel(e){
  e.preventDefault();
  const rect = elPreviewViewport.getBoundingClientRect();
  const cx = e.clientX - rect.left - rect.width/2;
  const cy = e.clientY - rect.top - rect.height/2;
  const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
  const newZoom = Math.min(PREVIEW_MAX_ZOOM, Math.max(PREVIEW_MIN_ZOOM, previewZoom*factor));
  previewX = cx - (cx - previewX) * (newZoom/previewZoom);
  previewY = cy - (cy - previewY) * (newZoom/previewZoom);
  previewZoom = newZoom;
  if(previewZoom === PREVIEW_MIN_ZOOM){ previewX = 0; previewY = 0; }
  applyPreviewTransform();
}
function onPreviewDragStart(e){
  if(previewZoom <= 1) return;
  previewDragging = true;
  previewDragStart = {x:e.clientX - previewX, y:e.clientY - previewY};
  elPreviewImg.style.cursor = 'grabbing';
  e.preventDefault();
}
function onPreviewDragMove(e){
  if(!previewDragging) return;
  previewX = e.clientX - previewDragStart.x;
  previewY = e.clientY - previewDragStart.y;
  applyPreviewTransform();
}
function onPreviewDragEnd(){
  if(!previewDragging) return;
  previewDragging = false;
  elPreviewImg.style.cursor = previewZoom > 1 ? 'grab' : 'zoom-in';
}

// ── Rechtliche Modals (Impressum/Datenschutz/Quellen) ──────────
// name entspricht dem id-Suffix "<name>-modal" in index.html.
function openLegalModal(name){
  const el = document.getElementById(name+'-modal');
  if(el) el.classList.add('active');
}
function closeLegalModal(name){
  const el = document.getElementById(name+'-modal');
  if(el) el.classList.remove('active');
}

document.addEventListener('DOMContentLoaded', boot);
