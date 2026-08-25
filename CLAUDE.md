# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

EO Visual Complexity Experiment — an interactive web experiment for the Research Group for Earth Observation (rgeo). Participants drag labels (Wald/Acker/Gebäude/Wasser) onto the matching regions of a satellite image, or drop them in a trash bin if the feature is absent. Time and errors are recorded per level to study visual complexity perception in remote-sensing imagery.

The **runtime is a static site** (`index.html` + `assets/js/telemetry.js` + `assets/js/app.js` + `assets/js/tutorial.js` + `assets/css/*.css` + `data/config.json` + `Bilder/`), deployed to GitHub Pages. There is no build step and no package manager. There **is** now server-side code — a Google Apps Script backend (`apps-script/Code.gs`, not deployed as part of the static site itself, see "Datenerhebung" below) that the client POSTs to. There is no automated test suite or linter for either the JS or the Python side; verify frontend changes by opening `index.html` in a browser (see "Working with new imagery" for the content-regeneration path). `data/config.json` is generated locally by a separate Python pipeline and must be committed alongside the images.

## Datenerhebung (seit 2026-08-25, Learnings aus dem TIER-List-Projekt übertragen)

**Backend:** `apps-script/Code.gs`, analog zum Vorbild in `03_Projektphasen/02_Empirische Datenerhebung/TIERList/apps-script/Code.gs`, aber mit eigenem Google Sheet + eigenem `SUBMIT_TOKEN`. Vier Tabs, verknüpft über `participant_id`/`lauf_id` (siehe Code.gs-Kommentare für die genaue `resolveRun_`-Logik):
- **Personendaten** — 1 Zeile pro `participant_id`, nur beim allerersten Formular (Platzhalter-Felder: Alter, Bildungsabschluss, Studienfach, GIS-Erfahrung, Geschlecht — Feldliste noch nicht literaturbasiert final).
- **Durchlaeufe** — 1 Zeile pro `lauf_id`, Geräte-/Browser-Metadaten (bewusst OHNE IP/Geolocation/Fingerprinting, siehe Datenschutz-Modal).
- **Level_Ergebnisse** — 1 Zeile pro Level+Label (Zeit, Versuche, Reihenfolge-Position, Fehlwürfe nach Ziel getrennt).
- **Drop_Versuche** — 1 Zeile pro Ablage-Versuch (auch Fehlversuche), inkl. `x_frac`/`y_frac`-Ablageposition und der am Ort tatsächlich laut GeoJSON vorhandenen Klasse(n) — ermöglicht räumliche Auswertung typischer Fehlzuordnungen.

**Client-Seite** (`assets/js/telemetry.js`, geladen VOR `app.js`): `participant_id` ist geräteweit stabil (localStorage, key `geogame_participant_id`), `_runToken` ist neu pro Durchlauf (nur im Speicher). Submission ist automatisch pro gelöstem Level (`no-cors`-POST, kein gesammeltes Absenden am Ende — robust gegen Abbruch). **Vor dem ersten echten Einsatz müssen `SUBMIT_URL` in `telemetry.js` und `SPREADSHEET_ID` in `apps-script/Code.gs` manuell eingetragen werden** (siehe README.md, Abschnitt "Deployment") — beide sind aktuell Platzhalter (`TRAGE_HIER_...`), solange fällt jede Übermittlung auf einen reinen `console.warn` zurück, ohne das Spiel zu blockieren.

Die Telemetrie-Hooks sitzen in `app.js`: `resetLevelTelemetry()` (in `loadLevel()`), `logDropAttempt()` (aufgerufen aus `handleStageDrop()`/`handleTrashDrop()` bei jedem Ablage-Versuch, korrekt oder nicht), `submitLevelTelemetry()` (aus `checkLevelComplete()` bei echtem Levelabschluss). Die Übungsrunde (`loadLevelSilent()` in `tutorial.js`) initialisiert `levelTelemetry` bewusst NICHT — dadurch werden Übungsrunden-Interaktionen automatisch von der Telemetrie ausgeklammert (siehe Guards in `logDropAttempt()`/`toggleDebug()`).

## Rechtliche Bausteine (ebenfalls aus TIER-List übertragen)

