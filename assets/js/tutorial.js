/**
 * tutorial.js
 * EO Visual Complexity Experiment – Tutorial
 * ──────────────────────────────────────────
 * Flow:
 *   1. Language selection (DE / EN)
 *   2. Info screens (fullscreen): Why / How / Measurement
 *   3. Overlay tutorial (over B1 satellite image):
 *      - Labels bar  → blinking arrow
 *      - Trash bin   → blinking arrow
 *      - Loupe hint  → blinking arrow
 *      - Pin hint    → blinking arrow
 *   4. Practice: user must drop "Fluss" on the correct zone
 *   5. Transition to main experiment (B1 skipped)
 */

// ── Texts ────────────────────────────────────────────────────────────────────
const TUT_TEXTS = {
  de: {
    langLabel: "Sprache wählen / Choose language",
    langBtn:   "Deutsch",

    info: [
      {
        badge:    "01 / Hintergrund",
        title:    "Warum gibt es dieses Spiel?",
        subtitle: "Wissenschaftliche Studie",
        body:     "Dieses Spiel ist Teil einer wissenschaftlichen Studie zur visuellen Komplexität von Satelliten- und Drohnenbildern. Ziel ist es zu untersuchen, wie Menschen verschiedene Landschaftselemente in Fernerkundungsbildern erkennen und wie sich unterschiedliche Bildmerkmale auf die Wahrnehmung auswirken.",
        note:     null,
      },
      {
        badge:    "02 / Aufgabe",
        title:    "Wie funktioniert das Spiel?",
        subtitle: "Deine Aufgabe",
        body:     "Ziehe die angezeigten Labels auf die passenden Stellen im Satellitenbild. Falls ein Objekt im Bild nicht vorhanden ist, lege es in den Papierkorb. Arbeite dabei so genau wie möglich.",
        note:     null,
      },
      {
        badge:    "03 / Messung",
        title:    "Was wird gemessen?",
        subtitle: "Bearbeitungszeit & Datenschutz",
        body:     "Während der Bearbeitung wird die benötigte Zeit gemessen. Bitte bearbeite die Aufgaben ganz natürlich – versuche weder besonders schnell noch absichtlich langsam zu arbeiten. Uns interessiert, wie Menschen solche Aufgaben unter normalen Bedingungen lösen.",
        note:     "Die Teilnahme erfolgt anonym. Es werden keine personenbezogenen Daten erfasst oder gespeichert. Die Daten dienen ausschließlich wissenschaftlichen Zwecken.",
      },
    ],

    overlay: [
      {
        title:  "Die Labels",
        body:   "Hier findest du alle Objekte, die du auf dem Bild markieren sollst. Ziehe ein Label mit gedrückter Maustaste auf den entsprechenden Bereich im Bild.",
        target: "labels",
      },
      {
        title:  "Nicht vorhanden – der Papierkorb",
        body:   "Ist ein Objekt auf dem Bild nicht sichtbar, ziehe das Label in den Papierkorb rechts unten.",
        target: "trash",
      },
      {
        title:  "Die Lupe",
        body:   "Sobald du die Maus über das Bild bewegst, erscheint eine Lupe. Sie zeigt den Bereich unter dem Cursor vergrößert an und hilft dir bei der genauen Zuordnung.",
        target: "loupe",
      },
      {
        title:  "Die Nadel",
        body:   "Wenn du ein Label aufgenommen hast, erscheint eine Nadel unter dem Cursor. Die Spitze der Nadel zeigt den exakten Ablageort an – platziere sie präzise im richtigen Bereich.",
        target: "pin",
      },
    ],

    practiceTitle:   "Jetzt bist du dran!",
    practiceBody:    "Markiere den Fluss auf dem Bild. Ziehe das Label „Fluss 🌊" auf den Bereich mit dem Fließgewässer.",
    practiceSuccess: "✓ Sehr gut! Du hast die Spielmechanik verstanden.",
    practiceBtn:     "Weiter zum Experiment ›",
    nextBtn:  "Weiter ›",
    skipBtn:  "Tutorial überspringen",
    startBtn: "Experiment starten ›",
  },

  en: {
    langLabel: "Sprache wählen / Choose language",
    langBtn:   "English",

    info: [
      {
        badge:    "01 / Background",
        title:    "Why does this game exist?",
        subtitle: "Scientific Study",
        body:     "This game is part of a scientific study on the visual complexity of satellite and drone images. The goal is to investigate how people recognise different landscape elements in remote sensing imagery and how various image characteristics affect perception.",
        note:     null,
      },
      {
        badge:    "02 / Task",
        title:    "How does the game work?",
        subtitle: "Your Task",
        body:     "Drag the displayed labels onto the matching areas in the satellite image. If an object is not present in the image, drop it into the bin. Please work as accurately as possible.",
        note:     null,
      },
      {
        badge:    "03 / Measurement",
        title:    "What is being measured?",
        subtitle: "Processing Time & Privacy",
        body:     "Your processing time is recorded during the task. Please work naturally – do not try to work especially fast or deliberately slow. We are interested in how people solve such tasks under normal conditions.",
        note:     "Participation is completely anonymous. No personal data is collected or stored. All data is used exclusively for scientific research purposes.",
      },
    ],

    overlay: [
      {
        title:  "The Labels",
        body:   "Here you find all objects you need to identify in the image. Drag a label with the mouse button held down onto the corresponding area in the image.",
        target: "labels",
      },
      {
        title:  "Not Present – the Bin",
        body:   "If an object is not visible in the image, drag its label into the bin in the bottom right.",
        target: "trash",
      },
      {
        title:  "The Magnifier",
        body:   "As you move your mouse over the image, a magnifying glass appears. It shows the area under the cursor enlarged and helps you place labels accurately.",
        target: "loupe",
      },
      {
        title:  "The Pin",
        body:   "When you pick up a label, a pin appears under the cursor. The tip of the pin shows the exact drop location – place it precisely in the correct area.",
        target: "pin",
      },
    ],

    practiceTitle:   "Your turn!",
    practiceBody:    "Mark the river in the image. Drag the label \"Fluss 🌊\" onto the area with the waterway.",
    practiceSuccess: "✓ Well done! You have understood the game mechanics.",
    practiceBtn:     "Continue to Experiment ›",
    nextBtn:  "Next ›",
    skipBtn:  "Skip tutorial",
    startBtn: "Start Experiment ›",
  },
};

