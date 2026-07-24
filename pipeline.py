"""
pipeline.py – EO Visual Complexity Experiment
═══════════════════════════════════════════════
Doppelklick-Pipeline für Windows (via Verarbeitung_starten.bat).

Was passiert automatisch:
  1. TIFs aus input/ einlesen (jede Datei genau einmal)
  2. Auf 4:3 zentriert zuschneiden → 1024×768 px PNG
  3. OSM-Hitboxes via Overpass API (bewährter Ansatz)
  4. Polygon-Reduktion via geopandas dissolve
  5. data/config.json aktualisieren

Abhängigkeiten:
  pip install rasterio numpy pillow requests geopandas shapely
"""

import os, sys, json, math, glob, time, traceback, logging
import tkinter as tk
from tkinter import scrolledtext, ttk
import threading
import warnings
warnings.filterwarnings("ignore")

# ── Konstanten ───────────────────────────────────────────────────────────
SCRIPT_DIR    = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR     = os.path.join(SCRIPT_DIR, "input")
EO_DIR        = os.path.join(SCRIPT_DIR, "Bilder", "EO_Bilder")
HITBOX_DIR    = os.path.join(SCRIPT_DIR, "Bilder", "Hitboxes")
DATA_DIR      = os.path.join(SCRIPT_DIR, "data")
CONFIG_FILE   = os.path.join(DATA_DIR, "config.json")

TARGET_W       = 1024
TARGET_H       = 768
ASPECT         = TARGET_W / TARGET_H
AREA_THRESHOLD = 0.05

ALL_LABELS = [
    {"id": "Wald",     "text": "Wald",     "icon": "🌲"},
    {"id": "Fluss",    "text": "Fluss",    "icon": "🌊"},
    {"id": "Siedlung", "text": "Siedlung", "icon": "🏘️"},
    {"id": "Acker",    "text": "Acker",    "icon": "🌾"},
    {"id": "Straße",   "text": "Straße",   "icon": "🛣️"},
    {"id": "See",      "text": "See",      "icon": "💧"},
]
ALL_LABEL_IDS = {l["id"] for l in ALL_LABELS}

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# Optimierte OSM-Klassen-Definition
# – See/Fluss strikt getrennt (kein doppeltes Mapping von Wasserflächen)
# – Siedlung ohne building-Tag (Einzelgebäude im Wald/Acker ausgeschlossen)
# – Acker ohne grass (urbane Grünflächen ausgeschlossen)
# – Straße ohne track/service (verhindert Buffer-Overload auf Feldwegen)
OSM_CLASSES = {
    "Wald": {
        "filters": [
            '["landuse"~"^(forest|wood)$"]',
            '["natural"~"^(wood|scrub|heath)$"]',
        ],
        "buffer_m": None,
    },
    "See": {
        "filters": [
            '["natural"="water"]["water"!~"^(river|stream|canal|lock|ditch|drain)$"]',
            '["landuse"~"^(reservoir|basin)$"]',
        ],
        "buffer_m": None,
    },
    "Fluss": {
        "filters": [
            '["waterway"~"^(river|stream|canal|drain|ditch)$"]',
            '["natural"="water"]["water"~"^(river|stream|canal|lock)$"]',
        ],
        "buffer_m": 50,
    },
    "Siedlung": {
        "filters": [
            '["landuse"~"^(residential|commercial|industrial|retail|construction|garages)$"]',
        ],
        "buffer_m": None,
    },
    "Acker": {
        "filters": [
            '["landuse"~"^(farmland|farmyard|orchard|vineyard|meadow|allotments)$"]',
            '["natural"="grassland"]',
        ],
        "buffer_m": None,
    },
    "Straße": {
        "filters": [
            '["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|road)$"]',
        ],
        "buffer_m": 50,
    },
}

