"""
pipeline.py – EO Visual Complexity Experiment
═══════════════════════════════════════════════
Doppelklick-Pipeline für Windows (via Verarbeitung_starten.bat).

Was passiert automatisch:
  1. TIFs aus input/ einlesen (jede Datei genau einmal)
  2. Auf 4:3 zentriert zuschneiden → 1024×768 px PNG
  3. Hitboxes für 4 Klassen (Wald, Acker, Gebäude, Wasser):
     OSM/Overpass ist die bevorzugte Quelle (höhere Auflösung); das
     ESA-WorldCover-10m-Landbedeckungsraster füllt nur echte Lücken (wo OSM
     buchstäblich nichts hat) und dient als Gegenprobe auf Widersprüche.
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
    {"id": "Wald",    "text": "Wald",                  "icon": "🌲"},
    {"id": "Acker",   "text": "Grünland/Landwirtschaft", "icon": "🌾"},
    {"id": "Gebäude", "text": "Gebäude/Infrastruktur",  "icon": "🏘️"},
    {"id": "Wasser",  "text": "Wasser",                "icon": "💧"},
]
ALL_LABEL_IDS = {l["id"] for l in ALL_LABELS}

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# OSM-Klassen-Definition (bevorzugte/primäre Quelle für alle 4 Klassen)
# – Wasser vereint frühere See+Fluss-Filter (Unterscheidung fließend/stehend
#   war mit den verfügbaren Quellen zu unsicher, daher eine gemeinsame Klasse)
# – Gebäude (vormals Siedlung) ohne building-Tag (Einzelgebäude im Wald/Acker
#   ausgeschlossen) – Lücken bei nur-Gebäude-ohne-Landuse gemappten Orten
#   werden durch das WorldCover-Raster gefüllt, siehe fetch_worldcover_window()
# – Acker ohne grass (urbane Grünflächen ausgeschlossen)
OSM_CLASSES = {
    "Wald": {
        "filters": [
            '["landuse"~"^(forest|wood)$"]',
            '["natural"~"^(wood|scrub|heath)$"]',
        ],
        "buffer_m": None,
    },
    "Wasser": {
        "filters": [
            '["natural"="water"]',
            '["waterway"~"^(river|stream|canal|drain|ditch)$"]',
            '["landuse"~"^(reservoir|basin)$"]',
        ],
        "buffer_m": 50,   # wirkt nur auf LineStrings (waterway), Polygone unangetastet
    },
    "Gebäude": {
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
}

# ── ESA WorldCover 10m (Lückenfüller + Gegenprobe, siehe fetch_worldcover_window) ──
# Öffentlicher S3-Bucket, kein Login/API-Key nötig. COGs in EPSG:4326 –
# kein Reprojizieren nötig, Level-Bboxen sind immer << 3° groß (Grid-Kachelgröße).
WORLDCOVER_GRID_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v100/2020/esa_worldcover_2020_grid.geojson"
WORLDCOVER_BASE_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map"
# Klasse → Tupel der zugehörigen WorldCover-Pixelwerte
# (10 Tree cover, 30 Grassland, 40 Cropland, 50 Built-up, 80 Permanent water bodies)
WORLDCOVER_RECLASS = {
    "Wald":    (10,),
    "Acker":   (30, 40),
    "Gebäude": (50,),
    "Wasser":  (80,),
}
WORLDCOVER_CONTRADICTION_THRESHOLD = 0.5  # >50% abweichende Pixel → Warnung loggen


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


_worldcover_grid_cache = None  # Modul-Cache: Grid-GeoJSON nur einmal pro Lauf laden


def _load_worldcover_grid():
    global _worldcover_grid_cache
    if _worldcover_grid_cache is None:
        import geopandas as gpd
        _worldcover_grid_cache = gpd.read_file(WORLDCOVER_GRID_URL)
    return _worldcover_grid_cache


def fetch_worldcover_window(bbox_wgs84, app=None):
    """Lädt den ESA-WorldCover-10m-Ausschnitt für die gegebene bbox (west,
    south, east, north) und gibt (numpy-Array, affine Transform) zurück –
    beide in EPSG:4326, direkt kompatibel mit den bbox-Koordinaten der
    Pipeline. Schlägt der Abruf fehl, wird eine Exception geworfen (analog
    zum Overpass-Hartfehler: das Level wird dann komplett übersprungen,
    statt mit einer stillschweigend leeren/falschen Maske weiterzumachen)."""
    import rasterio
    from rasterio.windows import from_bounds
    from shapely.geometry import box

    west, south, east, north = bbox_wgs84
    grid = _load_worldcover_grid()
    hit  = grid[grid.geometry.intersects(box(west, south, east, north))]
    if hit.empty:
        raise RuntimeError(f"Keine WorldCover-Kachel für bbox {bbox_wgs84} gefunden")

    tile_arrays = []
    transform   = None
    for tile in hit["ll_tile"]:
        url = f"{WORLDCOVER_BASE_URL}/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
        try:
            with rasterio.open(f"/vsicurl/{url}") as ds:
                window = from_bounds(west, south, east, north, ds.transform)
                arr    = ds.read(1, window=window)
                transform = ds.window_transform(window)
                tile_arrays.append(arr)
        except Exception as e:
            raise RuntimeError(f"WorldCover-Kachel {tile} nicht abrufbar: {e}")

    if len(tile_arrays) == 1:
        return tile_arrays[0], transform

    # Seltener Fall: bbox liegt auf einer Kachelgrenze → einfach überlagern
    # (Level-Bboxen sind immer << 3° groß, i.d.R. genau 1 Treffer).
    import numpy as np
    merged = tile_arrays[0].copy()
    for arr in tile_arrays[1:]:
        mask = merged == 0
        merged[mask] = arr[mask]
    return merged, transform


EROSION_MIN_WIDTH_M = 60.0  # siehe Memory project_geogame_visibility_erosion_idea


def native_window_to_wgs84_polygon(ds_crs, win_bounds):
    """Baut das tatsaechliche WGS84-Viereck des Zuschnittfensters, indem die
    VIER ECKPUNKTE einzeln reprojiziert werden -- NICHT ueber
    rasterio.warp.transform_bounds()/die umschliessende achsparallele
    Bounding-Box. Fuer CRSe wie EPSG:3035 (LAEA Europe) abseits des
    Projektionszentrums ist das native Fenster in WGS84 ein leicht
    GEDREHTES Viereck, keine achsparallele Box - die umschliessende Bbox
    ist deshalb immer groesser als das echte Fenster (sie deckt auch die
    "Eckzwickel" ausserhalb des gedrehten Vierecks ab).

    Bug gefunden von Julian+Nils an IMG_00072 (2026-09-02, siehe Memory
    project_geogame_real_imagery): der bisherige "strikte" Zuschnitt
    (naiv gegen shapely.geometry.box(west,south,east,north)) liess
    OSM/WorldCover-Polygonstuecke aus genau diesen Eckzwickeln durch, die
    dann bei der Pixel-Bruchteil-Umrechnung (siehe native_geom_to_pixel_
    fraction/wgs84_geom_to_pixel_fraction, deren np.clip(...,0,1) das
    Ueberschiessen einfach auf den Rand staucht statt es abzuschneiden)
    als kerzengerader, leicht schraeger Schnitt am Bildrand sichtbar
    wurden - viele Punkte landeten exakt auf Bruchteil 0.0/1.0 statt einer
    natuerlichen Gelaende-Kontur zu folgen. Diese Funktion liefert das
    fuer den Zuschnitt tatsaechlich richtige (gedrehte) Polygon; die
    fetch-Bbox fuer OSM/WorldCover-Anfragen darf weiterhin die groesszue-
    gigere achsparallele Box sein (etwas mehr Rohdaten laden ist
    harmlos), nur der abschliessende Zuschnitt muss praezise sein."""
    from rasterio.warp import transform as warp_transform
    from rasterio.crs import CRS
    from shapely.geometry import Polygon

    left, bottom, right, top = win_bounds
    xs = [left, right, right, left]
    ys = [top, top, bottom, bottom]
    lons, lats = warp_transform(ds_crs, CRS.from_epsg(4326), xs, ys)
    return Polygon(zip(lons, lats))


def native_geom_to_pixel_fraction(geom, win_bounds):
    """Wie wgs84_geom_to_pixel_fraction, aber fuer eine Geometrie, die
    bereits im nativen Raster-CRS vorliegt -- reine affine Skalierung, kein
    CRS-Transform noetig. Schneller, wenn (wie in run_pipeline/
    build_real_pool.py) ohnehin schon das ganze dissolved-GeoDataFrame per
    geopandas.to_crs() auf einmal reprojiziert wurde, statt jedes Feature
    einzeln per pyproj zu transformieren."""
    import numpy as np
    from shapely.ops import transform as shp_transform

    left, bottom, right, top = win_bounds
    span_x, span_y = right - left, top - bottom

    def _fn(x, y, z=None):
        x = np.asarray(x); y = np.asarray(y)
        fx = np.clip((x - left) / span_x, 0.0, 1.0)
        fy = np.clip((top - y) / span_y, 0.0, 1.0)
        return fx, fy

    return shp_transform(_fn, geom)


def compute_areas_native(dissolved_native, win_bounds, erosion_m=EROSION_MIN_WIDTH_M / 2):
    """Wie eine fruehere Version von compute_areas(), aber auf Basis der
    "effektiv sichtbaren" Flaeche statt der rohen Polygonflaeche: jedes
    Klassen-Polygon wird vorher um erosion_m negativ gepuffert (Standard-
    Generalisierungstrick fuer eine Mindest-Sichtbarkeitsbreite, hier
    EROSION_MIN_WIDTH_M = 60m -- siehe Memory
    project_geogame_visibility_erosion_idea, Julians Entscheidung vom
    2026-08-27). Schmale/verzweigte Objekte (z.B. ein sich schlaengelnder,
    ggf. baumueberdeckter Fluss) fallen dadurch automatisch aus der
    "klar sichtbar"-Einstufung, auch wenn ihre rohe Flaeche AREA_THRESHOLD
    erreichen wuerde -- reine Flaeche sagt nichts ueber Erkennbarkeit aus.

    Wichtig: die Erosion wirkt NUR auf diese Sichtbarkeits-Entscheidung
    (absent/absent_optional/areas), NICHT auf die tatsaechlich gerenderten/
    anklickbaren Hitbox-Polygone in der GeoJSON-Datei -- Spieler:innen
    sollen weiterhin ueberall im vollen (nicht-erodierten) Bereich korrekt
    treffen koennen.

    dissolved_native: GeoDataFrame mit Spalten 'klasse'/'geometry' im
    nativen (flaechentreuen Meter-)Raster-CRS. win_bounds: (left, bottom,
    right, top) im selben CRS."""
    left, bottom, right, top = win_bounds
    img_area = abs(right - left) * abs(top - bottom)

    klasse_area = {}
    present_klassen = set()
    if len(dissolved_native) > 0:
        for klasse in dissolved_native["klasse"].unique():
            present_klassen.add(klasse)
            geoms = dissolved_native.loc[dissolved_native["klasse"] == klasse, "geometry"]
            union = geoms.union_all() if hasattr(geoms, "union_all") else geoms.unary_union
            eroded = union.buffer(-erosion_m)
            # Auch eine vollstaendig weggeeroste Klasse (zu schmal, um je
            # AREA_THRESHOLD zu erreichen) braucht einen 0.0-Eintrag, sonst
            # faellt sie aus absent UND absent_optional heraus und wuerde
            # faelschlich als "klar sichtbar" gezaehlt (realer Bug, beim
            # ersten Testlauf dieser Funktion gefunden).
            klasse_area[klasse] = 0.0 if eroded.is_empty else eroded.area

    absent_opt = []
    areas = {}
    for k, area in klasse_area.items():
        ratio = area / img_area if img_area > 0 else 0
        areas[k] = round(ratio, 4)
        if ratio < AREA_THRESHOLD:
            absent_opt.append(k)
    absent = sorted(ALL_LABEL_IDS - present_klassen)
    return absent, sorted(absent_opt), areas


def make_wgs84_to_native_transformer(dst_crs):
    """Baut den (teureren) pyproj-Transformer einmal pro Level -- siehe
    wgs84_geom_to_pixel_fraction, die ihn pro Feature braucht. Getrennt
    gehalten, damit er nicht bei jedem Feature neu aufgebaut wird (macht bei
    Leveln mit vielen WorldCover-Lückenfüller-Polygonen einen spürbaren
    Unterschied)."""
    from pyproj import Transformer
    return Transformer.from_crs("EPSG:4326", dst_crs, always_xy=True)


def wgs84_geom_to_pixel_fraction(geom, transformer, win_bounds):
    """Reprojiziert eine Shapely-Geometrie von EPSG:4326 in das native
    Raster-CRS (via `transformer`, siehe make_wgs84_to_native_transformer)
    und bildet sie dann linear auf [0,1]x[0,1]-Pixel-Bruchteile ab, basierend
    auf dem exakten Zuschnittsfenster (win_bounds, im selben nativen CRS wie
    das Raster). Das Pixelraster ist in diesem CRS immer ein unrotiertes/
    unskaliertes Scale+Translate (siehe Affine-Transform der TIFs) – anders
    als eine WGS84-Bounding-Box + Web-Mercator-Näherung, die für CRSe wie
    EPSG:3035 (LAEA Europe) abseits des Projektionszentrums (52°N/10°E)
    stark schräg/rotiert zur echten Nord-Süd-Achse liegt (bis zu ~7° /
    >1200m Versatz über ein 7km-Bild – der Bug, den Julian am 2026-08-27
    beim Spielen bemerkt hat, siehe Memory project_geogame_real_imagery)."""
    import numpy as np
    from shapely.ops import transform as shp_transform

    left, bottom, right, top = win_bounds
    span_x, span_y = right - left, top - bottom

    def _fn(x, y, z=None):
        nx, ny = transformer.transform(np.asarray(x), np.asarray(y))
        fx = np.clip((nx - left) / span_x, 0.0, 1.0)
        fy = np.clip((top - ny) / span_y, 0.0, 1.0)
        return fx, fy

    return shp_transform(_fn, geom)


def raster_mask_to_polygons(array, transform, values):
    """Vektorisiert alle Pixel mit Wert in `values` zu einem GeoDataFrame
    (EPSG:4326), leicht geglättet um die 10m-Treppenstufen-Optik zu mildern."""
    import numpy as np
    import geopandas as gpd
    from rasterio.features import shapes as rio_shapes
    from shapely.geometry import shape as shp_shape

    mask = np.isin(array, values)
    if not mask.any():
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")

    polys = [
        shp_shape(geom).simplify(0.00003, preserve_topology=True)
        for geom, val in rio_shapes(mask.astype(np.uint8), mask=mask, transform=transform)
    ]
    polys = [p for p in polys if p.is_valid and not p.is_empty]
    if not polys:
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")
    return gpd.GeoDataFrame(geometry=polys, crs="EPSG:4326")


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
                ds_crs = ds.crs
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

        by_klasse = {}
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
                by_klasse[klasse] = gdf

                if not gdf.empty:
                    gdf["klasse"] = klasse
                    layers.append(gdf)
                    app.log_write(f"   [{klasse}] → {len(gdf)} Polygone", "ok")
                else:
                    app.log_write(f"   [{klasse}] → keine Polygone")
                time.sleep(3)

            # ── WorldCover: Lückenfüller + Gegenprobe (OSM bleibt bevorzugt) ──
            app.log_write("   WorldCover-Raster abrufen (Lückenfüller + Gegenprobe) …")
            wc_array, wc_transform = fetch_worldcover_window(bbox_wgs84, app)

            all_osm_geoms = [g for gdf in by_klasse.values() if not gdf.empty for g in gdf.geometry]
            osm_geoms = gpd.GeoSeries(all_osm_geoms, crs="EPSG:4326") if all_osm_geoms else None
            osm_union = (osm_geoms.union_all() if hasattr(osm_geoms, "union_all")
                         else osm_geoms.unary_union) if osm_geoms is not None else None

            n_checked = n_contradict = 0
            for klasse in OSM_CLASSES:
                wc_gdf = raster_mask_to_polygons(wc_array, wc_transform, WORLDCOVER_RECLASS[klasse])
                own_gdf = by_klasse.get(klasse)

                # Gegenprobe: eigene OSM-Polygone gegen WorldCover-Mehrheitsfläche prüfen.
                # OSM bleibt maßgeblich – bei Abweichung wird nur geloggt, nichts überschrieben.
                if own_gdf is not None and not own_gdf.empty and not wc_gdf.empty:
                    wc_class_union = (wc_gdf.geometry.union_all() if hasattr(wc_gdf.geometry, "union_all")
                                       else wc_gdf.geometry.unary_union)
                    for geom in own_gdf.geometry:
                        if geom.area <= 0:
                            continue
                        n_checked += 1
                        agree = geom.intersection(wc_class_union).area / geom.area
                        if agree < (1 - WORLDCOVER_CONTRADICTION_THRESHOLD):
                            n_contradict += 1
                            c = geom.centroid
                            app.log_write(
                                f"   ⚠ Widerspruch [{klasse}]: OSM-Polygon bei "
                                f"({c.y:.5f}, {c.x:.5f}) stimmt nur zu {agree*100:.0f}% "
                                f"mit WorldCover überein", "warn")

                # Lückenfüllung: WorldCover-Fläche dieser Klasse, die von KEINER
                # OSM-Klasse beansprucht wird (nicht nur der eigenen) – so
                # überschreibt WorldCover nie eine bereits anders klassifizierte
                # OSM-Fläche.
                if not wc_gdf.empty:
                    gap = wc_gdf.geometry if osm_union is None else wc_gdf.geometry.difference(osm_union)
                    gap = gap[~gap.is_empty & gap.is_valid]
                    if not gap.empty:
                        gap_gdf = gpd.GeoDataFrame(geometry=gap.values, crs="EPSG:4326")
                        gap_gdf["klasse"] = klasse
                        layers.append(gap_gdf)
                        app.log_write(f"   [{klasse}] WorldCover-Lückenfüller: +{len(gap_gdf)} Polygone", "ok")

            if n_checked:
                app.log_write(
                    f"   Gegenprobe: {n_contradict}/{n_checked} OSM-Polygone wichen von WorldCover ab",
                    "warn" if n_contradict else "ok")
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

            # Strict clip to image bounds – removes anything outside the image.
            # Das gedrehte Fenster-Viereck, NICHT die (bei rotierten CRS wie
            # EPSG:3035 zu grosszuegige) umschliessende Bbox - siehe
            # native_window_to_wgs84_polygon()-Docstring.
            clip_box = native_window_to_wgs84_polygon(ds.crs, win_bounds)
            dissolved["geometry"] = dissolved.geometry.intersection(clip_box)
            dissolved = dissolved[
                dissolved.geometry.is_valid &
                ~dissolved.geometry.is_empty &
                dissolved.geometry.geom_type.isin(
                    ["Polygon","MultiPolygon","GeometryCollection"])
            ].reset_index(drop=True)

            app.log_write(
                f"   {len(combined)} → {len(dissolved)} Features nach dissolve+clip", "ok")

            # Einmalig das ganze GeoDataFrame reprojizieren (statt pro
            # Feature per pyproj) -- dient sowohl den Pixel-Bruchteilen der
            # GeoJSON-Ausgabe als auch der erosionsbasierten Flaechenanteil-
            # Berechnung (compute_areas_native), beides im selben nativen
            # (flaechentreuen Meter-)CRS wie das Raster selbst.
            dissolved_native = dissolved.to_crs(ds_crs)

            features_out = []
            for _, row in dissolved_native.iterrows():
                geom = row.geometry
                # Flatten GeometryCollections to only polygons
                if geom.geom_type == "GeometryCollection":
                    from shapely.geometry import MultiPolygon
                    polys = [g for g in geom.geoms
                             if g.geom_type in ("Polygon","MultiPolygon")]
                    if not polys:
                        continue
                    geom = polys[0] if len(polys)==1 else MultiPolygon(polys)
                # Auf Pixel-Bruchteile im nativen Raster-CRS abbilden (siehe
                # native_geom_to_pixel_fraction) statt roher WGS84-
                # Koordinaten zu speichern – die Frontend-Seite
                # (buildZones() in app.js) macht dadurch keine eigene,
                # potenziell falsche Projektion mehr, sondern übernimmt die
                # Koordinaten direkt.
                geom_frac = native_geom_to_pixel_fraction(geom, win_bounds)
                features_out.append({
                    "type": "Feature",
                    "properties": {"klasse": row["klasse"]},
                    "geometry": geom_frac.__geo_interface__
                })
            geojson = {"type": "FeatureCollection", "features": features_out}
            with open(geo_out, "w", encoding="utf-8") as f:
                json.dump(geojson, f, ensure_ascii=False)
        else:
            app.log_write("   Keine OSM-Daten – leeres GeoJSON.", "warn")
            geojson = {"type": "FeatureCollection", "features": []}
            with open(geo_out, "w", encoding="utf-8") as f:
                json.dump(geojson, f)
            dissolved_native = gpd.GeoDataFrame(geometry=[], columns=["klasse", "geometry"])

        app.log_write(
            f"   GeoJSON gespeichert → {os.path.basename(geo_out)}", "ok")

        # ── 6. Flächenanteile (erosionsbasiert, siehe compute_areas_native) ──
        absent, absent_opt, areas = compute_areas_native(dissolved_native, win_bounds)
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

def polygon_area_m2(geom):
    """Fläche eines Polygon/MultiPolygon abzüglich etwaiger Löcher (innere
    Ringe) – wichtig für WorldCover-vektorisierte Flächen, die häufig
    verschachtelte Löcher haben (z. B. eine andere Klasse mitten im Wald)."""
    def rings_area(rings):
        area = ring_area_m2(rings[0])
        for hole in rings[1:]:
            area -= ring_area_m2(hole)
        return area

    t = geom["type"]
    if t == "Polygon":
        return rings_area(geom["coordinates"])
    if t == "MultiPolygon":
        return sum(rings_area(poly) for poly in geom["coordinates"])
    return 0.0

def compute_areas(geojson, bounds):
    img_area    = image_area_m2(bounds)
    klasse_area = {}
    for feat in geojson.get("features", []):
        k = feat.get("properties", {}).get("klasse")
        if not k: continue
        klasse_area[k] = klasse_area.get(k, 0.0) + polygon_area_m2(feat["geometry"])
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