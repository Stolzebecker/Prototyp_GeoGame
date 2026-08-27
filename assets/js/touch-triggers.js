/**
 * touch-triggers.js – Touch-Gesten für Test-/Debug-Modus (siehe
 * MOBILE_PLAN.md, WP1). Auf Touch-Geräten gibt es weder Tastatur noch
 * window.prompt()-Bedienbarkeit, deshalb zwei eigene Gesten:
 *
 *   Testmodus: alle vier roten Nadelköpfe im Startbildschirm-Hintergrund
 *              (die von der Person in der Hand gehaltenen, nicht die auf
 *              der Karte liegenden) von links nach rechts antippen.
 *   Debug-Modus: 10x nacheinander auf "Nicht vorhanden" (Papierkorb) tippen.
 *                Gleiche Geste schaltet auch wieder aus (toggleDebug()).
 *
 * Beide sind zusätzlich zu den bestehenden Tasten-Kürzeln (T/D), nicht als
 * Ersatz - Desktop bleibt unverändert. Kein window.prompt()-Ersatz nötig:
 * die Tipp-Sequenz selbst ist das "Geheimnis", kein Passwort-Dialog danach.
 */

// Nadelkopf-Positionen als Bruchteil der BILD-Eigengröße (nicht Viewport!),
// per Canvas-Farbanalyse aus Bilder/Deko_und_UI/Startscreen.png ermittelt
// (rot-gesättigte Pixel-Cluster im Handbereich, 2026-08-27) - robuster als
// visuelles Schätzen. Reihenfolge links -> rechts, wie von Julian gefordert.
const PIN_IMG_NATIVE = {w: 1406, h: 1119};
const PIN_FRACTIONS = [
  {fx: 940.9575070821529 / 1406, fy: 280.8866855524079 / 1119},
  {fx: 972.4447368421053 / 1406, fy: 247.99473684210528 / 1119},
  {fx: 992.7283950617284 / 1406, fy: 273.6141975308642 / 1119},
  {fx: 1021.9549549549549 / 1406, fy: 283.57957957957956 / 1119},
];
const PIN_TAP_RADIUS_PX = 34;
const PIN_TAP_TIMEOUT_MS = 4000;

let _pinTapIndex = 0;
let _pinTapResetTimer = null;

function resetPinTapSequence_(){
  _pinTapIndex = 0;
  if(_pinTapResetTimer){ clearTimeout(_pinTapResetTimer); _pinTapResetTimer = null; }
}

// Rechnet eine Bild-eigene Bruchkoordinate (fx,fy) in eine Bildschirm-
// position um, unter Berücksichtigung von background-size:cover +
// background-position:center auf dem Container (#start-screen).
//
// Wichtig: background-size:cover wird von CSS gegen die LOKALE (nicht
// transformierte) Boxgröße berechnet - offsetWidth/offsetHeight, NICHT
// getBoundingClientRect() (das liefert im erzwungenen Querformat die schon
// GEDREHTE Bildschirm-Bounding-Box, siehe mobile.css). Deshalb zweistufig:
// erst lokale Cover-Fit-Position bestimmen, dann getrennt in Bildschirm-
// koordinaten umrechnen.
function coverFitLocalPoint_(container, fx, fy){
  const localW = container.offsetWidth, localH = container.offsetHeight;
  const scale = Math.max(localW / PIN_IMG_NATIVE.w, localH / PIN_IMG_NATIVE.h);
  const dispW = PIN_IMG_NATIVE.w * scale, dispH = PIN_IMG_NATIVE.h * scale;
  const offX = (localW - dispW) / 2, offY = (localH - dispH) / 2;
  return { x: offX + fx * dispW, y: offY + fy * dispH };
}

function isPortraitRotated_(){
  return isTouchMode() && window.matchMedia('(orientation: portrait)').matches;
}

// Wandelt einen lokalen Punkt (im unrotierten Koordinatensystem von
// #start-screen) in echte Bildschirmkoordinaten um. Ohne erzwungenes
// Querformat identisch zur Bounding-Box-Position; im gedrehten Zustand wird
// dieselbe Transformation nachvollzogen, die mobile.css auf <body> anwendet
// (rotate(90deg) um die obere linke Ecke + Verschiebung um die volle
// Viewport-Breite durch left:100% bei position:fixed).
function localToScreenPoint_(container, local){
  const rect = container.getBoundingClientRect();
  if(!isPortraitRotated_()) return { x: rect.left + local.x, y: rect.top + local.y };
  const Wp = window.innerWidth;
  return { x: Wp - local.y, y: local.x };
}

function coverFitPoint_(container, fx, fy){
  return localToScreenPoint_(container, coverFitLocalPoint_(container, fx, fy));
}

function setupPinTapGesture_(){
  const el = document.getElementById('start-screen');
  if(!el) return;
  el.addEventListener('pointerdown', e=>{
    if(!isTouchMode()) return;
    // Nicht ausloesen bei Taps auf echte Bedienelemente (Start-Button,
    // Footer-Links, Legal-Modals) - nur der freie Hintergrund zaehlt.
    if(e.target.closest('button, a, .start-panel, .legal-modal')) return;
    const expected = PIN_FRACTIONS[_pinTapIndex];
    const p = coverFitPoint_(el, expected.fx, expected.fy);
    const hit = Math.hypot(e.clientX - p.x, e.clientY - p.y) <= PIN_TAP_RADIUS_PX;
    if(_pinTapResetTimer){ clearTimeout(_pinTapResetTimer); _pinTapResetTimer = null; }
    if(!hit){ resetPinTapSequence_(); return; }
    _pinTapIndex++;
    if(_pinTapIndex >= PIN_FRACTIONS.length){
      resetPinTapSequence_();
      activateTestModeWithPassword_(TEST_MODE_PASSWORD);
    }else{
      _pinTapResetTimer = setTimeout(resetPinTapSequence_, PIN_TAP_TIMEOUT_MS);
    }
  });
}

// ── Debug-Modus: 10x auf "Nicht vorhanden" tippen ──────────────────
const TRASH_TAP_COUNT = 10;
const TRASH_TAP_TIMEOUT_MS = 4000;
let _trashTapCount = 0;
let _trashTapResetTimer = null;

function setupTrashTapGesture_(){
  const el = document.getElementById('trash');
  if(!el) return;
  el.addEventListener('pointerdown', ()=>{
    if(!isTouchMode()) return;
    _trashTapCount++;
    if(_trashTapResetTimer){ clearTimeout(_trashTapResetTimer); _trashTapResetTimer = null; }
    if(_trashTapCount >= TRASH_TAP_COUNT){
      _trashTapCount = 0;
      toggleDebug();
    }else{
      _trashTapResetTimer = setTimeout(()=>{ _trashTapCount = 0; }, TRASH_TAP_TIMEOUT_MS);
    }
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  setupPinTapGesture_();
  setupTrashTapGesture_();
});