# Fallback für Siedlung: viele kleinere Ortschaften sind in OSM nur als einzelne
# building-Umrisse erfasst, ganz ohne umschließendes landuse=residential-Polygon
# (der Haupt-Filter oben findet solche Orte daher nicht). Als Ergänzung werden
# alle Gebäude gepuffert+dissolved; nur Cluster oberhalb einer Mindestfläche
# zählen als Siedlung – das filtert einzelne Gebäude im Wald/Acker weiterhin raus.
SIEDLUNG_BUILDING_BUFFER_M   = 15
SIEDLUNG_BUILDING_MIN_AREA_M2 = 3000


# ═══════════════════════════════════════════════════════════════════════
# GUI
# ═══════════════════════════════════════════════════════════════════════
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("EO Pipeline – rgeo")
        self.geometry("720x560")
        self.configure(bg="#0a3f70")
        self.resizable(False, False)

        hdr = tk.Frame(self, bg="#0a3f70")
        hdr.pack(fill="x", padx=20, pady=(18, 0))
        tk.Label(hdr, text="EO · PIPELINE",
                 font=("Segoe UI", 10, "bold"),
                 fg="#0ca4d1", bg="#0a3f70").pack(anchor="w")
        tk.Label(hdr, text="Automatische Bildverarbeitung",
                 font=("Segoe UI", 18, "bold"),
                 fg="white", bg="#0a3f70").pack(anchor="w")

        info = tk.Frame(self, bg="#083060")
        info.pack(fill="x", padx=20, pady=10)
        tk.Label(info,
                 text="  TIF-Dateien in input\\  legen → Pipeline starten"
                      "   │   Ausgabe: 1024×768 px, 4:3, OSM-Hitboxes",
                 font=("Segoe UI", 9),
                 fg="#c6c6c6", bg="#083060", pady=8).pack(anchor="w")

        style = ttk.Style(self)
        style.theme_use("default")
        style.configure("gold.Horizontal.TProgressbar",
                         troughcolor="#083060", background="#fdc300",
                         bordercolor="#0a3f70", lightcolor="#fdc300",
                         darkcolor="#c99400")
        self.progress = ttk.Progressbar(
            self, style="gold.Horizontal.TProgressbar",
            orient="horizontal", length=680, mode="determinate")
        self.progress.pack(padx=20, pady=(0, 4))
        self.prog_label = tk.Label(
            self, text="Warte auf Start …",
            font=("Segoe UI", 9), fg="#c6c6c6", bg="#0a3f70")
        self.prog_label.pack(anchor="w", padx=22)

        self.log = scrolledtext.ScrolledText(
            self, height=18, font=("Segoe UI", 9),
            bg="#051830", fg="#c6c6c6",
            insertbackground="white",
            relief="flat", bd=0, state="disabled")
        self.log.pack(fill="both", expand=True, padx=20, pady=6)
        self.log.tag_config("ok",   foreground="#fdc300")
        self.log.tag_config("err",  foreground="#b71918")
        self.log.tag_config("info", foreground="#0ca4d1")
        self.log.tag_config("done", foreground="#84993d")
        self.log.tag_config("warn", foreground="#ec6608")

        btn_frame = tk.Frame(self, bg="#0a3f70")
        btn_frame.pack(pady=(0, 14))
        self.btn_start = tk.Button(
            btn_frame, text="▶  Pipeline starten",
            font=("Segoe UI", 11, "bold"),
            bg="#fdc300", fg="#0a3f70",
            activebackground="#ffe566",
            relief="flat", padx=24, pady=10,
            cursor="hand2", command=self.start)
        self.btn_start.pack(side="left", padx=6)
        tk.Button(btn_frame, text="Schließen",
                  font=("Segoe UI", 10),
                  bg="#083060", fg="#c6c6c6",
                  relief="flat", padx=16, pady=10,
                  cursor="hand2", command=self.destroy).pack(side="left", padx=6)

    def log_write(self, msg, tag=""):
        self.log.configure(state="normal")
        self.log.insert("end", msg + "\n", tag)
        self.log.see("end")
        self.log.configure(state="disabled")
        self.update_idletasks()

    def set_progress(self, val, label=""):
        self.progress["value"] = val
        if label:
            self.prog_label.config(text=label)
        self.update_idletasks()

    def start(self):
        self.btn_start.config(state="disabled")
        self.log.configure(state="normal")
        self.log.delete("1.0", "end")
        self.log.configure(state="disabled")
        self.set_progress(0, "Starte …")
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        try:
            run_pipeline(self)
        except Exception:
            self.log_write(traceback.format_exc(), "err")
            self.log_write("Pipeline abgebrochen.", "err")
        finally:
            self.btn_start.config(state="normal")


