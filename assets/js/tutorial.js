/**
 * tutorial.js – EO Visual Complexity Experiment
 * Tutorial flow: Language → Info screens → Overlay → Practice → Experiment
 */

/* global CONFIG, buildZones, renderLabels, ensureMouseEvents, loadLevel */

// ── Texts ─────────────────────────────────────────────────────────────────────
const TUT_TEXTS = {
  de: {
    info: [
      {
        badge:    '01 / Hintergrund',
        title:    'Warum gibt es dieses Spiel?',
        subtitle: 'Wissenschaftliche Studie',
        body:     'Dieses Spiel ist Teil einer wissenschaftlichen Studie zur visuellen Komplexität von Satelliten- und Drohnenbildern. Ziel ist es zu untersuchen, wie Menschen verschiedene Landschaftselemente in Fernerkundungsbildern erkennen und wie sich unterschiedliche Bildmerkmale auf die Wahrnehmung auswirken.',
        note:     null,
      },
      {
        badge:    '02 / Aufgabe',
        title:    'Wie funktioniert das Spiel?',
        subtitle: 'Deine Aufgabe',
        body:     'Ziehe die angezeigten Labels auf die passenden Stellen im Satellitenbild. Falls ein Objekt im Bild nicht vorhanden ist, lege es in den Papierkorb. Arbeite dabei so genau wie möglich.',
        note:     null,
      },
      {
        badge:    '03 / Messung',
        title:    'Was wird gemessen?',
        subtitle: 'Bearbeitungszeit & Datenschutz',
        body:     'Während der Bearbeitung wird die benötigte Zeit gemessen. Bitte bearbeite die Aufgaben ganz natürlich – versuche weder besonders schnell noch absichtlich langsam zu arbeiten. Uns interessiert, wie Menschen solche Aufgaben unter normalen Bedingungen lösen.',
        note:     'Die Teilnahme erfolgt anonym. Es werden keine personenbezogenen Daten erfasst oder gespeichert. Die Daten dienen ausschließlich wissenschaftlichen Zwecken.',
      },
    ],
    overlay: [
      {
        title:  'Die Labels',
        body:   'Hier findest du alle Objekte, die du auf dem Bild markieren sollst. Ziehe ein Label mit gedrückter Maustaste auf den entsprechenden Bereich im Bild.',
        target: 'labels',
      },
      {
        title:  'Nicht vorhanden – der Papierkorb',
        body:   'Ist ein Objekt auf dem Bild nicht sichtbar, ziehe das Label in den Papierkorb rechts unten.',
        target: 'trash',
      },
      {
        title:  'Die Lupe',
        body:   'Sobald du die Maus über das Bild bewegst, erscheint eine Lupe. Sie zeigt den Bereich unter dem Cursor vergrößert an und hilft dir bei der genauen Zuordnung.',
        target: 'loupe',
      },
      {
        title:  'Die Nadel',
        body:   'Wenn du ein Label aufgenommen hast, erscheint eine Nadel unter dem Cursor. Die Spitze der Nadel zeigt den exakten Ablageort an – platziere sie präzise im richtigen Bereich.',
        target: 'pin',
      },
    ],
    practiceTitle:   'Jetzt bist du dran!',
    practiceBody:    'Markiere den Fluss auf dem Bild. Ziehe das Label "Fluss" auf den Bereich mit dem Fließgewässer.',
    practiceWrong:   'Versuche es mit dem Label "Fluss".',
    practiceSuccess: 'Sehr gut! Du hast die Spielmechanik verstanden.',
    practiceBtn:     'Weiter zum Experiment',
    nextBtn:         'Weiter',
    skipBtn:         'Tutorial überspringen',
    practiceHint:    'ÜBUNGSRUNDE – Zeit läuft nicht',
  },
  en: {
    info: [
      {
        badge:    '01 / Background',
        title:    'Why does this game exist?',
        subtitle: 'Scientific Study',
        body:     'This game is part of a scientific study on the visual complexity of satellite and drone images. The goal is to investigate how people recognise different landscape elements in remote sensing imagery and how various image characteristics affect perception.',
        note:     null,
      },
      {
        badge:    '02 / Task',
        title:    'How does the game work?',
        subtitle: 'Your Task',
        body:     'Drag the displayed labels onto the matching areas in the satellite image. If an object is not present in the image, drop it into the bin. Please work as accurately as possible.',
        note:     null,
      },
      {
        badge:    '03 / Measurement',
        title:    'What is being measured?',
        subtitle: 'Processing Time & Privacy',
        body:     'Your processing time is recorded during the task. Please work naturally – do not try to work especially fast or deliberately slow. We are interested in how people solve such tasks under normal conditions.',
        note:     'Participation is completely anonymous. No personal data is collected or stored. All data is used exclusively for scientific research purposes.',
      },
    ],
    overlay: [
      {
        title:  'The Labels',
        body:   'Here you find all objects you need to identify in the image. Drag a label with the mouse button held down onto the corresponding area in the image.',
        target: 'labels',
      },
      {
        title:  'Not Present – the Bin',
        body:   'If an object is not visible in the image, drag its label into the bin in the bottom right.',
        target: 'trash',
      },
      {
        title:  'The Magnifier',
        body:   'As you move your mouse over the image, a magnifying glass appears. It shows the area under the cursor enlarged and helps you place labels accurately.',
        target: 'loupe',
      },
      {
        title:  'The Pin',
        body:   'When you pick up a label, a pin appears under the cursor. The tip of the pin shows the exact drop location – place it precisely in the correct area.',
        target: 'pin',
      },
    ],
    practiceTitle:   'Your turn!',
    practiceBody:    'Mark the river in the image. Drag the label "Fluss" onto the area with the waterway.',
    practiceWrong:   'Try the label "Fluss".',
    practiceSuccess: 'Well done! You have understood the game mechanics.',
    practiceBtn:     'Continue to Experiment',
    nextBtn:         'Next',
    skipBtn:         'Skip tutorial',
    practiceHint:    'PRACTICE ROUND – Timer not running',
  },
};

