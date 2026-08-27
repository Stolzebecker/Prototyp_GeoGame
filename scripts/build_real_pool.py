"""
build_real_pool.py -- SCOPE/GeoGame Umstieg auf echte Sentinel-2-Bilder
(2026-08-26, siehe Memory project_geogame_real_imagery).

Verarbeitet die von der Satellitenbilder-Sourcing-Pipeline (--profile game,
03_Projektphasen/02_Empirische Datenerhebung/Satellitenbilder/) bereits
echtfarben gerenderten 700x525-px-TIFFs zu GeoGame-Levels: OSM/WorldCover-
Hitboxes (exakt dieselbe Logik wie pipeline.py:run_pipeline), aber:

  - KEIN 2./98.-Perzentil-Kontrast-Stretch mehr -- die Quell-TIFFs sind
    bereits mit fixem Gain/Gamma echtfarben gerendert; ein zusaetzlicher
    Stretch pro Bild wuerde genau die Stoervariable wieder einfuehren, die
    das fixe Rendering vermeiden soll. Nur Zuschnitt (hier ohnehin meist
    ueberfluessig, da 700x525 schon exakt 4:3 ist) + Resize.
  - NEUE Kategorien-Filterregel: Level werden nur uebernommen, wenn
    MINDESTENS 2 der 4 Klassen "klar sichtbar" sind (Flaechenanteil >=
    AREA_THRESHOLD, d.h. weder absent noch absent_optional). Kandidaten, die
    das nicht erfuellen, werden verworfen (PNG/GeoJSON geloescht, keine
    config.json-Eintragung).
  - Level-IDs sind die Satellitenbilder-Kandidaten-IDs selbst (z.B.
    "IMG_00001") statt fortlaufender "B<n>" -- macht das Skript idempotent/
    inkrementell wiederholbar (bereits verarbeitete TIFs werden uebersprungen,
    kein Ueberschreiben, keine Kollision mit dem unveraendert bleibenden
    Tutorial-Level "B1").

Aufruf:
    python scripts/build_real_pool.py --input-dir <Ordner mit TIFs> [--limit N]

WICHTIGER FALLSTRICK (2026-08-26 aufgetreten): --input-dir wird NICHT
rekursiv gescannt (glob "*.tif", keine Unterordner) - das Tutorial-Quell-TIF
liegt deshalb bewusst in input/tutorial/01.tif, NICHT direkt in input/,
sonst wird es als normaler Kandidat mitverarbeitet (erzeugt ein Duplikat-
Level "01" im echten Pool - genau das soll die Auswertung sauber halten,
siehe Memory project_geogame_real_imagery: "Tutorial-Bild nicht Teil des
Bilderpools"). Beim Aufraeumen eines fehlerhaften Laufs: pruefen, ob ein
Level mit id "01" (oder generell nicht "B1"/"IMG_*") ins config.json
gerutscht ist, und dessen PNG/GeoJSON/config-Eintrag von Hand entfernen.

Liest/schreibt data/config.json additiv: B1 (Tutorial) bleibt unveraendert
stehen, neue IMG_* Level werden angehaengt (oder bereits vorhandene erneut
uebersprungen).
"""

import argparse
import glob
import json
import os
import sys
import time

# Windows-Konsole nutzt sonst cp1252 -- bricht bei Umlauten/Sonderzeichen in
# den Log-Meldungen (siehe reference_phd_files-Memory: PYTHONUTF8-Fallstrick).
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
# Bei Umleitung in eine Datei puffert Python standardmaessig blockweise statt
# zeilenweise -- fuer eine live mitlesbare Fortschrittsdatei (Julian will den
# Lauf live verfolgen koennen, 2026-08-26) beides auf Zeilenpufferung stellen.
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GAME_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, GAME_DIR)

import numpy as np  # noqa: E402
import rasterio  # noqa: E402
from rasterio.crs import CRS  # noqa: E402
from rasterio.warp import transform_bounds  # noqa: E402
from PIL import Image  # noqa: E402
import geopandas as gpd  # noqa: E402

import pipeline as gg  # GeoGame's eigene pipeline.py, siehe sys.path oben  # noqa: E402

CONFIG_FILE = gg.CONFIG_FILE
EO_DIR = gg.EO_DIR
HITBOX_DIR = gg.HITBOX_DIR
DATA_DIR = gg.DATA_DIR
MIN_VISIBLE_CLASSES = 2  # siehe Modul-Docstring