Ablauf seit 2026-08-25: `[Sprachwahl]` → `[bestehende Info-Screens]` → `[Consent-Popup]` → `[Personendaten-Formular, nur beim allerersten Durchlauf]` → `[bestehendes Overlay-Tutorial + Übungsrunde]` → Spiel (siehe `tutorial.js`: `onConsentContinue()`, `showPersonFormScreen()`). Bei Wiederholungsspielern (erkannt via vorhandenem `participant_id`) wird das Formular übersprungen, aber jeder Durchlauf bekommt trotzdem eine neue `lauf_id`/`durchlauf_nr` (kein Warnbildschirm wie bei TIER-List — Wiederholung ist hier gewünschtes Verhalten, nicht Ausnahmefall).

Impressum-/Datenschutz-/Quellen-Modals sitzen in `index.html` (`#impressum-modal`, `#datenschutz-modal`, `#quellen-modal`, Klasse `.legal-modal`), geöffnet/geschlossen über `openLegalModal(name)`/`closeLegalModal(name)` in `app.js`, verlinkt aus dem Footer auf dem Startbildschirm. Das Quellen-Modal enthält sowohl den Copernicus-Sentinel-Lizenzhinweis als auch den Hinweis, dass das Startbildschirm-Hintergrundbild mit Google Gemini erstellt wurde.

**Wichtiger Fallstrick beim Ändern der Formular-Skip-Logik:** `isFirstEverVisit()` muss immer VOR jedem Aufruf geprüft werden, der `getParticipantId()` transitiv aufruft (z. B. `submitLaufStart()`) — sonst legt der Metadaten-Versand den `participant_id` bereits an, bevor die Erstbesuch-Prüfung läuft, und das Formular wird fälschlich übersprungen (realer Bug, der beim Testen dieser Umsetzung auftrat und in `onConsentContinue()` gefixt wurde, indem `firstVisit` vorab in einer Variable festgehalten wird).

## Optik (seit 2026-08-25)

Komplettumstellung von einem dunklen Navy-Spiel-Theme auf das helle rgeo-CI-Theme der TIER-List-Anwendung (`--bg`/`--panel`/`--panel-dark`/`--text`/`--muted` in `:root` wurden auf helle Werte umgestellt, siehe Kommentar am Anfang von `style.css`) — **probeweise**, auf ausdrücklichen Wunsch auch auf die Spielbühne selbst angewendet, nicht nur auf Onboarding-Screens. Bewusste Ausnahmen, die dunkel/unverändert blieben, weil sie über dem Satellitenbild selbst liegen (nicht über der Seiten-Chrome) und unabhängig vom Seiten-Theme funktionieren müssen: `.zone-ok`-Badges, der Tutorial-Spotlight-Veil, und der dunkle Lightbox-Backdrop des Bildvorschau-Modals (letzteres analog zu TIER-Lists eigener `.lightbox`, die trotz hellem Seiten-Theme ebenfalls dunkel bleibt).

## Content pipeline (local only, never runs on GitHub Pages)

Two ways to (re)generate the game content from source satellite imagery:

**A. GUI pipeline (current, preferred)** — `pipeline.py`, a Tkinter app launched via `Verarbeitung_starten.bat` (or the prebuilt `Verarbeitung_starten.exe`). Fully automated end-to-end:
1. Reads every TIF in `input/` (deduplicated by normalized path).
2. Center-crops each to 4:3 and resizes to 1024×768, normalizing bands via 2nd/98th percentile stretch → writes `Bilder/EO_Bilder/B{n}norm.png`.
3. Derives the image's WGS84 bounding box from the TIF's CRS/transform.
4. Queries OSM Overpass API per label class (`OSM_CLASSES` dict — separate filters for Wald/Acker/Gebäude/Wasser, with line-buffering for rivers) against that bbox, falling over three mirror endpoints on failure/rate-limit. A full request failure (not just an empty result) aborts that level entirely rather than silently writing a false "absent" flag — see `run_pipeline`'s try/except around the OSM loop.
5. Converts results to shapely geometries, reprojects to an estimated UTM CRS for buffering, dissolves per class, clips to the image bounds, and writes `Bilder/Hitboxes/B{n}puf.geojson`.
6. **WorldCover gap-fill + cross-check**: OSM is the preferred/higher-resolution source, but it's inherently incomplete (only contains what volunteers mapped). `fetch_worldcover_window()` streams the matching ESA WorldCover 10m tile (public S3, no auth, COG via `/vsicurl/`) for the level's bbox and reclassifies it via `WORLDCOVER_RECLASS`. For each class, any WorldCover-classified area not already claimed by *any* OSM class is added as a gap-filler polygon (never overwrites an existing OSM classification); OSM polygons are also cross-checked against the WorldCover majority class underneath them, logging a warning (not an auto-correction — OSM stays authoritative) when they disagree by more than `WORLDCOVER_CONTRADICTION_THRESHOLD`. A side effect: class polygons can now overlap slightly at their edges (a WorldCover gap-fill sliver next to an OSM polygon of a different class, or two OSM polygons that were never mutually exclusive) — code that hit-tests a drop point must not assume at most one class matches (see `handleStageDrop`/`tutPracticeCheck` below).
7. Computes each class's area fraction of the image (Web Mercator shoelace formula, subtracting polygon holes — see `polygon_area_m2`) and writes `data/config.json` directly — no separate config-generation step needed.

