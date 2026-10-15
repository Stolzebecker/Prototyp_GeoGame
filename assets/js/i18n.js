/**
 * i18n.js – SCOPE
 * Zweisprachige (DE/EN) Oberflaechentexte fuer alles AUSSERHALB der Onboarding-
 * Screens (die haben ihr eigenes TUT_TEXTS in tutorial.js): Startbildschirm,
 * Spielbereich, Ergebnisbildschirm, Post-Befragung, Modals, rechtliche Texte.
 *
 * Seit 2026-10-15 (Ethikantrag-Umsetzung, siehe Memory
 * project_geogame_antrag_umsetzung): durchgaengig "du"-Form, "Kategorie" statt
 * "Label/Objekt", vollstaendig auch auf Englisch.
 *
 * Aktive Sprache = globale Variable `tutLang` (tutorial.js, 'de' | 'en').
 * Statische HTML-Texte tragen data-i18n="<key>" (Text), data-i18n-html="<key>"
 * (HTML), data-i18n-ph="<key>" (placeholder), data-i18n-title / -alt.
 * applyI18n() setzt sie neu - aufgerufen beim Start, bei Sprachwahl und bei
 * dem DE/EN-Umschalter auf dem Startbildschirm.
 */

const UI_TEXTS = {
  de: {
    'loading':            'LADE KONFIGURATION …',
    'loading.error':      '⚠ config.json nicht gefunden!',
    'preload.text':       'Level werden vorbereitet …',
    'preload.progress':   'Level werden vorbereitet … ({done}/{total})',

    // Startbildschirm
    'start.btn':          'Experiment starten ›',
    'start.credit':       'Hintergrundbild Startbildschirm mit OpenAI GPT-Image-2 erstellt.',
    'footer.sources':     'Quellenangaben',
    'footer.imprint':     'Impressum',
    'footer.privacy':     'Datenschutz',
    'footer.lang':        'English',
    'device.forcedTouch':   '⚙ Mobile-Ansicht erzwungen – automatische Erkennung verwenden',
    'device.forcedDesktop': '⚙ Desktop-Ansicht erzwungen – automatische Erkennung verwenden',
    'device.toDesktop':     'Desktop-Version verwenden',
    'device.toMobile':      'Mobile-Version verwenden',

    // Vollbild-Hinweis
    'fs.title':           'Vollbildmodus empfohlen',
    'fs.text':            'Auf Handy und Tablet steht mehr Platz für das Satellitenbild zur Verfügung, wenn die Browserleisten ausgeblendet sind.',
    'fs.activate':        'Vollbildmodus aktivieren',
    'fs.guide':           'Anleitung für iPhone anzeigen',
    'fs.note':            'Der Button funktioniert auf Android- und Desktop-Browsern. Auf dem iPhone bitte die Anleitung nutzen.',
    'fs.skip':            'Weiter ohne Vollbildmodus ›',
    'fs.ios.title':       'Vollbildmodus auf dem iPhone',
    'fs.ios.step1':       '<strong>1.</strong> Tippe links neben der Adresszeile auf dieses Symbol.',
    'fs.ios.step2':       '<strong>2.</strong> Im Menü auf „Symbolleiste ausblenden“ tippen.',
    'fs.ios.alt1':        'Symbolleisten-Symbol links neben der Adresszeile antippen',
    'fs.ios.alt2':        'Im Menü „Symbolleiste ausblenden“ antippen',
    'fs.back':            '‹ Zurück',
    'fs.done':            'Fertig',

    // Spielbereich
    'stat.seconds':       'Sekunden',
    'stat.errors':        'Fehler',
    'prog.level':         'LEVEL {pos} / {tot}',
    'ready.btn':          'Bereit ›',
    'ready.countdown':    'EXPERIMENT STARTET …',
    'ready.tag':          'LEVEL {pos} / {tot}  —  {id}',
    'labelbar.title':     'KATEGORIEN ZIEHEN ›',
    'trash.absent':       'Nicht vorhanden',
    'hint.btn':           'Ich komme nicht weiter ›',
    'hint.shown':         'Lösung wird angezeigt',
    'hint.layers':        'SICHTBARE EBENEN',
    'next.btn':           'WEITER ›',
    'fb.noarea':          '✗ Kein Bereich getroffen – erneut versuchen',
    'fb.correct':         '✓ Korrekt',
    'fb.wrongcat':        '✗ Falsche Kategorie für diesen Bereich',
    'fb.removed':         '✓ Korrekt entfernt',
    'fb.visible':         '✗ Die Kategorie ist im Bild sichtbar – auf die Karte ziehen',
    'fb.geojson':         '⚠ GeoJSON nicht geladen: {src}',
    'level.done':         '✓ Level geschafft',
    'drop.question':      '{label} hier ablegen?',
    'drop.no':            '✕ Verwerfen',
    'drop.ok':            '✓ Bestätigen',
    'preview.zoom':       'Vergrößern',
    'preview.hint':       'Scrollen zum Zoomen · Ziehen zum Verschieben · Doppelklick zum Zurücksetzen',
    'row.title':          'Klicken für Bildvorschau',

    // Kategorien (Anzeigenamen; interne IDs bleiben unveraendert)
    'cat.Wald':           'Wald',
    'cat.Acker':          'Grünland/Landwirtschaft',
    'cat.Gebäude':        'Gebäude/Infrastruktur',
    'cat.Wasser':         'Wasser',

    // Ergebnis / Bestenliste
    'res.title':          'Experiment abgeschlossen',
    'res.yours':          'Deine Ergebnisse',
    'res.th.image':       'Bild',
    'res.th.time':        'Zeit&nbsp;(s)',
    'res.th.errors':      'Fehler',
    'res.th.percentile':  'Perzentil',
    'res.total':          'GESAMT',
    'res.faster':         'schneller als {pct}%',
    'lb.title':           'Bestenliste',
    'lb.th.name':         'Name',
    'lb.disq':            'Dieser Durchlauf hat mehr als 10 Fehler und erscheint daher nicht in der Bestenliste.',
    'lb.loading':         'Bestenliste wird geladen …',
    'lb.loadingRow':      'Lädt …',
    'lb.failed':          'Bestenliste konnte nicht geladen werden.',
    'lb.own':             'Deine Platzierung: {rank}. von {count} ({time} s, {errors} Fehler)',
    'lb.full':            'Vollständige Liste anzeigen ›',
    'lb.fullTitle':       'Vollständige Bestenliste',
    'res.thanks':         'Vielen Dank für deine Teilnahme! Deine Ergebnisse wurden automatisch übermittelt.',
    'res.feedback':       'Feedback geben ›',
    'res.share':          'Freund*in herausfordern ›',
    'res.again':          'Nochmal spielen ›',
    'common.close':       'Schließen',
    'share.title':        'Freund*in herausfordern',
    'share.copied':       'Text in die Zwischenablage kopiert – beim Einfügen in {platform} bereit.',
    'share.emailSubject': 'SCOPE – mach mit!',
    'share.emailIntro':   'Hier geht’s zum Spiel:',

    // Post-Befragung
    'ps.title':           'Noch ein paar Fragen zum Abschluss',
    'ps.q.konzentration': 'Wie konzentriert warst du während des Spiels?',
    'ps.q.ort':           'Wo warst du, als du gespielt hast?',
    'ps.ort.hint':        'Bitte nur grob, z. B. zu Hause, in der Bahn, im Büro oder im Park – keine genaue Adresse.',
    'ps.ort.ph':          'z. B. zu Hause, in der Bahn, …',
    'ps.q.ablenkung':     'Wurdest du während des Spiels unterbrochen oder abgelenkt (z.&nbsp;B. durch andere Personen, Geräusche, Benachrichtigungen)?',
    'ps.q.wachheit':      'Wie wach/ausgeruht warst du beim Spielen?',
    'ps.end.nothing':     'gar nicht',
    'ps.end.very':        'sehr',
    'ps.end.verystrong':  'sehr stark',
    'ps.end.tired':       'sehr müde',
    'ps.end.awake':       'hellwach',
    'ps.q.bekannt':       'Kanntest du eine oder mehrere der gezeigten Landschaften bereits, z.&nbsp;B. weil du den Ort schon einmal besucht oder das Gebiet schon einmal auf einer Karte oder einem Foto gesehen hast?',
    'ps.no':              'Nein',
    'ps.yes':             'Ja',
    'fam.title':          'Welche Landschaften kanntest du bereits?',
    'fam.text':           'Markiere mit dem Haken jedes Bild, das dir bereits bekannt war. Über die Lupe kannst du ein Bild vergrößern.',
    'fam.mark':           'Als bekannt markieren',
    'fam.done':           'Fertig ›',
    'fam.name.title':     'Region/Ort benennen',
    'fam.name.text':      'Wie heißt die Region oder der Ort, den du auf diesem Bild erkannt hast?',
    'fam.name.ph':        'z. B. Oberrheingraben',
    'fam.name.remove':    'Markierung entfernen',
    'fam.name.cancel':    'Abbrechen',
    'fam.name.ok':        'Bestätigen',
    'fb.title':           'Feedback',
    'fb.text':            'Hast du Anmerkungen, Verbesserungsvorschläge oder ist dir etwas aufgefallen? Wir freuen uns über dein Feedback.',
    'fb.hint':            'Bitte schreibe hier keine persönlichen Angaben (Name, Adresse, Telefonnummer, E-Mail).',
    'fb.ph':              'Dein Feedback …',
    'fb.cancel':          'Abbrechen',
    'fb.send':            'Absenden',
    'fb.thanksTitle':     'Danke!',
    'fb.thanksText':      'Dein Feedback wurde übermittelt.',

    // Impressum
    'imp.title':          'Impressum',
    'imp.html': `
      <p><strong>Verantwortliche Stelle:</strong><br>
        Pädagogische Hochschule Heidelberg, vertreten durch die Rektorin<br>
        Keplerstraße 87, 69120 Heidelberg<br>
        E-Mail: <a href="mailto:info@ph-heidelberg.de">info@ph-heidelberg.de</a></p>
      <p><strong>Durchführung der Studie und Ansprechperson für Rückfragen:</strong><br>
        Julian Stolz (Doktorand), betreut von Prof. Dr. Alexander Siegmund<br>
        Institut für Geographie und Geokommunikation, Research Group for Earth Observation (rgeo)<br>
        Pädagogische Hochschule Heidelberg<br>
        Czernyring 22/10-12, 69115 Heidelberg<br>
        Telefon: 06221.477.795<br>
        E-Mail: <a href="mailto:stolz@ph-heidelberg.de">stolz@ph-heidelberg.de</a></p>`,

    // Quellen
    'src.title':          'Quellenangaben',
    'src.html': `
      <p>Satellitenbilder: Enthalten modifizierte Copernicus-Sentinel-Daten, Sentinel-2 L2A, Copernicus Data Space Ecosystem. Rechtsgrundlage: Legal notice on the use of Copernicus Sentinel Data and Service Information (VO (EU) 377/2014, Delegierte VO (EU) 1159/2013).</p>
      <p>Hintergrundbild Startbildschirm: mit OpenAI GPT-Image-2 erstellt (KI-generiertes Bild, keine reale Aufnahme).</p>`,

    // Datenschutzerklaerung (Struktur nach der Vorlage des Datenschutzbeauftragten
    // der PH, Art. 13 DSGVO, V1.4 vom 28.08.2026)
    // TODO(IT, Gespraech 19.10.2026): Abschnitte "Server/Hosting" (Auftragsverarbeitung)
    // und "Server-Protokolle/IP" gegen die tatsaechliche Loesung pruefen.
    'dp.title':           'Datenschutzerklärung',
    'dp.html': `
      <p>Nachfolgend erhältst du gemäß Art. 13 der Datenschutz-Grundverordnung (DSGVO) umfassende Informationen zur Verarbeitung personenbezogener Daten im Rahmen der wissenschaftlichen Studie SCOPE. Die verwendeten Begriffe entsprechen den Definitionen des Art. 4 DSGVO.</p>

      <h2>1. Verantwortlich im datenschutzrechtlichen Sinne</h2>
      <p>Pädagogische Hochschule Heidelberg, vertreten durch die Rektorin, Keplerstraße 87, 69120 Heidelberg, <a href="mailto:info@ph-heidelberg.de">info@ph-heidelberg.de</a>.<br>
      Ansprechperson für diese Studie: Julian Stolz, Institut für Geographie und Geokommunikation (rgeo), Czernyring 22/10-12, 69115 Heidelberg, Telefon 06221.477.795, <a href="mailto:stolz@ph-heidelberg.de">stolz@ph-heidelberg.de</a>.</p>

      <h2>2. Datenschutzbeauftragter</h2>
      <p>Datenschutzbeauftragter der Pädagogischen Hochschule Heidelberg, Keplerstraße 87, 69120 Heidelberg, <a href="mailto:dsb@ph-heidelberg.de">dsb@ph-heidelberg.de</a>.</p>

      <h2>3. Umfang der Datenverarbeitung</h2>
      <p><strong>Beim ersten Spielen auf diesem Gerät:</strong> Angaben aus einem kurzen Fragebogen (Alter, höchster Bildungs- bzw. akademischer Abschluss, Studienfach, Vorerfahrung mit Kartenlesen/GIS/Fernerkundung, Geschlecht, Endgerät) und ein aus vorgegebenen Wortbausteinen zusammengestellter Spielname (Alias).</p>
      <p><strong>Bei jedem Durchgang:</strong> deine Aktionen im Spiel (welche Kategorie wo abgelegt wurde, benötigte Zeit, Versuche und Fehler, Reihenfolge der Bilder, Wechsel zu anderen Browser-Tabs, Nutzung der Hilfefunktion), deine Antworten nach dem Spiel (Konzentration, Ablenkung, Wachheit, grober Aufenthaltsort, bekannte Landschaften) und optional dein Freitext-Feedback. Dazu kommen technische Geräte- und Browserdaten (Bildschirm- und Fenstergröße, Pixeldichte, Browser- und Gerätetyp, Spracheinstellung, Zeitzone, Eingabeart) sowie Zeitstempel. Ein zufällig erzeugter Code (Kennwert) verbindet deine Durchgänge miteinander.</p>
      <p>Es werden <strong>keine</strong> Namen, Adressen, E-Mail-Adressen oder Standortdaten erhoben. Die Spieldaten selbst enthalten keine IP-Adresse. Beim Aufruf der Seite können technisch bedingt kurzzeitig Verbindungsdaten (z. B. die IP-Adresse) im Server-Protokoll anfallen; sie werden nicht mit den Spieldaten verknüpft und nach spätestens 7 Tagen gelöscht.</p>

      <h2>4. Zweck der Datenverarbeitung</h2>
      <p>Die Verarbeitung erfolgt zur Durchführung und wissenschaftlichen Auswertung einer Studie zur Wahrnehmung visueller Komplexität von Satellitenbildern im Rahmen einer Promotion. Untersucht wird, wie Bildmerkmale mit Bearbeitungszeit und Fehlern zusammenhängen.</p>

      <h2>5. Rechtsgrundlage</h2>
      <p>Deine Einwilligung nach Art. 6 Abs. 1 lit. a DSGVO, die du durch Aktivieren der Checkbox auf dem Einwilligungsbildschirm erteilst. Du kannst sie jederzeit mit Wirkung für die Zukunft widerrufen.</p>

      <h2>6. Angabe von Daten und Folgen der Nichtbereitstellung</h2>
      <p>Die Teilnahme und alle Angaben sind freiwillig. Für die Teilnahme sind die Pflichtangaben im Fragebogen nötig; ohne Einwilligung und ohne diese Angaben kann das Spiel nicht gespielt werden. Dir entstehen daraus keine Nachteile.</p>

      <h2>7. Dauer der Datenverarbeitung</h2>
      <p>Die Daten werden bis spätestens 31.12.2028 erhoben. Du kannst bis zum 31.12.2029 formlos verlangen, dass deine Daten gelöscht werden (siehe Abschnitt 11). Am 31.12.2029 wird der Alias aus dem Forschungsdatensatz entfernt; die Daten sind dann anonymisiert und können nicht mehr einzelnen Personen zugeordnet oder gelöscht werden. Der anonymisierte Datensatz wird nach den Regeln guter wissenschaftlicher Praxis zehn Jahre aufbewahrt, nach Ende der Erhebung auf einer verschlüsselten externen Festplatte. Für Veröffentlichungen kann eine gekürzte, anonymisierte Datensammlung anderen Forschenden zur Verfügung gestellt werden.</p>

      <h2>8. Empfänger der personenbezogenen Daten</h2>
      <p>Zugriff auf die Daten haben ausschließlich die Studiendurchführung (Julian Stolz) und der IT-Administrator, der den Server technisch betreut (nur Betrieb, keine Auswertung). Die Daten werden auf einem Server in Deutschland gespeichert. Eine Weitergabe an weitere Dritte findet nicht statt. <strong>Bestenliste:</strong> Dein Alias, deine Gesamtzeit und deine Fehlerzahl sind am Ende des Spiels für andere Teilnehmende sichtbar; Durchläufe mit mehr als 10 Fehlern erscheinen dort nicht (automatische Regel ohne rechtliche Wirkung). Der Alias besteht aus vorgegebenen Wortbausteinen (keine freie Texteingabe) und sagt nichts über dich aus.</p>

      <h2>9. Übermittlung in Drittländer</h2>
      <p>Eine Übermittlung personenbezogener Daten an Empfänger in Staaten außerhalb der EU bzw. des EWR findet nicht statt.</p>

      <h2>10. Automatisierte Entscheidungsfindung</h2>
      <p>Eine ausschließlich automatisierte Entscheidung mit rechtlicher Wirkung findet nicht statt.</p>

      <h2>Lokale Speicherung im Browser</h2>
      <p>Dein Browser speichert technisch notwendig lokal auf deinem Gerät: den zufälligen Code, deinen Alias, einen Hinweis, dass der Fragebogen schon ausgefüllt wurde, die Spielsprache, die Zahl deiner Durchgänge und die Kennungen der Bilder, die du schon gesehen hast (damit du bevorzugt neue Bilder bekommst). Es werden keine Cookies gesetzt und nichts davon wird zu Werbe- oder Trackingzwecken genutzt. Du kannst diese Daten jederzeit in den Einstellungen deines Browsers löschen.</p>

      <h2>Minderjährige</h2>
      <p>Wenn du unter 16 Jahre alt bist, lies diese Hinweise bitte gemeinsam mit deinen Eltern oder Erziehungsberechtigten. Sie müssen mit deiner Teilnahme einverstanden sein.</p>

      <h2>11. Deine Rechte</h2>
      <p>Dir stehen bei Vorliegen der gesetzlichen Voraussetzungen folgende Rechte zu: Auskunft über die dich betreffenden personenbezogenen Daten (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Widerspruch (Art. 21) sowie der Widerruf deiner Einwilligung (Art. 7 Abs. 3). <strong>Löschung:</strong> Schreibe bis zum 31.12.2029 formlos an <a href="mailto:stolz@ph-heidelberg.de">stolz@ph-heidelberg.de</a> und nenne deinen Alias oder den ungefähren Spielzeitpunkt. Anträge sind an die oben genannte verantwortliche Stelle zu richten.</p>
      <p>Du hast außerdem nach Art. 77 DSGVO jederzeit das Recht, dich bei der Aufsichtsbehörde zu beschweren: Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg, Postfach 10 29 32, 70025 Stuttgart, <a href="mailto:poststelle@lfdi.bwl.de">poststelle@lfdi.bwl.de</a>.</p>`,
  },

  en: {
    'loading':            'LOADING CONFIGURATION …',
    'loading.error':      '⚠ config.json not found!',
    'preload.text':       'Preparing levels …',
    'preload.progress':   'Preparing levels … ({done}/{total})',

    'start.btn':          'Start experiment ›',
    'start.credit':       'Start screen background image created with OpenAI GPT-Image-2.',
    'footer.sources':     'Sources',
    'footer.imprint':     'Legal notice',
    'footer.privacy':     'Privacy',
    'footer.lang':        'Deutsch',
    'device.forcedTouch':   '⚙ Mobile view forced – use automatic detection',
    'device.forcedDesktop': '⚙ Desktop view forced – use automatic detection',
    'device.toDesktop':     'Use desktop version',
    'device.toMobile':      'Use mobile version',

    'fs.title':           'Fullscreen mode recommended',
    'fs.text':            'On phones and tablets there is more room for the satellite image when the browser bars are hidden.',
    'fs.activate':        'Activate fullscreen mode',
    'fs.guide':           'Show guide for iPhone',
    'fs.note':            'The button works on Android and desktop browsers. On an iPhone, please use the guide.',
    'fs.skip':            'Continue without fullscreen ›',
    'fs.ios.title':       'Fullscreen mode on iPhone',
    'fs.ios.step1':       '<strong>1.</strong> Tap this icon to the left of the address bar.',
    'fs.ios.step2':       '<strong>2.</strong> In the menu, tap “Hide toolbar”.',
    'fs.ios.alt1':        'Tap the toolbar icon to the left of the address bar',
    'fs.ios.alt2':        'Tap “Hide toolbar” in the menu',
    'fs.back':            '‹ Back',
    'fs.done':            'Done',

    'stat.seconds':       'Seconds',
    'stat.errors':        'Errors',
    'prog.level':         'LEVEL {pos} / {tot}',
    'ready.btn':          'Ready ›',
    'ready.countdown':    'EXPERIMENT STARTING …',
    'ready.tag':          'LEVEL {pos} / {tot}  —  {id}',
    'labelbar.title':     'DRAG CATEGORIES ›',
    'trash.absent':       'Not present',
    'hint.btn':           'I’m stuck ›',
    'hint.shown':         'Showing the solution',
    'hint.layers':        'VISIBLE LAYERS',
    'next.btn':           'NEXT ›',
    'fb.noarea':          '✗ No area hit – try again',
    'fb.correct':         '✓ Correct',
    'fb.wrongcat':        '✗ Wrong category for this area',
    'fb.removed':         '✓ Correctly removed',
    'fb.visible':         '✗ The category is visible in the image – drag it onto the map',
    'fb.geojson':         '⚠ GeoJSON not loaded: {src}',
    'level.done':         '✓ Level complete',
    'drop.question':      'Place {label} here?',
    'drop.no':            '✕ Discard',
    'drop.ok':            '✓ Confirm',
    'preview.zoom':       'Enlarge',
    'preview.hint':       'Scroll to zoom · Drag to move · Double-click to reset',
    'row.title':          'Click for image preview',

    'cat.Wald':           'Forest',
    'cat.Acker':          'Grassland/Agriculture',
    'cat.Gebäude':        'Buildings/Infrastructure',
    'cat.Wasser':         'Water',

    'res.title':          'Experiment completed',
    'res.yours':          'Your results',
    'res.th.image':       'Image',
    'res.th.time':        'Time&nbsp;(s)',
    'res.th.errors':      'Errors',
    'res.th.percentile':  'Percentile',
    'res.total':          'TOTAL',
    'res.faster':         'faster than {pct}%',
    'lb.title':           'Leaderboard',
    'lb.th.name':         'Name',
    'lb.disq':            'This run had more than 10 errors and therefore does not appear in the leaderboard.',
    'lb.loading':         'Loading leaderboard …',
    'lb.loadingRow':      'Loading …',
    'lb.failed':          'The leaderboard could not be loaded.',
    'lb.own':             'Your rank: {rank} of {count} ({time} s, {errors} errors)',
    'lb.full':            'Show full list ›',
    'lb.fullTitle':       'Full leaderboard',
    'res.thanks':         'Thank you for taking part! Your results were submitted automatically.',
    'res.feedback':       'Give feedback ›',
    'res.share':          'Challenge a friend ›',
    'res.again':          'Play again ›',
    'common.close':       'Close',
    'share.title':        'Challenge a friend',
    'share.copied':       'Text copied to the clipboard – ready to paste into {platform}.',
    'share.emailSubject': 'SCOPE – join in!',
    'share.emailIntro':   'Play here:',

    'ps.title':           'A few more questions to finish',
    'ps.q.konzentration': 'How focused were you while playing?',
    'ps.q.ort':           'Where were you when you played?',
    'ps.ort.hint':        'Please keep it rough, e.g. at home, on the train, in the office or in the park – no exact address.',
    'ps.ort.ph':          'e.g. at home, on the train, …',
    'ps.q.ablenkung':     'Were you interrupted or distracted while playing (e.g. by other people, noise, notifications)?',
    'ps.q.wachheit':      'How awake/rested were you while playing?',
    'ps.end.nothing':     'not at all',
    'ps.end.very':        'very',
    'ps.end.verystrong':  'very much',
    'ps.end.tired':       'very tired',
    'ps.end.awake':       'wide awake',
    'ps.q.bekannt':       'Did you already know one or more of the landscapes shown, e.g. because you have visited the place or seen the area before on a map or in a photo?',
    'ps.no':              'No',
    'ps.yes':             'Yes',
    'fam.title':          'Which landscapes did you already know?',
    'fam.text':           'Tick every image you already knew. Use the magnifier to enlarge an image.',
    'fam.mark':           'Mark as known',
    'fam.done':           'Done ›',
    'fam.name.title':     'Name the region/place',
    'fam.name.text':      'What is the name of the region or place you recognised in this image?',
    'fam.name.ph':        'e.g. Upper Rhine Graben',
    'fam.name.remove':    'Remove mark',
    'fam.name.cancel':    'Cancel',
    'fam.name.ok':        'Confirm',
    'fb.title':           'Feedback',
    'fb.text':            'Do you have comments, suggestions, or did you notice anything? We would be glad to hear your feedback.',
    'fb.hint':            'Please do not write any personal information here (name, address, phone number, e-mail).',
    'fb.ph':              'Your feedback …',
    'fb.cancel':          'Cancel',
    'fb.send':            'Send',
    'fb.thanksTitle':     'Thank you!',
    'fb.thanksText':      'Your feedback was submitted.',

    'imp.title':          'Legal notice',
    'imp.html': `
      <p><strong>Responsible body:</strong><br>
        Pädagogische Hochschule Heidelberg (Heidelberg University of Education), represented by the Rector<br>
        Keplerstraße 87, 69120 Heidelberg, Germany<br>
        E-mail: <a href="mailto:info@ph-heidelberg.de">info@ph-heidelberg.de</a></p>
      <p><strong>Conduct of the study and contact person for questions:</strong><br>
        Julian Stolz (doctoral researcher), supervised by Prof. Dr. Alexander Siegmund<br>
        Institute of Geography and Geocommunication, Research Group for Earth Observation (rgeo)<br>
        Pädagogische Hochschule Heidelberg<br>
        Czernyring 22/10-12, 69115 Heidelberg, Germany<br>
        Phone: +49 6221 477795<br>
        E-mail: <a href="mailto:stolz@ph-heidelberg.de">stolz@ph-heidelberg.de</a></p>`,

    'src.title':          'Sources',
    'src.html': `
      <p>Satellite images: Contain modified Copernicus Sentinel data, Sentinel-2 L2A, Copernicus Data Space Ecosystem. Legal basis: Legal notice on the use of Copernicus Sentinel Data and Service Information (Regulation (EU) No 377/2014, Delegated Regulation (EU) No 1159/2013).</p>
      <p>Start screen background image: created with OpenAI GPT-Image-2 (AI-generated image, not a real photograph).</p>`,

    'dp.title':           'Privacy policy',
    'dp.html': `
      <p>Below you will find comprehensive information pursuant to Art. 13 of the General Data Protection Regulation (GDPR) on the processing of personal data in the scientific study SCOPE. The terms used correspond to the definitions in Art. 4 GDPR.</p>

      <h2>1. Controller</h2>
      <p>Pädagogische Hochschule Heidelberg (Heidelberg University of Education), represented by the Rector, Keplerstraße 87, 69120 Heidelberg, Germany, <a href="mailto:info@ph-heidelberg.de">info@ph-heidelberg.de</a>.<br>
      Contact person for this study: Julian Stolz, Institute of Geography and Geocommunication (rgeo), Czernyring 22/10-12, 69115 Heidelberg, phone +49 6221 477795, <a href="mailto:stolz@ph-heidelberg.de">stolz@ph-heidelberg.de</a>.</p>

      <h2>2. Data protection officer</h2>
      <p>Data protection officer of Pädagogische Hochschule Heidelberg, Keplerstraße 87, 69120 Heidelberg, <a href="mailto:dsb@ph-heidelberg.de">dsb@ph-heidelberg.de</a>.</p>

      <h2>3. Scope of data processing</h2>
      <p><strong>The first time you play on this device:</strong> answers from a short questionnaire (age, highest educational or academic qualification, field of study, prior experience with map reading/GIS/remote sensing, gender, device) and a player name (alias) put together from predefined word building blocks.</p>
      <p><strong>In every run:</strong> your actions in the game (which category was placed where, time needed, attempts and errors, order of the images, switching to other browser tabs, use of the help function), your answers after the game (concentration, distraction, alertness, rough location, landscapes you knew) and optionally your free-text feedback. In addition, technical device and browser data (screen and window size, pixel density, browser and device type, language setting, time zone, input type) and timestamps. A randomly generated code links your runs together.</p>
      <p>We do <strong>not</strong> collect names, addresses, e-mail addresses or location data. The game data itself contains no IP address. When the page is requested, connection data (e.g. the IP address) may briefly arise in the server log for technical reasons; it is not linked to the game data and is deleted after 7 days at the latest.</p>

      <h2>4. Purpose of processing</h2>
      <p>The processing serves the conduct and scientific evaluation of a study on the perception of visual complexity in satellite images as part of a doctoral thesis. The study examines how image characteristics relate to processing time and errors.</p>

      <h2>5. Legal basis</h2>
      <p>Your consent under Art. 6(1)(a) GDPR, which you give by ticking the checkbox on the consent screen. You can withdraw it at any time with effect for the future.</p>

      <h2>6. Provision of data and consequences of not providing it</h2>
      <p>Participation and all information are voluntary. The mandatory fields in the questionnaire are required to take part; without consent and without these details the game cannot be played. No disadvantage arises for you.</p>

      <h2>7. Duration of processing</h2>
      <p>Data is collected until 31 December 2028 at the latest. Until 31 December 2029 you can informally request that your data be deleted (see section 11). On 31 December 2029 the alias is removed from the research dataset; the data is then anonymised and can no longer be assigned to individuals or deleted. The anonymised dataset is kept for ten years in accordance with good scientific practice, after the end of data collection on an encrypted external hard drive. For publications, a shortened, anonymised data collection may be made available to other researchers.</p>

      <h2>8. Recipients of personal data</h2>
      <p>Only the person conducting the study (Julian Stolz) and the IT administrator who technically maintains the server (operation only, no analysis) have access to the data. The data is stored on a server in Germany. It is not passed on to any other third parties. <strong>Leaderboard:</strong> your alias, total time and number of errors are visible to other participants at the end of the game; runs with more than 10 errors do not appear there (automatic rule without legal effect). The alias consists of predefined word building blocks (no free-text input) and reveals nothing about you.</p>

      <h2>9. Transfer to third countries</h2>
      <p>Personal data is not transferred to recipients in countries outside the EU or the EEA.</p>

      <h2>10. Automated decision-making</h2>
      <p>There is no decision based solely on automated processing that has legal effect.</p>

      <h2>Local storage in the browser</h2>
      <p>Your browser stores, as technically necessary, locally on your device: the random code, your alias, a note that the questionnaire has already been completed, the game language, the number of your runs and the identifiers of images you have already seen (so that you preferably get new images). No cookies are set and none of this is used for advertising or tracking. You can delete this data at any time in your browser settings.</p>

      <h2>Minors</h2>
      <p>If you are under 16, please read this information together with your parents or legal guardians. They must agree to your participation.</p>

      <h2>11. Your rights</h2>
      <p>Where the legal requirements are met, you have the following rights: access to the personal data concerning you (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18) and objection (Art. 21), as well as withdrawal of your consent (Art. 7(3)). <strong>Erasure:</strong> until 31 December 2029, write informally to <a href="mailto:stolz@ph-heidelberg.de">stolz@ph-heidelberg.de</a> and state your alias or the approximate time you played. Requests must be addressed to the controller named above.</p>
      <p>You also have the right to lodge a complaint with the supervisory authority at any time under Art. 77 GDPR: Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg, Postfach 10 29 32, 70025 Stuttgart, Germany, <a href="mailto:poststelle@lfdi.bwl.de">poststelle@lfdi.bwl.de</a>.</p>`,
  },
};

