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
        body:     'Während der Bearbeitung werden Zeit und Fehlversuche gemessen. Bitte bearbeite die Aufgaben ganz natürlich – versuche weder besonders schnell noch absichtlich langsam zu arbeiten. Uns interessiert, wie Menschen solche Aufgaben unter normalen Bedingungen lösen. Am Ende siehst du deine Zeit im Vergleich zu anderen sowie eine Bestenliste – dort zählt nicht nur Geschwindigkeit, sondern auch Genauigkeit: Durchläufe mit mehr als 5 Fehlern erscheinen nicht in der Bestenliste.',
        note:     'Die Teilnahme erfolgt anonym: Vor dem ersten Spielen werden einmalig ein paar demografische Angaben erhoben (z. B. Alter, Bildungsabschluss), die sich nicht auf Ihre Identität zurückführen lassen. Namen, Adressen oder E-Mail-Adressen werden nicht erfasst. Die Daten dienen wissenschaftlichen Zwecken; Gesamtzeit und Alias werden zusätzlich in der Bestenliste für andere Teilnehmende sichtbar.',
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
    practiceBody:    'Markiere das Wasser auf dem Bild. Ziehe das Label "Wasser" auf einen See oder Fluss.',
    practiceWrong:   'Versuche es mit dem Label "Wasser".',
    practiceSuccess: 'Sehr gut! Du hast die Spielmechanik verstanden.',
    practiceBtn:     'Weiter zum Experiment',
    nextBtn:         'Weiter',
    skipBtn:         'Tutorial überspringen',
    practiceHint:    'ÜBUNGSRUNDE – Zeit läuft nicht',
    consentTitle:    'Bevor Sie teilnehmen',
    consentBody:     'Diese Studie wird im Rahmen einer Promotion an der Pädagogischen Hochschule Heidelberg (Research Group for Earth Observation, rgeo) durchgeführt. Die Teilnahme ist freiwillig und kann jederzeit ohne Angabe von Gründen und ohne Nachteile abgebrochen werden.',
    consentBody2:    'Erhoben werden: Ihre Angaben aus dem folgenden kurzen Fragebogen (nur beim ersten Spielen), Ihre Interaktionen während des Spiels (u. a. abgelegte Objekte, Zeiten, Fehlversuche) sowie technische Geräte-/Browserdaten. Es werden keine Namen, Adressen, E-Mail-Adressen, IP-Adressen oder Standortdaten erfasst; ein zufällig erzeugter, nicht auf Sie zurückführbarer Kennwert dient lediglich dazu, Ihre Angaben über mehrere Durchläufe hinweg derselben Person zuzuordnen. Zusätzlich werden Ihre Gesamtzeit sowie ein von Ihnen gewählter Alias (ersatzweise der genannte anonyme Kennwert) am Ende des Spiels in einer Bestenliste angezeigt, die für andere Teilnehmende sichtbar ist – bitte wählen Sie einen Alias, der keine Rückschlüsse auf Ihre Identität zulässt; ein selbst gewählter Alias kann je nach Formulierung theoretisch dennoch Rückschlüsse ermöglichen, wofür wir keine Verantwortung übernehmen können. Alle übrigen Angaben werden ausschließlich in einer Google-Tabelle gespeichert, die nur der Studienleitung zugänglich ist (Details siehe Datenschutzerklärung).',
    consentCheckbox: 'Ich habe die Hinweise gelesen und stimme der Verarbeitung meiner Angaben wie beschrieben zu.',
    consentContinue: 'Weiter',
    formTitle:       'Ein paar Angaben zu Ihnen',
    formIntro:       'Diese Angaben helfen bei der Auswertung der Studie. Sie erscheinen nur beim allerersten Spielen – bei erneutem Spielen auf diesem Gerät werden sie nicht noch einmal abgefragt.',
    formAlter:       'Alter',
    formBildung:     'Höchster Bildungs-/akademischer Abschluss',
    formStudienfach: 'Studienfach (falls zutreffend)',
    formGis:         'Vorerfahrung mit Kartenlesen / GIS / Fernerkundung',
    formGeschlecht:  'Geschlecht',
    formGeraet:      'Womit nehmen Sie teil?',
    formAlias:       'Alias für die Bestenliste (optional, für andere sichtbar)',
    formAliasPlaceholder: 'z. B. Spitzname – ohne Angabe wird Ihr anonymer Kennwert genutzt',
    formOptionLeer:  'Keine Angabe',
    formContinue:    'Weiter zum Tutorial',
    formBildungOptions: ['Hauptschulabschluss','Realschulabschluss','Abitur/Fachabitur','Berufsausbildung','Bachelor','Master/Diplom/Magister','Promotion'],
    formGisOptions: ['Keine Erfahrung','Grundkenntnisse','Fortgeschritten','Experte'],
    formGeschlechtOptions: ['Männlich','Weiblich','Divers'],
    formGeraetOptions: ['Computer/Laptop','Tablet','Handy'],
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
        body:     'Your time and mistakes are recorded during the task. Please work naturally – do not try to work especially fast or deliberately slow. We are interested in how people solve such tasks under normal conditions. At the end you\'ll see your time compared to others and a leaderboard – accuracy counts there too, not just speed: runs with more than 5 mistakes don\'t appear in the leaderboard.',
        note:     'Participation is anonymous: before your first play, a few demographic details are collected once (e.g. age, educational background) that cannot be traced back to your identity. No names, addresses, or e-mail addresses are collected. Data is used for scientific purposes; total time and alias are additionally shown to other participants in the leaderboard.',
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
    practiceBody:    'Mark the water in the image. Drag the label "Wasser" onto a lake or river.',
    practiceWrong:   'Try the label "Wasser".',
    practiceSuccess: 'Well done! You have understood the game mechanics.',
    practiceBtn:     'Continue to Experiment',
    nextBtn:         'Next',
    skipBtn:         'Skip tutorial',
    practiceHint:    'PRACTICE ROUND – Timer not running',
    consentTitle:    'Before you participate',
    consentBody:     'This study is conducted as part of a doctoral thesis at Heidelberg University of Education (Research Group for Earth Observation, rgeo). Participation is voluntary and can be discontinued at any time without giving reasons and without any disadvantages.',
    consentBody2:    'The following is collected: your answers from the short questionnaire below (only the first time you play), your interactions during the game (e.g. objects placed, timings, incorrect attempts), and technical device/browser data. No names, addresses, e-mail addresses, IP addresses or location data are collected; a randomly generated identifier that cannot be traced back to you is used only to link your data across multiple play sessions. Your total time and a self-chosen alias (or, failing that, the anonymous identifier mentioned above) will additionally be shown in a leaderboard visible to other participants at the end of the game – please choose an alias that does not allow conclusions about your identity; depending on how it is phrased, a self-chosen alias could theoretically still allow this, and we cannot take responsibility for that. All other data is stored exclusively in a Google spreadsheet accessible only to the study lead (see privacy policy for details).',
    consentCheckbox: 'I have read the information above and agree to the processing of my data as described.',
    consentContinue: 'Continue',
    formTitle:       'A few questions about you',
    formIntro:       'These details help with the analysis of the study. They only appear the very first time you play – on repeat plays on this device you will not be asked again.',
    formAlter:       'Age',
    formBildung:     'Highest educational / academic qualification',
    formStudienfach: 'Field of study (if applicable)',
    formGis:         'Prior experience with map reading / GIS / remote sensing',
    formGeschlecht:  'Gender',
    formGeraet:      'What are you using to participate?',
    formAlias:       'Alias for the leaderboard (optional, visible to others)',
    formAliasPlaceholder: 'e.g. a nickname – if left blank, your anonymous identifier is used',
    formOptionLeer:  'Prefer not to say',
    formContinue:    'Continue to tutorial',
    formBildungOptions: ['Lower secondary school','Secondary school','High school diploma / A-levels','Vocational training','Bachelor\'s degree','Master\'s / Diplom / Magister','Doctorate'],
    formGisOptions: ['No experience','Basic knowledge','Advanced','Expert'],
    formGeschlechtOptions: ['Male','Female','Non-binary'],
    formGeraetOptions: ['Computer/Laptop','Tablet','Phone'],
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
    showConsentScreen();
  }
}