Rebuild the `.exe` with:
```bash
build_exe.bat
```
(runs `pip install rasterio numpy pillow requests geopandas shapely pyinstaller` then PyInstaller with `Verarbeitung_starten.spec`.)

**B. Manual two-script pipeline (older, still present)** — used when hitboxes are hand-drawn/sourced some other way rather than pulled from OSM:
```bash
pip install rasterio numpy pillow
python scripts/convert_tif_to_png.py   # Bilder/EO_Bilder/B*norm.tif → B*norm.png
python scripts/generate_config.py      # reads TIF bounds + GeoJSON "klasse" properties → data/config.json
```
Both pipelines share the same area-threshold logic and the same `ALL_LABELS` id list (`Wald, Acker, Gebäude, Wasser`) — keep them in sync if labels change. Note: `scripts/generate_config.py` has no OSM/WorldCover logic of its own — it just reads pre-tagged GeoJSON `"klasse"` properties, so it only needs the label list itself kept in sync, not the hybrid classification approach. There's also a superseded, standalone `Convert tif to png.py` at the repo root (older duplicate of `scripts/convert_tif_to_png.py`) — not part of either documented pipeline, don't edit it by mistake.

### `data/config.json` shape

```json
{
  "labels": [{"id","text","icon"}, ...],
  "area_threshold": 0.05,
  "levels": [
    {
      "id": "B1",
      "imgSrc": "./Bilder/EO_Bilder/B1norm.png",
      "geojsonSrc": "./Bilder/Hitboxes/B1puf.geojson",
      "bounds": [[southLat, westLon], [northLat, eastLon]],
      "absent": ["Wasser"],
      "absent_optional": ["Gebäude"],
      "areas": {"Wald": 0.42, "Gebäude": 0.18, ...}
    }
  ]
}
```
- `absent`: class has zero area in the image → only the trash bin is a correct drop.
- `absent_optional`: class area is below `area_threshold` (default 5% of image area) → **both** the trash bin and the map hit-zone count as correct.
- `areas`: per-class area fraction (0–1), used only for the debug panel display.
- Area threshold is defined independently in `pipeline.py` (`AREA_THRESHOLD`) and `scripts/generate_config.py` (`AREA_THRESHOLD`) — change both if adjusting.

Committed to the repo: generated **PNGs**, **GeoJSONs**, **config.json** (for GitHub Pages) — but also, perhaps surprisingly, the raw source **TIFs in `input/`**, and the PyInstaller **build artifacts** (`build/`, `dist/`, `Verarbeitung_starten.exe`). Only `Bilder/EO_Bilder/*.tif` is gitignored; nothing under `input/` is. Keep this in mind before assuming a "raw data stays local" convention applies repo-wide.

## Frontend architecture (`assets/js/app.js`, `assets/js/tutorial.js`)

Two plain-script globals, no modules/bundler, loaded directly by `index.html` in this order: `app.js` then `tutorial.js` (tutorial.js reads/calls globals defined in app.js: `CONFIG`, `buildZones`, `renderLabels`, `ensureMouseEvents`, `loadLevel`, `startShuffledExperiment`).

**Flow:** `boot()` (on `DOMContentLoaded`) fetches `data/config.json` → shows start screen → `startTutorial()` (tutorial.js) drives language selection → 3 info screens → 4-step spotlight overlay tutorial → one practice round (must correctly drop "Wasser") → `finishTutorial()`/`skipTutorial()` calls `startShuffledExperiment()` to begin the real experiment.