# ═══════════════════════════════════════════════════════════════════════
# OSM HELPERS (aus bewährtem generate_hitboxes.py)
# ═══════════════════════════════════════════════════════════════════════
def build_query(bbox_wgs84: tuple, filters: list) -> str:
    w, s, e, n = bbox_wgs84
    bbox_str = f"{s},{w},{n},{e}"
    parts = []
    for f in filters:
        parts.append(f"  way{f}({bbox_str});")
        parts.append(f"  relation{f}({bbox_str});")
    union = "\n".join(parts)
    return (
        f"[out:json][timeout:180];\n"
        f"(\n{union}\n);\n"
        f"out body geom qt;"
    )


def overpass_request(query: str, app=None, retries: int = 5, delay: float = 15.0):
    """POST als reiner String – kein dict (verhindert 406-Fehler)."""
    import requests as req
    for attempt in range(1, retries + 1):
        for endpoint in OVERPASS_ENDPOINTS:
            try:
                resp = req.post(
                    endpoint,
                    data=query,           # ← reiner String, kein dict
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=180,
                )
                if resp.status_code == 429:
                    if app: app.log_write("   Rate-limit – warte 60 s", "warn")
                    time.sleep(60)
                    continue
                if resp.status_code != 200:
                    if app: app.log_write(
                        f"   HTTP {resp.status_code} ({endpoint})", "warn")
                    continue
                return resp.json()
            except req.exceptions.Timeout:
                if app: app.log_write(f"   Timeout ({endpoint})", "warn")
            except Exception as exc:
                if app: app.log_write(f"   Fehler: {exc}", "warn")
        time.sleep(delay)
    return None


def osm_element_to_shapely(el: dict):
    from shapely.geometry import Point, LineString, Polygon
    t = el.get("type")
    try:
        if t == "node":
            return Point(el["lon"], el["lat"])
        elif t == "way":
            coords = [(m["lon"], m["lat"]) for m in el.get("geometry", [])]
            if len(coords) < 2:
                return None
            if coords[0] == coords[-1] and len(coords) >= 4:
                return Polygon(coords)
            return LineString(coords)
        elif t == "relation":
            outer, inner = [], []
            for member in el.get("members", []):
                pts = [(g["lon"], g["lat"]) for g in member.get("geometry", [])]
                if len(pts) < 2:
                    continue
                (inner if member.get("role") == "inner" else outer).append(pts)
            if not outer:
                return None
            ext = outer[0]
            if len(ext) >= 4 and ext[0] == ext[-1]:
                return Polygon(ext, inner)
            return LineString(ext)
    except Exception:
        return None
    return None


def elements_to_polygons(elements: list, bbox_wgs84: tuple, buffer_m=None):
    import geopandas as gpd
    from shapely.geometry import box
    w, s, e, n = bbox_wgs84
    clip_poly = box(w, s, e, n)

    raw = [g for el in elements
           if (g := osm_element_to_shapely(el)) is not None
           and not g.is_empty]
    if not raw:
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")

    gdf   = gpd.GeoDataFrame(geometry=raw, crs="EPSG:4326")
    utm   = gdf.estimate_utm_crs()
    gdf_m = gdf.to_crs(utm)

    polys = []
    for geom in gdf_m.geometry:
        gt = geom.geom_type
        if gt in ("Polygon", "MultiPolygon"):
            polys.append(geom.buffer(0))
        elif gt in ("LineString", "MultiLineString") and buffer_m:
            polys.append(geom.buffer(buffer_m / 2))
        elif gt in ("Point", "MultiPoint"):
            polys.append(geom.buffer(10))
        elif gt == "GeometryCollection":
            for part in geom.geoms:
                pt = part.geom_type
                if pt in ("Polygon", "MultiPolygon"):
                    polys.append(part.buffer(0))
                elif pt in ("LineString", "MultiLineString") and buffer_m:
                    polys.append(part.buffer(buffer_m / 2))

    if not polys:
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")

    result = gpd.GeoDataFrame(geometry=polys, crs=utm).to_crs("EPSG:4326")
    result["geometry"] = result.geometry.intersection(clip_poly)
    result = result[
        result.geometry.is_valid & ~result.geometry.is_empty
    ].reset_index(drop=True)
    return result


