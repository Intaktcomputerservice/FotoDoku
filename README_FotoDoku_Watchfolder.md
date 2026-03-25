# FotoDoku Watchfolder (Prototype)

Dieses Node.js-Tool überwacht einen Ordner, liest GPS-Daten aus Bildern und benennt die Dateien automatisch anhand der ermittelten Adresse um.

Ziel ist ein möglichst einfacher Ablauf: Bilder werden in einen Ordner gelegt und anschließend automatisch strukturiert abgelegt.

---

## Funktionsweise (Ablauf)

1. Bilder werden in den Ordner `eingang/` gelegt  
2. Das Programm erkennt neue Dateien automatisch  
3. EXIF-Daten werden ausgelesen (inkl. GPS-Koordinaten)  
4. Die Koordinaten werden per Reverse Geocoding in eine Adresse umgewandelt  
5. Die Datei wird umbenannt und nach `verarbeitet/` verschoben  
6. Bilder ohne GPS-Daten werden nach `ohne_gps/` verschoben  
7. Fehlerhafte Dateien werden nach `fehler/` verschoben  
8. Alle Vorgänge werden in einer CSV-Datei unter `logs/` protokolliert  

---

## Technische Eigenschaften

- Verarbeitung erfolgt sequentiell (keine parallelen API-Aufrufe)  
- Einhaltung des Rate Limits (max. 1 Anfrage pro Sekunde)  
- Zwischenspeicherung von Geocoding-Ergebnissen (Cache)  
- Wiederholungsversuche bei temporären Fehlern  
- Konfiguration über `.env`-Datei  

---

## Installation und Start

### Voraussetzungen

- Node.js muss installiert sein (Download unter https://nodejs.org; empfohlen wird die aktuelle LTS-Version)  
- Internetverbindung für Geocoding  

---

### macOS / Linux

```bash
npm install
cp .env.example .env
npm start
```

---

### Windows (Eingabeaufforderung / CMD)

```cmd
npm install
copy .env.example .env
npm start
```

---

### Alternative (alle Systeme)

Die Datei `.env.example` kann auch manuell kopiert und in `.env` umbenannt werden.

---

## Konfiguration (.env)

Die `.env`-Datei enthält alle konfigurierbaren Einstellungen.

### Beispiel `.env`

```env
# Ordnerstruktur
WATCH_DIR=./eingang
OUTPUT_DIR=./verarbeitet
NO_GPS_DIR=./ohne_gps
ERROR_DIR=./fehler
LOG_DIR=./logs

# Nominatim API
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org

# WICHTIG: Eindeutiger User-Agent
USER_AGENT=FotoDokuWatchfolder/1.0 (deine@email.de)

# Rate Limit (max. 1 Request / Sekunde)
REQUEST_INTERVAL_MS=1100

# Verarbeitung
PROCESS_DELAY_MS=3000

# Retry-Verhalten
RETRY_COUNT=2
RETRY_DELAY_MS=2500

# Sprache
ACCEPT_LANGUAGE=de
```

---

### Hinweise zur `.env`

- Der `USER_AGENT` muss eindeutig sein  
- Keine Platzhalter wie `example.com` verwenden  
- Die E-Mail dient nur zur Identifikation gegenüber dem Geocoding-Dienst  
- Änderungen an der `.env` werden erst nach einem Neustart (`npm start`) wirksam  

---

## Ordnerstruktur

- `eingang/`  
  Eingangsordner für neue Bilder  

- `verarbeitet/`  
  Erfolgreich verarbeitete Bilder  

- `ohne_gps/`  
  Bilder ohne Standortdaten  

- `fehler/`  
  Dateien mit Verarbeitungsfehlern  

- `logs/`  
  Protokolle und Cache-Dateien  

---

## Dateibenennung

Beispiel:

2026-03-16_berlin_musterstrasse_12.jpg

Bei gleichen Namen wird automatisch ergänzt:

2026-03-16_berlin_musterstrasse_12_01.jpg

---

## Caching

- Ergebnisse des Geocodings werden lokal gespeichert  
- Identische Koordinaten führen nicht zu erneuten API-Anfragen  
- Reduziert Last und vermeidet Sperrungen  

---

## Hinweise zur Nutzung

- Eine Internetverbindung ist erforderlich  
- Der verwendete Geocoding-Dienst (Nominatim) ist für begrenzte Nutzung gedacht  
- Die Anwendung ist als Prototyp ausgelegt  

---

## Einschränkungen

- Keine Zuordnung zu Firmen oder POIs  
- Keine grafische Benutzeroberfläche  
- Verarbeitung großer Datenmengen nur eingeschränkt geeignet  

---

## Weiterentwicklung (optional)

- Integration einer alternativen Geocoding-API  
- Erweiterung um Firmen- oder Objektzuordnung  
- Aufbau einer einfachen Benutzeroberfläche  
- Optimierung für größere Datenmengen  

---

## Ziel

Automatisierung eines einfachen Workflows:

Bild aufnehmen → in Ordner legen → Datei wird automatisch sinnvoll benannt und abgelegt
