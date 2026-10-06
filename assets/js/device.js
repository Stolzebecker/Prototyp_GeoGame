/**
 * device.js – Geräteweiche für den Mobile/Touch-Umbau (siehe MOBILE_PLAN.md,
 * WP1). Muss als ERSTES Script geladen werden, vor telemetry.js/app.js, da
 * schon der erste Render-Pass die richtigen data-Attribute auf <html>
 * braucht (kein Flackern durch spätes Umschalten).
 *
 * Setzt data-device="touch"|"desktop" und data-tier="phone"|"tablet"|
 * "desktop" auf <html>. CSS (siehe mobile.css) und JS (app.js/tutorial.js)
 * docken darüber an, ohne eigene matchMedia-Logik zu duplizieren.
 */

const LS_DEVICE_OVERRIDE = 'geogame_device_override'; // 'touch' | 'desktop' | null (=auto)

// pointer:coarse + hover:none = grobe Zeigergenauigkeit ohne Hover-Fähigkeit,
// das eigentliche Signal für "wird gerade mit Touch statt Maus bedient".
// Bewusst NICHT User-Agent-Sniffing (iPadOS Safari gibt sich absichtlich als
// Desktop-Safari aus) und NICHT reine Breitenmessung (die dient separat nur
// dem Layout-Tiering innerhalb eines Modus, siehe detectLayoutTier_).
function detectInteractionMode_(){
  try{
    return window.matchMedia('(pointer: coarse) and (hover: none)').matches ? 'touch' : 'desktop';
  }catch(e){ return 'desktop'; }
}

// Tablet vs. Handy innerhalb des Touch-Modus: die lange Kante zählt, nicht
// die aktuelle (evtl. noch nicht rotierte) Breite - siehe forced-landscape-
// Logik in mobile.css, die ohnehin auf die lange Kante abzielt.
function detectLayoutTier_(mode){
  if(mode !== 'touch') return 'desktop';
  // Vollbild (Nils' Android-Testfund 2026-10-06): im Vollbildmodus blendet das
  // Geraet Status-/Navigationsleiste aus, innerWidth/innerHeight wachsen dadurch
  // um ~100-150px. Ein Geraet knapp unter der Schwelle (z.B. 412x915-CSS-px-
  // Handys, im Browser ~780 lange Kante) kippte so beim Aktivieren des Vollbilds
  // von "phone" auf "tablet" - das Tablet-Layout (76px-Papierkorb, 48px-Chips)
  // passt nicht in die ~412px Hoehe, die UI-Elemente ueberlappten. Waehrend
  // Vollbild deshalb den bisherigen Tier behalten; nach Verlassen wird mit den
  // wieder normalen Massen neu bewertet (= derselbe Tier wie vorher).
  if(_activeTier && document.fullscreenElement) return _activeTier;
  const longEdge = Math.max(window.innerWidth, window.innerHeight);
  return longEdge >= 900 ? 'tablet' : 'phone';
}

function getDeviceOverride(){
  const v = localStorage.getItem(LS_DEVICE_OVERRIDE);
  return (v === 'touch' || v === 'desktop') ? v : null;
}
function setDeviceOverride(value){
  if(value === 'touch' || value === 'desktop') localStorage.setItem(LS_DEVICE_OVERRIDE, value);
  else localStorage.removeItem(LS_DEVICE_OVERRIDE);
  applyDeviceMode_();
}

let _activeMode = null, _activeTier = null;

function applyDeviceMode_(){
  const detected = detectInteractionMode_();
  const override = getDeviceOverride();
  const mode = override || detected;
  const tier = detectLayoutTier_(mode);
  _activeMode = mode; _activeTier = tier;
  const html = document.documentElement;
  html.setAttribute('data-device', mode);
  html.setAttribute('data-tier', tier);
  // Erkannter (nicht durch Override verfälschter) Wert - für Telemetrie
  // (WP5) und den manuellen Umschalter, der wissen muss, was "automatisch"
  // wäre, um sinnvoll zwischen den beiden Zuständen umzuschalten.
  html.setAttribute('data-detected', detected);
  document.dispatchEvent(new CustomEvent('devicemodechange', {detail: {mode, tier, detected}}));
}

function isTouchMode(){ return _activeMode === 'touch'; }
function getDeviceTier(){ return _activeTier; }
function getDetectedInteractionMode_(){ return detectInteractionMode_(); }

// Initial sofort beim Laden anwenden (nicht erst auf DOMContentLoaded warten
// - <html> existiert immer schon, wenn dieses Script geparst wird), damit
// keine sichtbare Umschaltung nach dem ersten Render passiert.
applyDeviceMode_();

// Neu bewerten bei Änderungen, die den Interaktionsmodus beeinflussen
// könnten (z. B. externer Maus-Anschluss an ein Tablet, DevTools-Emulation-
// Umschaltung, Fenster-Resize).
try{
  window.matchMedia('(pointer: coarse) and (hover: none)').addEventListener('change', applyDeviceMode_);
}catch(e){ /* aeltere Browser ohne addEventListener auf MediaQueryList */ }
window.addEventListener('resize', applyDeviceMode_);

// ── Manueller Umschalter (Footer-Link auf dem Startbildschirm) ────────
// Ein Klick erzwingt jeweils den anderen Modus; ein zweiter Klick kehrt
// zurueck zur automatischen Erkennung (kein Drei-Zustands-Menü noetig).
function toggleDeviceOverride_(){
  if(getDeviceOverride()){
    setDeviceOverride(null);
  }else{
    setDeviceOverride(_activeMode === 'touch' ? 'desktop' : 'touch');
  }
  updateDeviceOverrideLink_();
}

function updateDeviceOverrideLink_(){
  const link = document.getElementById('device-override-link');
  if(!link) return;
  const override = getDeviceOverride();
  if(override === 'touch') link.textContent = '⚙ Mobile-Ansicht erzwungen – automatische Erkennung verwenden';
  else if(override === 'desktop') link.textContent = '⚙ Desktop-Ansicht erzwungen – automatische Erkennung verwenden';
  else link.textContent = _activeMode === 'touch' ? 'Desktop-Version verwenden' : 'Mobile-Version verwenden';
}

document.addEventListener('devicemodechange', updateDeviceOverrideLink_);
document.addEventListener('DOMContentLoaded', updateDeviceOverrideLink_);
