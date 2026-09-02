# Mobile/Touch-Umbau — Arbeitspaket-Plan

Verfolgt den Umbau von SCOPE/GeoGame auf eine automatische Geräteweiche
(Computer vs. Handy/Tablet) mit eigenem Touch-optimierten Modus. Entschieden
über eine Grilling-Runde mit Julian am 2026-08-27 — Details siehe unten und
Memory `project_geogame_mobile_plan`.

**Branch-Historie (wichtig, falls hier noch alte Verweise auftauchen):** WP0–WP2
liefen auf einem separaten Branch `mobile-support`, der nach jedem verifizierten
Arbeitspaket schrittweise nach `main` gemergt wurde. Am 2026-09-02 (nach
Abschluss von WP2 + dem Alias-Umbau) hat Julian entschieden, beide Branches
endgültig zusammenzuführen und **ab sofort nur noch auf `main` zu arbeiten** —
`mobile-support` wurde gelöscht (lokal und remote). WP3+ läuft direkt auf
`main` weiter, kein neuer Feature-Branch dafür.

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
  - Baseline-Screenshots erfasst (Startbildschirm, Sprachwahl, laufendes
    Level mit/ohne Debug-Overlay, Ergebnis-Screen) — Desktop-Layout: feste
    Topbar (Marke/Fortschritt/Zeit/Fehler), Bühne mit Satellitenbild,
    untere Leiste links "Ich komme nicht weiter"+Chip-Tray (4 Labels),
    unten rechts "Nicht vorhanden"-Papierkorb. Referenzpunkt für den
    Regressionsvergleich in WP2/WP3, nicht als Datei gespeichert (informell,
    live erneut screenshotten bei Bedarf).
- [x] **WP1 — Geräteerkennung & Querformat-Infrastruktur** *(erledigt 2026-08-27)*
  - `assets/js/device.js`: Interaktionsmodus-Erkennung
    (`matchMedia('(pointer:coarse) and (hover:none)')`), Layout-Tier
    (phone/tablet/desktop nach langer Kante, Schwelle 900px), manueller
    Override-Schalter (`localStorage`, Footer-Link auf dem Startbildschirm,
    Klartext "Desktop-Version verwenden"/"Mobile-Version verwenden").
    Setzt `data-device`/`data-tier`/`data-detected` auf `<html>`.
  - `assets/css/mobile.css` (neu, nur `[data-device="touch"]`-gescoped,
    Desktop unangetastet): erzwungenes Querformat per CSS-Rotationstrick
    (`body{position:fixed;left:100%;width:100vh;height:100vw;
    transform-origin:0 0;transform:rotate(90deg)}` unter
    `@media(orientation:portrait)`) — funktioniert plattformübergreifend
    zuverlässiger als `screen.orientation.lock()` (kein iOS-Support dort).
  - `assets/js/touch-triggers.js` (neu): die zwei Touch-Gesten aus der
    Grilling-Runde — vier Nadelköpfe im Startbild-Hintergrund (links→rechts)
    aktivieren den Testmodus; 10× Tippen auf "Nicht vorhanden" schaltet den
    Debug-Modus um. Nadelkopf-Positionen per Canvas-Farbanalyse aus
    `Startscreen.png` ermittelt (nicht per Augenmaß), als Bruchkoordinaten
    relativ zur Bild-Eigengröße gespeichert und zur Laufzeit korrekt gegen
    `background-size:cover` + die aktuelle Rotation umgerechnet.
  - **Scope-Korrektur ggü. Interview:** der geplante `window.prompt()`-Ersatz
    durch ein eigenes Modal entfiel — beide Touch-Gesten aktivieren direkt
    (kein Passwort-Dialog nötig, die Geste selbst ist das Geheimnis), und
    die automatisierte Verifikation läuft über den WP0-URL-Parameter. Damit
    gibt es keinen verbleibenden Aufrufer von `window.prompt()` mehr außer
    dem bestehenden Tasten-Kürzel `T` auf Desktop, das unverändert bleibt.
  - Verifiziert: Desktop-Regression (Screenshot identisch zur Baseline bis
    auf den neuen Footer-Link), Geräteerkennung in allen drei Tiers
    (Desktop/Phone/Tablet, letzteres nur per Custom-Viewport testbar — das
    Browser-Pane-"tablet"-Preset emuliert kein `pointer:coarse`), manueller
    Umschalter (Toggle + Rückkehr zu Auto), Rotation (Transform-Matrix +
    Screenshot bestätigt korrekt gedreht, `position:fixed`-Elemente wie der
    TESTMODUS-Banner bleiben korrekt an der sichtbaren Fläche), beide
    Touch-Gesten (per synthetischen `PointerEvent`s, siehe unten).
  - **Bekannte Einschränkung:** `computer`-Klicks (echte Klick-Simulation)
    laufen im Browser-Pane bei aktiver Rotation zuverlässig in einen
    30s-Timeout (vermutlich Hit-Testing-Problem der Automatisierung gegen
    das rotierte `<body>`) — Touch-Gesten wurden stattdessen per
    `dispatchEvent(new PointerEvent(...))` verifiziert. Für WP2 (echte
    Drag-Interaktion) relevant: ggf. denselben Workaround nutzen oder auf
    Julians echtem Gerät testen, falls `computer`-Klicks dort ebenfalls
    hängen.
  - **Offen für WP3:** ein paar Modal-Größen (`legal-modal-card`,
    `table-scroll`) nutzen `vh`/`vw`, die sich im rotierten Zustand auf den
    echten (ungedrehten) Viewport beziehen, nicht auf die gedrehte
    Darstellung — kann Modals im Querformat etwas knapper wirken lassen als
    optimal, keine Funktionsstörung.