// ── State ────────────────────────────────────────────────────────────────────
let tutLang       = "de";
let tutInfoStep   = 0;
let tutOverStep   = 0;
let tutArrow      = null;
let tutSpotlight  = null;
let tutPracticeOk = false;

// ── Entry point (called from app.js instead of startExperiment) ──────────────
function startTutorial(){
  // Hide start screen first
  const ss = document.getElementById('start-screen');
  if(ss){
    ss.classList.add('hidden');
    setTimeout(()=>{
      ss.remove();
      showLangScreen();
    }, 420);
  } else {
    showLangScreen();
  }
}

// ── 1. Language selection ────────────────────────────────────────────────────
function showLangScreen(){
  const el = document.getElementById('lang-screen');
  if(el){
    el.style.display = 'flex';
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    requestAnimationFrame(()=>{ el.style.opacity = '1'; });
  }
}

function selectLang(lang){
  tutLang = lang;
  const el = document.getElementById('lang-screen');
  if(el){ el.classList.add('tut-fade-out'); setTimeout(()=>el.remove(), 400); }
  setTimeout(()=> showInfoScreen(0), 420);
}

// ── 2. Info screens ───────────────────────────────────────────────────────────
function showInfoScreen(step){
  tutInfoStep = step;
  const texts = TUT_TEXTS[tutLang];
  const info  = texts.info;
  const s     = info[step];
  const screen = document.getElementById('tutorial-info-screen');
  screen.classList.add('active');

  screen.innerHTML = `
    <div class="tut-info-panel">
      <div class="tut-step-badge">${s.badge}</div>
      <h2>${s.title}</h2>
      <div class="tut-subtitle">${s.subtitle}</div>
      <p>${s.body}</p>
      ${s.note ? `<div class="tut-note">${s.note}</div>` : ''}
      <div class="tut-progress">
        ${info.map((_,i)=>`<div class="tut-progress-dot${i===step?' active':''}"></div>`).join('')}
      </div>
      <div class="tut-btn-row">
        <button class="tut-btn-skip" onclick="skipTutorial()">${texts.skipBtn}</button>
        <button class="tut-btn" onclick="nextInfoScreen()">
          ${step < info.length-1 ? texts.nextBtn : texts.nextBtn}
        </button>
      </div>
    </div>`;
}

