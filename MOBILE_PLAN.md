# Mobile/Touch-Umbau — Arbeitspaket-Plan

Verfolgt den Umbau von SCOPE/GeoGame auf eine automatische Geräteweiche
(Computer vs. Handy/Tablet) mit eigenem Touch-optimierten Modus. Arbeit läuft
auf dem Branch `mobile-support`, jedes fertige/verifizierte Arbeitspaket wird
einzeln nach `main` gemergt (nicht alles am Stück am Ende). Entschieden über
eine Grilling-Runde mit Julian am 2026-08-27 — Details siehe unten und Memory
`project_geogame_mobile_plan`.

## Settled decisions (nicht ohne Rückfrage neu verhandeln)

- **Eine gemeinsame Codebasis**, kein Fork in separate Dateien. Geräteweiche
  über CSS-Breakpoints + JS-Feature-Detection im bestehenden
  `app.js`/`tutorial.js`/`telemetry.js`-Setup (keine neuen Build-Tools/Module).
- **Erkennung des Interaktionsmodus**: `matchMedia('(pointer: coarse) and
  (hover: none)')` — nicht User-Agent-Sniffing, nicht reine Breitenmessung
  (die dient nur zusätzlich fürs Layout-Tiering innerhalb eines Modus).
- **Tablet und Handy** teilen sich den Touch-Interaktionsmodus, bekommen aber
  eigene Layout-Breakpoints (Tablet hat mehr Platz).
- **Manueller Override-Schalter** (persistiert in `localStorage`), falls die
  automatische Erkennung bei Randfällen danebenliegt oder für gezieltes
  Testen.
- **Erzwungenes Querformat** unabhängig von der physischen Geräteausrichtung
  (CSS-Rotationstrick, kein `screen.orientation.lock()` — das funktioniert auf
  iOS Safari ohnehin nicht zuverlässig). Gilt einheitlich für Handy und
  Tablet.
- **Geräteunterschiede sind eine akzeptierte Kovariate**, keine erzwungene
  1:1-Vergleichbarkeit von Zeit/Fehlern zwischen Desktop und Mobile — jede
  Plattform bekommt die für ihr Eingabegerät natürliche Interaktion.
- **Ablege-Mechanik auf Touch**: Ziehen mit versetztem Zielanzeiger + Lupe
  (Anzeiger erscheint oberhalb des Fingers, damit der Finger die Zielstelle
  nicht verdeckt) — über vereinheitlichte **Pointer Events**, die die
  bestehende `mousedown`/`mousemove`/`mouseup`-Logik ersetzen (deckt Maus UND
  Touch in einem Code-Pfad ab).
- **UI-Layout**: bestehende Desktop-Anordnung als Basis, aber Prüfung auf
  Reduktion/Umbau ohne Informationsverlust, damit das Satellitenbild
  größtmöglich dargestellt wird.
- **In-Game-Zoom/Pan während des Spielens**: bewusst offen gelassen, Entscheidung
  erst nach einem ersten Touch-Prototyp (WP2/WP3) anhand echter Tests.
- **Neue Telemetrie-Felder**: automatisch erkannter Interaktionsmodus,
  Bildschirmtier/-breite, ggf. ob Querformat erzwungen wurde — zusätzlich zur
  bestehenden Selbstauskunft `geraet` im Formular, nicht als Ersatz dafür.
- **Debug-/Testmodus auf Touch** (siehe WP1):
  - **Testmodus**: alle vier roten Nadelköpfe im Startbildschirm-Hintergrundbild
    von links nach rechts antippen. Bleibt aktiv bis zum nächsten
    Runden-/Seiten-Reset (wie die bestehende Tasten-Variante).
  - **Debug-Modus**: 10× nacheinander auf das "Nicht vorhanden"-Icon tippen.
    Gleiche Geste zum Ausschalten.
  - Zusätzlich (unabhängig von den Touch-Gesten): URL-Parameter
    (`?testmode=Claudius`, `?debug=1`) für automatisierte Verifikation durch
    Claude — `window.prompt()` wird ohnehin durch ein eigenes Modal ersetzt
    (Browser-Automatisierung dismissed native Prompts automatisch).