- [x] **WP2 — Touch-Eingabe (Pointer Events)** *(erledigt 2026-08-27)*
  - `app.js`: `mousedown`/`mousemove`/`mouseup` auf den Chips/`document`
    durch `pointerdown`/`pointermove`/`pointerup`/`pointercancel` ersetzt
    (ein Code-Pfad für Maus UND Touch). Pointer Capture auf dem Chip beim
    Aufnehmen, Guard gegen einen zweiten Finger während eines laufenden
    Drags (nur der `pointerId`, der den Drag gestartet hat, wird beachtet).
  - **Versetzter Ziel-Reticle für Touch**: `effectiveDragPoint_(e)` — bei
    `e.pointerType==='touch'` wird der tatsächliche Ablage-/Hittest-Punkt um
    70px nach oben verschoben (Lupe+Nadel folgen diesem versetzten Punkt,
    nicht dem rohen Finger), bei Maus/Stift exakt der Cursor wie bisher. Der
    schwebende Chip-Text bleibt bewusst am Finger; nur Lupe+Nadel (und damit
    die tatsächliche Ablageposition) wandern versetzt — genau Julians
    Grilling-Entscheidung "Ziehen mit versetztem Anzeiger".
  - `mobile.css`: `touch-action:none` auf Chips/`#stage`/`#trash` (nur
    `[data-device="touch"]`), sonst kapert der Browser die Ziehgeste als
    Seiten-Scroll/Pinch-Zoom.
  - **Bewusst außerhalb des Scopes gelassen:** die Zoom/Pan-Lightbox der
    Ergebnis-Bildvorschau (`onPreviewDragStart` etc.) ist weiterhin
    maus-only — eigenständiges, nicht blockierendes Feature, kandidiert für
    einen kleinen Nachtrag oder WP4.
  - **Verifiziert** (Browser-Pane-`computer`-Klicks hängen bei aktivem
    Touch-Emulationsmodus zuverlässig, siehe WP1-Einschränkung — deshalb
    komplett per synthetischen `PointerEvent`s mit `pointerType:'touch'`
    getestet, inkl. mehrstufiger `pointermove`-Folge für realistische Drags):
    Desktop-Maus-Regression (echter Klick-Drag, Übungsrunde bestand wie vor
    dem Umbau), Touch-Drag in der Übungsrunde (identisches Szenario zu
    Julians gemeldetem Blocker — jetzt erfolgreich), korrekte Kartenablage
    im echten Level, korrekte Papierkorb-Ablage, falsche Ablage zählt
    weiterhin einen Fehler, `pointercancel` bricht sauber ab (kein
    Fehlversuch, kein hängender Drag-Zustand), zweiter Finger während eines
    laufenden Drags wird ignoriert.
  - **Nachbesserung (2026-08-27, Julians Testbericht):** Papierkorb-Drop per
    Touch funktionierte nicht. Ursache: der 70px-Versatz gilt für den
    Bühnen-Präzisionspunkt, aber der Papierkorb liegt bei vielen
    Bildschirmgrößen näher unterhalb der Bühne als 70px (teils sogar
    überlappend) — der versetzte Punkt landete dadurch rechnerisch wieder
    IN der Bühne, der Papierkorb wurde nie geprüft. Fix: Papierkorb ist ein
    großes, grobes Ziel und wird jetzt anhand der **echten** Finger-/
    Cursor-Position geprüft (nicht des Versatz-Reticles), und zwar VOR der
    Bühnen-Prüfung. Für Maus ändert sich nichts (dort ist Versatzpunkt =
    echter Cursor). Verifiziert: Touch-Drop in den Papierkorb (korrekt +
    falsch gewertet), Bühnen-Drop mit Versatz weiterhin korrekt,
    Maus-Regression unverändert.
