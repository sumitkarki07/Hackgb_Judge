import {
  SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  DEFAULT_RUBRIC,
} from "../config/defaults.js";
import { requireThat } from "../security/validation.js";
export const SCHEMA = {
  Projects: [
    "id",
    "name",
    "team",
    "members",
    "devpost",
    "github",
    "description",
    "categories",
    "table",
    "status",
    "createdAt",
  ],
  Judges: [
    "id",
    "name",
    "email",
    "expertise",
    "status",
    "available",
    "capacity",
    "conflicts",
    "categories",
    "verifier",
    "codeVersion",
    "createdAt",
    "lastAccess",
  ],
  Assignments: [
    "id",
    "judgeId",
    "projectId",
    "categoryId",
    "status",
    "createdAt",
  ],
  Evaluations: [
    "id",
    "assignmentId",
    "judgeId",
    "projectId",
    "categoryId",
    "scores",
    "total",
    "notes",
    "rubric",
    "version",
    "requestId",
    "submittedAt",
    "reopenedAt",
    "reopenReason",
  ],
  Rankings: ["id", "judgeId", "categoryId", "projects", "submittedAt"],
  Categories: [
    "id",
    "name",
    "description",
    "target",
    "rubric",
    "specialist",
    "active",
  ],
  Results: [
    "id",
    "categoryId",
    "projectId",
    "count",
    "average",
    "points",
    "complete",
    "flags",
  ],
  Settings: [
    "id",
    "name",
    "date",
    "venue",
    "state",
    "target",
    "finalists",
    "shortRanking",
    "expertiseMatching",
    "rubric",
    "revision",
  ],
  AuditLogs: ["id", "actor", "action", "entityId", "details", "createdAt"],
  Sessions: ["id", "role", "subject", "email", "version", "expiresAt"],
  AuthFlows: [
    "id",
    "pollVerifier",
    "nonce",
    "pkce",
    "expiresAt",
    "status",
    "identity",
  ],
  Awards: [
    "id",
    "categoryId",
    "projectId",
    "status",
    "reason",
    "actor",
    "updatedAt",
  ],
  Meta: ["id", "version", "createdAt"],
};
export function emptyDatabase() {
  return Object.fromEntries(Object.keys(SCHEMA).map((k) => [k, []]));
}
export function initializeData(db, now) {
  const meta = db.Meta.find((x) => x.id === "schema");
  requireThat(
    !meta || meta.version === SCHEMA_VERSION,
    "SCHEMA",
    "Unsupported schema version. Back up before a reviewed migration.",
  );
  if (!meta)
    db.Meta.push({ id: "schema", version: SCHEMA_VERSION, createdAt: now });
  if (!db.Settings.some((x) => x.id === "event"))
    db.Settings.push(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  if (!db.Categories.some((x) => x.id === "overall"))
    db.Categories.push({
      id: "overall",
      name: "Overall awards",
      description: "Overall hackathon recognition",
      target: 3,
      rubric: DEFAULT_RUBRIC,
      specialist: false,
      active: true,
    });
  return db;
}
