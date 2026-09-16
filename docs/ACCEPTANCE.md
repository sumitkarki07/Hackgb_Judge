# Acceptance coverage and limits

| Requirement | Implementation |
|---|---|
| Existing private spreadsheet | Fixed supplied ID, owner-authorized initializer, restricted-sharing checks, explicit isolated-test exception only. |
| Modular Apps Script repository | Pure service/auth/security modules, Sheets adapter, flattened build, clasp configuration and Codespaces tooling. |
| Judge and organizer auth | High-entropy judge verifiers/sessions; server Google OAuth with allowlist. Live owner authorization pending. |
| Projects/judges | Manual editing, CSV mapping/preview/validation, stable IDs, duplicates, withdrawals, availability, expertise, conflicts, code rotation/revocation. |
| Assignment preview | Complete minimum-cost flow plan, capacity/independence/conflicts/specialist enforcement, balanced loads, manual assignment and pending reassignment. |
| Judge evaluation | Own projects only, QR intent, rubric-specific explicit scoring, notes, saved confirmation, duplicate protection and correction versions. |
| Rankings and results | Separate category rubric averages and ranking points, short policy, cutoff ties, missing coverage/ranking flags, human finalist/award decisions. |
| Lifecycle | Setup → Ready → Judging Open → Judging Closed → Deliberation → Finalized → Archived; audited reopening before award confirmation. |
| QR table cards | Individual or batch US Letter PDF, two cards/page; actual deployment URL and public project ID only. |
| Progress | Polling dashboard with per-project/judge progress, incomplete/inactive filters and provisional standings. |
| Export/backup | Credential-free UTF-8 CSV, private Drive snapshot, reconciliation and documented owner restore. |
| Tests | Pure logic/security tests, desktop/mobile browser tests, Google integration rehearsal checklist. |

## Explicit practical limits

- Google OAuth, initial workbook setup, sharing checks, live writes, backups and deployment need the owner's authorization. The repository alone cannot establish that these external operations succeeded.
- The local demo is an in-memory fixture, not a persistent backend or fake production Google login. Restarting the demo clears its records.
- The deployed Google integration needs a real rehearsal on the actual deployment/account, including anonymous HTML Service access and popup behavior. Workspace policy may prohibit anonymous web apps.
- No live event name, date, rubric or category needs a source change; a new event in an archived workbook requires an intentional backed-up owner rollover. Multi-event concurrent tenancy is outside this focused app's scope.
- Print PDFs use jsPDF's standard Latin fonts. Uncommon non-Latin project names may need a transliterated print name or a future embedded Unicode font enhancement; project data itself remains Unicode.
- CSV is the Excel-compatible export. A native `.xlsx` exporter is not included.
- Scored or history-bearing assignments cannot be silently reassigned away. Use corrections or a supplemental judge and review coverage flags.
- Award decisions support multiple confirmed projects per category with reasons, not automatic first/second/third prize allocation. The panel records the prize/place in its decision reason or configures distinct categories.
- Audit logs are visible to organizers and editable by trusted spreadsheet/script owners; this is not cryptographic tamper-evident storage.
- Script locks serialize requests for consistency. This is designed for the requested 50-project event, subject to actual Google quotas and network rehearsal.
- No destructive migration endpoint is shipped. Future schema migrations and restores require fresh backups and explicit owner confirmation.