def fetch_building_cluster_polygons(bbox_wgs84, app=None):
    """Fallback-Layer für Siedlung: dissolved Gebäude-Cluster oberhalb einer
    Mindestfläche (siehe SIEDLUNG_BUILDING_*). Fängt Orte auf, die in OSM nur
    über einzelne building-Umrisse ohne landuse=residential erfasst sind.
    Gibt ein leeres GeoDataFrame zurück, wenn die Anfrage fehlschlägt oder
    keine Cluster über der Mindestfläche liegen (kein harter Fehler)."""
    import geopandas as gpd

    query  = build_query(bbox_wgs84, ['["building"]'])
    result = overpass_request(query, app)
    if result is None:
        if app: app.log_write("   ⚠ Siedlung-Fallback (Gebäude): keine Antwort", "warn")
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")

    elements = result.get("elements", [])
    gdf = elements_to_polygons(elements, bbox_wgs84, buffer_m=None)
    if gdf.empty:
        return gdf

    # Gebäude leicht aufblasen, damit benachbarte Häuser eines Orts verschmelzen,
    # dann zu einem einzigen Cluster-Polygon vereinigen.
    utm = gdf.estimate_utm_crs()
    gdf_m = gdf.to_crs(utm)
    buffered = gdf_m.geometry.buffer(SIEDLUNG_BUILDING_BUFFER_M)
    merged   = buffered.union_all() if hasattr(buffered, "union_all") else buffered.unary_union

    from shapely.geometry import MultiPolygon
    polys = list(merged.geoms) if merged.geom_type == "MultiPolygon" else [merged]
    # Zurück auf die ursprüngliche Gebäudefläche schrumpfen (Puffer nur zum
    # Verschmelzen genutzt), dann nach Mindestfläche filtern.
    clusters = [p.buffer(-SIEDLUNG_BUILDING_BUFFER_M) for p in polys]
    clusters = [c for c in clusters if not c.is_empty and c.area >= SIEDLUNG_BUILDING_MIN_AREA_M2]

    if not clusters:
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")

    result_gdf = gpd.GeoDataFrame(geometry=clusters, crs=utm).to_crs("EPSG:4326")
    if app: app.log_write(f"   [Siedlung-Fallback] {len(result_gdf)} Gebäude-Cluster ≥ {SIEDLUNG_BUILDING_MIN_AREA_M2} m²", "ok")
    return result_gdf


