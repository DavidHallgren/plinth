import type { ProjectMetadata } from "../lib/storage";

export type ProjectLoadRequest = {
  id: number;
  signal: AbortSignal;
};

export class ProjectLoadRequestGate {
  private activeController: AbortController | null = null;
  private requestId = 0;

  start(): ProjectLoadRequest {
    this.activeController?.abort();
    const controller = new AbortController();
    this.activeController = controller;
    this.requestId += 1;
    return { id: this.requestId, signal: controller.signal };
  }

  cancel(): void {
    this.requestId += 1;
    this.activeController?.abort();
    this.activeController = null;
  }

  isCurrent(request: ProjectLoadRequest): boolean {
    return request.id === this.requestId && !request.signal.aborted;
  }
}

export type ProjectRouteResolution =
  | { status: "loading" }
  | { status: "found"; project: ProjectMetadata & { id: string; valid: true } }
  | { status: "not-found" };

export function projectPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

export function resolveProjectRoute(
  projects: readonly ProjectMetadata[],
  projectId: string,
  loading: boolean,
): ProjectRouteResolution {
  const project = projects.find(
    (candidate): candidate is ProjectMetadata & { id: string; valid: true } => candidate.valid && candidate.id === projectId,
  );
  if (project) return { status: "found", project };
  return loading ? { status: "loading" } : { status: "not-found" };
}
