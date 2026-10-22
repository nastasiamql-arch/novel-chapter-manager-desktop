# Novel Chapter Manager Desktop

Desktop migration of the user-provided Novel Chapter Manager v1.2.0 website.

**Status:** v2.0.0-alpha.7 — Windows desktop alpha. The chapter tools and installer are CI-validated; Google Docs still requires a real-account verification.

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

Create an OAuth 2.0 **Desktop app** client ID in Google Cloud Console; the older **Web application** ID cannot be reused in the installed app. Enable the Docs API and configure consent/test users as required. Paste the Desktop client ID into Google Docs in the program. Authorization opens your regular browser and returns via a temporary 127.0.0.1 random-port listener at its root path with PKCE. Do not manually add an authorized Redirect URI for a Desktop client. Import a Desktop OAuth client JSON once. OAuth configuration and refresh token are encrypted locally using Electron safeStorage / OS encryption; access tokens stay in process memory and are refreshed automatically. Disconnect clears the local authorization. Do not commit the client JSON to GitHub. See [คู่มือ Google OAuth](docs/google-oauth-th.md) for help with 400 redirect_uri_mismatch. Test with 2–3 chapters before bulk publishing.

## Current limitations

- Local workspace autosave/restore is enabled for imported sources, edits and selections (with an on-disk backup of the previous save). This is not a replacement for independent manuscript backups.
- Real Google-account integration has not been tested; no Google credentials are included.
- Windows installer generation is validated through GitHub Actions. A manual run on a user's PC is still recommended.
- Developers use npm; end users can use the unsigned Windows installer from a successful GitHub Actions artifact.

The original project stays separate from Palantir: Novel. No credentials or manuscripts are included in this repository.

## Local data and limitations

Workspace data is stored in Electron's `userData/chapter-workspace.json` with a `.bak` copy of the last save. Google access tokens are kept in the Electron main process memory, not in project files. Import and export remain local unless you explicitly choose Google publishing. If a save/restore warning occurs, **do not clear the workspace** until you have backed up your manuscript files and project directory.

For an unsigned installer: open [Actions](https://github.com/nastasiamql-arch/novel-chapter-manager-desktop/actions), select the latest successful `Desktop validation and Windows installer` run, then download the `novel-chapter-manager-windows` artifact. Windows SmartScreen may show an unknown publisher warning; the app is not code-signed.

## Desktop Google login persistence (alpha.3)

In Google Cloud Console, create OAuth Client ID type **Desktop app**. Download the JSON from that client; it contains `installed.client_id` and `installed.client_secret`. In Google Docs view, click **เลือก OAuth Desktop JSON** and choose that file, then authorize once. On next launches the saved refresh token is used automatically, unless Google revokes it or it expires. The app will refuse persistent login when the operating system does not provide protected encryption. Keep the downloaded JSON private. Do not upload it to GitHub. Google OAuth Testing-mode refresh tokens may expire after 7 days depending on scopes and configuration.

## Existing Google Docs (v2.0.0-alpha.7)

The Desktop OAuth flow now requests both `drive.file` and `documents`, enabling the Google Docs API to read existing Docs files that the connected Google account can access. This is a broader Google permission than earlier releases and may require adding it in Google Auth Platform, configuring test users, and Google app verification for broader public distribution. After upgrading from alpha.6 or earlier, click **เชื่อม Google Account** again to grant the new permission; the saved Desktop OAuth client configuration is preserved. Reconnecting does not delete manuscripts. Check the account, document URL, and edit access if a document still returns 404. Make a backup before editing an existing document. No live Google-account end-to-end test has been performed.
