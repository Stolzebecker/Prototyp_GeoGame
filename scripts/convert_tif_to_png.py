"""
convert_tif_to_png.py
─────────────────────
Konvertiert alle B*norm.tif → B*norm.png
(Browser können TIF nicht darstellen, PNG schon.)

Voraussetzungen:
  pip install rasterio numpy pillow

Ausführen (im Projektordner):
  python convert_tif_to_png.py
"""

import os
import glob
import numpy as np

# Resolve paths relative to repo root, not working directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR   = os.path.dirname(SCRIPT_DIR)


TIF_DIR = os.path.join(ROOT_DIR, "Bilder", "EO_Bilder")


def convert(tif_path, png_path):
    import rasterio
    from PIL import Image

    with rasterio.open(tif_path) as ds:
        # Lese die ersten 3 Bänder (RGB) oder weniger falls Graustufen
        n_bands = ds.count
        if n_bands >= 3:
            r = ds.read(1).astype(float)
            g = ds.read(2).astype(float)
            b = ds.read(3).astype(float)
        else:
            # Graustufen → alle drei Kanäle gleich
            r = g = b = ds.read(1).astype(float)

    def norm(arr):
        """Normalisiert auf 0–255 (ignoriert NoData-Extrema)."""
        p2, p98 = np.percentile(arr[arr > arr.min()], (2, 98))
        arr = np.clip(arr, p2, p98)
        arr = (arr - p2) / (p98 - p2) * 255
        return arr.astype(np.uint8)

    rgb = np.stack([norm(r), norm(g), norm(b)], axis=-1)
    img = Image.fromarray(rgb, mode="RGB")
    img.save(png_path, "PNG")
    print(f"  ✓  {os.path.basename(tif_path)} → {os.path.basename(png_path)}")


def main():
    tif_files = sorted(glob.glob(os.path.join(TIF_DIR, "B*norm.tif")))
    if not tif_files:
        print(f"⚠  Keine TIF-Dateien in {TIF_DIR} gefunden.")
        return

    print(f"Konvertiere {len(tif_files)} Datei(en) …\n")
    for tif_path in tif_files:
        png_path = tif_path.replace(".tif", ".png")
        if os.path.exists(png_path):
            print(f"  –  {os.path.basename(png_path)} existiert bereits, übersprungen.")
            continue
        try:
            convert(tif_path, png_path)
        except Exception as e:
            print(f"  ⚠  Fehler bei {tif_path}: {e}")

    print("\n✅  Fertig. Lade die PNG-Dateien zusammen mit config.json auf GitHub hoch.")


if __name__ == "__main__":
    main()