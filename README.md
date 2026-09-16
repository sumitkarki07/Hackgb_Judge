# HackGB JudgeHub

A focused judging workspace for **HackGB 2026**, October 17–18 at the University of Wisconsin–Green Bay. Judges evaluate assigned projects on a phone; organizers manage judging, monitor progress, and record award decisions in one private workspace.

**Implementation status:** the application runs locally with an isolated in-memory backend and builds into an Apps Script web app. Google OAuth, spreadsheet initialization, Drive backups, and deployment require the owner's authorization and a live verification run. No live Google connection or deployment is claimed.

## Try it locally

Requires Node.js 22 or later.

```sh
npm ci
npm run dev
```

Open **http://localhost:4173**. Use **Explore organizer demo** for the synthetic organizer workspace, or `DEMO-HACKGB-2026` for the synthetic judge account. The demo contains eight projects and six judges. Use **Start empty setup** to rehearse imports and the complete event lifecycle from scratch. Changes disappear when the server restarts. The local server listens on loopback and never calls Google or reads the real workbook. Keep Codespaces port visibility **Private**.

```sh
npm test                       # core logic, authentication, authorization and data tests
npx playwright install chromium
npm run test:ui                # desktop/mobile browser workflows
npm run build                  # deployable Apps Script files in dist/
```

See [Google setup](docs/SETUP.md) for the exact deployment sequence. The configured production database is the existing spreadsheet:

`1XlSkHbv2hObIim8kuMGXjKdRIHTKeHN58vxFzR8sCUk`

The app never creates a replacement database. Authorized backups are separate restricted copies.

## What is included

- Mobile judge dashboard, QR project access, explicit scoring controls, notes, session restoration, and top-three rankings.
- Organizer dashboard with projects, judges, CSV mapping and previews, code rotation/revocation, assignments, QR/PDF cards, settings, live monitoring, results, exports, backups, and audit logs.
- Capacity-balanced automatic assignments with independent judges, conflicts, availability, expertise preference, specialist categories, stale-preview checks, and shortage reporting.
- Separate rubric averages and ranking points, incomplete-data and tie flags, provisional finalist suggestions, panel verification, confirmation, and locked awards.
- Server-side Google OAuth authorization-code flow for allowlisted organizers; high-entropy judge codes with protected verifiers and expiring, revocable sessions.
- Idempotent schema initialization, stable IDs, correction history, atomic Sheets batch writes under a script lock, and reconciliation from source records.
- Devcontainer, clasp build tooling, CI, automated tests, and operational guides.

## Architecture

HTML/CSS/JavaScript runs in Apps Script HTML Service. The browser calls a single `rpc` gateway through `google.script.run`. A pure JavaScript application layer handles authentication, authorization and business rules; a repository adapter reads and writes the private Google Sheet as its owner. All helpers are scoped inside a bundle or end with `_`, so they cannot be invoked as independent browser RPCs.

Organizer authentication uses a Google OAuth popup and a server-to-Google code exchange. The existing app tab proves ownership of the sign-in flow before receiving an application session. It does not rely on the Apps Script active-user email. See [authentication design](docs/SECURITY.md).

No frontend framework, external database, paid service, or permanent Codespaces server is required. The build bundles lightweight CSV, QR and PDF libraries into the app; Google Fonts is the only optional external presentation request.

## Repository

```text
src/
  Code.gs                  HTML Service and RPC entry points
  server.js                Production environment and error boundary
  appsscript.json          Apps Script manifest and service scopes
  auth/                    Sessions, authorization and Google OAuth
  config/                  Existing spreadsheet ID and event defaults
  database/                Schema, initialization and Sheets transactions
  security/                Validation and safe CSV output
  services/                Application operations, assignments and results
  ui/                      Responsive client, styles and HTML shell
scripts/                   Build, local mock server and setup tooling
tests/                     Core logic and desktop/mobile browser tests
docs/                      Setup, deployment, security and user guides
.devcontainer/             GitHub Codespaces environment
.github/workflows/         CI checks
```

## Documentation

- [Setup and Google authorization](docs/SETUP.md)
- [Deployment, updates, backup and restore](docs/DEPLOYMENT.md)
- [Architecture and integrity model](docs/ARCHITECTURE.md)
- [Organizer guide](docs/ADMIN_GUIDE.md)
- [Judge guide](docs/JUDGE_GUIDE.md)
- [Security and authentication](docs/SECURITY.md)
- [Automated and live integration test plan](docs/TESTING.md)
- [Acceptance coverage and operational limits](docs/ACCEPTANCE.md)
- [Local verification results](docs/VERIFICATION.md)

## Troubleshooting

| Symptom | Action |
|---|---|
| Organizer sign-in not configured | Set OAuth client ID/secret, exact `/exec` deployment URL and administrator allowlist in Script Properties. |
| `redirect_uri_mismatch` | The OAuth client's redirect URI must exactly match `DEPLOYMENT_URL`, without a trailing slash. |
| Spreadsheet/schema error | Run `initializeSpreadsheet_` in the Apps Script editor. Do not rename headers or edit the typed JSON cells manually. |
| Workbook sharing error | Set Google Drive general access to Restricted; remove public and domain link permissions. |
| Judge sees an unassigned-project message | Verify active assignment, correct project ID, judge status and conflicts. |
| Assignment plan cannot be saved | Resolve shortages or generate a new preview if event records changed. |
| Request could not be confirmed | Keep the form open and retry; evaluation retries with the same submission ID are idempotent. |
| QR code opens localhost | You printed demo cards. Configure the production URL and regenerate cards from the deployed app. |
| Browser blocks OAuth popup | Allow popups for the deployed app and try Google sign-in again. |
| Apps Script services are slow or unavailable | Check quotas and ownership access; follow the event contingency procedure in the organizer guide. |

Future organizers can edit event branding, dates, rubrics, categories, target coverage and ranking policy in Setup. Reuse the same workbook only after archiving and backing up its existing records using the documented new-event procedure; initialization never resets an event.
