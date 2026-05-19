"""
pipeline.py – EO Visual Complexity Experiment
═══════════════════════════════════════════════
Doppelklick-Pipeline für Windows.

Was passiert automatisch:
  1. TIFs aus input/ einlesen
  2. Auf 4:3 Seitenverhältnis zentriert zuschneiden
  3. Als 1024×768 px PNG speichern → Bilder/EO_Bilder/
  4. OSM-Daten (Overpass API) für Bild-Bounds abrufen
  5. Polygone per Klasse auflösen (dissolve) → Polygon-Reduktion
  6. Als GeoJSON speichern → Bilder/Hitboxes/
  7. Flächenanteile berechnen, absent/absent_optional setzen
  8. data/config.json aktualisieren

Parameter (aus bestehenden Bildern abgeleitet):
  Seitenverhältnis : 4:3
  Ausgabe-Auflösung: 1024 × 768 px
  Zuschnitt        : zentriert
  Polygon-Reduktion: geopandas dissolve(by="klasse")

Abhängigkeiten (einmalig via build_exe.bat installieren):
  pip install rasterio numpy pillow requests geopandas shapely pyinstaller
"""

import os, sys, json, math, glob, time, traceback
import tkinter as tk
from tkinter import scrolledtext, ttk
import threading

# ── Konstanten ───────────────────────────────────────────────────────────
SCRIPT_DIR    = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR     = os.path.join(SCRIPT_DIR, "input")
EO_DIR        = os.path.join(SCRIPT_DIR, "Bilder", "EO_Bilder")
HITBOX_DIR    = os.path.join(SCRIPT_DIR, "Bilder", "Hitboxes")
DATA_DIR      = os.path.join(SCRIPT_DIR, "data")
CONFIG_FILE   = os.path.join(DATA_DIR, "config.json")

TARGET_W      = 1024   # px
TARGET_H      = 768    # px  → 4:3
ASPECT        = TARGET_W / TARGET_H   # 1.3333…

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

# OSM Overpass queries per Klasse
OSM_QUERIES = {
    "Wald": """
        way["landuse"="forest"](bbox);
        way["natural"="wood"](bbox);
        relation["landuse"="forest"](bbox);
        relation["natural"="wood"](bbox);
    """,
    "Fluss": """
        way["waterway"~"river|stream|canal"](bbox);
        relation["waterway"~"river|stream|canal"](bbox);
    """,
    "Siedlung": """
        way["landuse"~"residential|commercial|industrial|retail"](bbox);
        relation["landuse"~"residential|commercial|industrial|retail"](bbox);
    """,
    "Acker": """
        way["landuse"~"farmland|meadow|orchard|vineyard|allotments"](bbox);
        relation["landuse"~"farmland|meadow|orchard|vineyard|allotments"](bbox);
    """,
    "Straße": """
        way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified"](bbox);
    """,
    "See": """
        way["natural"="water"](bbox);
        way["landuse"="reservoir"](bbox);
        relation["natural"="water"](bbox);
        relation["type"="multipolygon"]["natural"="water"](bbox);
    """,
}