- [x] **Zwischenschritt — App-Version-Logging & Interviewmodus** *(erledigt 2026-09-01, ausgelöst durch den TIER-List-zu-GeoGame-Pivot, siehe Memory `project_paper1_pivot_no_tierlist`)*
  - `telemetry.js`: `APP_VERSION`-Konstante wird bei jeder Übertragung
    mitgeschickt (`sendToBackend_()`), unabhängig vom Modus.
  - Testmodus-Banner bekam eine Checkbox "Interviewmodus" — schreibt (anders
    als Testmodus) echte, aber explizit geflaggte Daten für die spätere
    Think-Aloud-Interview-Auswertung; deaktiviert dabei automatisch den
    Testmodus und vergibt eine frische Speicher-Identität (`int_...`), damit
    aufeinanderfolgende Interviewpartner auf demselben Laptop nicht
    fälschlich als Wiederholungsbesuch erkannt werden.
  - `Code.gs`: neue selbstheilende Spalten `app_version`/`interview_modus`
    in jedem Tab (`stampMetaColumns_()`); `interview_modus`-Zeilen fliegen
    zusätzlich aus der öffentlichen Bestenliste raus.
  - Verifiziert im Browser-Pane (Testmodus per URL-Param, `fetch` gemockt,
    um keine echten Zeilen ins Live-Sheet zu schreiben): Checkbox erscheint
    nur im Testmodus-Banner, Umschalten deaktiviert Testmodus und zeigt den
    INTERVIEWMODUS-Banner, Payload enthält `appVersion`/`interviewModus`
    korrekt in allen drei Zuständen (normal/Test/Interview), reine
    Testmodus-Unterdrückung weiterhin unverändert (Regression geprüft).
  - **Nachbesserung noch in derselben Sitzung (Julians Nachfrage, ob das
    auch mobil funktioniert):** die erste Version nutzte eine ungestylte
    native Checkbox (~13×13px) - unter mobiler mit Touch-Emulation
    verifiziert per `getBoundingClientRect()`: Positionierung unter dem
    Rotationstrick war korrekt (nichts abgeschnitten), aber der Tap-Target
    war deutlich unter dem sonst im Projekt verwendeten ≥44px-Ziel (siehe
    WP3 unten). Fix: Checkbox-Zeile auf eigene Zeile (statt inline neben
    "TESTMODUS"), Label-Padding vergrößert, Checkbox selbst auf 20×20px -
    Label-Tap-Fläche jetzt 44×111px. Per synthetischem `PointerEvent`
    (`pointerType:'touch'`) auf die Mitte des Labels (nicht das kleine
    Kästchen) verifiziert: löst zuverlässig aus, schaltet korrekt auf
    Interviewmodus um. Lehre: neue interaktive Elemente in diesem Repo
    grundsätzlich gegen mobile Touch-Emulation pruefen, nicht nur Desktop -
    Positionierung kann stimmen, waehrend die Zielgroesse trotzdem
    unbrauchbar ist.
  - **Noch offen:** `Code.gs`-Änderung muss noch manuell in der Apps-
    Script-Konsole bereitgestellt werden (Bereitstellungen verwalten →
    Version bearbeiten → Neue Version) — der Git-Commit allein deployed
    nichts.
