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

### 4. Deployment (Frontend)

Alle Dateien auf GitHub Pages hochladen. GitHub Pages liefert statische Dateien –  
Python-Scripts laufen **lokal**, nie auf dem Server.

### 5. Deployment (Backend — Google Sheet + Apps Script)

Muss **einmalig manuell** eingerichtet werden, bevor echte Daten erhoben werden können:

1. Neues Google Sheet anlegen (leer, Name z. B. "GeoGame Ergebnisse"). Die Tabs (Personendaten, Durchlaeufe, Level_Ergebnisse, Drop_Versuche, Bildwiedererkennung, Post_Befragung, Feedback) werden beim ersten Request automatisch mit Kopfzeile angelegt — nichts manuell vorbereiten.
2. Im Sheet: Erweiterungen → Apps Script. Den Inhalt von `apps-script/Code.gs` einfügen.
3. In `Code.gs`: `SPREADSHEET_ID` eintragen (aus der Sheet-URL zwischen `/d/` und `/edit`).
4. Bereitstellen → Neue Bereitstellung → Web-App. Ausführen als "Ich", Zugriff "Jeder". Deployen, die ausgegebene Web-App-URL kopieren.
5. In `assets/js/telemetry.js`: `SUBMIT_URL` auf diese URL setzen.
6. `SUBMIT_TOKEN` ist in `Code.gs` und `telemetry.js` bereits identisch vorbelegt — beim Ändern in **beiden** Dateien synchron halten.
7. Nach jeder Änderung an `Code.gs`: erneut "Neue Bereitstellung" bzw. "Bereitstellungen verwalten → Version bearbeiten → Neue Version", sonst wird die alte Version weiter ausgeführt.

Solange `SUBMIT_URL` noch den Platzhalter enthält, werden Telemetrie-Payloads nur per `console.warn` geloggt statt gesendet — das Spiel bleibt dabei voll funktionsfähig (siehe `sendToBackend_()` in `telemetry.js`).

**Fallstrick:** Das Sheet-eigene Menü "Erweiterungen → Apps Script" öffnet ein *anderes*, leeres, nie deploytes Projekt — das echte Backend ist das **eigenständige** Apps-Script-Projekt "GeoGame Backend", zu finden über script.google.com/home/my (blauer Pfeil-Icon, nicht das grüne Sheet-Icon).

`Code.gs` enthält neben `doPost` (Schreiben, siehe oben) auch `doGet` mit einem eigenen `READ_TOKEN` — liefert alle Tabs als JSON fürs Auswertungs-Dashboard (`00_Tests und AdHoc/VisualComplexity_Game/Auswertung/GeoGame_Dashboard.html`), ohne dass das Sheet selbst öffentlich freigegeben werden muss. Der `READ_TOKEN` gehört **nicht** in den öffentlichen Client-Code.

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

Für Teilnehmende gibt es zusätzlich den Knopf **"Ich komme nicht weiter ›"** (unten links, während eines Levels sichtbar) — zeigt nur die Hitbox-Umrisse, ohne das restliche Debug-Panel zu öffnen. Wird separat als `hinweis_genutzt` erfasst (siehe CLAUDE.md).

---

## CI / Design

Seit 2026-08-25 helles Theme (an TIER-List angenähert), auch auf der Spielbühne selbst:

| Token         | Hex       | Verwendung                          |
|---------------|-----------|--------------------------------------|
| Primary Blue  | `#0a3f70` | Text, Buttons, Rahmen                |
| Light Blue    | `#0ca4d1` | Borders, Akzente                     |
| Gold          | `#fdc300` | CTA-Buttons (Start/Weiter/Bereit)    |
| Orange        | `#ec6608` | Akzent                                |
| Red           | `#b71918` | Fehler, Warn                         |
| Grey          | `#c6c6c6` / `#eef1f4` | Muted Text / helle Flächen |

Schrift: **Segoe UI Semibold** (Titel), **Segoe UI** (Fließtext)

## Auswertung

`00_Tests und AdHoc/VisualComplexity_Game/Auswertung/GeoGame_Dashboard.html` — Level-Schwierigkeit, Objektklassen-Fehlerraten, Demografie, GIS-Erfahrung↔Leistung, live aus den per `doGet()` geholten Rohdaten berechnet (kein Live-Fetch im Dashboard selbst). Details/Update-Workflow: Memory-Referenz `reference_geogame_dashboard`.