// ── State ─────────────────────────────────────────────────────────────────────
let tutLang      = 'de';
let tutInfoStep  = 0;
let tutOverStep  = 0;
let tutArrow     = null;
let tutSpotlight = null;

// ── Entry point ───────────────────────────────────────────────────────────────
function startTutorial() {
  const ss = document.getElementById('start-screen');
  if (ss) {
    ss.classList.add('hidden');
    setTimeout(function() { ss.remove(); showLangScreen(); }, 420);
  } else {
    showLangScreen();
  }
}

// ── 1. Language selection ─────────────────────────────────────────────────────
function showLangScreen() {
  const el = document.getElementById('lang-screen');
  if (el) {
    el.style.display    = 'flex';
    el.style.opacity    = '0';
    el.style.transition = 'opacity .3s';
    requestAnimationFrame(function() { el.style.opacity = '1'; });
  }
}

function selectLang(lang) {
  tutLang = lang;
  const el = document.getElementById('lang-screen');
  if (el) {
    el.style.opacity = '0';
    setTimeout(function() { el.remove(); showInfoScreen(0); }, 320);
  } else {
    showInfoScreen(0);
  }
}

// ── 2. Info screens ───────────────────────────────────────────────────────────
function showInfoScreen(step) {
  tutInfoStep  = step;
  var texts    = TUT_TEXTS[tutLang];
  var info     = texts.info;
  var s        = info[step];
  var screen   = document.getElementById('tutorial-info-screen');
  screen.classList.add('active');

  var dots = '';
  for (var i = 0; i < info.length; i++) {
    dots += '<div class="tut-progress-dot' + (i === step ? ' active' : '') + '"></div>';
  }

  screen.innerHTML =
    '<div class="tut-info-panel">' +
      '<div class="tut-step-badge">' + s.badge + '</div>' +
      '<h2>' + s.title + '</h2>' +
      '<div class="tut-subtitle">' + s.subtitle + '</div>' +
      '<p>' + s.body + '</p>' +
      (s.note ? '<div class="tut-note">' + s.note + '</div>' : '') +
      '<div class="tut-progress">' + dots + '</div>' +
      '<div class="tut-btn-row">' +
        '<button class="tut-btn-skip" onclick="skipTutorial()">' + texts.skipBtn + '</button>' +
        '<button class="tut-btn" onclick="nextInfoScreen()">' + texts.nextBtn + '</button>' +
      '</div>' +
    '</div>';
}

