import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "../lib/schema";
import { apiFetch, ApiClientError, jsonRequest } from "../lib/client-api";
import type { ProjectMetadata } from "../lib/storage";
import { useDebouncedAutosave, type AutosaveState } from "../hooks/use-autosave";
import { ProjectPicker } from "./project-picker";
import { EditorWorkspace } from "./editor/editor-workspace";

export function App() {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const projectRef = useRef<Project | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const refreshProjects = useCallback(async () => {
    const result = await apiFetch<{ projects: ProjectMetadata[] }>("/api/projects");
    setProjects(result.projects);
    return result.projects;
  }, []);

  useEffect(() => {
    void refreshProjects()
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load projects."))
      .finally(() => setLoading(false));
  }, [refreshProjects]);

  const openProject = useCallback(async (slug: string) => {
    setError(null);
    try {
      const result = await apiFetch<{ project: Project }>(`/api/projects/${encodeURIComponent(slug)}`);
      projectRef.current = result.project;
      setProject(result.project);
      setDirty(false);
      dirtyRef.current = false;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open project.");
    }
  }, []);

  const createProject = useCallback(async (name: string, slug?: string) => {
    setError(null);
    try {
      const result = await apiFetch<{ project: Project }>("/api/projects", jsonRequest({ name, slug }));
      projectRef.current = result.project;
      setProject(result.project);
      setDirty(false);
      dirtyRef.current = false;
      await refreshProjects();
    } catch (reason) {
      const message = reason instanceof ApiClientError && reason.code === "PROJECT_EXISTS" ? "That project slug already exists." : reason instanceof Error ? reason.message : "Could not create project.";
      setError(message);
      throw reason;
    }
  }, [refreshProjects]);

  const saveProject = useCallback(async (nextProject: Project): Promise<Project> => {
    setError(null);
    try {
      const result = await apiFetch<{ project: Project }>(`/api/projects/${encodeURIComponent(nextProject.slug)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextProject),
      });
      if (projectRef.current === nextProject) {
        projectRef.current = result.project;
        setProject(result.project);
        setDirty(false);
        dirtyRef.current = false;
      }
      await refreshProjects();
      return result.project;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the project.");
      throw reason;
    }
  }, [refreshProjects]);

  const autosave = useDebouncedAutosave({
    value: project,
    enabled: dirty && Boolean(project?.settings.autosave),
    delayMs: project?.settings.autosaveDelayMs ?? 800,
    save: saveProject,
  });

  const changeProject = useCallback((nextProject: Project) => {
    projectRef.current = nextProject;
    setProject(nextProject);
    setDirty(true);
    dirtyRef.current = true;
  }, []);

  const syncProject = useCallback(async (nextProject: Project) => {
    projectRef.current = nextProject;
    setProject(nextProject);
    setDirty(false);
    dirtyRef.current = false;
    await refreshProjects();
  }, [refreshProjects]);

  const saveLatestProject = useCallback(async () => {
    const latest = projectRef.current;
    if (latest && dirtyRef.current) await autosave.saveNow(latest);
  }, [autosave.saveNow]);

  const deleteProjectBySlug = useCallback(async (slug: string) => {
    setError(null);
    try {
      const current = projectRef.current;
      if (current?.slug === slug) await saveLatestProject();
      await apiFetch<{ deleted: string }>(`/api/projects/${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (current?.slug === slug) {
        projectRef.current = null;
        setProject(null);
        setDirty(false);
        dirtyRef.current = false;
      }
      await refreshProjects();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete the project.");
      throw reason;
    }
  }, [refreshProjects, saveLatestProject]);

  const renameProject = useCallback(async (name: string, slug?: string, exportDirectory?: string | null) => {
    const current = projectRef.current;
    if (!current) return;
    setError(null);
    try {
      await saveLatestProject();
      const result = await apiFetch<{ project: Project }>(`/api/projects/${encodeURIComponent(current.slug)}/rename`, jsonRequest({ name, slug, exportDirectory }));
      projectRef.current = result.project;
      setProject(result.project);
      setDirty(false);
      dirtyRef.current = false;
      await refreshProjects();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the project.");
      throw reason;
    }
  }, [refreshProjects, saveLatestProject]);

  const leaveProject = useCallback(async () => {
    await saveLatestProject();
    projectRef.current = null;
    setProject(null);
    setDirty(false);
    dirtyRef.current = false;
    setError(null);
  }, [saveLatestProject]);

  if (!project) {
    return <ProjectPicker error={error} loading={loading} onCreate={createProject} onDelete={deleteProjectBySlug} onOpen={openProject} projects={projects} />;
  }

  return (
    <EditorWorkspace
      dirty={dirty}
      error={error}
      onBack={leaveProject}
      onProjectChange={changeProject}
      onProjectSynced={(nextProject) => void syncProject(nextProject)}
      onRenameProject={renameProject}
      onSaveNow={autosave.saveNow}
      project={project}
      saveState={autosave.state as AutosaveState}
    />
  );
}
