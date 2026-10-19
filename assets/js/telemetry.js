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
// Oeffentlicher Lese-Token nur fuer die Bestenliste (seit 2026-08-26) - muss
// exakt mit LEADERBOARD_TOKEN in apps-script/Code.gs uebereinstimmen. Anders
// als SUBMIT_TOKEN erlaubt dieser NUR das Lesen aggregierter/anonymer Werte,
// nie Rohdaten - siehe Code.gs-Kommentar.
const LEADERBOARD_TOKEN = "gg_board_71cf3e0a4d8b26f5913c6e0a8d4b2f17";

// ── App-Version (seit 2026-09-01) ──────────────────────────────
// Wird bei JEDER Uebertragung mitgeloggt (siehe sendToBackend_), unabhaengig
// vom Modus - falls sich durch die parallelen Interviews Anpassungsbedarf am
// Spiel zeigt, lassen sich frueh gesammelte Feld-Datensaetze so nach Version
// filtern/als Kovariate kontrollieren statt sie verwerfen zu muessen (siehe
// Memory project_paper1_pivot_no_tierlist). Von Hand hochzaehlen bei
// inhaltlich relevanten Aenderungen am Spiel, nicht bei jedem Commit.
const APP_VERSION = "antrag-v3";

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
let _testAlias = null;
let _testModeBannerEl = null;

function isTestModeActive(){
  return _testModeActive;
}

// Aktiv waehrend Testmodus ODER Interviewmodus: beide brauchen eine frische,
// rein speicherresidente Teilnehmer-Identitaet statt der echten
// geraeteweiten (siehe getParticipantId() etc. weiter unten) - sonst wuerde
// z.B. der zweite Interviewpartner auf demselben Laptop faelschlich als
// Wiederholungsbesuch des ersten erkannt (Formular/Tutorial uebersprungen).
function _usesEphemeralIdentity_(){
  return _testModeActive || _interviewModeActive;
}

function showTestModeBanner_(){
  if(!_testModeBannerEl){
    _testModeBannerEl = document.createElement('div');
    Object.assign(_testModeBannerEl.style, {
      position: 'fixed', top: '8px', right: '8px', zIndex: 99999,
      background: '#b71918', color: '#fff', fontFamily: "'Segoe UI', sans-serif",
      fontWeight: '700', fontSize: '11px', letterSpacing: '.08em',
      padding: '8px 12px', borderRadius: '4px', boxShadow: '0 1px 4px rgba(0,0,0,.3)',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px',
      pointerEvents: 'none',
    });
    const label = document.createElement('span');
    label.textContent = 'TESTMODUS';
    _testModeBannerEl.appendChild(label);

    // Checkbox schaltet auf Interviewmodus um (seit 2026-09-01, siehe Memory
    // project_paper1_pivot_no_tierlist) - deaktiviert dabei automatisch den
    // Testmodus, sonst wuerde weiterhin gar nichts uebertragen (Testmodus
    // unterdrueckt jede Uebertragung, siehe sendToBackend_). Eigene Zeile
    // (nicht wie TESTMODUS-Label inline) + grosszuegiges Label-Padding, damit
    // der Tap-Target auch auf Handy/Tablet real bedienbar ist - eine
    // ungestylte Checkbox allein waere mit ~13x13px weit unter dem sonst im
    // Projekt verwendeten ~44px-Ziel (siehe MOBILE_PLAN.md WP3), gerade weil
    // sie im schmalen rotierten Banner am Bildschirmrand sitzt (per
    // Browser-Pane-Mobilemulation + getBoundingClientRect() verifiziert,
    // bevor dieser Fix kam). Klick/Tap auf das gesamte Label (nicht nur das
    // kleine Kaestchen) loest dank <label>-Wrapping bereits nativ aus.
    const cbLabel = document.createElement('label');
    Object.assign(cbLabel.style, {
      display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '400',
      letterSpacing: 'normal', textTransform: 'none', cursor: 'pointer',
      pointerEvents: 'auto', padding: '12px 4px', margin: '-6px -4px', minHeight: '20px',
    });
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    Object.assign(cb.style, { width: '20px', height: '20px', margin: '0', flexShrink: '0' });
    cb.addEventListener('change', () => { if(cb.checked) activateInterviewMode_(); });
    cbLabel.appendChild(cb);
    cbLabel.appendChild(document.createTextNode('Interviewmodus'));
    _testModeBannerEl.appendChild(cbLabel);

    document.body.appendChild(_testModeBannerEl);
  }
  _testModeBannerEl.style.display = 'flex';
}
function hideTestModeBanner_(){
  if(_testModeBannerEl) _testModeBannerEl.style.display = 'none';
}