function nextInfoScreen(){
  const texts = TUT_TEXTS[tutLang];
  if(tutInfoStep < texts.info.length - 1){
    showInfoScreen(tutInfoStep + 1);
  } else {
    // Move to overlay tutorial
    const screen = document.getElementById('tutorial-info-screen');
    screen.classList.remove('active');
    startOverlayTutorial();
  }
}

// ── 3. Overlay tutorial ───────────────────────────────────────────────────────
async function startOverlayTutorial(){
  // Load B1 (tutorial image) into the stage without starting the timer
  await loadLevelSilent(0);
  showOverlayStep(0);
}

function showOverlayStep(step){
  tutOverStep = step;
  const texts = TUT_TEXTS[tutLang];
  const steps = texts.overlay;
  const s     = steps[step];

  const overlay = document.getElementById('tutorial-overlay');
  overlay.classList.add('active');

  // Remove old arrow + spotlight
  if(tutArrow)     { tutArrow.remove();     tutArrow = null; }
  if(tutSpotlight) { tutSpotlight.remove(); tutSpotlight = null; }

  // Get target element position
  const target = getTutorialTarget(s.target);

  // Create spotlight
  if(target){
    tutSpotlight = document.createElement('div');
    tutSpotlight.className = 'tut-spotlight';
    positionSpotlight(tutSpotlight, target);
    overlay.appendChild(tutSpotlight);
  }

  // Create blinking arrow
  if(target){
    tutArrow = document.createElement('div');
    tutArrow.className = 'tut-arrow';
    tutArrow.innerHTML = `
      <svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
        <polygon points="18,2 34,34 18,26 2,34" fill="#fdc300" stroke="#0a3f70" stroke-width="2"/>
      </svg>`;
    positionArrow(tutArrow, target);
    overlay.appendChild(tutArrow);
  }

  // Position tooltip
  const tooltip = document.getElementById('tut-tooltip');
  tooltip.innerHTML = `
    <h3>${s.title}</h3>
    <p>${s.body}</p>
    <div class="tut-btn-row">
      <button class="tut-btn-skip" onclick="skipTutorial()">${texts.skipBtn}</button>
      <button class="tut-btn" onclick="nextOverlayStep()">
        ${step < steps.length-1 ? texts.nextBtn : texts.nextBtn}
      </button>
    </div>`;
  positionTooltip(tooltip, target);
}

function nextOverlayStep(){
  const texts = TUT_TEXTS[tutLang];
  if(tutOverStep < texts.overlay.length - 1){
    showOverlayStep(tutOverStep + 1);
  } else {
    // Move to practice round
    startPracticeRound();
  }
}

// ── 4. Practice round ─────────────────────────────────────────────────────────
function startPracticeRound(){
  const texts   = TUT_TEXTS[tutLang];
  const overlay = document.getElementById('tutorial-overlay');

  // Remove arrow + spotlight
  if(tutArrow)     { tutArrow.remove();     tutArrow = null; }
  if(tutSpotlight) { tutSpotlight.remove(); tutSpotlight = null; }

  // Update tooltip to practice instructions
  const tooltip = document.getElementById('tut-tooltip');
  tooltip.innerHTML = `
    <h3>${texts.practiceTitle}</h3>
    <p>${texts.practiceBody}</p>`;
  positionTooltipCenter(tooltip);

  // Show practice banner
  const banner = document.getElementById('tut-practice-banner');
  banner.textContent = tutLang === 'de'
    ? '🎯  ÜBUNGSRUNDE – Zeit läuft nicht'
    : '🎯  PRACTICE ROUND – Timer not running';
  banner.classList.add('active');

  // Enable drag but intercept drop: only accept "Fluss" as correct
  tutPracticeOk = false;
  window._tutPracticeActive = true;
}