// ── Endcard-Sprueche (je Gruppe 10, zufaellig; siehe app.js pickEndcardSpruch_) ──
const ENDCARD_SPRUECHE = {
  de: {
    fail: [
      'Das war knifflig! 🧩 Mit etwas mehr Genauigkeit kommst du in die Bestenliste – versuch’s gleich nochmal!',
      'Satellitenbilder haben es in sich! 🛰️ Beim nächsten Mal gelingt dir bestimmt mehr.',
      'Nicht aufgeben! 💪 Jede Runde schärft deinen Blick für Landschaften.',
      'Puh, ganz schön harte Nuss! 🥜 Probier’s nochmal – Übung macht den Meister.',
      'Genau hinschauen lohnt sich! 🔍 Mit etwas mehr Sorgfalt wirst du schnell besser.',
      'Das war eine Herausforderung! 🧗 Mit frischem Blick klappt die nächste Runde besser.',
      'Kein Problem, aller Anfang ist schwer! 🌱 Starte direkt eine neue Runde.',
      'Da ist noch Luft nach oben! 🎈 Mit etwas mehr Genauigkeit landest du in der Bestenliste.',
      'Die nächsten Bilder warten schon auf dich! 🧭 Du schaffst das.',
      'Hoppla, die Landschaft hat dich ausgetrickst! 😄 Revanche gefällig?',
    ],
    top10: [
      'Wow, Spitzenklasse! 🏆 Schaffst du es, dich noch zu verbessern?',
      'Du hast ein Auge für Landschaften! 👁️ Das war richtig stark.',
      'Starke Leistung! 🔥 Die Bestenliste kennt jetzt deinen Namen.',
      'Beeindruckend schnell und genau! ⚡ Geht da noch mehr?',
      'Satellitenbild-Profi gesichtet! 🛰️ Probier die nächste Runde mit neuen Bildern.',
      'Das war ganz oben dabei! 🥇 Kannst du das wiederholen?',
      'Respekt, das war Weltklasse! 🌟 Hol dir die nächste Bestzeit.',
      'Du liest Landschaften wie ein Entdecker! 🧭 Weiter so!',
      'Mit dieser Runde gehörst du zu den Besten! 🚀 Reicht der Schwung für noch eine?',
      'Scharfer Blick, ruhige Hand! 🎯 Zeig’s dir selbst noch einmal.',
    ],
    repeat: [
      'Schön, dass du wieder dabei bist! 🙌 Neue Bilder warten auf dich.',
      'Willkommen zurück! 🛰️ Mal sehen, ob du dich diesmal noch verbesserst.',
      'Wiederholungstäter:in – wir mögen das! 😄 Noch eine Runde?',
      'Du kommst wieder, das freut uns! 🌟 Auf zu neuen Landschaften.',
      'Zurück im Spiel! 🎮 Dein Blick wird mit jeder Runde schärfer.',
      'Du bist ein echter Stammspieler! 🏅 Was holst du diesmal raus?',
      'Schön, dich wieder zu sehen! 🌍 Probier die nächsten Bilder aus.',
      'Dranbleiben lohnt sich! 📈 Wie schlägst du dich diesmal?',
      'Da ist jemand auf den Geschmack gekommen! 😋 Auf in die nächste Runde.',
      'Noch eine Runde? Immer gerne! 🚀 Es warten wieder andere Bilder auf dich.',
    ],
    upper: [
      'Starke Runde! 🚀 Mit jedem Durchgang erkennst du die Landschaft ein Stück besser.',
      'Das lief richtig gut! 👍 Mit etwas mehr Tempo oder Genauigkeit kletterst du weiter nach oben.',
      'Solide Leistung! 🌿 Die nächste Runde bringt dich bestimmt noch weiter.',
      'Gut geschaut! 🔎 Da ist noch Luft nach oben – probier’s nochmal.',
      'Du bist auf einem guten Weg! 🧭 Neue Bilder, neue Chance.',
      'Das war eine saubere Runde! ✨ Schaffst du es noch ein Stück weiter nach vorn?',
      'Du hast den Dreh raus! 🎯 Wie wäre es mit einer weiteren Runde?',
      'Ordentlich! 💪 Die Spitze ist nicht weit entfernt.',
      'Das macht Lust auf mehr! 🌍 Noch eine Runde mit anderen Bildern?',
      'Starker Auftritt! 🌟 Mit etwas Übung wirst du richtig schnell.',
    ],
    lower: [
      'Gut gemacht! 🌍 Beim nächsten Mal entdeckst du bestimmt noch mehr Details.',
      'Danke fürs Mitmachen! 🙌 Mit jeder Runde wirst du sicherer.',
      'Das war ein guter Anfang! 🌱 Die nächsten Bilder warten schon.',
      'Satellitenbilder sind nicht einfach, du hast dich gut geschlagen! 🛰️',
      'Mit etwas Übung wirst du schneller und genauer! ⏱️ Probier’s nochmal.',
      'Geschafft! 🎉 Und mit jedem Durchgang siehst du mehr.',
      'Da geht noch was! 🚀 Starte direkt die nächste Runde.',
      'Du hast alle acht Bilder geschafft! 🧩 Wie wär’s mit einer zweiten Runde?',
      'Jede Runde zählt! 📈 Beim nächsten Mal sieht’s bestimmt noch besser aus.',
      'Gut durchgehalten! 💪 Neue Landschaften warten auf dich.',
    ],
  },
  en: {
    fail: [
      'That was tricky! 🧩 A little more accuracy and you’ll make the leaderboard – give it another go!',
      'Satellite images are no walk in the park! 🛰️ You’ll surely do better next time.',
      'Don’t give up! 💪 Every round sharpens your eye for landscapes.',
      'Phew, a tough nut to crack! 🥜 Try again – practice makes perfect.',
      'Looking closely pays off! 🔍 With a bit more care you’ll improve quickly.',
      'That was a challenge! 🧗 With fresh eyes the next round will go better.',
      'No worries, every beginning is hard! 🌱 Start a new round right away.',
      'Room for improvement! 🎈 A little more accuracy and you’ll land on the leaderboard.',
      'The next images are already waiting for you! 🧭 You can do this.',
      'Oops, the landscape tricked you! 😄 Fancy a rematch?',
    ],
    top10: [
      'Wow, top class! 🏆 Can you improve even more?',
      'You have an eye for landscapes! 👁️ That was really strong.',
      'Great performance! 🔥 The leaderboard now knows your name.',
      'Impressively fast and accurate! ⚡ Is there even more in you?',
      'Satellite image pro spotted! 🛰️ Try the next round with new images.',
      'That was right up there! 🥇 Can you do it again?',
      'Respect, that was world class! 🌟 Go for your next best time.',
      'You read landscapes like an explorer! 🧭 Keep it up!',
      'With this round you’re among the best! 🚀 Got enough momentum for another one?',
      'Sharp eye, steady hand! 🎯 Prove it to yourself once more.',
    ],
    repeat: [
      'Great to have you back! 🙌 New images are waiting for you.',
      'Welcome back! 🛰️ Let’s see if you can improve this time.',
      'A repeat player – we love that! 😄 One more round?',
      'You keep coming back, and we love it! 🌟 On to new landscapes.',
      'Back in the game! 🎮 Your eye gets sharper with every round.',
      'You’re a true regular! 🏅 What will you achieve this time?',
      'Nice to see you again! 🌍 Try the next images.',
      'Sticking with it pays off! 📈 How will you do this time?',
      'Someone’s got a taste for it! 😋 On to the next round.',
      'Another round? Always! 🚀 Different images are waiting for you again.',
    ],
    upper: [
      'Strong round! 🚀 With every run you read the landscape a little better.',
      'That went really well! 👍 A bit more speed or accuracy and you’ll climb even higher.',
      'Solid performance! 🌿 The next round will surely take you further.',
      'Well spotted! 🔎 There’s still room to grow – give it another go.',
      'You’re on a good path! 🧭 New images, new chance.',
      'That was a clean round! ✨ Can you move a bit further up?',
      'You’ve got the hang of it! 🎯 How about another round?',
      'Nicely done! 💪 The top isn’t far away.',
      'That makes you want more! 🌍 One more round with different images?',
      'Strong showing! 🌟 With a bit of practice you’ll get really fast.',
    ],
    lower: [
      'Well done! 🌍 Next time you’ll surely spot even more details.',
      'Thanks for playing! 🙌 You get more confident with every round.',
      'That was a good start! 🌱 The next images are already waiting.',
      'Satellite images aren’t easy – you did well! 🛰️',
      'With a bit of practice you’ll get faster and more accurate! ⏱️ Give it another try.',
      'Done! 🎉 And with every run you see more.',
      'There’s more in you! 🚀 Start the next round right away.',
      'You finished all eight images! 🧩 How about a second round?',
      'Every round counts! 📈 Next time it’ll surely look even better.',
      'Nicely persevered! 💪 New landscapes are waiting for you.',
    ],
  },
};

