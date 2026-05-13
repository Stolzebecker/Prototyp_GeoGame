"""
generate_config.py
──────────────────
Liest automatisch:
  - Bounds aus den TIF-Dateien (via rasterio oder GDAL)
  - Klassen + Flächenanteile aus den GeoJSON-Dateien (Property "klasse")

Schwellenwert-Logik:
  Liegt die Gesamtfläche aller Polygone einer Klasse unter AREA_THRESHOLD
  (als Anteil an der Bildfläche), wird die Klasse in "absent_optional"
  statt "absent" eingetragen.

  absent          → Klasse fehlt völlig im Bild  → nur Papierkorb richtig
  absent_optional → Klasse zu klein (<Schwellenwert) → Papierkorb UND
                    Karten-Treffer werden als richtig gewertet

Erzeugt: config.json

Voraussetzungen:
  pip install rasterio numpy
Ausführen (im Projektordner):
  python generate_config.py
"""

import json
import os
import glob
import math

# ── Konfiguration ───────────────────────────────────────────────────────
TIF_DIR     = "./Bilder/EO_Bilder"
GEOJSON_DIR = "./Bilder/Hitboxes"
OUTPUT_FILE = "./data/config.json"

# Schwellenwert: Anteil der Polygon-Gesamtfläche an der Bildfläche.
# Klassen darunter → absent_optional (Papierkorb ODER Karte = richtig).
# Klassen komplett fehlend → absent (nur Papierkorb = richtig).
AREA_THRESHOLD = 0.05   # 5 %

# ── Label-Definitionen ──────────────────────────────────────────────────
ALL_LABELS = [
    {"id": "Wald",     "text": "Wald",     "icon": "🌲"},
    {"id": "Fluss",    "text": "Fluss",    "icon": "🌊"},
    {"id": "Siedlung", "text": "Siedlung", "icon": "🏘️"},
    {"id": "Acker",    "text": "Acker",    "icon": "🌾"},
    {"id": "Straße",   "text": "Straße",   "icon": "🛣️"},
    {"id": "See",      "text": "See",      "icon": "💧"},
]
ALL_LABEL_IDS = {l["id"] for l in ALL_LABELS}


# ── Bounds ──────────────────────────────────────────────────────────────
def get_bounds_rasterio(tif_path):
    import rasterio
    from rasterio.warp import transform_bounds
    with rasterio.open(tif_path) as ds:
        bounds = ds.bounds
        crs    = ds.crs
        if crs is None:
            raise ValueError(f"Kein CRS in {tif_path}.")
        if crs.to_epsg() != 4326:
            left, bottom, right, top = transform_bounds(
                crs, "EPSG:4326",
                bounds.left, bounds.bottom, bounds.right, bounds.top)
        else:
            left, bottom, right, top = (
                bounds.left, bounds.bottom, bounds.right, bounds.top)
    return [[round(bottom,6), round(left,6)],
            [round(top,6),    round(right,6)]]


def get_bounds_gdal(tif_path):
    from osgeo import gdal, osr
    ds = gdal.Open(tif_path)
    if ds is None:
        raise FileNotFoundError(f"GDAL kann {tif_path} nicht öffnen.")
    gt   = ds.GetGeoTransform()
    cols, rows = ds.RasterXSize, ds.RasterYSize
    left   = gt[0];  top    = gt[3]
    right  = left + cols * gt[1]
    bottom = top  + rows * gt[5]
    src = osr.SpatialReference(); src.ImportFromWkt(ds.GetProjection())
    tgt = osr.SpatialReference(); tgt.ImportFromEPSG(4326)
    tgt.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    tr  = osr.CoordinateTransformation(src, tgt)
    lons, lats = [], []
    for px, py in [(left,top),(right,top),(right,bottom),(left,bottom)]:
        lon, lat, _ = tr.TransformPoint(px, py)
        lons.append(lon); lats.append(lat)
    return [[round(min(lats),6), round(min(lons),6)],
            [round(max(lats),6), round(max(lons),6)]]


def get_bounds(tif_path):
    try:
        return get_bounds_rasterio(tif_path)
    except ImportError:
        print("  rasterio nicht gefunden → versuche GDAL …")
        return get_bounds_gdal(tif_path)


# ── Flächen-Berechnung ──────────────────────────────────────────────────
def to_mercator(lon, lat):
    """WGS84 → Web-Mercator (Meter). Gleiche Projektion wie index.html."""
    R    = 6378137
    x    = lon * math.pi / 180 * R
    sinL = math.sin(lat * math.pi / 180)
    y    = R * math.log((1 + sinL) / (1 - sinL)) / 2
    return x, y


def ring_area_m2(ring):
    """Shoelace-Formel auf Mercator-projizierten Koordinaten (m²)."""
    pts  = [to_mercator(lon, lat) for lon, lat in ring]
    n    = len(pts)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += pts[i][0] * pts[j][1]
        area -= pts[j][0] * pts[i][1]
    return abs(area) / 2.0


