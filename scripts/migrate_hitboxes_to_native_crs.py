"""
migrate_hitboxes_to_native_crs.py -- one-off fix for the CRS/rotation bug
found 2026-08-27 (Julian noticed hitboxes systematically offset while
playing). Source TIFs for the real-imagery pool are in EPSG:3035 (LAEA
Europe), which is NOT north-aligned away from its projection center
(52N/10E). The pipeline used to store hitbox polygons as plain WGS84
lon/lat and let the frontend map them onto the image via a WGS84-bounding-
box -> Web-Mercator-fraction linear interpolation -- this silently assumed
the raster's pixel grid was north-aligned, which is false for EPSG:3035 (up
to ~7deg rotation / >1200m shear confirmed across a single 7km-wide image).

Fix: hitbox GeoJSON coordinates are now stored directly as [fracX, fracY]
in [0,1]x[0,1] pixel-fraction space, computed via each level's own raster's
native CRS (exact, since the pixel grid is an unrotated, unsheared
scale+translate in that CRS). This script re-derives fraction coordinates
for all EXISTING levels from their already-correct real-world (WGS84)
hitbox polygons -- no new Overpass/WorldCover queries needed, just a
coordinate reprojection using each level's own source TIF (still present
under input/).

config.json itself (areas/absent/absent_optional/bounds) is NOT touched --
those were computed from real-world WGS84 geometry, which was never wrong;
only the pixel-space *rendering* coordinates were.

Usage: python scripts/migrate_hitboxes_to_native_crs.py [--dry-run]
"""
import argparse
import json
import os
import sys

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(line_buffering=True)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GAME_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, GAME_DIR)

import rasterio  # noqa: E402
from shapely.geometry import shape, mapping  # noqa: E402

import pipeline as gg  # noqa: E402


def _tif_path_for(level_id):
    if level_id == "B1":
        return os.path.join(GAME_DIR, "input", "tutorial", "01.tif")
    return os.path.join(GAME_DIR, "input", f"{level_id}.tif")


def _window_bounds(ds):
    """Identische Zuschnittslogik wie pipeline.py/build_real_pool.py."""
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


def migrate_level(level_id, dry_run=False):
    tif_path = _tif_path_for(level_id)
    geo_path = os.path.join(gg.HITBOX_DIR, f"{level_id}puf.geojson")
    if not os.path.exists(tif_path):
        print(f"  [{level_id}] SKIP - TIF fehlt: {tif_path}")
        return False
    if not os.path.exists(geo_path):
        print(f"  [{level_id}] SKIP - GeoJSON fehlt: {geo_path}")
        return False

    with rasterio.open(tif_path) as ds:
        ds_crs = ds.crs
        win_bounds = _window_bounds(ds)

    with open(geo_path, encoding="utf-8") as f:
        geojson = json.load(f)

    transformer = gg.make_wgs84_to_native_transformer(ds_crs)
    new_features = []
    for feat in geojson.get("features", []):
        geom = shape(feat["geometry"])
        geom_frac = gg.wgs84_geom_to_pixel_fraction(geom, transformer, win_bounds)
        new_features.append({
            "type": "Feature",
            "properties": feat.get("properties", {}),
            "geometry": mapping(geom_frac),
        })

    print(f"  [{level_id}] {len(new_features)} Feature(s) reprojiziert (CRS {ds_crs})")

    if not dry_run:
        with open(geo_path, "w", encoding="utf-8") as f:
            json.dump({"type": "FeatureCollection", "features": new_features},
                       f, ensure_ascii=False)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with open(gg.CONFIG_FILE, encoding="utf-8") as f:
        cfg = json.load(f)

    ids = [lv["id"] for lv in cfg["levels"]]
    print(f"{len(ids)} Level in config.json.")
    ok = 0
    for level_id in ids:
        if migrate_level(level_id, dry_run=args.dry_run):
            ok += 1
    print(f"\nFertig: {ok}/{len(ids)} Level migriert."
          + (" (DRY RUN, keine Dateien geschrieben)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
