/**
 * Empfaengt die Ergebnisse des EO Visual Complexity Experiments (GeoGame) per
 * POST und schreibt sie in vier verknuepfte Tabs eines Google Sheets.
 * Analoges Muster zum TIER-List-Backend (siehe
 * 03_Projektphasen/02_Empirische Datenerhebung/TIERList/apps-script/Code.gs),
 * aber mit eigenem Sheet, eigenem Token und einem zusaetzlichen
 * Personendaten-/Drop-Versuche-Schema. Nicht direkt ausfuehren -- wird ueber
 * die Web-App-URL vom Browser der Probandin/des Probanden aufgerufen.
 *
 * Tabs:
 *   Personendaten   -- 1 Zeile pro participant_id (nur beim allerersten Formular)
 *   Durchlaeufe     -- 1 Zeile pro lauf_id (Geraete-/Browser-Metadaten je Durchlauf)
 *   Level_Ergebnisse-- 1 Zeile pro Level+Label (aggregierte Kennzahlen)
 *   Drop_Versuche   -- 1 Zeile pro einzelnem Ablage-Versuch (inkl. Fehlversuche)
 */

// Muss exakt mit SUBMIT_TOKEN in assets/js/app.js uebereinstimmen; bei
// Aenderung dort UND hier anpassen und neu bereitstellen (Bereitstellungen
// verwalten -> Version bearbeiten -> Neue Version). Kein Schutz gegen
// jemanden, der den Client-Quelltext liest -- nur gegen zufaellige/
// automatisierte Requests ohne den Token (siehe TIER-List-README).
var SUBMIT_TOKEN = "gg_5f2a9c14e8b6d0317f4a2c9e6b8d1053";

// EINTRAGEN nach dem manuellen Erstellen des Google Sheets (Datei > Freigeben
// > ID aus der URL kopieren). Siehe README.md, Abschnitt "Deployment".
var SPREADSHEET_ID = "1lPCc6IVj4hputGpwTaA45DLjZLCBwrhM-Tim9ZCcY9I";

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.authToken !== SUBMIT_TOKEN) {
      return jsonOut_({ ok: false, error: "invalid token" });
    }

    switch (data.type) {
      case "person": return handlePerson_(data);
      case "lauf":   return handleLauf_(data);
      case "level":  return handleLevel_(data);
      default:       return jsonOut_({ ok: false, error: "unknown type: " + data.type });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getOrCreateTab_(name, header) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(header);
  return sheet;
}

// ── Personendaten (einmalig pro participant_id) ────────────────────────────
function handlePerson_(data) {
  var sheet = getOrCreateTab_("Personendaten", [
    "empfangen_am", "timestamp_client", "participant_id",
    "alter", "bildungsabschluss", "studienfach", "gis_erfahrung", "geschlecht",
  ]);
  sheet.appendRow([
    new Date(), data.timestampClient || "", data.participantId || "",
    data.alter || "", data.bildungsabschluss || "", data.studienfach || "",
    data.gisErfahrung || "", data.geschlecht || "",
  ]);
  return jsonOut_({ ok: true });
}

// ── Durchlaeufe (einmalig pro lauf_id, zu Beginn eines Durchlaufs) ─────────
function handleLauf_(data) {
  var run = resolveRun_(data.participantId, data.runToken);
  var sheet = getOrCreateTab_("Durchlaeufe", [
    "empfangen_am", "timestamp_client", "participant_id", "lauf_id", "durchlauf_nr",
    "user_agent", "screen_w", "screen_h", "viewport_w", "viewport_h",
    "device_pixel_ratio", "sprache", "zeitzone", "input_typ", "page_load_ms",
  ]);
  sheet.appendRow([
    new Date(), data.timestampClient || "", data.participantId || "",
    run.laufId, run.durchlaufNr,
    data.userAgent || "", data.screenWidth || "", data.screenHeight || "",
    data.viewportWidth || "", data.viewportHeight || "",
    data.devicePixelRatio || "", data.language || "", data.timezone || "",
    data.inputType || "", data.pageLoadMs || "",
  ]);
  return jsonOut_({ ok: true, laufId: run.laufId, durchlaufNr: run.durchlaufNr });
}

