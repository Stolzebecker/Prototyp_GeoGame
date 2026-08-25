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

// ── Teilnehmer-Identitaet ────────────────────────────────────
function getParticipantId(){
  let id = localStorage.getItem(LS_PARTICIPANT_ID);
  if(!id){
    id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,10);
    localStorage.setItem(LS_PARTICIPANT_ID, id);
  }
  return id;
}
function isFirstEverVisit(){
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
