/**
 * Empfaengt die Ergebnisse des EO Visual Complexity Experiments (GeoGame) per
 * POST und schreibt sie in verknuepfte Tabs eines Google Sheets.
 * Analoges Muster zum TIER-List-Backend (siehe
 * 03_Projektphasen/02_Empirische Datenerhebung/TIERList/apps-script/Code.gs),
 * aber mit eigenem Sheet, eigenem Token und einem zusaetzlichen
 * Personendaten-/Drop-Versuche-Schema. Nicht direkt ausfuehren -- wird ueber
 * die Web-App-URL vom Browser der Probandin/des Probanden aufgerufen.
 *
 * Tabs:
 *   Personendaten      -- 1 Zeile pro participant_id (nur beim allerersten Formular)
 *   Durchlaeufe        -- 1 Zeile pro lauf_id (Geraete-/Browser-Metadaten je Durchlauf)
 *   Level_Ergebnisse   -- 1 Zeile pro Level+Label (aggregierte Kennzahlen)
 *   Drop_Versuche      -- 1 Zeile pro einzelnem Ablage-Versuch (inkl. Fehlversuche)
 *   Bildwiedererkennung-- 1 Zeile pro als bekannt markiertem/benanntem Bild
 *   Post_Befragung     -- 1 Zeile pro lauf_id (Konzentration/Ort/Ablenkung/Wachheit)
 *   Feedback           -- 1 Zeile pro abgeschicktem Freitext-Feedback
 *   Bestenliste        -- 1 Zeile pro Durchlauf (Alias/Gesamtzeit/Fehler/Disqualifikation,
 *                          siehe Memory project_geogame_leaderboard)
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

// Dritter Token (seit 2026-08-26, siehe Memory project_geogame_leaderboard):
// oeffentlich im Client-Code (wie SUBMIT_TOKEN), aber gewaehrt NUR Lesezugriff
// auf die Bestenliste (Alias + Gesamtzeit + Fehleranzahl) und Perzentil-Werte
// pro Bild - NIE rohe Personendaten, participant_id anderer Nutzer oder
// sonstige Tabelleninhalte. Bewusst nicht derselbe Token wie READ_TOKEN, da
// READ_TOKEN privat bleiben soll (gibt Personendaten preis).
var LEADERBOARD_TOKEN = "gg_board_71cf3e0a4d8b26f5913c6e0a8d4b2f17";

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
      case "person":      return handlePerson_(data);
      case "lauf":        return handleLauf_(data);
      case "level":       return handleLevel_(data);
      case "familiarity": return handleFamiliarity_(data);
      case "post_survey": return handlePostSurvey_(data);
      case "run_summary": return handleRunSummary_(data);
      case "feedback":    return handleFeedback_(data);
      default:            return jsonOut_({ ok: false, error: "unknown type: " + data.type });
    }
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

// Zwei oeffentliche Zwecke unter derselben doGet-Weiche:
//   ?mode=leaderboard&token=<LEADERBOARD_TOKEN>&...  -- oeffentlich, vom
//     Spiel-Client selbst aufgerufen (siehe handleLeaderboardRead_), liefert
//     NUR aggregierte/anonyme Werte.
//   ?token=<READ_TOKEN>  -- privat, nur fuers Auswertungs-Dashboard, liefert
//     alle Tabs vollstaendig (inkl. Personendaten). Das Sheet selbst bleibt
//     dabei komplett privat, nur dieser Endpunkt gibt Daten heraus.
// Bewusst als GET (nicht doPost) implementiert: einfache GET-Requests loesen
// im Browser keinen CORS-Preflight aus und die Antwort ist normal lesbar
// (anders als die no-cors-POSTs in telemetry.js, deren Antwort bewusst
// opak/ungelesen bleibt) - siehe reference_geogame_dashboard-Memory, dieses
// Muster ist schon fuers Dashboard erprobt.
function doGet(e) {
  if (!e) return jsonOut_({ ok: false, error: "invalid token" });

  if (e.parameter.mode === "leaderboard") {
    if (e.parameter.token !== LEADERBOARD_TOKEN) {
      return jsonOut_({ ok: false, error: "invalid token" });
    }
    return handleLeaderboardRead_(e);
  }

  if (e.parameter.token !== READ_TOKEN) {
    return jsonOut_({ ok: false, error: "invalid token" });
  }
  var ss = getSpreadsheet_();
  var tabs = ["Personendaten", "Durchlaeufe", "Level_Ergebnisse", "Drop_Versuche",
              "Bildwiedererkennung", "Post_Befragung", "Feedback", "Bestenliste"];
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
  // Geraetetyp (seit 2026-08-26) - per ensureColumn_ selbstheilend angehaengt,
  // gleiches Muster wie bekanntheit_status in handleLauf_ (siehe dort).
  var geraetCol = ensureColumn_(sheet, "geraet");
  sheet.getRange(sheet.getLastRow(), geraetCol).setValue(data.geraet || "");
  // Alias fuer die Bestenliste (seit 2026-08-26) - leer, wenn keiner
  // vergeben wurde; der Client faellt dann selbst auf participant_id zurueck
  // (siehe Memory project_geogame_leaderboard), hier wird nur festgehalten,
  // was tatsaechlich eingegeben wurde.
  var aliasCol = ensureColumn_(sheet, "alias");
  sheet.getRange(sheet.getLastRow(), aliasCol).setValue(data.alias || "");
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
  // Default-Wert fuer den Familiarity-Check (siehe handleFamiliarity_):
  // "abgebrochen" wird ueberschrieben, sobald die Frage tatsaechlich
  // beantwortet wird (Ja/Nein) - bleibt sonst stehen, wenn der Durchlauf
  // vorher abgebrochen wurde. ensureColumn_ haengt die Spalte bei Bedarf
  // an ein bereits bestehendes (live) Sheet an, ohne dessen Header-Reihen-
  // folge zu veraendern.
  var statusCol = ensureColumn_(sheet, "bekanntheit_status"); // 1-basiert
  sheet.getRange(sheet.getLastRow(), statusCol).setValue("abgebrochen");
  return jsonOut_({ ok: true, laufId: run.laufId, durchlaufNr: run.durchlaufNr });
}

// Stellt sicher, dass die Kopfzeile von `sheet` eine Spalte `colName` hat -
// haengt sie bei Bedarf hinten an, statt bestehende Spalten zu verschieben
// (wichtig fuer das bereits live laufende Durchlaeufe-Tab mit echten Daten).
// Gibt den 1-basierten Spaltenindex zurueck.
function ensureColumn_(sheet, colName) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idx = header.indexOf(colName);
  if (idx === -1) {
    idx = header.length;
    sheet.getRange(1, idx + 1).setValue(colName);
  }
  return idx + 1;
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

// ── Familiarity-Check (einmalig pro lauf_id, am Spielende) ─────────────────
// Ueberschreibt den bei handleLauf_ gesetzten Default "abgebrochen" in der
// Durchlaeufe-Zeile mit "ja"/"nein" und schreibt bei "ja" zusaetzlich eine
// Zeile pro markiertem/benanntem Bild nach Bildwiedererkennung - damit Julian
// diese Datenpunkte in der Level_Ergebnisse-Auswertung im Nachhinein gezielt
// ausschliessen kann (siehe CLAUDE.md).
function handleFamiliarity_(data) {
  var run = resolveRun_(data.participantId, data.runToken);
  var laufSheet = getOrCreateTab_("Durchlaeufe", [
    "empfangen_am", "timestamp_client", "participant_id", "lauf_id", "durchlauf_nr",
    "user_agent", "screen_w", "screen_h", "viewport_w", "viewport_h",
    "device_pixel_ratio", "sprache", "zeitzone", "input_typ", "page_load_ms",
  ]);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var statusCol = ensureColumn_(laufSheet, "bekanntheit_status");
    var values = laufSheet.getDataRange().getValues();
    var header = values[0];
    var laufCol = header.indexOf("lauf_id");
    for (var i = 1; i < values.length; i++) {
      if (values[i][laufCol] === run.laufId) {
        laufSheet.getRange(i + 1, statusCol).setValue(data.status || "");
        break;
      }
    }
  } finally {
    lock.releaseLock();
  }

  var markedImages = data.markedImages || [];
  if (markedImages.length) {
    var sheet = getOrCreateTab_("Bildwiedererkennung", [
      "empfangen_am", "timestamp_client", "participant_id", "lauf_id", "durchlauf_nr",
      "level", "region_name",
    ]);
    markedImages.forEach(function (m) {
      sheet.appendRow([
        new Date(), data.timestampClient || "", data.participantId || "",
        run.laufId, run.durchlaufNr, m.level || "", m.name || "",
      ]);
    });
  }
  return jsonOut_({ ok: true });
}

// ── Post-Befragung (einmalig pro lauf_id, zusammen mit dem Familiarity-Check
// abgeschickt) ── Platzhalterfragen (Konzentration/Ort/Ablenkung/Wachheit),
// bewusst austauschbar gegen literaturbasierte Items - siehe HTML-Kommentar
// bei #familiarity-modal in index.html und CLAUDE.md.
function handlePostSurvey_(data) {
  var run = resolveRun_(data.participantId, data.runToken);
  var sheet = getOrCreateTab_("Post_Befragung", [
    "empfangen_am", "timestamp_client", "participant_id", "lauf_id", "durchlauf_nr",
    "konzentration_1_5", "aufenthaltsort", "ablenkung_1_5", "wachheit_1_5",
  ]);
  sheet.appendRow([
    new Date(), data.timestampClient || "", data.participantId || "",
    run.laufId, run.durchlaufNr,
    data.konzentration || "", data.ort || "", data.ablenkung || "", data.wachheit || "",
  ]);
  return jsonOut_({ ok: true });
}

// ── Feedback (optional, aus dem Abschlusspopup) ─────────────────────────────
function handleFeedback_(data) {
  var run = resolveRun_(data.participantId, data.runToken);
  var sheet = getOrCreateTab_("Feedback", [
    "empfangen_am", "timestamp_client", "participant_id", "lauf_id", "durchlauf_nr",
    "feedback_text",
  ]);
  sheet.appendRow([
    new Date(), data.timestampClient || "", data.participantId || "",
    run.laufId, run.durchlaufNr, data.feedbackText || "",
  ]);
  return jsonOut_({ ok: true });
}

// ── Bestenliste (einmalig pro lauf_id, beim Erreichen des Ergebnis-Screens)
// ── Alias + Gesamtzeit + Gesamtfehler, wie sie im bestehenden GESAMT-Feld
// der Ergebnistabelle ohnehin schon clientseitig berechnet werden (siehe
// showResults() in app.js) - hier nur zusaetzlich abgeschickt. disqualifiziert
// = mehr als 5 Fehler im gesamten Durchlauf (Julians Entscheidung, siehe
// Memory project_geogame_leaderboard: Genauigkeit soll auch zaehlen, nicht
// nur Geschwindigkeit).
var DISQUALIFY_ERROR_THRESHOLD = 5;
function handleRunSummary_(data) {
  var run = resolveRun_(data.participantId, data.runToken);
  var sheet = getOrCreateTab_("Bestenliste", [
    "empfangen_am", "timestamp_client", "participant_id", "lauf_id", "durchlauf_nr",
    "alias", "total_time_ms", "total_errors", "disqualifiziert",
  ]);
  var totalErrors = data.totalErrors != null ? data.totalErrors : 0;
  sheet.appendRow([
    new Date(), data.timestampClient || "", data.participantId || "",
    run.laufId, run.durchlaufNr,
    data.alias || data.participantId || "", data.totalTimeMs || 0, totalErrors,
    totalErrors > DISQUALIFY_ERROR_THRESHOLD,
  ]);
  return jsonOut_({ ok: true });
}

// ── Bestenliste + Perzentile lesen (oeffentlich, LEADERBOARD_TOKEN) ────────
// Liefert NUR aggregierte/anonyme Werte: Top-10 (oder volle Liste bei
// full=1), die eigene Platzierung (ueber runToken -> resolveRun_ -> lauf_id
// wiedergefunden, da der Client wegen no-cors-POSTs seine eigene lauf_id
// sonst nie erfaehrt), und Perzentile fuer die angefragten Level-IDs
// (berechnet aus Level_Ergebnisse, max(gesamtzeit_ms) je Lauf+Level - siehe
// reference_geogame_dashboard-Memory zur selben Aggregationslogik).
function handleLeaderboardRead_(e) {
  var ss = getSpreadsheet_();
  var bestSheet = ss.getSheetByName("Bestenliste");
  var rows = bestSheet ? sheetToObjects_(bestSheet) : [];
  var qualifying = rows.filter(function (r) { return !r.disqualifiziert; });

  // Bester (schnellster) Lauf je participant_id - NICHT je Alias, da Aliase
  // nicht eindeutig sein muessen (siehe Memory project_geogame_leaderboard).
  var bestByParticipant = {};
  qualifying.forEach(function (r) {
    var pid = r.participant_id;
    if (!bestByParticipant[pid] || r.total_time_ms < bestByParticipant[pid].total_time_ms) {
      bestByParticipant[pid] = r;
    }
  });
  var sorted = Object.keys(bestByParticipant)
    .map(function (pid) { return bestByParticipant[pid]; })
    .sort(function (a, b) { return a.total_time_ms - b.total_time_ms; });

  function toEntry(r, i) {
    return { rank: i + 1, alias: r.alias, totalTimeMs: r.total_time_ms, totalErrors: r.total_errors };
  }

  var result = { ok: true, top10: sorted.slice(0, 10).map(toEntry), fullCount: sorted.length };
  if (e.parameter.full === "1") {
    result.full = sorted.map(toEntry);
  }

  var participantId = e.parameter.participantId;
  var runToken = e.parameter.runToken;
  if (participantId && runToken) {
    var run = resolveRun_(participantId, runToken);
    var myRow = qualifying.filter(function (r) {
      return r.participant_id === participantId && Number(r.lauf_id) === run.laufId;
    })[0];
    if (myRow) {
      var idx = sorted.indexOf(bestByParticipant[participantId]);
      result.myRank = { rank: idx + 1, alias: myRow.alias, totalTimeMs: myRow.total_time_ms, totalErrors: myRow.total_errors };
    } else {
      result.myRank = null; // nicht in der Bestenliste (disqualifiziert oder noch nicht abgeschickt)
    }
  }

  var levelIds = (e.parameter.levels || "").split(",").filter(function (s) { return s; });
  var myTimes = (e.parameter.times || "").split(",").map(Number);
  var percentiles = {};
  if (levelIds.length) {
    var levelSheet = ss.getSheetByName("Level_Ergebnisse");
    var levelRows = levelSheet ? sheetToObjects_(levelSheet) : [];
    var maxByRun = {};
    levelRows.forEach(function (r) {
      var key = r.participant_id + "|" + r.lauf_id + "|" + r.level;
      var t = Number(r.gesamtzeit_ms) || 0;
      if (!maxByRun[key] || t > maxByRun[key]) maxByRun[key] = t;
    });
    var timesByLevel = {};
    Object.keys(maxByRun).forEach(function (key) {
      var level = key.split("|")[2];
      (timesByLevel[level] = timesByLevel[level] || []).push(maxByRun[key]);
    });
    levelIds.forEach(function (level, i) {
      var myTime = myTimes[i];
      var others = timesByLevel[level] || [];
      if (!others.length || !myTime) { percentiles[level] = null; return; }
      var slower = others.filter(function (t) { return t > myTime; }).length;
      percentiles[level] = Math.round((slower / others.length) * 100);
    });
  }
  result.percentiles = percentiles;

  return jsonOut_(result);
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
