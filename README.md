# FotoDoku

## 📌 Übersicht
FotoDoku ist ein Node.js-Watchfolder-Dienst für die automatische Verarbeitung von Bildern mit GPS-Metadaten. Neue Dateien werden erkannt, anhand der EXIF-Position einer Adresse zugeordnet, sinnvoll umbenannt und in passende Zielordner verschoben.

## 🚀 Features
- Überwacht einen Eingangsordner kontinuierlich mit `chokidar`.
- Liest EXIF-Metadaten inklusive GPS-Koordinaten mit `exiftool-vendored`.
- Führt Reverse Geocoding über Nominatim mit Rate-Limit und Retry-Logik aus.
- Nutzt lokalen Geocode-Cache zur Reduktion externer API-Anfragen.
- Verschiebt Dateien abhängig vom Ergebnis in `verarbeitet/`, `ohne_gps/` oder `fehler/`.
- Protokolliert jeden Verarbeitungsschritt als CSV in `logs/`.

## 🛠️ Technologien
- Node.js (ES Modules)
- `chokidar` (Dateisystem-Watching)
- `dotenv` (Konfiguration über Umgebungsvariablen)
- `exiftool-vendored` (EXIF-Auswertung)
- Nominatim Reverse Geocoding (OpenStreetMap)

## 📦 Installation
1. Abhängigkeiten installieren:
   ```bash
   npm install
   ```
2. Konfigurationsdatei anlegen:
   ```bash
   cp .env.example .env
   ```
   Unter Windows (CMD):
   ```cmd
   copy .env.example .env
   ```
3. `.env` prüfen und insbesondere `USER_AGENT` mit einer gültigen Kontakt-E-Mail setzen.

## ▶️ Nutzung
1. Dienst starten:
   ```bash
   npm start
   ```
2. Bilder in den Ordner `eingang/` legen.
3. Ergebnisse in den Ausgabeordnern prüfen:
   - `verarbeitet/` für erfolgreiche Verarbeitung
   - `ohne_gps/` bei fehlenden GPS-Daten
   - `fehler/` bei Verarbeitungsfehlern
4. CSV-Protokolle unter `logs/` einsehen.

## 📂 Projektstruktur
- `index.js`: Einstiegspunkt und vollständige Verarbeitungslogik.
- `package.json`: Projekt-Metadaten, Skripte und Runtime-Abhängigkeiten.
- `README.md`: Hauptdokumentation für Setup und Nutzung.
- `README_FotoDoku_Watchfolder.md`: Vertiefende technische Dokumentation zum Watchfolder-Workflow.
- `logs/`: Laufzeit-Logs und Geocode-Cache.

## 🤝 Beitrag
1. Branch erstellen.
2. Änderungen mit Fokus auf Wartbarkeit und Dokumentation umsetzen.
3. Relevante Tests oder Laufchecks ausführen.
4. Pull Request mit klarer Beschreibung erstellen.

## 📄 Lizenz
Derzeit ist keine explizite Lizenzdatei enthalten. Ergänze bei Bedarf eine passende Open-Source-Lizenz (z. B. MIT) im Projektroot.
