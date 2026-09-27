import { describe, it, expect } from "vitest";
import {
  DEMO_GROUP_LABEL,
  HISTORY_GROUP_LABEL,
  switcherGroups,
  switcherProjects,
} from "@/lib/switcher";
import type { ProjectSummary } from "@/lib/project";

const project = (
  id: string,
  code: string,
  vessel: [string, string | null, string],
  status = "ACTIVE",
  isDemo = false,
): ProjectSummary => ({
  id,
  code,
  name: code,
  vesselId: vessel[0],
  vesselYardNumber: vessel[1],
  vesselName: vessel[2],
  status,
  isDemo,
});

const draak: [string, string, string] = ["v709", "Y709", "Draak"];
const batello: [string, string, string] = ["v701", "Y701", "Batello"];
const kaos: [string, string, string] = ["v714", "Y714", "KAOS"];

const projects = [
  project("p1", "DEMO-01", draak, "ACTIVE", true),
  project("b", "Y701", batello),
  project("d", "Y709", draak),
  project("k", "Y714", kaos),
  project("p2", "DEMO-02", draak, "PLANNED", true),
  project("b12", "Y701-2012", batello, "COMPLETED"),
  project("d23", "Y709-2023", draak, "COMPLETED"),
];

describe("switcherGroups", () => {
  it("puts the demo workspace first, apart from every real vessel", () => {
    const groups = switcherGroups(projects, "p1");
    expect(groups[0].label).toBe(DEMO_GROUP_LABEL);
    expect(groups[0].projects.map((p) => p.code)).toEqual(["DEMO-01", "DEMO-02"]);
    expect(groups.slice(1).every((g) => g.projects.every((p) => !p.isDemo))).toBe(true);
  });

  it("groups live projects by vessel, in yard-number order", () => {
    const groups = switcherGroups(projects, "p1");
    expect(groups.slice(1).map((g) => g.label)).toEqual([
      "Y701 · Batello",
      "Y709 · Draak",
      "Y714 · KAOS",
    ]);
  });

  it("leaves completed yard periods out", () => {
    const codes = switcherProjects(projects, "p1").map((p) => p.code);
    expect(codes).not.toContain("Y701-2012");
    expect(codes).not.toContain("Y709-2023");
  });

  it("shows a completed project under history while it is the active one", () => {
    const groups = switcherGroups(projects, "d23");
    const history = groups.at(-1)!;
    expect(history.label).toBe(HISTORY_GROUP_LABEL);
    expect(history.projects.map((p) => p.code)).toEqual(["Y709-2023"]);
    expect(switcherProjects(projects, "d23").map((p) => p.code)).not.toContain("Y701-2012");
  });

  it("names a vessel with no yard number by name alone", () => {
    const groups = switcherGroups([project("x", "R-1", ["vx", null, "M/Y Example"])], null);
    expect(groups[0].label).toBe("M/Y Example");
  });

  it("offers nothing for a user who reaches nothing", () => {
    expect(switcherGroups([], null)).toEqual([]);
  });
});