**Randomised level order:** `buildLevelOrder()` shuffles indices `1..N-1` into the global `levelOrder` (index `0` is reserved for the tutorial's silent preload/practice round and never appears in the timed experiment). `orderPos` tracks the current position in that shuffled sequence; `nextLevel()` increments `orderPos` and loads `levelOrder[orderPos]`, or calls `showResults()` once exhausted. The top progress bar/text and the "Bereit" overlay both display `orderPos+1 / levelOrder.length`, **not** the raw `CONFIG.levels` index — so progress numbering reflects play order, not image order. Debug-panel level navigation (`debugPrevLevel`/`debugNextLevel`) deliberately bypasses this and steps through raw config indices instead, for QA purposes.

**Per level (`loadLevel(i)` in app.js):**
1. Loads the level's PNG + GeoJSON.
2. `buildZones()` projects each GeoJSON polygon ring from WGS84 to Web Mercator, then to image-fraction coordinates `[0,1]×[0,1]` (must match the same Mercator projection used by the Python pipeline's `to_mercator`/`ring_area_m2`, or hit-testing will be off).
3. Shows a "Bereit" (ready) overlay with a 3-2-1 countdown; the timer (`startTimer()`) only starts once the countdown reaches 0 — image and labels stay hidden until then.
4. Drag-and-drop is native mouse events (`mousedown`/`mousemove`/`mouseup` on `document`), not HTML5 DnD — see `beginDrag`/`setupMouseEvents`. A magnifying "loupe" canvas and a pin cursor follow the mouse; both account for the image being letterboxed inside `#stage` if the container ratio differs from 4:3.
5. `handleStageDrop`/`handleTrashDrop` validate against `zones`, `absent`, and `absent_optional`; `checkLevelComplete` gates the "Weiter" button. Because zones can overlap slightly (see the WorldCover gap-fill note above), `handleStageDrop` collects **all** matching classes at the drop point into a `hitKlassen` Set rather than assuming a single match — any code consuming that set (e.g. `tutPracticeCheck`) must check membership (`.has(...)`), not just the first/only element.
6. Results accumulate in the `results` array (`{image, imgSrc, time, errors}`) and are shown/exportable (CSV/JSON) on the final results screen.

**Results screen:** clicking a row opens a full-screen image-preview lightbox (`#image-preview-modal`) showing that level's satellite image — scroll to zoom (cursor-centred), drag to pan, double-click to reset, ✕/Escape to close. See `openImagePreview`/`onPreviewWheel`/`onPreviewDragMove` in app.js.

**Debug mode:** press `D` in-experiment to toggle `#debug-panel` + a canvas overlay drawing every class's hitbox polygons (colour-coded, from `DEBUG_COLOURS`), with per-class checkboxes, raw-index level `‹ ›` navigation, and an "Aufgaben-Steuerung" section with two shortcuts for QA: **Nächste Aufgabe** (`debugSkipTask()` — force-advances the shuffled sequence regardless of whether the current level is actually solved) and **Zu den Resultaten** (`debugJumpToResults()` — jumps straight to the results screen) so testers don't have to solve every level by hand to reach the later parts of the flow.

**Styling:** `assets/css/style.css` (main UI) + `assets/css/tutorial.css` (tutorial-only screens/overlay), both hand-written, using the rgeo CI palette as CSS custom properties in `:root` (`--panel #0a3f70`, `--accent #0ca4d1`, `--accent2 #fdc300`, `--accent3 #ec6608`, `--warn #b71918`, font `Segoe UI`).

## Working with new imagery

To add/replace levels: drop TIFs into `input/`, run the pipeline (GUI `.exe`/`.bat` or the manual scripts), then commit the resulting `Bilder/EO_Bilder/*.png`, `Bilder/Hitboxes/*.geojson`, and `data/config.json`. Level ordering follows sorted TIF filenames (`B1`, `B2`, … by pipeline processing order); the *play* order is separately randomised at runtime (see above), so this ordering only matters for filenames/debug navigation. No other code changes are needed for a new set of images unless the label set (`ALL_LABELS`) itself changes — that must be updated in `pipeline.py`, `scripts/generate_config.py`, and implicitly relied upon by `app.js`'s `CONFIG.labels`.
