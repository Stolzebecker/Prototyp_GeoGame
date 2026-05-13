# EO Visual Complexity Experiment

Interaktives Web-Experiment der **Research Group for Earth Observation (rgeo)**  
zur visuellen Komplexität von Satellitenbildern.

---

## Projektstruktur

```
Prototyp_GeoGame/
│
├── index.html                  # Markup (nur HTML, kein CSS/JS inline)
│
├── assets/
│   ├── css/
│   │   └── style.css           # Alle Styles (rgeo CI)
│   └── js/
│       └── app.js              # Gesamte Anwendungslogik
│
├── data/
│   └── config.json             # Generiert durch scripts/generate_config.py
│
├── scripts/
│   ├── generate_config.py      # Liest TIF-Bounds + GeoJSON → config.json
│   └── convert_tif_to_png.py   # Konvertiert TIF → PNG für den Browser
│
└── Bilder/
    ├── EO_Bilder/              # Satellitenbilder (B1norm.png … B6norm.png)
    ├── Hitboxes/               # GeoJSON-Polygone (B1puf.geojson … B6puf.geojson)
    └── Deko_und_UI/            # UI-Grafiken (Startscreen.png, …)
```

---

## Einrichtung

### 1. Abhängigkeiten installieren

```bash
pip install rasterio numpy pillow
```

### 2. Satellitenbilder konvertieren

TIF-Dateien können Browser nicht darstellen – einmalig zu PNG konvertieren:

```bash
python scripts/convert_tif_to_png.py
```

### 3. Konfiguration generieren

Liest Bounds aus den TIF-Metadaten und Klassen aus den GeoJSONs:

```bash
python scripts/generate_config.py
```

Ausgabe: `data/config.json`

Die Konsole zeigt dabei für jedes Bild die Flächenanteile aller Klassen und kennzeichnet Klassen unter dem Schwellenwert (5 % der Bildfläche) als `absent_optional`.

### 4. Deployment

Alle Dateien auf GitHub Pages hochladen. GitHub Pages liefert statische Dateien –  
Python-Scripts laufen **lokal**, nie auf dem Server.

---

## Konfiguration

### config.json (automatisch generiert)

```json
{
  "labels": [...],
  "area_threshold": 0.05,
  "levels": [
    {
      "id": "B1",
      "imgSrc": "./Bilder/EO_Bilder/B1norm.png",
      "geojsonSrc": "./Bilder/Hitboxes/B1puf.geojson",
      "bounds": [[südLat, westLon], [nordLat, ostLon]],
      "absent": ["See"],
      "absent_optional": ["Straße"],
      "areas": { "Wald": 0.42, "Siedlung": 0.18, ... }
    }
  ]
}
```

| Feld              | Bedeutung                                                |
|-------------------|----------------------------------------------------------|
| `absent`          | Klasse fehlt völlig → nur Papierkorb korrekt             |
| `absent_optional` | Klasse < 5 % Fläche → Papierkorb **oder** Karte korrekt |
| `areas`           | Flächenanteile (0–1) für Debug-Anzeige                   |

### Schwellenwert anpassen

In `scripts/generate_config.py`:

```python
AREA_THRESHOLD = 0.05   # 5 % der Bildfläche
```

---

## Debug-Modus

Im laufenden Experiment **D** drücken:  
- Farbige Hitbox-Polygone über dem Satellitenbild  
- Checkbox pro Klasse (mit Flächenanteil in %)  
- Level-Navigation (‹ ›) zum Wechseln zwischen Bildern

---

## CI / Design

| Token         | Hex       | Verwendung             |
|---------------|-----------|------------------------|
| Primary Blue  | `#0a3f70` | Hintergrund, Panels    |
| Light Blue    | `#0ca4d1` | Borders, Akzente       |
| Gold          | `#fdc300` | Buttons, Pin, Lupe     |
| Orange        | `#ec6608` | Akzent                 |
| Red           | `#b71918` | Fehler, Warn           |
| Grey          | `#c6c6c6` | Muted Text             |

Schrift: **Segoe UI Semibold** (Titel), **Segoe UI** (Fließtext)