function nextInfoScreen() {
  var texts = TUT_TEXTS[tutLang];
  if (tutInfoStep < texts.info.length - 1) {
    showInfoScreen(tutInfoStep + 1);
  } else {
    document.getElementById('tutorial-info-screen').classList.remove('active');
    startOverlayTutorial();
  }
}

// ── 3. Overlay tutorial ───────────────────────────────────────────────────────
function startOverlayTutorial() {
  loadLevelSilent(0).then(function() {
    showOverlayStep(0);
  });
}

function showOverlayStep(step) {
  tutOverStep  = step;
  var texts    = TUT_TEXTS[tutLang];
  var steps    = texts.overlay;
  var s        = steps[step];
  var overlay  = document.getElementById('tutorial-overlay');
  overlay.classList.add('active');

  if (tutArrow)     { tutArrow.remove();     tutArrow = null; }
  if (tutSpotlight) { tutSpotlight.remove(); tutSpotlight = null; }

  var target = getTutorialTarget(s.target);

  if (target) {
    var r   = target.getBoundingClientRect();
    var pad = 8;

    tutSpotlight = document.createElement('div');
    tutSpotlight.className = 'tut-spotlight';
    tutSpotlight.style.position = 'fixed';
    tutSpotlight.style.left     = (r.left - pad) + 'px';
    tutSpotlight.style.top      = (r.top  - pad) + 'px';
    tutSpotlight.style.width    = (r.width  + pad * 2) + 'px';
    tutSpotlight.style.height   = (r.height + pad * 2) + 'px';
    overlay.appendChild(tutSpotlight);

    tutArrow = document.createElement('div');
    tutArrow.className = 'tut-arrow';
    tutArrow.innerHTML =
      '<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">' +
        '<polygon points="18,34 34,2 18,10 2,2" fill="#fdc300" stroke="#0a3f70" stroke-width="2"/>' +
      '</svg>';
    tutArrow.style.position  = 'fixed';
    tutArrow.style.left      = (r.left + r.width / 2) + 'px';
    tutArrow.style.top       = (r.top - 42) + 'px';
    tutArrow.style.transform = 'translate(-50%, 0)';
    overlay.appendChild(tutArrow);
  }

  var tooltip = document.getElementById('tut-tooltip');
  tooltip.style.transform = '';
  tooltip.innerHTML =
    '<h3>' + s.title + '</h3>' +
    '<p>' + s.body + '</p>' +
    '<div class="tut-btn-row">' +
      '<button class="tut-btn-skip" onclick="skipTutorial()">' + texts.skipBtn + '</button>' +
      '<button class="tut-btn" onclick="nextOverlayStep()">' + texts.nextBtn + '</button>' +
    '</div>';

  // Always place tooltip at top-center so it never overlaps the target element
  tooltip.style.position  = 'fixed';
  tooltip.style.top       = '80px';
  tooltip.style.left      = '50%';
  tooltip.style.transform = 'translateX(-50%)';
}

function nextOverlayStep() {
  var texts = TUT_TEXTS[tutLang];
  if (tutOverStep < texts.overlay.length - 1) {
    showOverlayStep(tutOverStep + 1);
  } else {
    startPracticeRound();
  }
}

