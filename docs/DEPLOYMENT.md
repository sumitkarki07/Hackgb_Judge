# Deployment, updates, backup and recovery

Perform initial authorization using [SETUP.md](SETUP.md). Codespaces is a development workspace; the permanent app runs on Google Apps Script.

## Release or update without changing the website URL

Create a backup from **Export & Backup** before a significant release. Then:

```sh
npm ci
npm run check
npm run test:ui
npx clasp show-file-status
npx clasp push
npx clasp create-version "Describe this release"
npx clasp list-deployments
npx clasp update-deployment YOUR_EXISTING_DEPLOYMENT_ID --versionNumber YOUR_NEW_VERSION_NUMBER --description "Describe this release"
```

Use the existing deployment ID to preserve `/exec`, OAuth redirect settings and printed QR codes. Alternatively, in **Deploy → Manage deployments → Edit**, select the new version and deploy. Record the release version and deployment ID privately. Do not delete/recreate a live deployment for an ordinary update.

Pushing code does not initialize, clear or migrate spreadsheet records. Schema initialization is a separate, idempotent owner action. If a schema version is unsupported, stop and use a reviewed migration with explicit backup and confirmation.

## Backup

From **Export & Backup → Create backup**, the authorized owner backend copies the existing workbook into the owner's Drive root with restricted sharing. This is a point-in-time application snapshot taken under the same lock used for writes. Open the returned private link and verify its contents and access.

Take backups before opening judging, before deliberation, before finalization, and before code/schema changes. Download credential-free CSV exports for independent review. CSV files are not a complete restore format: they exclude sessions, private configuration and some credential fields.

Drive backup creation and subsequent sheet audit writing are separate services. If the app reports a failed confirmation, check Drive for an already-created backup before retrying.

## Restore into the existing workbook

Restore is intentionally an owner maintenance procedure. It is not a public application endpoint and never silently replaces the workbook ID.

1. Announce a maintenance window, pause judging, and temporarily restrict the web app deployment to yourself. Ensure no submissions are in flight. Record the current deployment version and event status.
2. Make a **new private backup of the current live workbook**, even if it is damaged. Record its ID and timestamp separately.
3. Open the intended backup. Confirm the event, schema version, expected Projects/Judges/Assignments counts and evaluation/ranking timestamps. Do not proceed with an unverified backup.
4. Explicitly record owner confirmation in your maintenance log: `RESTORE <backup ID> INTO 1XlSkHbv2hObIim8kuMGXjKdRIHTKeHN58vxFzR8sCUk; CURRENT BACKUP <new backup ID>`.
5. Using the Google Sheets UI as the owner, copy each application worksheet from the verified backup to the **existing live spreadsheet**. Preserve all original live worksheets with a timestamped prefix first; rename each restored worksheet to its exact schema name. Never copy just Results: restore the complete consistent set of application tables together. Keep restored worksheets' column order and JSON cell strings unchanged.
6. Retain the timestamped previous sheets until the restore is verified. They are not read by the application. Do not alter source data to satisfy schema errors.
7. Generate a fresh private secret with `node scripts/configure.mjs` in a separate private working folder or use a local cryptographic secret generator. Update `AUTH_SECRET` in Script Properties. This invalidates restored sessions and judge codes. Do not delete your only copy of existing private configuration just to regenerate a secret.
8. Run `initializeSpreadsheet_`. Sign in as an approved organizer, reconcile Results, inspect audits and check record counts against the selected backup. Generate new judge access codes before resuming.
9. Restore the intended deployment access and record the restoration in your maintenance log with the person, reason, source backup and verification evidence. Reopen judging only after the complete acceptance checks pass.

A restore is a destructive operational change despite the preserved snapshots. It requires the backup and explicit confirmation above. The application deliberately does not automate this procedure in routine initialization.

## Future HackGB events

Change branding, date, venue, target, rubric and categories through **Rubric & Settings** while in Setup; no source edit is needed.

To reuse this exact workbook after an Archived event, use an owner maintenance window and a verified full backup. With explicit owner confirmation, rename each old application tab with an event-specific archive prefix, preserving its contents, then run `initializeSpreadsheet_` to create empty schema-named tabs in the same workbook. Rotate `AUTH_SECRET`, regenerate codes, and configure the new event in Setup. Retain the archived tabs and private backup for history. This is a deliberate new-event rollover, not a side effect of initialization. The website deployment and spreadsheet ID stay the same.

## Release acceptance

The repository does not include real credentials, a live deployment ID, or a claim of Google authorization. Run the Google integration and phone test checklist in [TESTING.md](TESTING.md), recording actual results before describing the installation as ready for event use.