# ═══════════════════════════════════════════════════════════════════════
# PIPELINE
# ═══════════════════════════════════════════════════════════════════════
def run_pipeline(app):
    import rasterio
    from rasterio.crs import CRS
    from rasterio.warp import transform_bounds
    import numpy as np
    from PIL import Image
    import geopandas as gpd

    for d in [INPUT_DIR, EO_DIR, HITBOX_DIR, DATA_DIR]:
        os.makedirs(d, exist_ok=True)

    # ── 1. TIFs finden (dedupliziert) ────────────────────────────────
    app.log_write("── Schritt 1: TIF-Dateien suchen …", "info")
    seen = set()
    tifs = []
    for pattern in ["*.tif", "*.TIF", "*.tiff", "*.TIFF"]:
        for p in sorted(glob.glob(os.path.join(INPUT_DIR, pattern))):
            norm = os.path.normcase(os.path.abspath(p))
            if norm not in seen:
                seen.add(norm)
                tifs.append(p)
    tifs = sorted(tifs)

    if not tifs:
        app.log_write(f"⚠  Keine TIF-Dateien in {INPUT_DIR}", "err")
        app.set_progress(0, "Keine TIFs gefunden.")
        return

    app.log_write(f"   {len(tifs)} TIF(s) gefunden:", "ok")
    for t in tifs:
        app.log_write(f"   • {os.path.basename(t)}")

    levels = []
    n      = len(tifs)

    for idx, tif_path in enumerate(tifs):
        bname   = f"B{idx + 1}"
        png_out = os.path.join(EO_DIR,     f"{bname}norm.png")
        geo_out = os.path.join(HITBOX_DIR,  f"{bname}puf.geojson")
        base_pct = int(idx / n * 85)

        app.log_write(f"\n{'─'*55}", "info")
        app.log_write(f"  {bname}  ←  {os.path.basename(tif_path)}", "info")
        app.set_progress(base_pct, f"{bname}: lese Bounds …")

        # ── 2. Bounds lesen + Zuschnitt ───────────────────────────────
        try:
            with rasterio.open(tif_path) as ds:
                if ds.crs is None:
                    raise ValueError("Keine CRS-Information im TIF.")
                cols, rows = ds.width, ds.height

                # 4:3-Zuschnitt (zentriert)
                img_ratio = cols / rows
                if abs(img_ratio - ASPECT) > 0.01:
                    if img_ratio > ASPECT:
                        new_cols = int(rows * ASPECT)
                        col_off  = (cols - new_cols) // 2
                        row_off, new_rows = 0, rows
                    else:
                        new_rows = int(cols / ASPECT)
                        row_off  = (rows - new_rows) // 2
                        col_off, new_cols = 0, cols
                    app.log_write(
                        f"   Zuschnitt: {cols}×{rows} → {new_cols}×{new_rows} (4:3)",
                        "warn")
                else:
                    col_off = row_off = 0
                    new_cols, new_rows = cols, rows
                    app.log_write(f"   Bildgröße: {cols}×{rows} (bereits 4:3)", "ok")

                window    = rasterio.windows.Window(col_off, row_off, new_cols, new_rows)
                win_bounds = rasterio.windows.bounds(window, ds.transform)
                west, south, east, north = transform_bounds(
                    ds.crs, CRS.from_epsg(4326), *win_bounds)

                geo_bounds = [[round(south, 6), round(west, 6)],
                              [round(north, 6), round(east, 6)]]
                bbox_wgs84 = (west, south, east, north)
                app.log_write(f"   Bounds: {geo_bounds}", "ok")

                # ── 3. PNG konvertieren ───────────────────────────────
                app.set_progress(base_pct + 5, f"{bname}: PNG …")
                app.log_write("   Konvertiere zu PNG …")

                def norm_band(arr):
                    arr   = arr.astype(float)
                    valid = arr[arr > arr.min()]
                    if len(valid) == 0:
                        return np.zeros(arr.shape, dtype=np.uint8)
                    p2, p98 = np.percentile(valid, (2, 98))
                    arr = np.clip(arr, p2, p98)
                    if p98 > p2:
                        arr = (arr - p2) / (p98 - p2) * 255
                    return arr.astype(np.uint8)

                nb = ds.count
                if nb >= 3:
                    r     = norm_band(ds.read(1, window=window))
                    g     = norm_band(ds.read(2, window=window))
                    b_arr = norm_band(ds.read(3, window=window))
                else:
                    r = g = b_arr = norm_band(ds.read(1, window=window))

                rgb = np.stack([r, g, b_arr], axis=-1)
                Image.fromarray(rgb, "RGB")\
                     .resize((TARGET_W, TARGET_H), Image.LANCZOS)\
                     .save(png_out, "PNG")
                app.log_write(
                    f"   PNG gespeichert ({TARGET_W}×{TARGET_H} px) → "
                    f"{os.path.basename(png_out)}", "ok")

        except Exception as e:
            app.log_write(f"   ⚠ TIF-Fehler: {e}", "err")
            continue

        # ── 4. OSM-Hitboxes ───────────────────────────────────────────
        app.set_progress(base_pct + 15, f"{bname}: OSM …")
        app.log_write("   OSM-Daten abrufen …")
        layers = []

        try:
            for klasse, cfg in OSM_CLASSES.items():
                app.log_write(f"   Klasse: {klasse}")
                query  = build_query(bbox_wgs84, cfg["filters"])
                result = overpass_request(query, app)
                if result is None:
                    # Kompletter Ausfall (alle Endpunkte/Retries erschöpft) darf NICHT
                    # stillschweigend als "0 Elemente = absent" durchgehen – das hat
                    # in der Vergangenheit zu falschen "absent"-Flags in config.json
                    # geführt (Klasse war real vorhanden, Overpass hat nur nicht
                    # geantwortet). Stattdessen wird das ganze Level übersprungen.
                    raise RuntimeError(
                        f"Overpass-Anfrage für Klasse '{klasse}' fehlgeschlagen "
                        f"(alle Endpunkte/Retries erschöpft)")
                elements = result.get("elements", [])
                app.log_write(f"   [{klasse}] {len(elements)} Elemente")
                gdf = elements_to_polygons(elements, bbox_wgs84, cfg["buffer_m"])

                if klasse == "Siedlung":
                    fallback = fetch_building_cluster_polygons(bbox_wgs84, app)
                    time.sleep(3)
                    if not fallback.empty:
                        gdf = gpd.pd.concat([gdf, fallback], ignore_index=True) \
                              if not gdf.empty else fallback

                if not gdf.empty:
                    gdf["klasse"] = klasse
                    layers.append(gdf)
                    app.log_write(f"   [{klasse}] → {len(gdf)} Polygone", "ok")
                else:
                    app.log_write(f"   [{klasse}] → keine Polygone")
                time.sleep(3)
        except RuntimeError as e:
            app.log_write(f"   ✗ {bname} übersprungen: {e}", "err")
            app.log_write(
                f"   → {bname} wurde NICHT in config.json übernommen. "
                f"Pipeline später erneut ausführen, um dieses Level nachzuholen.", "err")
            continue

        # ── 5. Dissolve + speichern ───────────────────────────────────
        app.set_progress(base_pct + 25, f"{bname}: dissolve …")
        app.log_write("   Polygon-Reduktion (dissolve) …")

        if layers:
            combined = gpd.pd.concat(layers, ignore_index=True)[["klasse","geometry"]]
            combined["geometry"] = combined.geometry.buffer(0)
            combined = combined[combined.geometry.is_valid & ~combined.geometry.is_empty]

            # dissolve fasst überlappende Polygone pro Klasse zusammen,
            # explode zerlegt MultiPolygons wieder in Einzelpolygone
            dissolved = combined.dissolve(by="klasse", as_index=False)
            dissolved = dissolved.explode(index_parts=False).reset_index(drop=True)

            # Strict clip to image bounds – removes anything outside the image
            from shapely.geometry import box as shp_box
            clip_box = shp_box(west, south, east, north)
            dissolved["geometry"] = dissolved.geometry.intersection(clip_box)
            dissolved = dissolved[
                dissolved.geometry.is_valid &
                ~dissolved.geometry.is_empty &
                dissolved.geometry.geom_type.isin(
                    ["Polygon","MultiPolygon","GeometryCollection"])
            ].reset_index(drop=True)

            app.log_write(
                f"   {len(combined)} → {len(dissolved)} Features nach dissolve+clip", "ok")

            features_out = []
            for _, row in dissolved.iterrows():
                geom = row.geometry
                # Flatten GeometryCollections to only polygons
                if geom.geom_type == "GeometryCollection":
                    from shapely.geometry import MultiPolygon
                    polys = [g for g in geom.geoms
                             if g.geom_type in ("Polygon","MultiPolygon")]
                    if not polys:
                        continue
                    geom = polys[0] if len(polys)==1 else MultiPolygon(polys)
                features_out.append({
                    "type": "Feature",
                    "properties": {"klasse": row["klasse"]},
                    "geometry": geom.__geo_interface__
                })
            geojson = {"type": "FeatureCollection", "features": features_out}
            with open(geo_out, "w", encoding="utf-8") as f:
                json.dump(geojson, f, ensure_ascii=False)
        else:
            app.log_write("   Keine OSM-Daten – leeres GeoJSON.", "warn")
            geojson = {"type": "FeatureCollection", "features": []}
            with open(geo_out, "w", encoding="utf-8") as f:
                json.dump(geojson, f)

        app.log_write(
            f"   GeoJSON gespeichert → {os.path.basename(geo_out)}", "ok")

        # ── 6. Flächenanteile ─────────────────────────────────────────
        absent, absent_opt, areas = compute_areas(geojson, geo_bounds)
        app.log_write("   Flächenanteile:")
        for k, v in sorted(areas.items(), key=lambda x: -x[1]):
            flag = "  ← unter Schwellenwert" if k in absent_opt else ""
            app.log_write(f"     {k:12s} {v*100:5.1f} %{flag}")

        levels.append({
            "id":              bname,
            "imgSrc":          f"./Bilder/EO_Bilder/{bname}norm.png",
            "geojsonSrc":      f"./Bilder/Hitboxes/{bname}puf.geojson",
            "bounds":          geo_bounds,
            "absent":          absent,
            "absent_optional": absent_opt,
            "areas":           areas,
        })

    # ── 7. config.json ────────────────────────────────────────────────
    app.set_progress(95, "config.json …")
    app.log_write("\n── config.json schreiben …", "info")
    config = {
        "labels":         ALL_LABELS,
        "area_threshold": AREA_THRESHOLD,
        "levels":         levels,
    }
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    app.log_write(f"   Geschrieben → {CONFIG_FILE}", "ok")

    app.set_progress(100, "✅  Fertig!")
    app.log_write(
        f"\n✅  Pipeline abgeschlossen – {len(levels)} Level verarbeitet.", "done")
    app.log_write("   Auf GitHub hochladen:", "done")
    app.log_write("   • Bilder/EO_Bilder/   (PNGs)", "done")
    app.log_write("   • Bilder/Hitboxes/    (GeoJSONs)", "done")
    app.log_write("   • data/config.json", "done")


