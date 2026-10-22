# Novel Chapter Manager Desktop

Desktop migration of the user-provided Novel Chapter Manager v1.2.0 website.

**Status:** v2.0.0-alpha.1 — first implementation, not a production release.

## Features

- Import multiple TXT/DOCX files and paste text.
- Split and sort chapters labeled `บทที่` (Thai and Arabic numerals).
- Check duplicate/missing chapters and `[จบตอน]` / `[จบบท]` markers.
- Edit or exclude chapters.
- Export individual TXT/DOCX ZIP files or merged Word.
- Create Google Docs with one tab per chapter; inspect and append missing chapters.

DOCX is processed as plain text; rich formatting and images are not retained. Source files are not overwritten.

## Run

Requires Node.js and npm.

```sh
npm install
npm test
npm start
```

To build an unsigned Windows installer on Windows:

```sh
npm run dist:win
```

GitHub Actions runs tests and builds the installer as an **Actions artifact**.

## Google Docs

Create an OAuth 2.0 **Desktop app** client ID in Google Cloud Console; enable the Docs API and configure consent/test users as required. Paste the client ID into Google Docs in the program. Authorization opens your regular browser and returns via a temporary 127.0.0.1 listener with PKCE. Only the access token is kept in memory; reconnect after restart or expiry. Test with 2–3 chapters before bulk publishing.

## Current limitations

- No persistent workspace/auto-save yet; unsaved chapter selections and edits are lost at exit.
- Real Google-account integration has not been tested.
- Installer packaging has not yet been verified on Windows.
- This desktop alpha requires dependency installation via npm.

The original project stays separate from Palantir: Novel. No credentials or manuscripts are included in this repository.