// ── 2b. Einwilligung ──────────────────────────────────────────────────────────
function showConsentScreen() {
  var texts = TUT_TEXTS[tutLang];
  var screen = document.getElementById('tutorial-info-screen');
  screen.classList.add('active');
  screen.innerHTML =
    '<div class="tut-info-panel">' +
      '<h2>' + texts.consentTitle + '</h2>' +
      '<p>' + texts.consentBody + '</p>' +
      '<p>' + texts.consentBody2 + ' <a href="#" id="consent-datenschutz-link" onclick="openLegalModal(\'datenschutz\');return false;">' +
        (tutLang === 'de' ? 'Datenschutzerklärung' : 'privacy policy') + '</a></p>' +
      '<label class="tut-consent-label">' +
        '<input type="checkbox" id="tut-consent-checkbox" onchange="onConsentCheckboxChange()">' +
        ' ' + texts.consentCheckbox +
      '</label>' +
      '<div class="tut-btn-row">' +
        '<button class="tut-btn" id="tut-consent-continue-btn" disabled onclick="onConsentContinue()">' + texts.consentContinue + '</button>' +
      '</div>' +
    '</div>';
}

function onConsentCheckboxChange() {
  var cb  = document.getElementById('tut-consent-checkbox');
  var btn = document.getElementById('tut-consent-continue-btn');
  btn.disabled = !cb.checked;
}