# ═══════════════════════════════════════════════════════════════════════
# GUI
# ═══════════════════════════════════════════════════════════════════════
class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("EO Pipeline – rgeo")
        self.geometry("720x540")
        self.configure(bg="#0a3f70")
        self.resizable(False, False)

        # Header
        hdr = tk.Frame(self, bg="#0a3f70")
        hdr.pack(fill="x", padx=20, pady=(18, 0))
        tk.Label(hdr, text="EO · PIPELINE",
                 font=("Segoe UI", 10, "bold"),
                 fg="#0ca4d1", bg="#0a3f70").pack(anchor="w")
        tk.Label(hdr, text="Automatische Bildverarbeitung",
                 font=("Segoe UI", 18, "bold"),
                 fg="white", bg="#0a3f70").pack(anchor="w")

        # Info
        info = tk.Frame(self, bg="#083060")
        info.pack(fill="x", padx=20, pady=10)
        tk.Label(info,
                 text="  TIF-Dateien in input\\  legen → Pipeline starten"
                      "   │   Ausgabe: 1024×768 px, 4:3, OSM-Hitboxes",
                 font=("Segoe UI", 9),
                 fg="#c6c6c6", bg="#083060", pady=8).pack(anchor="w")

        # Progress
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

        # Log
        self.log = scrolledtext.ScrolledText(
            self, height=17, font=("Segoe UI", 9),
            bg="#051830", fg="#c6c6c6",
            insertbackground="white",
            relief="flat", bd=0, state="disabled")
        self.log.pack(fill="both", expand=True, padx=20, pady=6)
        self.log.tag_config("ok",   foreground="#fdc300")
        self.log.tag_config("err",  foreground="#b71918")
        self.log.tag_config("info", foreground="#0ca4d1")
        self.log.tag_config("done", foreground="#84993d")
        self.log.tag_config("warn", foreground="#ec6608")

        # Buttons
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
# PIPELINE
# ═══════════════════════════════════════════════════════════════════════
def run_pipeline(app):
    import rasterio
    from rasterio.warp import transform_bounds
    import numpy as np
    from PIL import Image
    import requests
    import geopandas as gpd
    from shapely.geometry import shape

    for d in [INPUT_DIR, EO_DIR, HITBOX_DIR, DATA_DIR]:
        os.makedirs(d, exist_ok=True)

    # ── 1. TIFs finden ────────────────────────────────────────────────
    app.log_write("── Schritt 1: TIF-Dateien suchen …", "info")
    tifs = sorted(
        glob.glob(os.path.join(INPUT_DIR, "*.tif"))  +
        glob.glob(os.path.join(INPUT_DIR, "*.TIF"))  +
        glob.glob(os.path.join(INPUT_DIR, "*.tiff")) +
        glob.glob(os.path.join(INPUT_DIR, "*.TIFF"))
    )
    if not tifs:
        app.log_write(f"⚠  Keine TIF-Dateien in {INPUT_DIR}", "err")
        app.set_progress(0, "Keine TIFs gefunden.")
        return
    app.log_write(f"   {len(tifs)} TIF(s) gefunden.", "ok")

    levels   = []
    n        = len(tifs)

    for idx, tif_path in enumerate(tifs):
        bname    = f"B{idx + 1}"
        png_out  = os.path.join(EO_DIR,     f"{bname}norm.png")
        geo_out  = os.path.join(HITBOX_DIR,  f"{bname}puf.geojson")
        base_pct = int(idx / n * 85)

        app.log_write(f"\n{'─'*55}", "info")
        app.log_write(f"  {bname}  ←  {os.path.basename(tif_path)}", "info")
        app.set_progress(base_pct, f"{bname}: Bounds lesen …")

        # ── 2. Bounds + Zuschnitt berechnen ──────────────────────────
        try:
            with rasterio.open(tif_path) as ds:
                crs     = ds.crs
                n_bands = ds.count
                cols    = ds.width
                rows    = ds.height
                transform = ds.transform

                # Pixel-Zuschnitt auf 4:3 (zentriert)
                img_ratio = cols / rows
                if abs(img_ratio - ASPECT) > 0.01:
                    if img_ratio > ASPECT:
                        # zu breit → links/rechts beschneiden
                        new_cols = int(rows * ASPECT)
                        col_off  = (cols - new_cols) // 2
                        row_off  = 0
                        new_rows = rows
                    else:
                        # zu hoch → oben/unten beschneiden
                        new_rows = int(cols / ASPECT)
                        row_off  = (rows - new_rows) // 2
                        col_off  = 0
                        new_cols = cols
                    app.log_write(
                        f"   Zuschnitt: {cols}×{rows} → {new_cols}×{new_rows} (4:3)",
                        "warn")
                else:
                    col_off = 0; row_off = 0
                    new_cols = cols; new_rows = rows
                    app.log_write(f"   Bildgröße: {cols}×{rows} (bereits 4:3)", "ok")

                # Geo-Bounds des zugeschnittenen Bereichs
                win = rasterio.windows.Window(col_off, row_off,
                                               new_cols, new_rows)
                win_transform = ds.window_transform(win)
                win_bounds    = rasterio.windows.bounds(win, ds.transform)
                left, bottom, right, top = win_bounds

                if crs.to_epsg() != 4326:
                    left, bottom, right, top = transform_bounds(
                        crs, "EPSG:4326", left, bottom, right, top)

                geo_bounds = [[round(bottom, 6), round(left, 6)],
                              [round(top, 6),    round(right, 6)]]
                app.log_write(f"   Bounds: {geo_bounds}", "ok")

                # ── 3. PNG konvertieren ───────────────────────────────
                app.set_progress(base_pct + 5, f"{bname}: PNG konvertieren …")
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

                window = rasterio.windows.Window(col_off, row_off,
                                                  new_cols, new_rows)
                if n_bands >= 3:
                    r     = norm_band(ds.read(1, window=window))
                    g     = norm_band(ds.read(2, window=window))
                    b_arr = norm_band(ds.read(3, window=window))
                else:
                    r = g = b_arr = norm_band(ds.read(1, window=window))

                rgb = np.stack([r, g, b_arr], axis=-1)
                img = Image.fromarray(rgb, "RGB").resize(
                    (TARGET_W, TARGET_H), Image.LANCZOS)
                img.save(png_out, "PNG")
                app.log_write(
                    f"   PNG gespeichert ({TARGET_W}×{TARGET_H} px) → {png_out}", "ok")

        except Exception as e:
            app.log_write(f"   ⚠ Fehler TIF-Verarbeitung: {e}", "err")
            continue

        # ── 4. OSM-Daten abrufen ─────────────────────────────────────
        app.set_progress(base_pct + 15, f"{bname}: OSM abrufen …")
        app.log_write("   OSM-Daten abrufen …")
        south, west = geo_bounds[0]
        north, east = geo_bounds[1]
        bbox_str    = f"{south},{west},{north},{east}"
        all_features = []

        for klasse, osm_body in OSM_QUERIES.items():
            query = (
                "[out:json][timeout:90];\n(\n"
                + osm_body.replace("(bbox)", f"({bbox_str})")
                + "\n);\nout geom;"
            )
            try:
                resp = requests.post(
                    "https://overpass-api.de/api/interpreter",
                    data={"data": query}, timeout=120)
                resp.raise_for_status()
                elements = resp.json().get("elements", [])
                app.log_write(f"   {klasse:10s}: {len(elements):4d} Elemente")

                for el in elements:
                    geom = osm_to_geometry(el)
                    if geom:
                        all_features.append({
                            "type": "Feature",
                            "properties": {"klasse": klasse,
                                           "osm_id": el.get("id")},
                            "geometry": geom,
                        })
            except Exception as e:
                app.log_write(f"   ⚠ OSM-Fehler {klasse}: {e}", "err")
            time.sleep(0.8)   # Overpass rate-limit

        # ── 5. Polygon-Reduktion via dissolve ─────────────────────────
        app.set_progress(base_pct + 25, f"{bname}: Polygone reduzieren …")
        app.log_write("   Polygon-Reduktion (dissolve by Klasse) …")
        try:
            if all_features:
                gdf = gpd.GeoDataFrame.from_features(all_features, crs="EPSG:4326")
                # dissolve: alle Polygone gleicher Klasse zusammenführen
                dissolved = gdf.dissolve(by="klasse", as_index=False)
                # Nur relevante Spalten behalten
                dissolved = dissolved[["klasse", "geometry"]]
                before = len(gdf)
                after  = len(dissolved)
                app.log_write(
                    f"   {before} Features → {after} nach dissolve", "ok")

                # Zurück zu GeoJSON-Features
                reduced_features = []
                for _, row in dissolved.iterrows():
                    geom = row.geometry
                    if geom is None or geom.is_empty:
                        continue
                    reduced_features.append({
                        "type": "Feature",
                        "properties": {"klasse": row["klasse"]},
                        "geometry": geom.__geo_interface__,
                    })
            else:
                reduced_features = []
                app.log_write("   Keine OSM-Features gefunden.", "warn")

        except Exception as e:
            app.log_write(f"   ⚠ Dissolve-Fehler: {e}", "err")
            reduced_features = all_features   # fallback: undissolved

        # ── 6. GeoJSON speichern ──────────────────────────────────────
        geojson = {"type": "FeatureCollection", "features": reduced_features}
        with open(geo_out, "w", encoding="utf-8") as f:
            json.dump(geojson, f, ensure_ascii=False)
        app.log_write(
            f"   GeoJSON gespeichert ({len(reduced_features)} Features) → {geo_out}",
            "ok")

        # ── 7. Flächenanteile ─────────────────────────────────────────
        absent, absent_opt, areas = compute_areas(geojson, geo_bounds)
        app.log_write("   Flächenanteile:")
        for k, v in sorted(areas.items(), key=lambda x: -x[1]):
            flag = " ← unter Schwellenwert" if k in absent_opt else ""
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

    # ── 8. config.json schreiben ──────────────────────────────────────
    app.set_progress(92, "config.json schreiben …")
    app.log_write("\n── config.json schreiben …", "info")
    config = {
        "labels":         ALL_LABELS,
        "area_threshold": AREA_THRESHOLD,
        "levels":         levels,
    }
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    app.log_write(f"   Geschrieben → {CONFIG_FILE}", "ok")

    app.set_progress(100, "✅  Fertig!")
    app.log_write(
        f"\n✅  Pipeline abgeschlossen – {len(levels)} Level verarbeitet.", "done")
    app.log_write(
        "   Dateien auf GitHub hochladen:", "done")
    app.log_write(
        "   • Bilder/EO_Bilder/  (PNGs)", "done")
    app.log_write(
        "   • Bilder/Hitboxes/   (GeoJSONs)", "done")
    app.log_write(
        "   • data/config.json", "done")


