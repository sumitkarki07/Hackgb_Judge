# Organizer guide

## Prepare the event

Sign in using an approved Google account. Use the sidebar to move between operations; the current lifecycle state is always visible. Setup is the only state for changing rubrics, award categories, project eligibility and importing records.

1. **Import projects.** Choose Projects → Import CSV, select your Devpost export, map the name, team, links, description, categories and table fields, then preview. Use configured category names or IDs separated by semicolons. Fix errors; duplicate Devpost URLs or name/team pairs are skipped. Confirm the preview to save. You can also add and edit projects manually.
2. **Add judges.** Use Judges → Add judge or Import CSV. Set email, expertise, total assignment capacity, availability, status, conflict project IDs, and optional specialist categories. Expertise is optional; conflicts are mandatory constraints.
3. **Generate codes.** Open the judge's Access code dialog. Generate a code, copy it immediately, and distribute it privately to that judge. The complete code is not retrievable later. Regeneration revokes prior codes and all prior judge sessions. Revocation disables access without deleting history.
4. **Configure judging.** In Rubric & Settings, set event branding, dates, venue, independent judge target (default three), finalist count, short-ranking policy, and scoring criteria. Add Best Hardware or sponsor categories as needed. Assign category eligibility to projects and specialist category access to judges. Category rubrics are visible to their judges before evaluation.
5. **Assign judges.** Press Auto-Assign Judges. Review per-judge loads, new assignments, shortages and warnings. A plan with shortages cannot be saved. Increase capacity, add judges, resolve conflicts, or reduce a category's target in Setup if appropriate. Save a fresh preview. Manual assignments run the same eligibility checks.
6. **Print cards.** Set every table number, then use QR Codes → Download all cards (PDF), or download an individual card. PDFs contain two cards per US Letter page, QR quiet zones, project/table identifiers and instructions. Print at actual size and test scans on a real phone. Use the deployed app's cards, not demo localhost cards.
7. **Open judging.** Manage event → Ready requires submitted projects, tables, valid coded judges and complete assignments. Type the new state and give a reason. Move Ready → Judging Open when teams and judges are prepared.

## During judging

Overview and Live Judging refresh every 30 seconds while visible. Check pending evaluations, incomplete projects and judges with unfinished assignments. Project and judge lists offer search/filter controls. Judges never see these reports or other judges' scores.

| Situation | Action |
|---|---|
| Judge is absent | Mark unavailable in Judges; reassign each unsubmitted assignment with a reason. Run a new preview if needed. |
| Judge loses a code | Generate a replacement and distribute it privately. |
| Judge reports a conflict | Record the project ID in their conflict list; reassign pending work. A conflict update revokes current judge sessions. |
| Existing scored assignment needs another perspective | Add a supplemental judge. Scored/history-bearing assignments cannot be removed by reassignment. Review unequal coverage during deliberation. |
| Incorrect score | Reopen the evaluation from Assignments with a reason. The old score remains in history, stops contributing while reopened, and the judge's category ranking is invalidated. |
| Table changes | Edit the project table and regenerate its card. Its project ID remains stable. |
| Team withdraws | Edit submission status to withdrawn. Historical evaluations remain. |
| Time runs long | Keep judging open, or use the recorded closed-to-open transition before awards are confirmed. |
| Save fails / connection interrupted | Tell judges to keep the form open and retry. Do not report a score as saved without confirmation. |
| Quotas or outage interrupt service | Pause judging, announce the interruption, preserve open forms and use existing private backups for review. Resume only after a test submission succeeds. Never publicize the workbook to bypass the app. |

Changing availability alone preserves history. Confirmations and role checks always happen on the backend; disabled UI controls are not security controls.

## Rankings and decisions

Judges rank their own evaluated projects by category after completing all eligible assignments. Default short-ranking behavior is to rank every available project when fewer than three exist, awarding 3/2 points. The alternate policy requires three. Explain the selected policy to the panel: unequal exposure can affect ranking totals.

In Results, choose a category, inspect rubric averages and ranking points separately, and review flags. Ranking points determine the provisional order; tied projects at the configured cutoff are all included. Missing evaluations, missing rankings and unequal coverage need panel attention. Do not treat a tie or provisional label as a winner declaration.

After submissions/rankings are complete, close judging and move to Deliberation. Open Review on each finalist to inspect criterion scores and judge notes. Record finalist verification and its reason. To confirm an award, first verify that project, then choose Confirm award winner, enter a reason and type its project ID. An incomplete-data exception requires explicit acknowledgment and a substantive reason. Each category uses its own eligibility and evidence; overall scores never automatically assign a sponsor award.

The first confirmed award locks underlying project/judge metadata and evaluation reopening. Confirmed awards cannot be edited. When every active category has at least one confirmed award, move to Finalized with a reason and typed confirmation. After backup/export, move to Archived. Archived events cannot return to Setup through the app.

## Back up and hand over

Create private workbook backups and credential-free CSV exports from Export & Backup. Review administrative changes in Audit Logs. Keep backups restricted. Use [DEPLOYMENT.md](DEPLOYMENT.md) for recovery, URL-preserving updates, and a deliberate next-year rollover without deleting historical records.
