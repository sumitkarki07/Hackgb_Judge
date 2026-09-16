import { randomBytes } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import { SPREADSHEET_ID } from "../src/config/defaults.js";
await mkdir(".local", { recursive: true, mode: 0o700 });
const file = ".local/script-properties.json";
try {
  await access(file);
  console.log("Existing private configuration preserved at " + file);
} catch {
  await writeFile(
    file,
    JSON.stringify(
      {
        SPREADSHEET_ID,
        AUTH_SECRET: randomBytes(32).toString("hex"),
        ADMIN_EMAILS: '["YOUR_APPROVED_GOOGLE_EMAIL"]',
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
        DEPLOYMENT_URL: "",
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Private Script Properties template created at " +
      file +
      ". Do not commit or share it.",
  );
}
