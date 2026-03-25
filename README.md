# FotoDoku (Desktop)

FotoDoku ist jetzt als lokale Electron-Desktop-App aufgebaut (Windows-first), mit Node.js-Backend und einer schlanken Oberfläche in HTML/CSS/JavaScript.

## Funktionen

- Drag-and-drop oder Dateiauswahl für `jpg`, `jpeg`, `png`, `heic`
- EXIF-Auslesen und GPS-Erkennung pro Bild
- Reverse-Geocoding über OpenStreetMap/Nominatim
- Automatischer Dateinamensvorschlag im Schema:
  - `YYYY-MM-DD_Firma_Straße_Hausnummer_BildX.ext`
- Bearbeitbare Vorschläge vor dem Start
- Zielordner-Management:
  - Standardzielordner in Einstellungen
  - Überschreibung pro aktuellem Lauf
  - Fallback auf `Dokumente/FotoDoku/verarbeitet`
- Verschieben statt Kopieren in Struktur `/YYYY/MM/`
- Gemischte Batches: gültige Bilder werden verarbeitet, ungültige sauber abgelehnt

## Projektstruktur

- `electron/` – Electron Main-Prozess und Preload (sicherer IPC-Bridge)
- `frontend/` – Renderer UI (reines HTML/CSS/JS, Sprache: Deutsch)
- `backend/` – Wiederverwendbare Verarbeitungslogik (EXIF, Geocoding, Dateibenennung, Batch-Verarbeitung)
- `index.js` – bisheriger Watchfolder-Einstieg (legacy, optional)

## Entwicklung

1. Abhängigkeiten installieren:

```bash
npm install
```

2. App starten:

```bash
npm start
```

## Build für Windows (EXE/Installer vorbereiten)

```bash
npm run build:win
```

`electron-builder` erzeugt anschließend ein Windows-Artefakt (NSIS).

## Kurzablauf in der App

1. Bilder per Drag-and-drop oder Button hinzufügen.
2. Firma und optional Zusatztext eintragen.
3. Vorschläge erzeugen lassen.
4. Vorgeschlagene Dateinamen bei Bedarf pro Datei anpassen.
5. Zielordner prüfen/ändern.
6. `Verarbeiten` klicken.
7. Zusammenfassung über erfolgreiche und abgelehnte Bilder lesen.

## Hinweise

- Dateien ohne GPS werden nicht verschoben und bleiben unverändert am Ursprungsort.
- Bei Namenskonflikten werden automatisch Suffixe (`_1`, `_2`, …) ergänzt.
- Interne Caches liegen im Electron `userData`-Ordner und es werden keine temporären Bildduplikate erzeugt.