- [ ] **WP3 — UI-Layout für Touch/kleine Screens** *(begonnen 2026-09-02)*
  - [x] **Safari-Chrome-Überlappung + Rand-Wischgesten** *(erledigt 2026-09-02,
    Julians Testfund auf echtem iPhone)* — `assets/css/mobile.css`:
    `100vh`/`100vw` → `100dvh`/`100dvw` (dynamic viewport units, folgen
    Safaris ein-/ausklappender Adressleiste live statt der größtmöglichen
    Ansicht) behebt die Überlappung; zusätzlich 18px Sicherheitsabstand
    (`padding`, `box-sizing:border-box`) auf der gedrehten `body`-Box zu
    allen vier physischen Rändern gegen versehentlich ausgelöste iOS-
    Systemgesten (Home-Indicator-Wischgeste, Safari-Zurück/Vorwärts-
    Navigation) — per `getBoundingClientRect()` nachgemessen: der
    Rotationstrick bildet CSS-oben/unten/links/rechts auf physisch
    rechts/links/oben/unten ab (Papierkorb landete nur ~20px vom
    physischen unteren Rand entfernt, exakt der Home-Indicator-Zone).
    Diese Systemgesten sind aus keiner Website/App per CSS/JS vollständig
    unterdrückbar, nur durch Abstand zu entschärfen. Auf echtem iPhone von
    Julian bestätigt (Folgesitzung selben Tages).
  - [x] **Native Textauswahl, Flexbox-Scroll-Bug, native Selects, Panel-
    Breite, Alias-Räder, Handy-Spiellayout, ein-/ausklappbare Debug-Panels**
    *(erledigt 2026-09-02, mehrere Iterationsrunden mit Julian auf echtem
    iPhone)* — Details siehe Memory `project_geogame_mobile_plan` und die
    Commit-Historie (`7e31439`..`7e44b3d`). Kurzfassung: `user-select:none`;
    `margin:auto` statt `align-items:center` gegen einen Flexbox-Bug, der
    überlaufenden Text unerreichbar machte; native `<select>`-Popups durch
    ein selbstgebautes Button+Listen-Widget ersetzt (natives Select/
    virtuelle Tastatur folgen nicht dem CSS-Rotationstrick — harte
    Plattformgrenze, nur bei Selects umgehbar); `--landscape-w`/
    `--landscape-h`-Custom-Properties statt roher `vw`/`vh` (wichtig: rohe
    Einheiten kippen bei tatsächlicher physischer Quer-Drehung ins
    Gegenteil, siehe Memory); Alias-Räder von 5 auf 3 sichtbare Reihen
    verkleinert; auf `data-tier="phone"` (NICHT Tablet) Topbar/Chips/
    Papierkorb/Hinweisbutton in die bisher leere Seitenspalte neben dem
    Bild umgezogen (`relocatePhoneControls_()` in app.js), `#bottom`
    ausgeblendet; Debug-Panel + Hinweis-Ebenenpanel bekamen einen Ein-/
    Ausklapp-Pfeil (Standard: ausgeklappt), Debug-Panel bleibt bewusst an
    Ort und Stelle.
  - **Julians Rückmeldung am Ende der Sitzung: "besser als zuvor, aber es
    gibt noch einiges anzupassen" — ohne weitere Spezifizierung.** Nächste
    Sitzung: zuerst konkret nachfragen, was noch genau stört, nicht
    annehmen. Bekannte Selbst-Verifikations-Lücke (siehe Memory): ob Bild/
    Bedienung auf dem Handy tatsächlich links/rechts (statt oben/unten)
    stehen, konnte Claude sich selbst nicht zuverlässig über Screenshots/
    Koordinaten bestätigen - das war zumindest zum Zeitpunkt von Julians
    "besser als zuvor" wohl grundsaetzlich in die richtige Richtung
    unterwegs, aber unklar wie vollstaendig.
  - [ ] Touch-taugliche Zielgrößen (≥ ca. 44px) — systematische Prüfung
  - [ ] Getrennte Breakpoints Tablet vs. Handy
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
  - ~~Finaler Merge nach `main`~~ — entfällt, siehe Branch-Historie oben:
    `mobile-support` wurde bereits 2026-09-02 vorzeitig (mitten in WP2/3) auf
    Julians Wunsch final nach `main` gemergt und gelöscht, kein separater
    Merge-Schritt am WP7-Ende mehr nötig.

## Zusätzliches Arbeitspaket (unabhängig vom Mobile-Umbau, für eine der nächsten Sitzungen)

- [x] **Alias-Vergabe ohne Freitext, inspiriert von SuperAutoPets** — ERLEDIGT
  2026-09-02, siehe [[project_geogame_structured_alias]] und CLAUDE.md
  (Abschnitt "Bestenliste/Alias") für die vollständige Umsetzung: eigener
  Bildschirm mit drei Wortpool-Rädern (neutrales Adjektiv/geo-Adjektiv/
  geo-Subjekt, `data/alias_words.json`), Artikel nach Genus des Substantivs
  (DE) bzw. fest "The" (EN), Pflichtfeld, kein Freitext-Fallback mehr. Auf
  `main` und `mobile-support` gleichermaßen umgesetzt (Commit
  `2877b3a`/`2ef691d`).

## Offene Punkte für später

- WP4 (In-Game-Zoom): Bedarf erst nach echtem Prototyp beurteilbar.
- Datenschutzerklärung ggf. um Hinweis auf automatische Geräteerkennung
  ergänzen (Teil von WP6, analog zur Bestenliste-Offenlegung).
