# FotoDoku

FotoDoku is a local-first Electron desktop app for image processing. It reads image metadata, extracts EXIF/GPS coordinates, performs reverse geocoding through OpenStreetMap (Nominatim), and organizes files automatically with structured naming and folders.

## Features

- **Automatic processing workflow** for selected images in one batch.
- **EXIF/GPS extraction** with robust metadata fallbacks.
- **Address resolution** from GPS coordinates via reverse geocoding.
- **File renaming and sorting** into `YYYY/MM` target folders.
- **Missing GPS handling** with clear rejection reasons (no silent failures).
- **Local-first architecture**: files are processed on your machine.
- **Collision-safe file moves** (`_1`, `_2`, ...) and cross-volume move fallback.

## How It Works

1. You add images to a batch (file picker, multiple files supported).
2. FotoDoku reads EXIF metadata and validates supported image types.
3. GPS coordinates are resolved to address parts (street/house number).
4. The app generates a clean filename, then moves the file into a dated folder.

## Installation

### Requirements

- **Node.js 20+**
- **npm**
- Windows is the primary target platform for packaged builds.

### Run in development

```bash
npm install
npm start
```

## Build

Create a Windows installer/build:

```bash
npm run build:win
```

Build artifacts are written to:

- `dist/`

## Project Structure

- `electron/` → Electron main process, IPC handlers, app bootstrap.
- `backend/` → Core processing logic (EXIF, geocoding, naming, processing, logs, settings).
- `frontend/` → Renderer UI (`index.html`, `renderer.js`, `styles.css`).

## Configuration

### Settings storage

FotoDoku stores runtime files in Electron's `userData` directory, including:

- `settings.json` (with `settings.json.bak` backup)
- `geocode-cache.json`
- `logs/` (daily log folders, see below)


### Logging

Logs are **not** stored in the project directory. FotoDoku writes logs to Electron's OS-specific `userData` directory and creates folders automatically.

Folder structure:

```
logs/<YYYY-MM-DD>/
  - app.log
  - processing.csv
```

Purpose:

- `app.log` → technical/debug log (structured JSON lines, machine-readable).
- `processing.csv` → audit trail of processed images (human-readable CSV).

Typical base paths:

- macOS: `~/Library/Application Support/FotoDoku/`
- Windows: `%APPDATA%/FotoDoku/`

### Environment variables

If needed, create a `.env` file in the project root.

- `USER_AGENT` → Custom user agent for Nominatim requests.
- `ACCEPT_LANGUAGE` → Preferred language for reverse geocoding responses.

## Error Handling

FotoDoku is designed to fail safely and continue batch processing where possible:

- **Files without GPS**: rejected as business-rule failures and not moved.
- **Corrupted/unreadable images**: rejected with EXIF read error details.
- **Geocoding/API issues**: retried with delay; persistent failures are reported per file.
- **Move failures**: logged and returned in results without stopping all other files.

## Privacy

- File processing is local.
- Reverse geocoding requests send only coordinates to Nominatim.
- No cloud upload pipeline is part of the application flow.

## Roadmap

- Improved UI/UX for large batches.
- Optional folder-watch mode for continuous ingestion.
- Better batch management and filtering in the results view.
- Enhanced location enrichment (e.g., company/place details from OpenStreetMap).
- AI-assisted filename or metadata enrichment options.

## License

No explicit license file is currently included in this repository.
