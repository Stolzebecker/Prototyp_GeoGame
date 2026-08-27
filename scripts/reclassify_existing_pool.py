"""
reclassify_existing_pool.py -- Neubewertung des bestehenden Real-Pools mit
der 60m-Erosions-Sichtbarkeitsregel (siehe Memory
project_geogame_visibility_erosion_idea, Julians Entscheidung 2026-08-27).

Rechnet fuer jedes bestehende IMG_*-Level (nicht B1) absent/absent_optional/
areas mit pipeline.compute_areas_native() neu -- rein geometrisch aus der
bereits vorhandenen (Pixel-Bruchteil-)Hitbox-GeoJSON zurueckgerechnet ins
native Raster-CRS, KEINE neue Overpass/WorldCover-Abfrage noetig. Level, die
dadurch unter 2 klar sichtbare Klassen fallen, werden aus dem Pool entfernt
(PNG+GeoJSON geloescht, Eintrag aus config.json). Die tatsaechlichen Hitbox-
Koordinaten (GeoJSON-Dateien der verbleibenden Level) werden NICHT
veraendert -- nur die absent/absent_optional/areas-Metadaten in config.json.

Usage: python scripts/reclassify_existing_pool.py [--dry-run]
"""
import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GAME_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, GAME_DIR)

import geopandas as gpd  # noqa: E402
import rasterio  # noqa: E402
from shapely.geometry import shape  # noqa: E402
from shapely.ops import transform as shp_transform  # noqa: E402

import pipeline as gg  # noqa: E402

MIN_VISIBLE_CLASSES = 2  # gleiche Regel wie build_real_pool.py


def tif_path_for(level_id):
    if level_id == "B1":
        return os.path.join(GAME_DIR, "input", "tutorial", "01.tif")
    return os.path.join(GAME_DIR, "input", f"{level_id}.tif")


def window_bounds(ds):
    cols, rows = ds.width, ds.height
    img_ratio = cols / rows
    if abs(img_ratio - gg.ASPECT) > 0.01:
        if img_ratio > gg.ASPECT:
            new_cols = int(rows * gg.ASPECT)
            col_off = (cols - new_cols) // 2
            row_off, new_rows = 0, rows
        else:
            new_rows = int(cols / gg.ASPECT)
            row_off = (rows - new_rows) // 2
            col_off, new_cols = 0, cols
    else:
        col_off = row_off = 0
        new_cols, new_rows = cols, rows
    window = rasterio.windows.Window(col_off, row_off, new_cols, new_rows)
    return rasterio.windows.bounds(window, ds.transform)


def fraction_to_native(geom, win_bounds):
    """Umkehrung von pipeline.native_geom_to_pixel_fraction -- exakt, da
    reine affine Skalierung (keine Reprojektion, kein Praezisionsverlust)."""
    left, bottom, right, top = win_bounds
    span_x, span_y = right - left, top - bottom

    def _fn(x, y, z=None):
        return (left + x * span_x, top - y * span_y)

    return shp_transform(_fn, geom)


def reclassify_level(level_id):
    tif_path = tif_path_for(level_id)
    geo_path = os.path.join(gg.HITBOX_DIR, f"{level_id}puf.geojson")

    with rasterio.open(tif_path) as ds:
        win_bounds = window_bounds(ds)

    with open(geo_path, encoding="utf-8") as f:
        geojson = json.load(f)

    klassen, geoms = [], []
    for feat in geojson.get("features", []):
        klasse = feat["properties"].get("klasse")
        if not klasse:
            continue
        geom_native = fraction_to_native(shape(feat["geometry"]), win_bounds).buffer(0)
        if geom_native.is_empty:
            continue
        klassen.append(klasse)
        geoms.append(geom_native)

    dissolved_native = gpd.GeoDataFrame({"klasse": klassen}, geometry=geoms)
    absent, absent_opt, areas = gg.compute_areas_native(dissolved_native, win_bounds)
    n_visible = len(gg.ALL_LABEL_IDS) - len(absent) - len(absent_opt)
    return absent, absent_opt, areas, n_visible


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with open(gg.CONFIG_FILE, encoding="utf-8") as f:
        cfg = json.load(f)

    kept_levels = []
    removed = []
    for lv in cfg["levels"]:
        if lv["id"] == "B1":
            kept_levels.append(lv)  # Tutorial explizit unangetastet
            continue

        absent, absent_opt, areas, n_visible = reclassify_level(lv["id"])
        if n_visible < MIN_VISIBLE_CLASSES:
            removed.append(lv["id"])
            print(f"  ✗ {lv['id']}: nur {n_visible} klar sichtbare Klasse(n) -> ENTFERNT")
            if not args.dry_run:
                png_path = os.path.join(GAME_DIR, lv["imgSrc"].lstrip("./"))
                geo_path = os.path.join(GAME_DIR, lv["geojsonSrc"].lstrip("./"))
                for p in (png_path, geo_path):
                    if os.path.exists(p):
                        os.remove(p)
        else:
            lv["absent"] = absent
            lv["absent_optional"] = absent_opt
            lv["areas"] = areas
            kept_levels.append(lv)
            print(f"  ✓ {lv['id']}: {n_visible} klar sichtbare Klasse(n) -> behalten (neu bewertet)")

    print(f"\nVorher: {len(cfg['levels'])} Level. Nachher: {len(kept_levels)} Level "
          f"({len(removed)} entfernt).")
    print(f"Entfernt: {removed}")

    if not args.dry_run:
        cfg["levels"] = kept_levels
        with open(gg.CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        print(f"\nconfig.json aktualisiert -> {len(kept_levels)} Level.")
    else:
        print("\n(DRY RUN, config.json nicht veraendert)")


if __name__ == "__main__":
    main()