// ── 4. Practice round ─────────────────────────────────────────────────────────
function startPracticeRound() {
  var texts = TUT_TEXTS[tutLang];
  if (tutArrow)     { tutArrow.remove();     tutArrow = null; }
  if (tutSpotlight) { tutSpotlight.remove(); tutSpotlight = null; }

  // Allow ALL mouse events to pass through overlay during practice
  // so user can drag labels from bottom bar onto the image
  var overlay = document.getElementById('tutorial-overlay');
  overlay.style.pointerEvents = 'none';
  var veil = document.getElementById('tut-veil');
  if (veil) { veil.style.pointerEvents = 'none'; }
  // Tooltip stays interactive (for the finish button)
  var tip = document.getElementById('tut-tooltip');
  tip.style.pointerEvents = 'all';

  var tooltip = document.getElementById('tut-tooltip');
  tooltip.innerHTML = '<h3>' + texts.practiceTitle + '</h3><p>' + texts.practiceBody + '</p>';
  tooltip.style.position  = 'fixed';
  tooltip.style.top       = '20px';
  tooltip.style.left      = '50%';
  tooltip.style.transform = 'translateX(-50%)';

  var banner = document.getElementById('tut-practice-banner');
  banner.textContent = texts.practiceHint;
  banner.classList.add('active');

  window._tutPracticeActive = true;

  // Show cursor during practice so user can see where they're dragging
  document.getElementById('stage').style.cursor = 'default';
}

// Called from app.js handleStageDrop when practice is active
function tutPracticeCheck(droppedId, hitKlasse) {
  if (!window._tutPracticeActive) { return false; }
  var texts = TUT_TEXTS[tutLang];

  if (droppedId === 'Fluss' && hitKlasse === 'Fluss') {
    window._tutPracticeActive = false;

    var msg = document.getElementById('tut-success-msg');
    msg.textContent  = texts.practiceSuccess;
    msg.style.display = 'block';

    var tooltip = document.getElementById('tut-tooltip');
    tooltip.innerHTML =
      '<h3>' + texts.practiceSuccess + '</h3>' +
      '<div class="tut-btn-row">' +
        '<button class="tut-btn" onclick="finishTutorial()">' + texts.practiceBtn + '</button>' +
      '</div>';
    return true;
  }

  if (droppedId !== 'Fluss') {
    var tooltip2 = document.getElementById('tut-tooltip');
    var p = tooltip2.querySelector('p');
    if (p) { p.textContent = texts.practiceWrong; }
    return true;
  }
  return false;
}

// ── 5. Finish ─────────────────────────────────────────────────────────────────
function finishTutorial() {
  document.getElementById('stage').style.cursor = 'none';
  document.getElementById('tutorial-overlay').classList.remove('active');
  document.getElementById('tut-practice-banner').classList.remove('active');
  var msg = document.getElementById('tut-success-msg');
  if (msg) { msg.style.display = 'none'; }
  window._tutPracticeActive = false;
  ensureMouseEvents();
  loadLevel(1);
}

function skipTutorial() {
  var screen  = document.getElementById('tutorial-info-screen');
  var overlay = document.getElementById('tutorial-overlay');
  var banner  = document.getElementById('tut-practice-banner');
  if (screen)  { screen.classList.remove('active'); }
  if (overlay) { overlay.classList.remove('active'); }
  if (banner)  { banner.classList.remove('active'); }
  window._tutPracticeActive = false;
  ensureMouseEvents();
  loadLevel(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadLevelSilent(i) {
  var lv = CONFIG.levels[i];
  return new Promise(function(resolve) {
    var img = document.getElementById('sat-img');
    img.onload = img.onerror = resolve;
    img.src = lv.imgSrc;
  }).then(function() {
    return fetch(lv.geojsonSrc);
  }).then(function(res) {
    return res.json();
  }).then(function(gj) {
    buildZones(gj, lv.bounds);
    renderLabels(lv);
  }).catch(function(e) {
    console.warn('Tutorial GeoJSON error:', e);
    renderLabels(lv);
  });
}

function getTutorialTarget(name) {
  if (name === 'labels') { return document.getElementById('label-bar'); }
  if (name === 'trash')  { return document.getElementById('trash'); }
  if (name === 'loupe')  { return document.getElementById('loupe'); }
  if (name === 'pin')    { return document.getElementById('pin'); }
  return null;
}