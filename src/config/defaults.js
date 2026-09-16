export const SPREADSHEET_ID = "1XlSkHbv2hObIim8kuMGXjKdRIHTKeHN58vxFzR8sCUk";
export const SCHEMA_VERSION = 1;
export const DEFAULT_RUBRIC = [
  {
    id: "technology",
    name: "Technology",
    max: 5,
    description:
      "Technical ambition, implementation quality, and thoughtful use of tools.",
  },
  {
    id: "design",
    name: "Design",
    max: 5,
    description:
      "Usability, accessibility, clarity, and quality of the experience.",
  },
  {
    id: "completion",
    name: "Completion",
    max: 5,
    description:
      "A working demonstration that delivers on the project’s core promise.",
  },
  {
    id: "learning",
    name: "Learning",
    max: 5,
    description:
      "Growth, exploration, and what the team learned while building.",
  },
];
export const DEFAULT_SETTINGS = {
  id: "event",
  name: "HackGB 2026",
  date: "October 17–18, 2026",
  venue: "University of Wisconsin–Green Bay",
  state: "Setup",
  target: 3,
  finalists: 5,
  shortRanking: "available",
  expertiseMatching: false,
  rubric: DEFAULT_RUBRIC,
  revision: 0,
};
export const STATES = [
  "Setup",
  "Ready",
  "Judging Open",
  "Judging Closed",
  "Deliberation",
  "Finalized",
  "Archived",
];