# ═══════════════════════════════════════════════════════════════════════
# HILFSFUNKTIONEN
# ═══════════════════════════════════════════════════════════════════════
def osm_to_geometry(el):
    """Overpass 'out geom' Element → GeoJSON geometry dict."""
    t = el.get("type")
    if t == "way":
        nodes = el.get("geometry", [])
        if len(nodes) < 3:
            return None
        coords = [[n["lon"], n["lat"]] for n in nodes]
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        return {"type": "Polygon", "coordinates": [coords]}

    elif t == "relation":
        outer = []
        for m in el.get("members", []):
            if m.get("type") == "way" and m.get("role") in ("outer", ""):
                nodes = m.get("geometry", [])
                if len(nodes) >= 3:
                    coords = [[n["lon"], n["lat"]] for n in nodes]
                    if coords[0] != coords[-1]:
                        coords.append(coords[0])
                    outer.append(coords)
        if not outer:
            return None
        if len(outer) == 1:
            return {"type": "Polygon", "coordinates": outer}
        return {"type": "MultiPolygon", "coordinates": [[r] for r in outer]}
    return None


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
    if t == "Polygon":
        return [geom["coordinates"][0]]
    if t == "MultiPolygon":
        return [p[0] for p in geom["coordinates"]]
    return []


def compute_areas(geojson, bounds):
    img_area    = image_area_m2(bounds)
    klasse_area = {}
    for feat in geojson.get("features", []):
        k = feat.get("properties", {}).get("klasse")
        if not k:
            continue
        for ring in extract_outer_rings(feat["geometry"]):
            klasse_area[k] = klasse_area.get(k, 0.0) + ring_area_m2(ring)

    present = []
    absent_opt = []
    areas = {}
    for k, area in klasse_area.items():
        ratio   = area / img_area if img_area > 0 else 0
        areas[k] = round(ratio, 4)
        if ratio >= AREA_THRESHOLD:
            present.append(k)
        else:
            absent_opt.append(k)

    absent = sorted(ALL_LABEL_IDS - set(klasse_area.keys()))
    return absent, sorted(absent_opt), areas


# ═══════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    App().mainloop()
