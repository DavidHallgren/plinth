import { describe, expect, test } from "bun:test";
import { ProjectLoadRequestGate, projectPath, resolveProjectRoute } from "../src/app/project-route";
import type { ProjectMetadata } from "../src/lib/storage";

const project = {
  id: "project_stable-id",
  slug: "editable-slug",
  name: "Editable project",
  description: "A project",
  deckCount: 1,
  screenCount: 1,
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
  valid: true,
} satisfies ProjectMetadata;

describe("project routes", () => {
  test("builds a URL from the stable project ID", () => {
    expect(projectPath("project_stable-id")).toBe("/projects/project_stable-id");
  });

  test("resolves a stable ID to mutable project metadata", () => {
    expect(resolveProjectRoute([project], "project_stable-id", false)).toEqual({ status: "found", project });
  });

  test("waits for the project index before reporting a missing project", () => {
    expect(resolveProjectRoute([], "missing", true)).toEqual({ status: "loading" });
    expect(resolveProjectRoute([], "missing", false)).toEqual({ status: "not-found" });
  });

  test("does not install a project after its route load is canceled", async () => {
    const gate = new ProjectLoadRequestGate();
    const request = gate.start();
    let resolveLoad: (projectId: string) => void = () => undefined;
    const loadedProjectId = new Promise<string>((resolve) => { resolveLoad = resolve; });
    let activeProjectId: string | null = null;
    const installLoadedProject = async () => {
      const projectId = await loadedProjectId;
      if (gate.isCurrent(request)) activeProjectId = projectId;
    };

    const pendingInstall = installLoadedProject();
    gate.cancel();
    activeProjectId = "newly-created-project";
    resolveLoad("stale-route-project");
    await pendingInstall;

    expect(request.signal.aborted).toBe(true);
    expect(activeProjectId).toBe("newly-created-project");
  });
});