class _ConsoleLogger:
    """Minimaler Ersatz fuer die Tk-App, die pipeline.py's Helferfunktionen
    (overpass_request, fetch_worldcover_window) fuer Fortschrittsmeldungen
    erwarten -- druckt stattdessen einfach auf die Konsole."""
    def log_write(self, msg, tag=""):
        print(msg)

    def set_progress(self, val, label=""):
        pass


def _load_existing_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {"labels": gg.ALL_LABELS, "area_threshold": gg.AREA_THRESHOLD, "levels": []}


def _process_one(tif_path, app):
    """Verarbeitet ein einzelnes TIF zu einem Level-Dict oder None (verworfen).
    Analog zu pipeline.py:run_pipeline's Kernschleife, aber ohne Perzentil-
    Stretch und mit der neuen >=2-Kategorien-Filterregel."""
    image_id = os.path.splitext(os.path.basename(tif_path))[0]
    png_out = os.path.join(EO_DIR, f"{image_id}norm.png")
    geo_out = os.path.join(HITBOX_DIR, f"{image_id}puf.geojson")

    app.log_write(f"\n{'─'*55}")
    app.log_write(f"  {image_id}  ←  {os.path.basename(tif_path)}")

    # ── Bounds lesen + Zuschnitt (identisch zu run_pipeline, aber ohne
    #    Perzentil-Stretch -- die Quelle ist bereits fertig gerendert) ──
    with rasterio.open(tif_path) as ds:
        if ds.crs is None:
            raise ValueError("Keine CRS-Information im TIF.")
        ds_crs = ds.crs
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
        win_bounds = rasterio.windows.bounds(window, ds.transform)
        west, south, east, north = transform_bounds(ds.crs, CRS.from_epsg(4326), *win_bounds)
        geo_bounds = [[round(south, 6), round(west, 6)], [round(north, 6), round(east, 6)]]
        bbox_wgs84 = (west, south, east, north)

        r = ds.read(1, window=window)
        g_band = ds.read(2, window=window)
        b_band = ds.read(3, window=window)
        rgb = np.stack([r, g_band, b_band], axis=-1).astype(np.uint8)
        Image.fromarray(rgb, "RGB").resize((gg.TARGET_W, gg.TARGET_H), Image.LANCZOS).save(png_out, "PNG")

    # ── OSM-Hitboxes + WorldCover-Luekenfueller (identisch zu run_pipeline) ──
    layers = []
    by_klasse = {}
    for klasse, cfg in gg.OSM_CLASSES.items():
        query = gg.build_query(bbox_wgs84, cfg["filters"])
        result = gg.overpass_request(query, app)
        if result is None:
            raise RuntimeError(f"Overpass-Anfrage fuer Klasse '{klasse}' fehlgeschlagen")
        elements = result.get("elements", [])
        gdf = gg.elements_to_polygons(elements, bbox_wgs84, cfg["buffer_m"])
        by_klasse[klasse] = gdf
        if not gdf.empty:
            gdf["klasse"] = klasse
            layers.append(gdf)
        time.sleep(3)

    wc_array, wc_transform = gg.fetch_worldcover_window(bbox_wgs84, app)
    all_osm_geoms = [g for gdf in by_klasse.values() if not gdf.empty for g in gdf.geometry]
    osm_geoms = gpd.GeoSeries(all_osm_geoms, crs="EPSG:4326") if all_osm_geoms else None
    osm_union = (osm_geoms.union_all() if hasattr(osm_geoms, "union_all")
                 else osm_geoms.unary_union) if osm_geoms is not None else None

    for klasse in gg.OSM_CLASSES:
        wc_gdf = gg.raster_mask_to_polygons(wc_array, wc_transform, gg.WORLDCOVER_RECLASS[klasse])
        if not wc_gdf.empty:
            gap = wc_gdf.geometry if osm_union is None else wc_gdf.geometry.difference(osm_union)
            gap = gap[~gap.is_empty & gap.is_valid]
            if not gap.empty:
                gap_gdf = gpd.GeoDataFrame(geometry=gap.values, crs="EPSG:4326")
                gap_gdf["klasse"] = klasse
                layers.append(gap_gdf)

    if layers:
        combined = gpd.pd.concat(layers, ignore_index=True)[["klasse", "geometry"]]
        combined["geometry"] = combined.geometry.buffer(0)
        combined = combined[combined.geometry.is_valid & ~combined.geometry.is_empty]
        dissolved = combined.dissolve(by="klasse", as_index=False)
        dissolved = dissolved.explode(index_parts=False).reset_index(drop=True)

        from shapely.geometry import box as shp_box
        clip_box = shp_box(west, south, east, north)
        dissolved["geometry"] = dissolved.geometry.intersection(clip_box)
        dissolved = dissolved[
            dissolved.geometry.is_valid & ~dissolved.geometry.is_empty &
            dissolved.geometry.geom_type.isin(["Polygon", "MultiPolygon", "GeometryCollection"])
        ].reset_index(drop=True)

        # Einmalig das ganze GeoDataFrame reprojizieren (statt pro Feature
        # per pyproj) -- dient sowohl den Pixel-Bruchteilen der GeoJSON-
        # Ausgabe als auch der erosionsbasierten Flaechenanteil-Berechnung.
        dissolved_native = dissolved.to_crs(ds_crs)

        features_out = []
        for _, row in dissolved_native.iterrows():
            geom = row.geometry
            if geom.geom_type == "GeometryCollection":
                from shapely.geometry import MultiPolygon
                polys = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
                if not polys:
                    continue
                geom = polys[0] if len(polys) == 1 else MultiPolygon(polys)
            # Auf Pixel-Bruchteile im nativen Raster-CRS abbilden statt roher
            # WGS84-Koordinaten -- siehe pipeline.native_geom_to_pixel_fraction.
            geom_frac = gg.native_geom_to_pixel_fraction(geom, win_bounds)
            features_out.append({"type": "Feature", "properties": {"klasse": row["klasse"]},
                                  "geometry": geom_frac.__geo_interface__})
        geojson = {"type": "FeatureCollection", "features": features_out}
    else:
        geojson = {"type": "FeatureCollection", "features": []}
        dissolved_native = gpd.GeoDataFrame(geometry=[], columns=["klasse", "geometry"])

    with open(geo_out, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    absent, absent_opt, areas = gg.compute_areas_native(dissolved_native, win_bounds)
    n_visible = len(gg.ALL_LABEL_IDS) - len(absent) - len(absent_opt)
    app.log_write(f"   Flaechenanteile: {areas}  (absent={absent}, absent_optional={absent_opt})")

    if n_visible < MIN_VISIBLE_CLASSES:
        app.log_write(
            f"   ✗ verworfen: nur {n_visible} klar sichtbare Klasse(n) "
            f"(mind. {MIN_VISIBLE_CLASSES} gefordert)")
        os.remove(png_out)
        os.remove(geo_out)
        return None

    app.log_write(f"   ✓ uebernommen ({n_visible} klar sichtbare Klassen)")
    return {
        "id": image_id,
        "imgSrc": f"./Bilder/EO_Bilder/{image_id}norm.png",
        "geojsonSrc": f"./Bilder/Hitboxes/{image_id}puf.geojson",
        "bounds": geo_bounds,
        "absent": absent,
        "absent_optional": absent_opt,
        "areas": areas,
    }


def main():
    parser = argparse.ArgumentParser(description="GeoGame: TIFs zu echten Levels verarbeiten")
    parser.add_argument("--input-dir", required=True, help="Ordner mit den zu verarbeitenden TIFs")
    parser.add_argument("--limit", type=int, default=None, help="Max. Anzahl TIFs in diesem Lauf")
    args = parser.parse_args()

    os.makedirs(EO_DIR, exist_ok=True)
    os.makedirs(HITBOX_DIR, exist_ok=True)

    cfg = _load_existing_config()
    existing_ids = {lv["id"] for lv in cfg["levels"]}

    tifs = sorted(glob.glob(os.path.join(args.input_dir, "*.tif")))
    tifs = [t for t in tifs if os.path.splitext(os.path.basename(t))[0] not in existing_ids]
    if args.limit:
        tifs = tifs[:args.limit]

    print(f"{len(tifs)} neue TIF(s) zu verarbeiten (bereits {len(existing_ids)} Level in config.json).")

    app = _ConsoleLogger()
    accepted = rejected = errored = 0
    for tif_path in tifs:
        try:
            level = _process_one(tif_path, app)
        except Exception as e:
            print(f"   ⚠ Fehler bei {os.path.basename(tif_path)}: {e}")
            errored += 1
            continue
        if level is None:
            rejected += 1
            continue
        cfg["levels"].append(level)
        accepted += 1
        # Nach jedem akzeptierten Level speichern -- robust gegen Abbruch
        # mitten im (potenziell langen) Lauf.
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)

    print(f"\nFertig: {accepted} akzeptiert, {rejected} verworfen (<{MIN_VISIBLE_CLASSES} Klassen), "
          f"{errored} Fehler. Insgesamt {len(cfg['levels'])} Level in config.json.")


if __name__ == "__main__":
    main()