// Called from app.js handleStageDrop when tutorial practice is active
function tutPracticeCheck(droppedId, hitKlasse){
  if(!window._tutPracticeActive) return false;
  const texts = TUT_TEXTS[tutLang];

  if(droppedId === 'Fluss' && hitKlasse === 'Fluss'){
    tutPracticeOk = true;
    window._tutPracticeActive = false;

    // Show success
    const msg = document.getElementById('tut-success-msg');
    msg.textContent = texts.practiceSuccess;
    msg.style.display = 'block';

    // Update tooltip with "continue" button
    const tooltip = document.getElementById('tut-tooltip');
    tooltip.innerHTML = `
      <h3>${texts.practiceSuccess}</h3>
      <p></p>
      <div class="tut-btn-row">
        <button class="tut-btn" onclick="finishTutorial()">${texts.practiceBtn}</button>
      </div>`;
    positionTooltipCenter(tooltip);

    return true;  // consumed by tutorial
  } else if(droppedId !== 'Fluss'){
    // Wrong label – give hint
    const tooltip = document.getElementById('tut-tooltip');
    const hint = tutLang === 'de'
      ? 'Versuche es mit dem Label „Fluss 🌊".'
      : 'Try using the label "Fluss 🌊".';
    tooltip.querySelector('p').textContent = hint;
    return true;  // consumed – don't count as game error
  }
  return false;
}

// ── 5. Finish tutorial ────────────────────────────────────────────────────────
function finishTutorial(){
  // Hide all tutorial elements
  document.getElementById('tutorial-overlay').classList.remove('active');
  document.getElementById('tut-practice-banner').classList.remove('active');
  document.getElementById('tut-success-msg').style.display = 'none';
  window._tutPracticeActive = false;

  // Start actual experiment from level 1 (skip B1 = index 0)
  ensureMouseEvents();
  loadLevel(1);   // B1 was tutorial, real game starts at B2
}

function skipTutorial(){
  document.getElementById('tutorial-info-screen').classList.remove('active');
  document.getElementById('tutorial-overlay').classList.remove('active');
  document.getElementById('tut-practice-banner').classList.remove('active');
  window._tutPracticeActive = false;
  ensureMouseEvents();
  loadLevel(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Load a level without starting the timer (for tutorial)
async function loadLevelSilent(i){
  const lv = CONFIG.levels[i];
  const stage = document.getElementById('stage');

  // Load satellite image
  await new Promise(resolve=>{
    const img = document.getElementById('sat-img');
    img.onload = img.onerror = resolve;
    img.src = lv.imgSrc;
  });

  // Load GeoJSON for practice hit-test
  try{
    const res  = await fetch(lv.geojsonSrc);
    const gj   = await res.json();
    buildZones(gj, lv.bounds);
  }catch(e){ console.warn('Tutorial GeoJSON:', e); }

  // Render labels (needed for drag)
  renderLabels(lv);
}

function getTutorialTarget(name){
  switch(name){
    case 'labels': return document.getElementById('label-bar');
    case 'trash':  return document.getElementById('trash');
    case 'loupe':  return document.getElementById('loupe');
    case 'pin':    return document.getElementById('pin');
    default:       return null;
  }
}

function positionSpotlight(el, target){
  const r   = target.getBoundingClientRect();
  const pad = 8;
  el.style.position = 'fixed';
  el.style.left   = (r.left   - pad) + 'px';
  el.style.top    = (r.top    - pad) + 'px';
  el.style.width  = (r.width  + pad*2) + 'px';
  el.style.height = (r.height + pad*2) + 'px';
  document.getElementById('tutorial-overlay').appendChild(el);
}

function positionArrow(el, target){
  const r = target.getBoundingClientRect();
  el.style.position = 'fixed';
  // Point arrow at top-centre of target
  el.style.left = (r.left + r.width/2) + 'px';
  el.style.top  = (r.top - 44) + 'px';
  // Rotate arrow to point downward
  el.style.transform = 'translate(-50%,-50%) rotate(180deg)';
  document.getElementById('tutorial-overlay').appendChild(el);
}

function positionTooltip(tooltip, target){
  if(!target){ positionTooltipCenter(tooltip); return; }
  const r  = target.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  tooltip.style.position = 'fixed';

  // Try to place above target
  let top  = r.top - 20 - tooltip.offsetHeight;
  let left = r.left + r.width/2 - tooltip.offsetWidth/2;

  // If above viewport, place below
  if(top < 10) top = r.bottom + 20;
  // Clamp horizontally
  left = Math.max(10, Math.min(vw - tooltip.offsetWidth - 10, left));
  top  = Math.max(10, Math.min(vh - tooltip.offsetHeight - 10, top));

  tooltip.style.top  = top + 'px';
  tooltip.style.left = left + 'px';
}

function positionTooltipCenter(tooltip){
  tooltip.style.position = 'fixed';
  tooltip.style.top      = '50%';
  tooltip.style.left     = '50%';
  tooltip.style.transform= 'translate(-50%,-50%)';
}
