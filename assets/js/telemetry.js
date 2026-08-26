/**
 * telemetry.js – EO Visual Complexity Experiment
 * ─────────────────────────────────────────────
 * Alles rund um Teilnehmer-Identitaet und die Uebertragung an das
 * Google-Apps-Script-Backend (siehe apps-script/Code.gs). Geladen VOR
 * app.js/tutorial.js, da beide Funktionen von hier aufrufen.
 *
 * Konzept (siehe Code.gs fuer die Server-Seite):
 *   participant_id – geraete-/browserstabil (localStorage), ueberlebt
 *                    mehrere Durchlaeufe derselben Person.
 *   runToken       – neu bei jedem frischen Durchlauf (nur im Speicher,
 *                    nicht persistiert), wird serverseitig zu einer
 *                    fortlaufenden lauf_id + durchlauf_nr aufgeloest.
 *
 * Uebertragen wird per fetch(..., {mode:'no-cors'}) – die Antwort ist damit
 * nicht lesbar, das ist bewusst so (siehe TIER-List-Vorbild): der Client
 * braucht keine Bestaetigung, ein fehlgeschlagener Request soll das Spiel
 * nicht blockieren.
 */

// TRAGE HIER die Web-App-URL ein, die beim Deployment von apps-script/Code.gs
// ausgegeben wird (Bereitstellen -> Web-App -> URL kopieren). Siehe README.md.
const SUBMIT_URL = "https://script.google.com/macros/s/AKfycbydDqFT3-vS0V7j41QcJEONnzzPsAtGTRLeJIyhF7tRcW74Xhx1cYo8u2K_aMJR_O9heQ/exec";
// Muss exakt mit SUBMIT_TOKEN in apps-script/Code.gs uebereinstimmen.
const SUBMIT_TOKEN = "gg_5f2a9c14e8b6d0317f4a2c9e6b8d1053";

const LS_PARTICIPANT_ID = "geogame_participant_id";

// ── Testmodus (geheim, per Taste T + Passwort) ────────────────
// Unterdrueckt jede Uebertragung ans Backend, damit QA-/Testlaeufe nicht in
// der echten Tabelle landen. Bewusst NICHT persistent (kein localStorage-Flag
// fuer den Modus selbst) und mit einer frischen, rein speicherresidenten
// Test-Identitaet pro Aktivierung, damit auch der Erstbesuch-Ablauf
// (Formular/Tutorial) beliebig oft wiederholt getestet werden kann, ohne den
// echten geraeteweiten participant_id-Zustand zu beruehren. Das ist keine
// echte Sicherheitsmassnahme (Client-JS, per DevTools auslesbar) - nur ein
// Schutz gegen versehentliches Ausloesen durch normale Spieler.
const TEST_MODE_PASSWORD = "Claudius";
let _testModeActive = false;
let _testParticipantId = null;
let _testModeBannerEl = null;

function isTestModeActive(){
  return _testModeActive;
}

function showTestModeBanner_(){
  if(!_testModeBannerEl){
    _testModeBannerEl = document.createElement('div');
    _testModeBannerEl.textContent = 'TESTMODUS';
    Object.assign(_testModeBannerEl.style, {
      position: 'fixed', top: '8px', right: '8px', zIndex: 99999,
      background: '#b71918', color: '#fff', fontFamily: "'Segoe UI', sans-serif",
      fontWeight: '700', fontSize: '11px', letterSpacing: '.08em',
      padding: '4px 10px', borderRadius: '4px', boxShadow: '0 1px 4px rgba(0,0,0,.3)',
      pointerEvents: 'none',
    });
    document.body.appendChild(_testModeBannerEl);
  }
  _testModeBannerEl.style.display = 'block';
}
function hideTestModeBanner_(){
  if(_testModeBannerEl) _testModeBannerEl.style.display = 'none';
}

function toggleTestMode(){
  if(_testModeActive){
    _testModeActive = false;
    _testParticipantId = null;
    hideTestModeBanner_();
    return;
  }
  const input = window.prompt('Passwort:');
  if(input === TEST_MODE_PASSWORD){
    _testModeActive = true;
    _testParticipantId = 'test_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
    showTestModeBanner_();
  }
  // falsches Passwort: keine sichtbare Reaktion
}