def image_area_m2(bounds):
    """Bildfläche in m² (Mercator-Rechteck)."""
    x0, y0 = to_mercator(bounds[0][1], bounds[0][0])  # SW
    x1, y1 = to_mercator(bounds[1][1], bounds[1][0])  # NE
    return abs(x1 - x0) * abs(y1 - y0)


def extract_outer_rings(geometry):
    """Gibt alle Außenringe eines Polygon/MultiPolygon zurück."""
    t = geometry["type"]
    if t == "Polygon":
        return [geometry["coordinates"][0]]
    if t == "MultiPolygon":
        return [p[0] for p in geometry["coordinates"]]
    return []


def analyse_geojson(geojson_path, bounds):
    """
    Gibt zurück:
      present          – Klassen mit Fläche >= AREA_THRESHOLD
      absent_optional  – Klassen vorhanden aber Fläche < AREA_THRESHOLD
      absent           – Klassen gar nicht vorhanden
      areas            – {klasse: anteil} für alle vorhandenen Klassen
    """
    with open(geojson_path, encoding="utf-8") as f:
        gj = json.load(f)

    img_area = image_area_m2(bounds)

    # Summiere Fläche pro Klasse
    klasse_area = {}
    for feat in gj.get("features", []):
        k = feat.get("properties", {}).get("klasse")
        if not k:
            continue
        for ring in extract_outer_rings(feat["geometry"]):
            klasse_area[k] = klasse_area.get(k, 0.0) + ring_area_m2(ring)

    present         = []
    absent_optional = []
    areas           = {}

    for k, area in klasse_area.items():
        ratio = area / img_area if img_area > 0 else 0
        areas[k] = round(ratio, 4)
        if ratio >= AREA_THRESHOLD:
            present.append(k)
        else:
            absent_optional.append(k)

    # Klassen die gar nicht in der GeoJSON auftauchen
    absent = sorted(ALL_LABEL_IDS - set(klasse_area.keys()))

    return (sorted(present),
            sorted(absent_optional),
            absent,
            areas)


# ── Hauptprogramm ───────────────────────────────────────────────────────
def main():
    tif_files = sorted(glob.glob(os.path.join(TIF_DIR, "B*norm.tif")))
    if not tif_files:
        print(f"⚠  Keine TIF-Dateien in {TIF_DIR} gefunden.")
        return

    print(f"Schwellenwert: {AREA_THRESHOLD*100:.1f} % der Bildfläche\n")

    levels = []
    for tif_path in tif_files:
        basename = os.path.basename(tif_path)
        bname    = basename.replace("norm.tif", "")
        geojson_path = os.path.join(GEOJSON_DIR, bname + "puf.geojson")

        print(f"── {bname} ────────────────────────────────────")
        print(f"   TIF:     {tif_path}")
        print(f"   GeoJSON: {geojson_path}")

        try:
            bounds = get_bounds(tif_path)
            print(f"   Bounds:  {bounds}")
        except Exception as e:
            print(f"   ⚠ Bounds-Fehler: {e}")
            bounds = [[0, 0], [1, 1]]

        if os.path.exists(geojson_path):
            present, absent_optional, absent, areas = analyse_geojson(
                geojson_path, bounds)

            print(f"   Flächenanteile:")
            for k, v in sorted(areas.items(), key=lambda x: -x[1]):
                flag = ""
                if k in absent_optional:
                    flag = f"  ← UNTER Schwellenwert ({AREA_THRESHOLD*100:.0f} %)"
                print(f"     {k:12s}  {v*100:5.2f} %{flag}")
            print(f"   present:         {present}")
            print(f"   absent_optional: {absent_optional}")
            print(f"   absent:          {absent}")
        else:
            print(f"   ⚠ GeoJSON nicht gefunden – alle Labels als absent")
            present = []; absent_optional = []; absent = sorted(ALL_LABEL_IDS)
            areas   = {}

        levels.append({
            "id":              bname,
            "imgSrc":          f"./Bilder/EO_Bilder/{bname}norm.png",
            "geojsonSrc":      f"./Bilder/Hitboxes/{bname}puf.geojson",
            "bounds":          bounds,
            "absent":          absent,           # komplett fehlend → nur Papierkorb
            "absent_optional": absent_optional,  # zu klein → Papierkorb ODER Karte
            "areas":           areas,            # {klasse: anteil 0-1} für Debug-Anzeige
        })
        print()

    config = {
        "labels":         ALL_LABELS,
        "area_threshold": AREA_THRESHOLD,
        "levels":         levels,
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

    print(f"✅  config.json geschrieben → {OUTPUT_FILE}")
    print(f"   {len(levels)} Level(s) konfiguriert.")


if __name__ == "__main__":
    main()