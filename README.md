# FotoDoku (Desktop)

FotoDoku ist eine lokale Electron-Desktop-App (Windows-first) zur robusten Bildverarbeitung mit EXIF-Auslese, GPS-Pflichtprüfung, Reverse-Geocoding und sicherer Dateiablage.

## Kernfunktionen

- Drag-and-drop oder Dateiauswahl für `jpg`, `jpeg`, `png`, `heic`
- EXIF-Auslesen pro Bild mit robusten Datums-Fallbacks
- GPS als Pflichtkriterium für die eigentliche Verarbeitung
- Reverse-Geocoding über OpenStreetMap/Nominatim mit Queue, Rate-Limit, Retry und Timeout
- Vorschlag und manuelle Anpassung von Dateinamen
- Sichere Verschiebung in Struktur `/<Zielordner>/YYYY/MM/`
- Geordnete Verarbeitungsergebnisse (erfolgreich/abgelehnt)
- Retry für fehlgeschlagene Dateien direkt in der Oberfläche

## Verarbeitungsablauf

1. Bilder laden
2. Für jede Datei:
   - Dateityp validieren
   - EXIF lesen
   - GPS extrahieren (Pflicht)
   - Datum bestimmen
   - Adresse per Reverse-Geocoding (mit Cache)
   - Dateinamen-Vorschlag erzeugen
3. Beim Start der Verarbeitung:
   - Zielordner validieren
   - Ziel-Unterordner `YYYY/MM` anlegen
   - Dateikollisionen per Suffix auflösen (`_1`, `_2`, ...)
   - Sicheres Verschieben: zuerst `rename`, bei Cross-Volume-Fall (`EXDEV`) Fallback auf `copy + delete`
4. Ergebnis inkl. Fehlergründen zurückgeben

## Anforderungen an Bilder (EXIF/GPS)

- **GPS ist Pflicht** für volle Verarbeitung (Verschieben/Umbenennen).
- Bilder ohne GPS werden **kontrolliert abgelehnt** und nicht verschoben.
- Datums-Fallbacks für Dateinamen:
  1. `DateTimeOriginal`
  2. `CreateDate`
  3. `ModifyDate`
  4. Datum aus Dateiname (wenn Muster erkannt)
  5. Dateisystemzeit

## Reverse-Geocoding-Strategie

- Dedizierte Queue pro Service-Instanz
- Mindestabstand zwischen API-Aufrufen (`requestIntervalMs`)
- Timeout-Schutz pro Request
- Retry für temporäre Fehler (z. B. 429, 5xx, Timeout)
- Cache nach Koordinaten-Schlüssel (auf 6 Nachkommastellen gerundet)
- Deduplizierung laufender identischer Requests (in-flight)

## Datenverlustschutz bei Dateioperationen

- Keine stillschweigende Überschreibung (immer eindeutiger Zielname)
- Quelle wird vor Verarbeitung geprüft
- Zielordner-Erstellung mit Fehlerbehandlung
- Bei `copy + delete` wird bei Teilausfall aufgeräumt (Zieldatei wird wieder entfernt)
- Fehler werden pro Datei protokolliert und im Ergebnis sichtbar

## Dateinamen-Regeln

- Zentrale Sanitization für alle Segmente
- Entfernung unzulässiger Zeichen und Mehrfachtrenner
- Schutz vor leeren Segmenten und reservierten Windows-Namen
- Konsistente Erweiterung (`.jpg`, `.png`, ...)
- Begrenzte Namenslänge für bessere Dateisystem-Kompatibilität

## Logging & Nachvollziehbarkeit

Im Electron `userData`-Verzeichnis:

- `logs/technical.log.jsonl` – technische Fehler/Events im JSONL-Format
- `logs/processing_YYYY-MM-DD.csv` – fachlicher Verarbeitungsverlauf
- `geocode-cache.json` – Reverse-Geocoding-Cache
- `settings.json` (+ `.bak`) – Einstellungen mit Backup

## Sicherheit / Validierung

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Renderer erhält nur explizite API-Flächen über Preload-Bridge
- IPC-Payloads werden validiert (Struktur, Typen, Limits)
- Pfade werden normalisiert und in der Länge begrenzt
- Eingaben für Dateinamen werden sanitisiert und gekürzt

## Entwicklung

```bash
npm install
npm start
```

## Build für Windows

```bash
npm run build:win
```

## Hinweise / Grenzen

- Bei dauerhaftem API-Ausfall (Geocoding) werden betroffene Bilder abgelehnt, aber der Batch läuft weiter.
- Sehr große Batches sind möglich, aber API-seitig durch Rate-Limits begrenzt.
- Legacy-Einstieg über `index.js` bleibt bestehen, Fokus dieser Robustheitsmaßnahmen ist die Desktop-App.
