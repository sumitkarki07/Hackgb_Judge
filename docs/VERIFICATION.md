# Local verification record

Verified in this workspace on September 16, 2026.

| Check | Result |
|---|---|
| Core and adapter tests (`npm test`) | **49 passed** |
| Desktop/mobile browser tests (`npm run test:ui`) | **10 passed** |
| Production Apps Script build | Passed |
| Apps Script bundle loads without Node/browser globals | Passed, automated VM test |
| clasp file selection | Exactly the six generated deployment files; no mocks, tests or private configuration |
| Dependency audit (`npm audit`) | 0 reported vulnerabilities |
| Source formatting (`prettier --check`) | Passed |
| Table-card PDF visual review | Four US Letter pages / eight cards rendered and inspected; no clipping or overlap; compressed sample 29 KB |
| Private configuration exclusion | `.local/script-properties.json` and generated/dependency directories ignored by Git |

The browser suite completes an event from empty setup through CSV project import, judge creation, one-time code generation, assignment preview/save, Ready/Open transitions, judge evaluations, top-three rankings, closing judging, finalist verification, award confirmation and Finalized. It also tests invalid login, unassigned QR access, persistence across reload, no default scores, admin navigation, filtering, CSV export and QR/PDF generation. Mobile coverage uses Chromium device emulation; it is not a real phone camera or Safari test.

The 50-project/10-judge core scenario produces 150 unique overall assignments with 15 projects per judge. Additional tests cover conflicts, capacity shortages, specialist criteria, corrections, schema preservation, atomic adapter failure, OAuth claim/protocol boundaries and revoked credentials.

**Not executed:** live Google OAuth with the owner's client, initialization or writes to the supplied private workbook, actual Google service concurrency/quotas, Drive backup/restore, Apps Script deployment, and real phone scans. Those remain the owner-authorized checks in [TESTING.md](TESTING.md). Mock protocol tests are not evidence that Google authorization succeeded.