- **Testgeräte**: Julian hat ein echtes Handy und Tablet zur Verfügung,
  zusätzlich Browser-Pane-Emulation (Viewport-Resize + Touch-Emulation).

## Arbeitspakete

- [x] **WP0 — Vorbereitung** *(erledigt 2026-08-27)*
  - Branch `mobile-support` angelegt
  - Dieser Plan angelegt
  - URL-Parameter-Aktivierung für Test-/Debug-Modus (`?testmode=Claudius`,
    `?debug=1`) in `telemetry.js` (`applyUrlActivation_()`) + `app.js`
    (`boot()`) — verifiziert per echtem Seitenaufruf (Banner erscheint,
    `isTestModeActive()`/`debugMode` korrekt gesetzt)
  - Cache-Buster-Query (`?v=mobile-wp0`) an den `<script>`/`<link>`-Tags in
    `index.html` ergänzt — der lokale Dev-Server (`python -m http.server`)
    wurde beim Testen wiederholt mit veraltetem JS/CSS aus dem Browser-Cache
    ausgeliefert, auch nach Server-Neustart/neuem Tab (Proxy-Port bleibt
    stabil). Bei künftigen Arbeitspaketen den `v=`-Wert hochzählen, wenn der
    Dev-Server wieder veralteten Code ausliefert.
  - Baseline-Screenshots offen: das Browser-Pane war in dieser Sitzung nicht
    sichtbar/geöffnet ("pane is not displayed", Kompositierung schlägt fehl)
    — strukturelle Verifikation per `read_page` stattdessen durchgeführt
    (alle Screens/Modals vorhanden). Screenshots nachholen, sobald das Pane
    sichtbar ist.
- [ ] **WP1 — Geräteerkennung & Querformat-Infrastruktur** *(nächstes Paket)*
  - `assets/js/device.js`: Interaktionsmodus-Erkennung, Layout-Tier
    (phone/tablet/desktop), manueller Override-Schalter
  - CSS-Grundgerüst (`data-device`/`data-tier`-Attribute), worauf alle
    folgenden Pakete aufbauen
  - Erzwungenes Querformat (CSS-Rotationstrick)
  - Touch-Trigger für Test-/Debug-Modus (vier Nadelköpfe, 10× "Nicht
    vorhanden"), `window.prompt()`-Ersatz durch eigenes Modal
  - Verifikation: reine Infrastruktur, am eigentlichen Spiel darf sich nichts
    ändern (Desktop exakt wie bisher)
- [ ] **WP2 — Touch-Eingabe (Pointer Events)**
  - Umstellung Drag-Logik von Maus-only auf Pointer Events
  - Versetzter Zielanzeiger + Lupe für Touch
  - Kritischstes Paket bzgl. Desktop-Regression — Maus-Verhalten muss exakt
    gleich bleiben
- [ ] **WP3 — UI-Layout für Touch/kleine Screens**
  - Verdichtung/Umbau der bestehenden Anordnung ohne Informationsverlust
  - Touch-taugliche Zielgrößen (≥ ca. 44px)
  - Getrennte Breakpoints Tablet vs. Handy
- [ ] **WP4 — In-Game-Zoom/Pan (bedingt)**
  - Entscheidung nach WP2/WP3-Prototyp mit Julian, ob überhaupt nötig
- [ ] **WP5 — Telemetrie-Erweiterung**
  - Neue Sheet-Spalten für erkannten Interaktionsmodus/Gerätetier
    (`Code.gs`, `ensureColumn_()`-Muster wie bisher)
- [ ] **WP6 — Tutorial/Formulare/Rechtstexte für Touch**
  - Onboarding-Flow, Consent-Screens, Datenschutztext-Ergänzung
- [ ] **WP7 — End-to-End-QA & Rollout**
  - Kompletter Durchlauf auf echten Geräten (Handy + Tablet)
  - Desktop-Regressionscheck
  - Finaler Merge nach `main`

## Offene Punkte für später

- WP4 (In-Game-Zoom): Bedarf erst nach echtem Prototyp beurteilbar.
- Datenschutzerklärung ggf. um Hinweis auf automatische Geräteerkennung
  ergänzen (Teil von WP6, analog zur Bestenliste-Offenlegung).
