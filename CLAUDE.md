# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

EO Visual Complexity Experiment — an interactive web experiment for the Research Group for Earth Observation (rgeo). Participants drag labels (Wald/Acker/Gebäude/Wasser) onto the matching regions of a satellite image, or drop them in a trash bin if the feature is absent. Time and errors are recorded per level to study visual complexity perception in remote-sensing imagery.

The **runtime is a static site** (`index.html` + `assets/js/app.js` + `assets/js/tutorial.js` + `assets/css/*.css` + `data/config.json` + `Bilder/`), deployed to GitHub Pages. There is no build step and no server-side code for the experiment itself — everything runs in the browser via `fetch()` of local JSON/GeoJSON/PNG files. `data/config.json` is generated locally by a separate Python pipeline and must be committed alongside the images.

## Content pipeline (local only, never runs on GitHub Pages)

Two ways to (re)generate the game content from source satellite imagery:

**A. GUI pipeline (current, preferred)** — `pipeline.py`, a Tkinter app launched via `Verarbeitung_starten.bat` (or the prebuilt `Verarbeitung_starten.exe`). Fully automated end-to-end:
1. Reads every TIF in `input/` (deduplicated by normalized path).
2. Center-crops each to 4:3 and resizes to 1024×768, normalizing bands via 2nd/98th percentile stretch → writes `Bilder/EO_Bilder/B{n}norm.png`.
3. Derives the image's WGS84 bounding box from the TIF's CRS/transform.
4. Queries OSM Overpass API per label class (`OSM_CLASSES` dict — separate filters for Wald/Acker/Gebäude/Wasser, with line-buffering for rivers) against that bbox, falling over three mirror endpoints on failure/rate-limit. A full request failure (not just an empty result) aborts that level entirely rather than silently writing a false "absent" flag — see `run_pipeline`'s try/except around the OSM loop.
5. Converts results to shapely geometries, reprojects to an estimated UTM CRS for buffering, dissolves per class, clips to the image bounds, and writes `Bilder/Hitboxes/B{n}puf.geojson`.
6. **WorldCover gap-fill + cross-check**: OSM is the preferred/higher-resolution source, but it's inherently incomplete (only contains what volunteers mapped). `fetch_worldcover_window()` streams the matching ESA WorldCover 10m tile (public S3, no auth, COG via `/vsicurl/`) for the level's bbox and reclassifies it via `WORLDCOVER_RECLASS`. For each class, any WorldCover-classified area not already claimed by *any* OSM class is added as a gap-filler polygon (never overwrites an existing OSM classification); OSM polygons are also cross-checked against the WorldCover majority class underneath them, logging a warning (not an auto-correction — OSM stays authoritative) when they disagree by more than `WORLDCOVER_CONTRADICTION_THRESHOLD`.
7. Computes each class's area fraction of the image (Web Mercator shoelace formula) and writes `data/config.json` directly — no separate config-generation step needed.

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
Both pipelines share the same area-threshold logic and the same `ALL_LABELS` id list (`Wald, Acker, Gebäude, Wasser`) — keep them in sync if labels change. Note: `scripts/generate_config.py` has no OSM/WorldCover logic of its own — it just reads pre-tagged GeoJSON `"klasse"` properties, so it only needs the label list itself kept in sync, not the hybrid classification approach.

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

Committed to the repo (for GitHub Pages) are only the generated **PNGs**, **GeoJSONs**, and **config.json** — raw TIFs are gitignored (`Bilder/EO_Bilder/*.tif`) and stay local.

## Frontend architecture (`assets/js/app.js`, `assets/js/tutorial.js`)

Two plain-script globals, no modules/bundler, loaded directly by `index.html` in this order: `app.js` then `tutorial.js` (tutorial.js reads/calls globals defined in app.js: `CONFIG`, `buildZones`, `renderLabels`, `ensureMouseEvents`, `loadLevel`).

**Flow:** `boot()` (on `DOMContentLoaded`) fetches `data/config.json` → shows start screen → `startTutorial()` (tutorial.js) drives language selection → 3 info screens → 4-step spotlight overlay tutorial → one practice round (must correctly drop "Wasser") → `finishTutorial()`/`skipTutorial()` calls `loadLevel(1)` to begin the real experiment at level index 1 (level 0 is reserved/consumed by the tutorial's silent preload).

**Per level (`loadLevel(i)` in app.js):**
1. Loads the level's PNG + GeoJSON.
2. `buildZones()` projects each GeoJSON polygon ring from WGS84 to Web Mercator, then to image-fraction coordinates `[0,1]×[0,1]` (must match the same Mercator projection used by the Python pipeline's `to_mercator`/`ring_area_m2`, or hit-testing will be off).
3. Shows a "Bereit" (ready) overlay with a 3-2-1 countdown; the timer (`startTimer()`) only starts once the countdown reaches 0 — image and labels stay hidden until then.
4. Drag-and-drop is native mouse events (`mousedown`/`mousemove`/`mouseup` on `document`), not HTML5 DnD — see `beginDrag`/`setupMouseEvents`. A magnifying "loupe" canvas and a pin cursor follow the mouse; both account for the image being letterboxed inside `#stage` if the container ratio differs from 4:3.
5. `handleStageDrop`/`handleTrashDrop` validate against `zones`, `absent`, and `absent_optional`; `checkLevelComplete` gates the "Weiter" button.
6. Results accumulate in the `results` array (`{image, time, errors}`) and are shown/exportable (CSV/JSON) on the final results screen.

**Debug mode:** press `D` in-experiment to toggle `#debug-panel` + a canvas overlay drawing every class's hitbox polygons (colour-coded, from `DEBUG_COLOURS`), with per-class checkboxes and level `‹ ›` navigation — useful when checking whether pipeline-generated hitboxes line up with the image.

**Styling:** `assets/css/style.css` (main UI) + `assets/css/tutorial.css` (tutorial-only screens/overlay), both hand-written, using the rgeo CI palette as CSS custom properties in `:root` (`--panel #0a3f70`, `--accent #0ca4d1`, `--accent2 #fdc300`, `--accent3 #ec6608`, `--warn #b71918`, font `Segoe UI`).

## Working with new imagery

To add/replace levels: drop TIFs into `input/`, run the pipeline (GUI `.exe`/`.bat` or the manual scripts), then commit the resulting `Bilder/EO_Bilder/*.png`, `Bilder/Hitboxes/*.geojson`, and `data/config.json`. Level ordering follows sorted TIF filenames (`B1`, `B2`, … by pipeline processing order). No other code changes are needed for a new set of images unless the label set (`ALL_LABELS`) itself changes — that must be updated in `pipeline.py`, `scripts/generate_config.py`, and implicitly relied upon by `app.js`'s `CONFIG.labels`.