// ── Teilnehmer-Identitaet ────────────────────────────────────
function getParticipantId(){
  if(_testModeActive) return _testParticipantId;
  let id = localStorage.getItem(LS_PARTICIPANT_ID);
  if(!id){
    id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,10);
    localStorage.setItem(LS_PARTICIPANT_ID, id);
  }
  return id;
}
function isFirstEverVisit(){
  if(_testModeActive) return true;
  return localStorage.getItem(LS_PARTICIPANT_ID) === null;
}

let _runToken = null;
function newRunToken(){
  _runToken = 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,10);
  return _runToken;
}

// ── Geraete-/Browser-Metadaten (siehe Datenschutzerklaerung: bewusst OHNE
//    IP-Adresse, Geolocation oder fingerprinting-artige Merkmale wie
//    Font-/Plugin-Listen) ─────────────────────────────────────
function collectDeviceMetadata(){
  let pageLoadMs = null;
  try{
    const nav = performance.getEntriesByType('navigation')[0];
    if(nav) pageLoadMs = Math.round(nav.loadEventEnd - nav.startTime);
  }catch(e){/* ignore */}

  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  return {
    userAgent: navigator.userAgent,
    screenWidth: screen.width,
    screenHeight: screen.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    inputType: isTouch ? 'touch' : 'maus',
    pageLoadMs: pageLoadMs,
  };
}

// ── Low-level Uebertragung ───────────────────────────────────
function sendToBackend_(payload){
  if(_testModeActive){
    console.log('[TESTMODUS] Übertragung unterdrückt:', payload);
    return;
  }
  if(!SUBMIT_URL || SUBMIT_URL.indexOf('TRAGE_HIER') === 0){
    console.warn('[telemetry] SUBMIT_URL noch nicht konfiguriert – Payload nur geloggt:', payload);
    return;
  }
  payload.authToken = SUBMIT_TOKEN;
  payload.timestampClient = new Date().toISOString();
  fetch(SUBMIT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' }, // vermeidet CORS-Preflight (siehe TIER-List-Erfahrung)
    body: JSON.stringify(payload),
  }).catch(err => console.warn('[telemetry] Uebertragung fehlgeschlagen:', err));
}

// ── Oeffentliche Sende-Funktionen ────────────────────────────
function submitPersonData(fields){
  sendToBackend_({
    type: 'person',
    participantId: getParticipantId(),
    alter: fields.alter,
    bildungsabschluss: fields.bildungsabschluss,
    studienfach: fields.studienfach,
    gisErfahrung: fields.gisErfahrung,
    geschlecht: fields.geschlecht,
    geraet: fields.geraet,
  });
}

function submitLaufStart(){
  const meta = collectDeviceMetadata();
  sendToBackend_(Object.assign({
    type: 'lauf',
    participantId: getParticipantId(),
    runToken: _runToken,
  }, meta));
}

function submitLevelResult(levelPayload){
  sendToBackend_(Object.assign({
    type: 'level',
    participantId: getParticipantId(),
    runToken: _runToken,
  }, levelPayload));
}

// status: 'ja' | 'nein'. markedImages: [{level, name}, ...] (leer bei 'nein').
function submitFamiliarity(status, markedImages){
  sendToBackend_({
    type: 'familiarity',
    participantId: getParticipantId(),
    runToken: _runToken,
    status: status,
    markedImages: markedImages || [],
  });
}

// answers: {konzentration, ort, ablenkung, wachheit} (siehe POST_SURVEY_LIKERT_QUESTIONS
// in app.js) - Platzhalter-Fragen, austauschbar gegen literaturbasierte Items.
function submitPostSurvey(answers){
  sendToBackend_(Object.assign({
    type: 'post_survey',
    participantId: getParticipantId(),
    runToken: _runToken,
  }, answers));
}

function submitFeedback(feedbackText){
  sendToBackend_({
    type: 'feedback',
    participantId: getParticipantId(),
    runToken: _runToken,
    feedbackText: feedbackText,
  });
}