# ═══════════════════════════════════════════════════════════════════════
# AREA HELPERS
# ═══════════════════════════════════════════════════════════════════════
def to_mercator(lon, lat):
    R    = 6378137
    x    = lon * math.pi / 180 * R
    sinL = math.sin(lat * math.pi / 180)
    y    = R * math.log((1 + sinL) / (1 - sinL)) / 2
    return x, y

def ring_area_m2(ring):
    pts  = [to_mercator(c[0], c[1]) for c in ring]
    n    = len(pts)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += pts[i][0] * pts[j][1]
        area -= pts[j][0] * pts[i][1]
    return abs(area) / 2.0

def image_area_m2(bounds):
    x0, y0 = to_mercator(bounds[0][1], bounds[0][0])
    x1, y1 = to_mercator(bounds[1][1], bounds[1][0])
    return abs(x1 - x0) * abs(y1 - y0)

def extract_outer_rings(geom):
    t = geom["type"]
    if t == "Polygon":      return [geom["coordinates"][0]]
    if t == "MultiPolygon": return [p[0] for p in geom["coordinates"]]
    return []

def compute_areas(geojson, bounds):
    img_area    = image_area_m2(bounds)
    klasse_area = {}
    for feat in geojson.get("features", []):
        k = feat.get("properties", {}).get("klasse")
        if not k: continue
        for ring in extract_outer_rings(feat["geometry"]):
            klasse_area[k] = klasse_area.get(k, 0.0) + ring_area_m2(ring)
    present = []; absent_opt = []; areas = {}
    for k, area in klasse_area.items():
        ratio    = area / img_area if img_area > 0 else 0
        areas[k] = round(ratio, 4)
        (present if ratio >= AREA_THRESHOLD else absent_opt).append(k)
    absent = sorted(ALL_LABEL_IDS - set(klasse_area.keys()))
    return absent, sorted(absent_opt), areas


# ═══════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    App().mainloop()