function onConsentContinue() {
  document.getElementById('tutorial-info-screen').classList.remove('active');
  // Muss VOR submitLaufStart() geprüft werden: submitLaufStart() ruft
  // getParticipantId() auf, was bei allerersten Besuch den participant_id
  // in localStorage anlegt – danach würde isFirstEverVisit() faelschlich
  // "nicht mehr der erste Besuch" liefern und das Formular überspringen.
  var firstVisit = isFirstEverVisit();
  // Neuer Durchlauf beginnt hier (auch bei Wiederholungsspielern) – siehe
  // Q8/Q2: robust gegen Abbruch, jeder Versuch ab hier zählt als eigener
  // lauf_id/durchlauf_nr, unabhängig davon, ob das Formular noch folgt.
  newRunToken();
  submitLaufStart();
  if (firstVisit) {
    showPersonFormScreen();
  } else {
    startOverlayTutorial();
  }
}

// ── 2c. Personendaten-Formular (nur beim allerersten Durchlauf) ──────────────
function showPersonFormScreen() {
  var texts = TUT_TEXTS[tutLang];
  var screen = document.getElementById('tutorial-info-screen');
  screen.classList.add('active');

  function opts(list) {
    var html = '<option value="">' + texts.formOptionLeer + '</option>';
    list.forEach(function (o) { html += '<option value="' + o + '">' + o + '</option>'; });
    return html;
  }

  screen.innerHTML =
    '<div class="tut-info-panel">' +
      '<h2>' + texts.formTitle + '</h2>' +
      '<p>' + texts.formIntro + '</p>' +
      '<div class="tut-form-row"><label>' + texts.formAlter + '</label>' +
        '<input type="number" id="pf-alter" min="0" max="120"></div>' +
      '<div class="tut-form-row"><label>' + texts.formBildung + '</label>' +
        '<select id="pf-bildung">' + opts(texts.formBildungOptions) + '</select></div>' +
      '<div class="tut-form-row"><label>' + texts.formStudienfach + '</label>' +
        '<input type="text" id="pf-studienfach"></div>' +
      '<div class="tut-form-row"><label>' + texts.formGis + '</label>' +
        '<select id="pf-gis">' + opts(texts.formGisOptions) + '</select></div>' +
      '<div class="tut-form-row"><label>' + texts.formGeschlecht + '</label>' +
        '<select id="pf-geschlecht">' + opts(texts.formGeschlechtOptions) + '</select></div>' +
      '<div class="tut-form-row"><label>' + texts.formGeraet + '</label>' +
        '<select id="pf-geraet">' + opts(texts.formGeraetOptions) + '</select></div>' +
      '<div class="tut-form-row"><label>' + texts.formAlias + '</label>' +
        '<input type="text" id="pf-alias" placeholder="' + texts.formAliasPlaceholder + '" maxlength="40"></div>' +
      '<div class="tut-btn-row">' +
        '<button class="tut-btn" onclick="onPersonFormContinue()">' + texts.formContinue + '</button>' +
      '</div>' +
    '</div>';
}