// ── Helfer ────────────────────────────────────────────────────────────────────
function uiLang(){
  return (typeof tutLang !== 'undefined' && tutLang === 'en') ? 'en' : 'de';
}

function t(key, vars){
  const dict = UI_TEXTS[uiLang()] || UI_TEXTS.de;
  let s = (dict[key] !== undefined) ? dict[key] : (UI_TEXTS.de[key] !== undefined ? UI_TEXTS.de[key] : key);
  if(vars){
    Object.keys(vars).forEach(k=>{ s = s.split('{'+k+'}').join(vars[k]); });
  }
  return s;
}

// Anzeigename einer Kategorie (interne Klassen-IDs bleiben unveraendert,
// damit alte und neue Daten vergleichbar bleiben).
function labelText(id, fallback){
  const k = 'cat.'+id;
  const dict = UI_TEXTS[uiLang()] || UI_TEXTS.de;
  return (dict[k] !== undefined) ? dict[k] : (fallback || id);
}

function applyI18n(root){
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent = t(el.getAttribute('data-i18n')); });
  scope.querySelectorAll('[data-i18n-html]').forEach(el=>{ el.innerHTML = t(el.getAttribute('data-i18n-html')); });
  scope.querySelectorAll('[data-i18n-ph]').forEach(el=>{ el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')).replace(/&nbsp;/g,' ')); });
  scope.querySelectorAll('[data-i18n-title]').forEach(el=>{ el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
  scope.querySelectorAll('[data-i18n-alt]').forEach(el=>{ el.setAttribute('alt', t(el.getAttribute('data-i18n-alt'))); });
  document.documentElement.lang = uiLang();
  if(typeof updateDeviceOverrideLink_ === 'function') updateDeviceOverrideLink_();
}

// Waehlt einen zufaelligen Spruch der Gruppe, nie zweimal derselbe hintereinander
// (letzter Index pro Gruppe/Sprache in localStorage, Fehler dabei sind unkritisch).
function pickSpruch_(group){
  const list = (ENDCARD_SPRUECHE[uiLang()] || ENDCARD_SPRUECHE.de)[group] || [];
  if(!list.length) return '';
  const key = 'geogame_last_spruch_'+uiLang()+'_'+group;
  let last = -1;
  try{ last = parseInt(localStorage.getItem(key), 10); if(isNaN(last)) last = -1; }catch(e){}
  let idx = Math.floor(Math.random()*list.length);
  if(list.length > 1 && idx === last) idx = (idx + 1 + Math.floor(Math.random()*(list.length-1))) % list.length;
  try{ localStorage.setItem(key, String(idx)); }catch(e){}
  return list[idx];
}
