# Google setup

These steps are performed by the owner of the existing private spreadsheet. They have not been executed against your Google account in this workspace.

## 1. Prepare Codespaces

Open this repository in GitHub Codespaces, using its devcontainer. Then:

```sh
npm ci
npm run check
node scripts/configure.mjs
```

The last command generates a 256-bit random `AUTH_SECRET` into `.local/script-properties.json` with owner-only filesystem permissions. It preserves an existing file and does not print secrets. Keep this file private; `.local/` is ignored by Git. Never commit `.clasp.json`, `.clasprc.json`, OAuth client credentials, real judge codes or application sessions.

## 2. Authorize clasp

Enable the Google Apps Script API in your account at https://script.google.com/home/usersettings. Authenticate:

```sh
npx clasp login --no-localhost
```

Follow the CLI's Google authorization flow. If your Google/Workspace policy blocks that mode, run `npx clasp login` on a local machine with a browser or use a Desktop OAuth client with `npx clasp login --creds /private/path/client.json`. Do not paste account passwords or OAuth tokens into chat or source files.

## 3. Create or connect an Apps Script project

Create a **standalone script**, not a spreadsheet:

```sh
npx clasp create-script --type standalone --title "HackGB JudgeHub" --rootDir dist
npm run build
```

Alternatively, create a standalone project at https://script.google.com, copy its Script ID from Project Settings, copy `.clasp.json.example` to `.clasp.json`, and replace `YOUR_APPS_SCRIPT_PROJECT_ID`.

The project configuration must contain `"rootDir": "dist"`. Source directories are bundled into flat `.gs` and HTML files. Rebuilding after creation restores the repository's manifest if clasp generated a default manifest.

```sh
npx clasp show-file-status
npx clasp push
npx clasp open-script
```

Only `Code.gs`, `Server.gs`, `Index.html`, `Styles.html`, `Scripts.html`, and `appsscript.json` should be selected for upload. Do not push the local mock server or tests.

## 4. Configure private Script Properties

In the Apps Script editor, open **Project Settings → Script Properties → Add script property**. Add the following values individually from your private configuration file:

| Property | Value |
|---|---|
| `SPREADSHEET_ID` | `1XlSkHbv2hObIim8kuMGXjKdRIHTKeHN58vxFzR8sCUk` |
| `AUTH_SECRET` | The generated 64-character hexadecimal secret |
| `ADMIN_EMAILS` | A JSON string array, e.g. `["organizer@your-domain.edu"]`, containing your real approved Google account |
| `GOOGLE_CLIENT_ID` | Web application OAuth client ID, configured below |
| `GOOGLE_CLIENT_SECRET` | That client's secret |
| `DEPLOYMENT_URL` | The stable web app `/exec` URL, configured below |

Do not set `ISOLATED_TEST_FIXTURE` on the production project. `TOKEN_COUNTER` and bounded `RATE_…` properties are managed automatically. Do not reset the counter manually.

## 5. Authorize and initialize the existing workbook

Ensure the script owner can edit the supplied workbook. In Drive, set **General access: Restricted**. Do not grant judges spreadsheet access. The app refuses public or domain link sharing.

The manifest enables the advanced **Google Sheets API v4**. In the editor's Services panel, confirm Google Sheets API is present. If you associate a standard Google Cloud project, enable the Sheets API in that Cloud project too.

Select **`initializeSpreadsheet_`** from the Apps Script editor's function dropdown, click **Run**, and authorize the spreadsheet, Drive and external-request scopes when Google prompts. The underscore prevents browser RPC access but permits manual editor execution. This requires the owner; there is no public setup endpoint.

The initializer validates every existing table's headers and schema version before making changes, creates missing worksheets, and inserts only missing initial configuration. Run it a second time to confirm idempotence. It never deletes or replaces existing evaluations. An unexpected existing worksheet with a reserved name causes an explicit error; back it up and review its contents before adapting the schema. Do not delete it to bypass the check.

## 6. Deploy the web application

In Apps Script select **Deploy → New deployment → Web app**:

- Execute as: **Me (the script owner)**.
- Who has access: **Anyone** (anonymous entry page needed for judge codes).

The landing page is public; application data requires server-validated sessions. The workbook remains private and is accessed only by the backend owner. If Workspace policy forbids anonymous web apps, this deployment cannot serve account-free judges; arrange an approved hosting account/policy before the event.

Copy the URL ending in `/exec` into the `DEPLOYMENT_URL` Script Property. Do not use the `/dev` test URL or a `script.googleusercontent.com` iframe URL.

## 7. Configure real Google organizer sign-in

In Google Cloud Console, create/configure a project with **Google Auth Platform**:

1. Configure app branding/consent with your organizer contact details. Choose Internal only if every organizer is in the same supported Workspace organization; otherwise External.
2. Configure audience/test users if the consent app is in Testing. Add every intended organizer as a test user. Allowlisting in JudgeHub is a separate requirement.
3. Create an OAuth client of type **Web application**.
4. Add the exact `DEPLOYMENT_URL` as an **Authorized redirect URI**. This is the Apps Script `/exec` URL, no added query parameters or trailing slash.
5. Copy the client ID and client secret into Script Properties. Only `openid email profile` is requested for organizer login. No browser JavaScript-origin configuration is needed for this server authorization-code flow.
6. Confirm `ADMIN_EMAILS` contains the first organizer's Google email in a valid JSON array.
7. Open the deployed web app, click **Sign in with Google**, complete the popup, then return to the original tab. It should show the organizer overview after the popup's identity has been verified.
8. Repeat with a non-allowlisted Google account and verify rejection.

Google identity tokens are obtained by the backend directly from Google's authenticated HTTPS token endpoint. The app validates audience, authorized party, issuer, nonce, expiry, issued time, subject and verified email. It does not accept an ID token or asserted email from the browser. See [SECURITY.md](SECURITY.md) for the trust boundary and Google's supporting documentation.

## 8. Verify before event use

Follow [TESTING.md](TESTING.md), including real phone QR scans, anonymous judge access, code revocation, concurrent submissions, Google OAuth, private backups, and re-running initialization without changing evaluation records. This is the deployment acceptance gate. A passing local test suite does not substitute for these Google checks.
