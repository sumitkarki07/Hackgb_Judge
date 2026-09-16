import { test, expect } from "@playwright/test";
async function judgeLogin(page) {
  await page.goto("/");
  await page.getByLabel("Your judge access code").fill("DEMO-HACKGB-2026");
  await page.getByRole("button", { name: "Continue as Judge" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome, Alex." }),
  ).toBeVisible();
}
async function adminLogin(page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore organizer demo" }).click();
  await expect(
    page.getByRole("heading", { name: "Judging overview" }),
  ).toBeVisible();
}
async function navigate(page, name) {
  const menu = page.getByRole("button", { name: "Toggle navigation" });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name, exact: true })
    .click();
}
test("landing is responsive and invalid login reports an error", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Welcome to JudgeHub" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with Google", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: `test-results/landing-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("Your judge access code").fill("bad-code");
  await page.getByRole("button", { name: "Continue as Judge" }).click();
  await expect(page.locator("#login-error")).toContainText(
    "Invalid or revoked",
  );
});
test("organizer navigation, filtering, export and print-ready QR PDF work", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await adminLogin(page);
  await page.screenshot({
    path: `test-results/overview-${testInfo.project.name}.png`,
    fullPage: true,
  });
  for (const name of [
    "Projects",
    "Judges",
    "Assignments",
    "Rubric & Settings",
    "Live Judging",
    "Results",
    "Export & Backup",
    "Audit Logs",
    "QR Codes",
  ]) {
    await navigate(page, name);
    await expect(page.locator("h1")).toBeVisible();
  }
  await expect(page.locator("[data-qr]").first()).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  const pdfPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download all cards (PDF)" }).click();
  const pdf = await pdfPromise;
  expect(pdf.suggestedFilename()).toBe("HackGB-all-table-cards.pdf");
  await pdf.saveAs(`test-results/cards-${testInfo.project.name}.pdf`);
  await navigate(page, "Projects");
  await page
    .getByRole("textbox", { name: "Search projects, teams, or tables…" })
    .fill("Canopy");
  await expect(page.locator("main tbody tr")).toHaveCount(1);
  await navigate(page, "Export & Backup");
  const csvPromise = page.waitForEvent("download");
  await page.locator('[data-table="Judges"]').click();
  expect((await csvPromise).suggestedFilename()).toBe("hackgb-Judges.csv");
  expect(errors).toEqual([]);
});
test("judge submission has no default scores, persists and survives a reload", async ({
  page,
}, testInfo) => {
  await judgeLogin(page);
  await page.screenshot({
    path: `test-results/judge-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const pending = page.getByRole("button", { name: "Start evaluation" });
  await pending.first().click();
  await expect(page.locator("#evaluation-form input:checked")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/evaluation-${testInfo.project.name}.png`,
    fullPage: true,
  });
  for (const criterion of ["technology", "design", "completion", "learning"])
    await page.locator(`input[name="score_${criterion}"][value="4"]`).check();
  await expect(page.locator("#score-total")).toHaveText("16");
  await page
    .getByLabel("Judge notes (optional)")
    .fill("Browser smoke test: useful prototype and clear demonstration.");
  await page.getByRole("button", { name: "Submit Evaluation" }).click();
  await expect(page.getByRole("status")).toContainText("Evaluation saved");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome, Alex." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View evaluation" }).first(),
  ).toBeVisible();
});
test("QR intent survives authentication and unassigned project URL is rejected", async ({
  page,
}) => {
  await page.goto("/?project=H999");
  await page.getByLabel("Your judge access code").fill("DEMO-HACKGB-2026");
  await page.getByRole("button", { name: "Continue as Judge" }).click();
  await expect(page.getByRole("status")).toContainText(
    "This project is not assigned to you",
  );
  await expect(
    page.getByRole("heading", { name: "Welcome, Alex." }),
  ).toBeVisible();
});

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/mock/reset", {
    data: { confirm: "RESET LOCAL DEMO" },
  });
  expect(response.ok()).toBeTruthy();
});

test("complete organizer setup, judge scoring, ranking and final award journey", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await adminLogin(page);
  await page
    .getByRole("button", { name: "Start empty setup", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reset local demo", exact: true })
    .click();
  await expect(page.locator(".event-banner")).toBeVisible();
  await navigate(page, "Rubric & Settings");
  await page.getByLabel("Judges per project", { exact: true }).fill("1");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Changes saved");
  await navigate(page, "Projects");
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await page.getByLabel("CSV file").setInputFiles({
    name: "projects.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Project name,Table,Description\nOne,1,First synthetic project\nTwo,2,Second synthetic project\nThree,3,Third synthetic project",
    ),
  });
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("3 ready");
  await page
    .getByRole("button", { name: "Confirm import", exact: true })
    .click();
  await expect(page.locator("main tbody tr")).toHaveCount(3);
  await navigate(page, "Judges");
  await page.getByRole("button", { name: "Add judge", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Name", { exact: true })
    .fill("Casey Test");
  await page
    .getByRole("dialog")
    .getByLabel("Email", { exact: true })
    .fill("casey@example.test");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Access code", exact: true }).click();
  await page
    .getByRole("button", { name: "Generate replacement code", exact: true })
    .click();
  const code = await page.locator(".code-output").innerText();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await navigate(page, "Assignments");
  await page
    .getByRole("button", { name: "Auto-Assign Judges", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("3 new assignments");
  await page
    .getByRole("button", { name: "Save assignment plan", exact: true })
    .click();
  await expect(page.locator("main tbody tr")).toHaveCount(3);
  await navigate(page, "Overview");
  async function changeState(next) {
    await page
      .getByRole("button", { name: "Manage event", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Next state", exact: true })
      .selectOption(next);
    await page
      .getByLabel("Reason for the change", { exact: true })
      .fill("Browser acceptance rehearsal");
    await page
      .getByLabel("Type the destination state exactly to confirm", {
        exact: true,
      })
      .fill(next);
    await page
      .getByRole("button", { name: "Confirm state change", exact: true })
      .click();
    await expect(page.locator(".topbar .badge")).toContainText(next);
  }
  await changeState("Ready");
  await changeState("Judging Open");
  const judgeContext = await browser.newContext();
  const judgePage = await judgeContext.newPage();
  await judgePage.goto("http://localhost:4173");
  await judgePage.getByLabel("Your judge access code").fill(code);
  await judgePage.getByRole("button", { name: "Continue as Judge" }).click();
  await expect(
    judgePage.getByRole("heading", { name: "Welcome, Casey." }),
  ).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await judgePage
      .getByRole("button", { name: "Start evaluation" })
      .first()
      .click();
    for (const criterion of ["technology", "design", "completion", "learning"])
      await judgePage
        .locator(`input[name="score_${criterion}"][value="5"]`)
        .check();
    await judgePage.getByRole("button", { name: "Submit Evaluation" }).click();
    await expect(
      judgePage.getByRole("heading", { name: "Welcome, Casey." }),
    ).toBeVisible();
  }
  await judgePage.getByRole("button", { name: "Your top projects" }).click();
  for (let i = 0; i < 3; i++)
    await judgePage.locator(`[name="rank${i}"]`).selectOption(`H00${i + 1}`);
  await judgePage
    .getByRole("button", { name: "Save ranking", exact: true })
    .click();
  await expect(judgePage.getByRole("status")).toContainText(
    "Your ranking was saved",
  );
  await judgeContext.close();
  await changeState("Judging Closed");
  await changeState("Deliberation");
  await navigate(page, "Results");
  const row = page.locator("main tbody tr").filter({ hasText: "H001" });
  await expect(row).toContainText("Provisional finalist");
  await row.getByRole("button", { name: "Review", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Decision and reason", exact: true })
    .fill("Verified live demonstration and eligibility");
  await page
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(row).toContainText("Verified finalist");
  await row.getByRole("button", { name: "Review", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Decision", exact: true })
    .selectOption("confirmed");
  await page
    .getByRole("textbox", { name: "Decision and reason", exact: true })
    .fill("Panel confirms first overall award");
  await page
    .getByLabel("To confirm an award, type the project ID", { exact: true })
    .fill("H001");
  await page
    .getByRole("button", { name: "Record decision", exact: true })
    .click();
  await expect(row).toContainText("Confirmed winner");
  await navigate(page, "Overview");
  await changeState("Finalized");
});