function onPersonFormContinue() {
  submitPersonData({
    alter: document.getElementById('pf-alter').value,
    bildungsabschluss: document.getElementById('pf-bildung').value,
    studienfach: document.getElementById('pf-studienfach').value,
    gisErfahrung: document.getElementById('pf-gis').value,
    geschlecht: document.getElementById('pf-geschlecht').value,
    geraet: document.getElementById('pf-geraet').value,
    alias: document.getElementById('pf-alias').value.trim(),
  });
  document.getElementById('tutorial-info-screen').classList.remove('active');
  startOverlayTutorial();
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

  // Mouse events must be active so drag works during practice
  ensureMouseEvents();

  // Hide overlay but keep a non-blocking veil for dimming
  var overlay = document.getElementById('tutorial-overlay');
  overlay.classList.remove('active');
  overlay.style.display = 'none';

  // Move tooltip and banner to body so they appear above the image
  var tip    = document.getElementById('tut-tooltip');
  var banner = document.getElementById('tut-practice-banner');
  document.body.appendChild(tip);
  document.body.appendChild(banner);
  tip.style.zIndex    = '3200';
  banner.style.zIndex = '3200';
  // Position banner below tooltip – will be recalculated after tooltip renders
  setTimeout(function() {
    var tipH = tip.offsetHeight || 120;
    banner.style.position  = 'fixed';
    banner.style.top       = (28 + tipH + 10) + 'px';
    banner.style.left      = '50%';
    banner.style.transform = 'translateX(-50%)';
  }, 50);

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

// Called from app.js handleStageDrop when practice is active.
// hitKlassen is the full Set of zones hit at the drop point (zones can
// overlap slightly), not just a single "first" class.
function tutPracticeCheck(droppedId, hitKlassen) {
  if (!window._tutPracticeActive) { return false; }
  var texts = TUT_TEXTS[tutLang];

  if (droppedId === 'Wasser' && hitKlassen.has('Wasser')) {
    window._tutPracticeActive = false;
    markChipUsed(droppedId);

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

  if (droppedId !== 'Wasser') {
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
  // Move tooltip and banner back into overlay (cleanup)
  var overlay = document.getElementById('tutorial-overlay');
  var tip     = document.getElementById('tut-tooltip');
  var banner  = document.getElementById('tut-practice-banner');
  if (tip    && tip.parentNode    !== overlay) { overlay.appendChild(tip); }
  if (banner && banner.parentNode !== overlay) { overlay.appendChild(banner); }
  overlay.style.display = '';
  overlay.classList.remove('active');
  banner.classList.remove('active');
  var msg = document.getElementById('tut-success-msg');
  if (msg) { msg.style.display = 'none'; }
  window._tutPracticeActive = false;
  ensureMouseEvents();
  startShuffledExperiment();
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
  startShuffledExperiment();
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