// ── Interviewmodus (seit 2026-09-01) ───────────────────────────
// Fuer Concurrent-Think-Aloud-Interviews: schreibt (anders als Testmodus)
// echte Daten ans Backend, aber mit explizitem Flag markiert, damit diese
// Sessions spaeter aus der Hauptstatistik ausgeschlossen werden koennen.
// Aktivierung nur ueber die Testmodus-Checkbox oben. Siehe Memory
// project_paper1_pivot_no_tierlist fuer die volle Entscheidungshistorie.
let _interviewModeActive = false;
let _interviewModeBannerEl = null;

function isInterviewModeActive(){
  return _interviewModeActive;
}

function activateInterviewMode_(){
  if(_testModeActive) deactivateTestMode_();
  _interviewModeActive = true;
  _testParticipantId = 'int_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
  _testAlias = null;
  showInterviewModeBanner_();
}

function showInterviewModeBanner_(){
  hideTestModeBanner_();
  if(!_interviewModeBannerEl){
    _interviewModeBannerEl = document.createElement('div');
    _interviewModeBannerEl.textContent = 'INTERVIEWMODUS';
    Object.assign(_interviewModeBannerEl.style, {
      position: 'fixed', top: '8px', right: '8px', zIndex: 99999,
      background: '#0ca4d1', color: '#fff', fontFamily: "'Segoe UI', sans-serif",
      fontWeight: '700', fontSize: '11px', letterSpacing: '.08em',
      padding: '6px 10px', borderRadius: '4px', boxShadow: '0 1px 4px rgba(0,0,0,.3)',
      pointerEvents: 'none',
    });
    document.body.appendChild(_interviewModeBannerEl);
  }
  _interviewModeBannerEl.style.display = 'block';
}

// Deaktivierungslogik als eigene Funktion (statt wie zuvor inline in
// toggleTestMode()) - activateInterviewMode_() oben muss den Testmodus
// ebenfalls deaktivieren koennen, sonst wuerde weiterhin jede Uebertragung
// unterdrueckt (siehe sendToBackend_).
function deactivateTestMode_(){
  _testModeActive = false;
  _testParticipantId = null;
  _testAlias = null;
  hideTestModeBanner_();
}

// Gemeinsame Aktivierungslogik, unabhaengig vom Ausloeser (Taste T + Prompt,
// Touch-Geste, oder URL-Parameter fuer automatisierte Verifikation).
function activateTestModeWithPassword_(input){
  if(input !== TEST_MODE_PASSWORD) return false;
  _testModeActive = true;
  _testParticipantId = 'test_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8);
  showTestModeBanner_();
  return true;
}

function toggleTestMode(){
  if(_testModeActive){ deactivateTestMode_(); return; }
  const input = window.prompt('Passwort:');
  activateTestModeWithPassword_(input);
  // falsches Passwort: keine sichtbare Reaktion
}

// Nur fuer automatisierte Verifikation (Claude/Browser-Pane): URL-Parameter
// ?testmode=<Passwort> bzw. ?debug=1 aktivieren denselben Test-/Debug-Modus
// wie die Tasten-/Touch-Ausloeser, ohne window.prompt() - das wird von
// Browser-Automatisierungstools automatisch weggeklickt (siehe Memory
// project_geogame_hitbox_crs_fix) und ist auf Touch-Geraeten ohnehin nicht
// bedienbar. Kein Sicherheitsmechanismus, nur ein Schutz gegen versehentliche
// Aktivierung - dieselbe Einschraenkung gilt bereits fuer TEST_MODE_PASSWORD.
function applyUrlActivation_(){
  const params = new URLSearchParams(location.search);
  const tm = params.get('testmode');
  if(tm) activateTestModeWithPassword_(tm);
  return params.get('debug') === '1';
}