// ── Level_Ergebnisse + Drop_Versuche (nach jedem abgeschlossenen Level) ────
function handleLevel_(data) {
  var run = resolveRun_(data.participantId, data.runToken);

  var levelSheet = getOrCreateTab_("Level_Ergebnisse", [
    "empfangen_am", "timestamp_client", "participant_id", "lauf_id", "durchlauf_nr",
    "level", "label", "gesamtzeit_ms", "versuche", "reihenfolge_position",
    "fehlwuerfe_karte", "fehlwuerfe_papierkorb",
    "tab_wechsel_count", "gesamt_mausweg_px", "debug_modus_ausgeloest",
  ]);
  (data.labelResults || []).forEach(function (r) {
    levelSheet.appendRow([
      new Date(), data.timestampClient || "", data.participantId || "",
      run.laufId, run.durchlaufNr, data.level || "",
      r.label || "", r.gesamtzeitMs != null ? r.gesamtzeitMs : "",
      r.versuche != null ? r.versuche : "",
      r.reihenfolgePosition != null ? r.reihenfolgePosition : "",
      r.fehlwuerfeKarte != null ? r.fehlwuerfeKarte : "",
      r.fehlwuerfePapierkorb != null ? r.fehlwuerfePapierkorb : "",
      data.tabWechsel != null ? data.tabWechsel : "",
      data.gesamtMausweg != null ? data.gesamtMausweg : "",
      !!data.debugAusgeloest,
    ]);
  });

  var dropSheet = getOrCreateTab_("Drop_Versuche", [
    "empfangen_am", "timestamp_client", "participant_id", "lauf_id", "durchlauf_nr",
    "level", "label", "ziel", "x_frac", "y_frac",
    "getroffene_klassen_laut_geojson", "korrekt", "versuch_nr_fuer_label",
    "zeit_seit_levelstart_ms",
  ]);
  (data.dropVersuche || []).forEach(function (d) {
    dropSheet.appendRow([
      new Date(), data.timestampClient || "", data.participantId || "",
      run.laufId, run.durchlaufNr, data.level || "",
      d.label || "", d.ziel || "",
      d.xFrac != null ? d.xFrac : "", d.yFrac != null ? d.yFrac : "",
      (d.getroffeneKlassen || []).join(";"), !!d.korrekt,
      d.versuchNrFuerLabel != null ? d.versuchNrFuerLabel : "",
      d.zeitSeitLevelstartMs != null ? d.zeitSeitLevelstartMs : "",
    ]);
  });

  return jsonOut_({ ok: true, laufId: run.laufId, durchlaufNr: run.durchlaufNr });
}

/**
 * Ordnet einem stabilen, vom Client pro Durchlauf erzeugten runToken eine
 * fortlaufende lauf_id sowie (getrennt gezaehlt je participant_id) eine
 * durchlauf_nr zu. Idempotent: derselbe runToken liefert bei mehrfachem
 * Aufruf (z. B. "lauf" dann mehrere "level"-Requests desselben Durchlaufs)
 * immer dasselbe Ergebnis. LockService verhindert Race Conditions bei
 * zeitgleichen Teilnehmenden. Analog zu resolveLaufId_ im TIER-List-Code,
 * aber zusaetzlich mit participant-bezogenem durchlauf_nr-Zaehler.
 */
function resolveRun_(participantId, runToken) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var tokenKey = "run_" + runToken;
    var existing = props.getProperty(tokenKey);
    if (existing) return JSON.parse(existing);

    var nextLaufId = Number(props.getProperty("NEXT_LAUF_ID") || "1");
    var participantKey = "participant_count_" + participantId;
    var durchlaufNr = Number(props.getProperty(participantKey) || "0") + 1;

    var result = { laufId: nextLaufId, durchlaufNr: durchlaufNr };
    props.setProperty(tokenKey, JSON.stringify(result));
    props.setProperty(participantKey, String(durchlaufNr));
    props.setProperty("NEXT_LAUF_ID", String(nextLaufId + 1));
    return result;
  } finally {
    lock.releaseLock();
  }
}
