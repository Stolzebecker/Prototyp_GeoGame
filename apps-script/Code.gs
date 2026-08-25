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

// Muss exakt mit SUBMIT_TOKEN in assets/js/telemetry.js uebereinstimmen; bei
// Aenderung dort UND hier anpassen und neu bereitstellen (Bereitstellungen
// verwalten -> Version bearbeiten -> Neue Version). Kein Schutz gegen
// jemanden, der den Client-Quelltext liest -- nur gegen zufaellige/
// automatisierte Requests ohne den Token (siehe TIER-List-README).
var SUBMIT_TOKEN = "gg_5f2a9c14e8b6d0317f4a2c9e6b8d1053";

// Separater Token NUR fuers Dashboard (doGet, siehe unten) -- bewusst
// verschieden vom SUBMIT_TOKEN oben: SUBMIT_TOKEN steht oeffentlich im
// Client-Code des Spiels (jeder kann ihn im Quelltext lesen), READ_TOKEN
// dagegen nur im (privat gehosteten) Auswertungs-Dashboard. Mit dem
// SUBMIT_TOKEN liesse sich nur SCHREIBEN; mit dem READ_TOKEN kann man
// Personendaten (Alter, Bildungsabschluss, ...) LESEN -- das braucht daher
// einen eigenen, nicht oeffentlich im Spiel sichtbaren Token.
var READ_TOKEN = "gg_read_9d3f7a1c58b0e42691dc7f5a0b3e8462";

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

// Liest alle vier Tabs und liefert sie als JSON ans (privat gehostete)
// Auswertungs-Dashboard -- das Sheet selbst bleibt dabei komplett privat,
// nur dieser eine, durch READ_TOKEN geschuetzte Endpunkt gibt Daten heraus.
// Aufruf: <Web-App-URL>?token=<READ_TOKEN>
function doGet(e) {
  if (!e || e.parameter.token !== READ_TOKEN) {
    return jsonOut_({ ok: false, error: "invalid token" });
  }
  var ss = getSpreadsheet_();
  var tabs = ["Personendaten", "Durchlaeufe", "Level_Ergebnisse", "Drop_Versuche"];
  var data = {};
  tabs.forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    data[name] = sheet ? sheetToObjects_(sheet) : [];
  });
  return jsonOut_({ ok: true, data: data });
}

function sheetToObjects_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 1) return [];
  var header = values[0];
  return values.slice(1).map(function (row) {
    var obj = {};
    header.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
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
    "tab_wechsel_count", "gesamt_mausweg_px", "debug_modus_ausgeloest", "hinweis_genutzt",
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
      !!data.hinweisGenutzt,
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
