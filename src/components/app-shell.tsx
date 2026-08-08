import { useCallback, useEffect, useState } from "react";
import { Route, Routes, useNavigate, useParams } from "react-router";
import { projectPath, resolveProjectRoute } from "../app/project-route";
import { useProjectPersistence } from "../hooks/use-project-persistence";
import type { CreateProjectInput } from "../hooks/use-project-persistence";
import { apiFetch } from "../lib/client-api";
import type { ProjectMetadata } from "../lib/storage";
import { EditorWorkspace } from "./editor/editor-workspace";
import { PlinthMark } from "./icons/plinth-mark";
import { ProjectPicker } from "./project-picker";
import { Button } from "./ui/button";

type Persistence = ReturnType<typeof useProjectPersistence>;

type ProjectEditorRouteProps = {
  loading: boolean;
  persistence: Persistence;
  projects: readonly ProjectMetadata[];
};

type ProjectPickerRouteProps = {
  createProject: (input: CreateProjectInput) => Promise<void>;
  loading: boolean;
  openProject: (slug: string) => Promise<void>;
  persistence: Persistence;
  projects: ProjectMetadata[];
};

function RouteState({ title, description, action }: { title: string; description: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="grid min-h-screen place-items-center px-5">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-panel/90 p-6 text-center shadow-xl shadow-black/25">
        <PlinthMark className="mx-auto h-10 w-10" />
        <h1 className="mt-5 text-base font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        {action ? <Button className="mt-5" onClick={action.onClick} type="button" variant="primary">{action.label}</Button> : null}
      </section>
    </div>
  );
}

function ProjectEditorRoute({ loading, persistence, projects }: ProjectEditorRouteProps) {
  const navigate = useNavigate();
  const { projectId = "" } = useParams();
  const resolution = resolveProjectRoute(projects, projectId, loading);
  const projectSlug = resolution.status === "found" ? resolution.project.slug : null;
  const activeProjectId = persistence.project?.id ?? null;
  const [loadState, setLoadState] = useState<{ projectId: string; failed: boolean } | null>(null);

  useEffect(() => {
    if (!projectSlug || activeProjectId === projectId) return;
    let active = true;
    setLoadState({ projectId, failed: false });
    void (async () => {
      try {
        if (activeProjectId) {
          await persistence.leaveProject();
          return;
        }
        const project = await persistence.openProject(projectSlug);
        if (active && !project) setLoadState({ projectId, failed: true });
      } catch {
        if (active) setLoadState({ projectId, failed: true });
      }
    })();
    return () => {
      active = false;
      persistence.cancelOpenProject();
    };
  }, [activeProjectId, persistence.cancelOpenProject, persistence.leaveProject, persistence.openProject, projectId, projectSlug]);

  const backToProjects = useCallback(async () => {
    await persistence.leaveProject();
    navigate("/");
  }, [navigate, persistence.leaveProject]);

  if (resolution.status === "loading") {
    return <RouteState description="Loading the local project index…" title="Loading project" />;
  }

  if (resolution.status === "not-found") {
    return <RouteState action={{ label: "Back to projects", onClick: () => navigate("/") }} description="This project does not exist or is no longer available." title="Project not found" />;
  }

  if (persistence.project?.id !== projectId) {
    if (loadState?.projectId === projectId && loadState.failed) {
      return <RouteState action={{ label: "Back to projects", onClick: () => navigate("/") }} description={persistence.error ?? "Plinth could not open this project."} title="Could not open project" />;
    }
    return <RouteState description={`Opening ${resolution.project.name}…`} title="Loading project" />;
  }

  return (
    <EditorWorkspace
      error={persistence.error}
      onBack={backToProjects}
      onProjectChange={persistence.changeProject}
      onProjectSynced={(nextProject) => void persistence.syncProject(nextProject)}
      onRenameProject={persistence.renameProject}
      onSaveNow={persistence.saveNow}
      project={persistence.project}
      readOnly={persistence.busy}
    />
  );
}

function ProjectPickerRoute({ createProject, loading, openProject, persistence, projects }: ProjectPickerRouteProps) {
  useEffect(() => {
    persistence.cancelOpenProject();
    if (!persistence.project) return;
    void persistence.leaveProject().catch(() => undefined);
    // This only reconciles history-driven navigation back to the picker. Project creation
    // happens after this route has mounted and navigates immediately after it succeeds.
  }, []);

  return <ProjectPicker error={persistence.error} loading={loading || persistence.busy} onCreate={createProject} onDelete={persistence.deleteProject} onOpen={openProject} projects={projects} />;
}

function NotFoundRoute() {
  const navigate = useNavigate();
  return <RouteState action={{ label: "Back to projects", onClick: () => navigate("/") }} description="The page you requested does not exist." title="Page not found" />;
}

export function App() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshProjects = useCallback(async () => {
    const result = await apiFetch<{ projects: ProjectMetadata[] }>("/api/projects");
    setProjects(result.projects);
    return result.projects;
  }, []);
  const persistence = useProjectPersistence(refreshProjects);

  useEffect(() => {
    void refreshProjects()
      .catch((reason: unknown) => persistence.setError(reason instanceof Error ? reason.message : "Could not load projects."))
      .finally(() => setLoading(false));
  }, [persistence.setError, refreshProjects]);

  const openProject = useCallback(async (slug: string) => {
    const metadata = projects.find((project) => project.valid && project.slug === slug);
    if (!metadata?.id) {
      persistence.setError("That project is no longer available.");
      return;
    }
    if (persistence.project && persistence.project.id !== metadata.id) {
      try {
        await persistence.leaveProject();
      } catch {
        return;
      }
    }
    navigate(projectPath(metadata.id));
  }, [navigate, persistence.leaveProject, persistence.project?.id, persistence.setError, projects]);

  const createProject = useCallback(async (input: CreateProjectInput) => {
    const project = await persistence.createProject(input);
    navigate(projectPath(project.id));
  }, [navigate, persistence.createProject]);

  return (
    <Routes>
      <Route
        element={<ProjectPickerRoute createProject={createProject} loading={loading} openProject={openProject} persistence={persistence} projects={projects} />}
        path="/"
      />
      <Route element={<ProjectEditorRoute loading={loading} persistence={persistence} projects={projects} />} path="/projects/:projectId" />
      <Route element={<NotFoundRoute />} path="*" />
    </Routes>
  );
}