// ── Teilnehmer-Identitaet: Profile pro Geraet (seit 2026-10-19) ──────
// Statt einer einzelnen geraeteweiten participant_id gibt es eine Liste von
// Profilen im localStorage (Schluessel LS_PROFILES): {id, alias, consentV,
// runCount, seen{levelId:ts}, last}. Auf einem bekannten Geraet fragt ein
// Popup ("Wer spielt?"), mit welchem Profil gespielt wird, oder ob jemand
// Neues spielt (siehe tutorial.js proceedAfterLanguage_()). Das aktive Profil
// liegt nur im Speicher (_activeProfileId); "Nochmal spielen" merkt es ueber
// einen Eintrag im sessionStorage fuer den naechsten Seitenaufruf.
// Die frueheren Einzel-Schluessel (participant_id/alias/seen_levels/
// run_count) werden NICHT migriert, sondern einmalig geloescht (Julian: keine
// Migration alter Daten, der neue Server kennt diese Personen nicht).
// Test-/Interviewmodus bleiben fluechtig (_usesEphemeralIdentity_).
const LS_PROFILES = "geogame_profiles_v2";
const SS_CONTINUE_PROFILE = "geogame_continue_profile";
const MAX_PROFILES = 20;
// Hochzaehlen, wenn sich der Einwilligungstext inhaltlich aendert: dann wird
// die Einwilligung bei allen Profilen erneut eingeholt.
const CONSENT_VERSION = "v1";

let _activeProfileId = null;   // null = neue Person (noch kein Profil)
let _pendingId = null;         // vorlaeufige ID einer neuen Person bis zur Alias-Wahl
let _memProfiles = null;       // Rueckfall, falls localStorage nicht nutzbar ist

(function dropLegacyIdentityKeys_(){
  try{
    ["geogame_participant_id","geogame_alias","geogame_seen_levels","geogame_run_count"]
      .forEach(k => localStorage.removeItem(k));
  }catch(e){ /* localStorage gesperrt: nichts zu tun */ }
})();

function loadProfiles_(){
  try{
    const arr = JSON.parse(localStorage.getItem(LS_PROFILES) || "[]");
    if(Array.isArray(arr)) return arr.filter(p => p && p.id && p.alias);
    return [];
  }catch(e){
    return _memProfiles ? _memProfiles.slice() : [];
  }
}
function saveProfiles_(arr){
  _memProfiles = arr.slice();
  try{ localStorage.setItem(LS_PROFILES, JSON.stringify(arr)); }catch(e){ /* nur im Speicher */ }
}
function getActiveProfile_(){
  if(_usesEphemeralIdentity_() || !_activeProfileId) return null;
  return loadProfiles_().find(p => p.id === _activeProfileId) || null;
}
// Fuer das Popup: Profile, zuletzt gespielt zuerst.
function listProfiles_(){
  return loadProfiles_().sort((a,b) => (b.last||0) - (a.last||0));
}
function setActiveProfile_(id){
  _activeProfileId = id;
  _pendingId = null;
}
function setActiveProfileNew_(){
  _activeProfileId = null;
  _pendingId = null;
}
function removeProfile_(id){
  saveProfiles_(loadProfiles_().filter(p => p.id !== id));
  if(_activeProfileId === id) _activeProfileId = null;
}
function updateActiveProfile_(mutate){
  if(_usesEphemeralIdentity_() || !_activeProfileId) return;
  const arr = loadProfiles_();
  const p = arr.find(x => x.id === _activeProfileId);
  if(!p) return;
  mutate(p);
  saveProfiles_(arr);
}
// Pro-Profil-Zaehler und Bildhistorie (app.js nutzt sie statt eigener localStorage-Keys).
function getProfileRunCount_(){
  const p = getActiveProfile_();
  return p ? (p.runCount || 0) : 0;
}
function bumpProfileRunCount_(){
  updateActiveProfile_(p => { p.runCount = (p.runCount || 0) + 1; p.last = Date.now(); });
}
function getProfileSeen_(){
  const p = getActiveProfile_();
  return (p && p.seen && typeof p.seen === "object") ? p.seen : {};
}
function setProfileSeen_(o){
  updateActiveProfile_(p => { p.seen = o; });
}
// Einwilligungsstand des aktiven Profils
function profileConsentOk_(id){
  const p = loadProfiles_().find(x => x.id === id);
  return !!p && p.consentV === CONSENT_VERSION;
}
function markActiveProfileConsent_(){
  updateActiveProfile_(p => { p.consentV = CONSENT_VERSION; });
}

function getParticipantId(){
  if(_usesEphemeralIdentity_()) return _testParticipantId;
  if(_activeProfileId) return _activeProfileId;
  if(!_pendingId){
    _pendingId = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,10);
  }
  return _pendingId;
}
// true = es spielt eine neue Person (noch kein Profil): Einwilligung, Formular,
// Alias-Wahl und Tutorial laufen komplett.
function isFirstEverVisit(){
  if(_usesEphemeralIdentity_()) return true;
  return _activeProfileId === null;
}

