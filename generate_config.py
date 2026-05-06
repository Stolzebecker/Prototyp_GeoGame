"""
generate_config.py
──────────────────
Liest automatisch:
  - Bounds aus den TIF-Dateien (via GDAL/rasterio)
  - Klassen aus den GeoJSON-Dateien (Property "klasse")

Erzeugt: config.json  (wird von index.html geladen)

Voraussetzungen:
  pip install rasterio
  (oder: pip install gdal)

Ausführen (im Projektordner, also dort wo index.html liegt):
  python generate_config.py
"""

import json
import os
import glob

# ── Pfade anpassen falls nötig ─────────────────────────────────────────
TIF_DIR     = "./Bilder/EO_Bilder"
GEOJSON_DIR = "./Bilder/Hitboxes"
OUTPUT_FILE = "./config.json"

# ── Alle Label-Definitionen (Reihenfolge = Anzeigereihenfolge) ──────────
ALL_LABELS = [
    {"id": "wald",     "text": "Wald",     "icon": "🌲"},
    {"id": "fluss",    "text": "Fluss",    "icon": "🌊"},
    {"id": "siedlung", "text": "Siedlung", "icon": "🏘️"},
    {"id": "acker",    "text": "Acker",    "icon": "🌾"},
    {"id": "strasse",  "text": "Straße",   "icon": "🛣️"},
    {"id": "see",      "text": "See",      "icon": "💧"},
]
ALL_LABEL_IDS = {l["id"] for l in ALL_LABELS}

# ────────────────────────────────────────────────────────────────────────
def get_bounds_rasterio(tif_path):
    """Gibt [[südLat,westLon],[nordLat,ostLon]] zurück (EPSG:4326)."""
    import rasterio
    from rasterio.warp import transform_bounds
    with rasterio.open(tif_path) as ds:
        bounds = ds.bounds          # left, bottom, right, top im nativen CRS
        crs    = ds.crs
        if crs is None:
            raise ValueError(f"Kein CRS in {tif_path} gefunden.")
        if crs.to_epsg() != 4326:
            left, bottom, right, top = transform_bounds(
                crs, "EPSG:4326",
                bounds.left, bounds.bottom, bounds.right, bounds.top
            )
        else:
            left, bottom, right, top = (
                bounds.left, bounds.bottom, bounds.right, bounds.top
            )
    # Leaflet erwartet [[südLat,westLon],[nordLat,ostLon]]
    return [[round(bottom,6), round(left,6)],
            [round(top,6),    round(right,6)]]


def get_bounds_gdal(tif_path):
    """Fallback falls rasterio nicht verfügbar."""
    from osgeo import gdal, osr
    ds = gdal.Open(tif_path)
    if ds is None:
        raise FileNotFoundError(f"GDAL kann {tif_path} nicht öffnen.")
    gt = ds.GetGeoTransform()
    cols, rows = ds.RasterXSize, ds.RasterYSize
    # Eckpunkte im nativen CRS
    left  = gt[0]
    top   = gt[3]
    right = left + cols * gt[1]
    bottom= top  + rows * gt[5]

    src_srs = osr.SpatialReference()
    src_srs.ImportFromWkt(ds.GetProjection())
    tgt_srs = osr.SpatialReference()
    tgt_srs.ImportFromEPSG(4326)
    tgt_srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)

    transform = osr.CoordinateTransformation(src_srs, tgt_srs)
    # Transformiere Ecken
    def tr(x, y):
        lon, lat, _ = transform.TransformPoint(x, y)
        return lon, lat

    lons, lats = [], []
    for px, py in [(left,top),(right,top),(right,bottom),(left,bottom)]:
        lon, lat = tr(px, py)
        lons.append(lon); lats.append(lat)

    return [[round(min(lats),6), round(min(lons),6)],
            [round(max(lats),6), round(max(lons),6)]]


def get_bounds(tif_path):
    try:
        return get_bounds_rasterio(tif_path)
    except ImportError:
        print("  rasterio nicht gefunden → versuche GDAL …")
        return get_bounds_gdal(tif_path)


def get_zone_classes(geojson_path):
    """Gibt (present, absent) zurück.
       present = Set der 'klasse'-Werte die in der GeoJSON vorkommen
       absent  = alle ALL_LABEL_IDS die NICHT present sind
    """
    with open(geojson_path, encoding="utf-8") as f:
        gj = json.load(f)
    present = set()
    for feat in gj.get("features", []):
        k = feat.get("properties", {}).get("klasse")
        if k:
            present.add(k)
    absent = sorted(ALL_LABEL_IDS - present)
    return sorted(present), absent


# ────────────────────────────────────────────────────────────────────────
def main():
    # TIF-Dateien finden (B1norm.tif … B6norm.tif)
    tif_files = sorted(glob.glob(os.path.join(TIF_DIR, "B*norm.tif")))
    if not tif_files:
        print(f"⚠  Keine TIF-Dateien in {TIF_DIR} gefunden.")
        return

    levels = []
    for tif_path in tif_files:
        basename = os.path.basename(tif_path)          # z.B. B1norm.tif
        bname    = basename.replace("norm.tif","")     # z.B. B1
        geojson_path = os.path.join(GEOJSON_DIR, bname + "puf.geojson")

        print(f"\n── {bname} ──────────────────────────")
        print(f"   TIF:     {tif_path}")
        print(f"   GeoJSON: {geojson_path}")

        # Bounds
        try:
            bounds = get_bounds(tif_path)
            print(f"   Bounds:  {bounds}")
        except Exception as e:
            print(f"   ⚠ Bounds-Fehler: {e}")
            bounds = [[0,0],[1,1]]

        # GeoJSON-Klassen
        if os.path.exists(geojson_path):
            present, absent = get_zone_classes(geojson_path)
            print(f"   Klassen: {present}  |  absent: {absent}")
        else:
            print(f"   ⚠ GeoJSON nicht gefunden – absent = alle Labels")
            present = []
            absent  = sorted(ALL_LABEL_IDS)

        # PNG-Pfad (index.html erwartet PNG, nicht TIF)
        img_src = f"./Bilder/EO_Bilder/{bname}norm.png"

        levels.append({
            "id":         bname,
            "imgSrc":     img_src,
            "geojsonSrc": f"./Bilder/Hitboxes/{bname}puf.geojson",
            "bounds":     bounds,
            "absent":     absent,
        })

    config = {
        "labels": ALL_LABELS,
        "levels": levels,
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

    print(f"\n✅  config.json geschrieben → {OUTPUT_FILE}")
    print(f"   {len(levels)} Level(s) konfiguriert.")
    print("\nNächster Schritt: TIF → PNG konvertieren")
    print("  Entweder in QGIS, oder mit folgendem Befehl (benötigt rasterio):")
    print("  python convert_tif_to_png.py")


if __name__ == "__main__":
    main()