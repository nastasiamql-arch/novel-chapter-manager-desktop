# Novel Chapter Manager Desktop

Desktop migration of the user-provided Novel Chapter Manager v1.2.0 website.

**Status:** v2.0.0-alpha.1 — Windows desktop alpha. The chapter tools and installer are CI-validated; Google Docs still requires a real-account verification.

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

- Local workspace autosave/restore is enabled for imported sources, edits and selections (with an on-disk backup of the previous save). This is not a replacement for independent manuscript backups.
- Real Google-account integration has not been tested; no Google credentials are included.
- Windows installer generation is validated through GitHub Actions. A manual run on a user's PC is still recommended.
- Developers use npm; end users can use the unsigned Windows installer from a successful GitHub Actions artifact.

The original project stays separate from Palantir: Novel. No credentials or manuscripts are included in this repository.

## Local data and limitations

Workspace data is stored in Electron's `userData/chapter-workspace.json` with a `.bak` copy of the last save. Google access tokens are kept in the Electron main process memory, not in project files. Import and export remain local unless you explicitly choose Google publishing. If a save/restore warning occurs, **do not clear the workspace** until you have backed up your manuscript files and project directory.

For an unsigned installer: open [Actions](https://github.com/nastasiamql-arch/novel-chapter-manager-desktop/actions), select the latest successful `Desktop validation and Windows installer` run, then download the `novel-chapter-manager-windows` artifact. Windows SmartScreen may show an unknown publisher warning; the app is not code-signed.