// ── Alias (Bestenliste, seit 2026-08-26) ──────────────────────
// Wird beim Anlegen eines Profils vergeben (Wortpool-Raeder) und gehoert zum
// Profil. setAlias() legt das Profil an: ab hier existiert die Person lokal.
function getAlias(){
  if(_usesEphemeralIdentity_()) return _testAlias;
  const p = getActiveProfile_();
  return p ? p.alias : null;
}
function setAlias(alias){
  if(_usesEphemeralIdentity_()){ _testAlias = alias || null; return; }
  if(!alias) return;
  const arr = loadProfiles_();
  const id = getParticipantId();
  let p = arr.find(x => x.id === id);
  if(!p){
    p = { id: id, alias: alias, consentV: CONSENT_VERSION, runCount: 0, seen: {}, last: Date.now() };
    arr.push(p);
    // Obergrenze: das am laengsten nicht genutzte Profil faellt weg
    while(arr.length > MAX_PROFILES){
      arr.sort((a,b) => (a.last||0) - (b.last||0));
      arr.shift();
    }
  }else{
    p.alias = alias;
  }
  saveProfiles_(arr);
  setActiveProfile_(id);
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
  payload.appVersion = APP_VERSION;
  payload.interviewModus = _interviewModeActive;
  fetch(SUBMIT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' }, // vermeidet CORS-Preflight (siehe TIER-List-Erfahrung)
    body: JSON.stringify(payload),
  }).catch(err => console.warn('[telemetry] Uebertragung fehlgeschlagen:', err));
}

// ── Oeffentliche Sende-Funktionen ────────────────────────────
function submitPersonData(fields){
  if(fields.alias) setAlias(fields.alias);
  sendToBackend_({
    type: 'person',
    participantId: getParticipantId(),
    alter: fields.alter,
    bildungsabschluss: fields.bildungsabschluss,
    studienfach: fields.studienfach,
    gisErfahrung: fields.gisErfahrung,
    geschlecht: fields.geschlecht,
    geraet: fields.geraet,
    alias: fields.alias,
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

// ── Bestenliste (seit 2026-08-26) ─────────────────────────────
// Einmalig beim Erreichen des Ergebnis-Screens abgeschickt (fire-and-forget
// wie alle anderen Submissions). alias faellt auf die eigene participant_id
// zurueck, wenn keiner vergeben wurde (die ist bereits anonym, siehe
// Memory project_geogame_leaderboard).
function submitRunSummary(totalTimeMs, totalErrors){
  sendToBackend_({
    type: 'run_summary',
    participantId: getParticipantId(),
    runToken: _runToken,
    alias: getAlias() || getParticipantId(),
    totalTimeMs: totalTimeMs,
    totalErrors: totalErrors,
  });
}

// Liest die Bestenliste + Perzentile - EINZIGE Stelle in telemetry.js, die
// eine echte (nicht no-cors) Antwort braucht, da wir hier tatsaechlich Daten
// zurueckbekommen wollen. Einfache GET-Requests loesen keinen CORS-Preflight
// aus (siehe Code.gs-Kommentar zu doGet) - dasselbe Muster, mit dem das
// Auswertungs-Dashboard das Sheet schon erfolgreich per curl liest.
// levelTimes: [{level, timeMs}, ...] - die eigenen, bereits bekannten
// Pro-Level-Zeiten dieses Durchlaufs (aus app.js' results[]); der Server
// gibt dafuer NUR die Perzentil-Zahl zurueck, nie fremde Rohzeiten.
function fetchLeaderboard(levelTimes){
  if(!SUBMIT_URL || SUBMIT_URL.indexOf('TRAGE_HIER') === 0) return Promise.resolve(null);
  const params = new URLSearchParams({
    mode: 'leaderboard',
    token: LEADERBOARD_TOKEN,
    participantId: getParticipantId(),
    runToken: _runToken || '',
    levels: levelTimes.map(l => l.level).join(','),
    times: levelTimes.map(l => l.timeMs).join(','),
  });
  return fetch(SUBMIT_URL + '?' + params.toString())
    .then(r => r.json())
    .catch(err => { console.warn('[telemetry] Bestenliste konnte nicht geladen werden:', err); return null; });
}

function fetchLeaderboardFull(){
  if(!SUBMIT_URL || SUBMIT_URL.indexOf('TRAGE_HIER') === 0) return Promise.resolve(null);
  const params = new URLSearchParams({
    mode: 'leaderboard', token: LEADERBOARD_TOKEN, full: '1',
    participantId: getParticipantId(), runToken: _runToken || '',
  });
  return fetch(SUBMIT_URL + '?' + params.toString())
    .then(r => r.json())
    .catch(err => { console.warn('[telemetry] Vollstaendige Bestenliste konnte nicht geladen werden:', err); return null; });
}
