# Verification plan

## Automated checks

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:ui
npm audit
```

Core tests exercise the production application logic with an isolated transaction adapter. They cover authentication, authorization, Google claim validation, polling-proof replay prevention, revoked/expired credentials, rate limits, 50-project assignment balance, constrained assignment graphs, unavailable/conflicted judges, stale previews, scoring validation, retries, lock contention, reopened histories, category independence, short rankings, finalization, idempotent setup, CSV validation and safe export.

Browser tests use Chromium at desktop and iPhone-sized viewports, with the exact production UI and in-memory backend. They verify the landing page, admin sections, filtering, credential-free exports, PDF download, QR images, explicit unselected scores, evaluation persistence, session restoration, and QR intent/unassigned-project rejection. Screenshots and PDFs are written to ignored `test-results/`; failing traces are retained there. Mobile emulation does not establish real iOS Safari or camera compatibility.

Concurrency tests prove application idempotency, rollback and retry semantics in a deterministic adapter. They **do not** prove the Google service's runtime locking, quotas or durability. Those require the rehearsal below.

## Safe mock mode

`npm run dev` starts the loopback-only demo at http://localhost:4173. Mock organizer access is clearly labeled; it is not Google authentication. All records are synthetic and reset on restart. **Start empty setup** deliberately clears the local fixture for an organizer rehearsal; it never accesses Google. Browser tests reset their own fixture before each scenario. The mock server and its session issuance endpoint are not present in the Apps Script deployment. Never expose the demo port publicly or use it for real judging.

For full Google integration rehearsal, use an explicitly isolated test spreadsheet and a separate Apps Script project. This is the only authorized reason to use a different spreadsheet ID: set that test project's `SPREADSHEET_ID` and `ISOLATED_TEST_FIXTURE=true`. Do not change these values on the production project. Test fixture initialization creates its own schema only after owner authorization. Production continues to use the existing supplied workbook.

## Live Google acceptance checklist — not yet executed

Record date, deployed version, account, browser/device, steps, observed counts and pass/fail. Use a separate authorized test fixture wherever a test would create synthetic scores, alter sharing, simulate corruption or attempt recovery.

| Area | Verify against Google |
|---|---|
| Owner authorization | Script owner can read/write the intended workbook and enabled Sheets/Drive services. |
| Restricted workbook | General access Restricted, no judge shares; anonymous visitor cannot open the workbook. Test public-sharing rejection on the isolated fixture only. |
| Initialization | Run twice; compare all existing records before/after; schema version is 1; unexpected headers/version stop without overwriting records. |
| Google allowlist | Approved account signs in; non-allowlisted account is rejected; wrong audience/expired state cannot yield a session; popup completion returns to the original tab. |
| Revocation | Generate code, sign in, regenerate/revoke, and confirm the old code and its existing session fail immediately. |
| Session expiry | Confirm expired judge/admin sessions require sign-in; organizer removal from allowlist applies to existing sessions. |
| Assignment acceptance | Import 50 fixture projects, add 10 judges, preview three per project, verify 150 unique overall assignments and loads of 15. |
| Restrictions | In a judge's developer console call `rpc('admin.dashboard', {}, token)` and all mutation routes; verify rejection. Change `?project=` to another judge's project; verify the specified unassigned message and no score disclosure. |
| Concurrent writes | Submit from multiple signed-in judge browsers at once. Retry the exact same submission ID concurrently. Verify one evaluation per active assignment/version, matching totals and no missing audits. |
| Lock contention | Trigger overlapping requests; busy requests are retryable, not reported as saved. Successful retry persists exactly once. |
| Write failure | On the fixture, simulate a service failure or revoked backend permission. No success toast, no partially persisted score/history/result batch. Restore permission and safely retry. |
| Corrections | Submit, reopen with a reason, verify old totals excluded and ranking invalidated, correct, and confirm two versions with exactly one active contribution. |
| Lifecycle | Open/close with typed confirmation; closed blocks scoring/rankings; confirmed award locks; finalized prevents ordinary mutations. |
| Results | Verify known averages, 3/2/1 ranking points, cutoff ties, unequal coverage, missing rankings, specialist criteria and documented short-ranking policy. |
| Backup | Create restricted Drive copy, verify table counts and sharing. Perform documented recovery only on a fixture, with fresh pre-restore backup and explicit confirmation. |
| Deployment update | Update the same deployment ID, verify unchanged `/exec` URL and functional existing QR cards. |
| Phone test | On real iOS Safari and Android Chrome, sign in, scan assigned/unassigned cards, confirm session restoration across camera-opened tabs, score, submit, rank and sign out. |
| Load/venue | Use the venue Wi-Fi and actual organizer account; confirm 30-second polling, submission latency and Apps Script quota headroom. |

Do not mark the Google steps passed based on local mocks. Resolve compatibility and quota failures before event use. Store live test evidence privately, excluding credentials and session tokens.
