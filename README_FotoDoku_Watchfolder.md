# FotoDoku Watchfolder

## Überblick
Dieser Dienst automatisiert einen einfachen Foto-Workflow:

1. Bilddatei in den Eingangsordner legen.
2. GPS-Daten aus EXIF lesen.
3. Koordinaten in eine Adresse auflösen.
4. Datei umbenennen und in den Zielordner verschieben.

Der Fokus liegt auf robuster, nachvollziehbarer Verarbeitung mit klaren Fehlerpfaden und Protokollierung.

## Ablauf der Verarbeitung
1. **Dateierkennung**: Neue Bilder im Ordner `eingang/` werden erkannt.
2. **Metadatenanalyse**: EXIF-Daten werden gelesen und auf GPS-Informationen geprüft.
3. **Geocoding**: Koordinaten werden per Nominatim Reverse Geocoding in Adressdaten umgewandelt.
4. **Benennung**: Dateiname folgt dem Schema `YYYY-MM-DD_ort_strasse_hausnummer.ext`.
5. **Routing**:
   - Erfolg → `verarbeitet/`
   - Keine GPS-Daten → `ohne_gps/`
   - Fehler → `fehler/`
6. **Logging**: Ergebnisse werden in `logs/processing_YYYY-MM-DD.csv` protokolliert.

## Technische Eigenschaften
- Sequenzielle Geocoding-Verarbeitung zur kontrollierten API-Nutzung.
- Rate-Limit-Steuerung (`REQUEST_INTERVAL_MS`, mindestens 1000 ms).
- Retry-Mechanismus bei temporären HTTP-/Netzwerkfehlern.
- Persistenter Geocode-Cache (`logs/geocode-cache.json`).
- Konfiguration über `.env`.

## Konfiguration
### Beispiel `.env`
```env
# Ordner
WATCH_DIR=./eingang
OUTPUT_DIR=./verarbeitet
NO_GPS_DIR=./ohne_gps
ERROR_DIR=./fehler
LOG_DIR=./logs
CACHE_FILE=./logs/geocode-cache.json

# Geocoding
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
USER_AGENT=FotoDokuWatchfolder/1.0 (deine@email.de)
ACCEPT_LANGUAGE=de
REVERSE_ZOOM=18
REQUEST_INTERVAL_MS=1100

# Verarbeitung
PROCESS_DELAY_MS=3000
RETRY_COUNT=2
RETRY_DELAY_MS=2500
```

### Hinweise zur Konfiguration
- `USER_AGENT` muss eindeutig sein und eine Kontaktmöglichkeit enthalten.
- Änderungen an `.env` werden erst nach Neustart des Dienstes wirksam.
- Eine Internetverbindung ist für Geocoding erforderlich.

## Installation und Start
### macOS / Linux
```bash
npm install
cp .env.example .env
npm start
```

### Windows (CMD)
```cmd
npm install
copy .env.example .env
npm start
```

## Ordner und Dateien
- `eingang/`: Eingang für neue Bilddateien.
- `verarbeitet/`: Erfolgreich umbenannte Dateien.
- `ohne_gps/`: Dateien ohne GPS-Metadaten.
- `fehler/`: Dateien mit Verarbeitungsausnahmen.
- `logs/`: CSV-Protokolle und Cache-Datei.

## Bekannte Grenzen
- Keine semantische POI-/Firmenzuordnung.
- Keine grafische Benutzeroberfläche.
- Für sehr große Datenmengen aktuell nur eingeschränkt optimiert.

## Begriffserklärung
- **EXIF**: Metadatenformat in Bilddateien (z. B. Kamera, Datum, GPS).
- **Reverse Geocoding**: Umwandlung von Koordinaten in menschenlesbare Adressen.
- **Rate Limit**: Begrenzung der Anfragefrequenz an externe Dienste.
