import { useCallback, useEffect, useState } from "react";
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
      setProject(result.project);
      setDirty(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open project.");
    }
  }, []);

  const createProject = useCallback(async (name: string, slug?: string) => {
    setError(null);
    try {
      const result = await apiFetch<{ project: Project }>("/api/projects", jsonRequest({ name, slug }));
      setProject(result.project);
      setDirty(false);
      await refreshProjects();
    } catch (reason) {
      const message = reason instanceof ApiClientError && reason.code === "PROJECT_EXISTS" ? "That project slug already exists." : reason instanceof Error ? reason.message : "Could not create project.";
      setError(message);
      throw reason;
    }
  }, [refreshProjects]);

  const saveProject = useCallback(async (nextProject: Project) => {
    setError(null);
    try {
      const result = await apiFetch<{ project: Project }>(`/api/projects/${encodeURIComponent(nextProject.slug)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextProject),
      });
      setProject(result.project);
      setDirty(false);
      await refreshProjects();
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
    setProject(nextProject);
    setDirty(true);
  }, []);

  const syncProject = useCallback(async (nextProject: Project) => {
    setProject(nextProject);
    setDirty(false);
    await refreshProjects();
  }, [refreshProjects]);

  const renameProject = useCallback(async (name: string, slug?: string) => {
    if (!project) return;
    setError(null);
    try {
      const result = await apiFetch<{ project: Project }>(`/api/projects/${encodeURIComponent(project.slug)}/rename`, jsonRequest({ name, slug }));
      setProject(result.project);
      setDirty(false);
      await refreshProjects();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not rename the project.");
      throw reason;
    }
  }, [project, refreshProjects]);

  const deleteProject = useCallback(async () => {
    if (!project) return;
    setError(null);
    try {
      await apiFetch<{ deleted: string }>(`/api/projects/${encodeURIComponent(project.slug)}`, { method: "DELETE" });
      setProject(null);
      setDirty(false);
      await refreshProjects();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete the project.");
      throw reason;
    }
  }, [project, refreshProjects]);

  if (!project) {
    return <ProjectPicker error={error} loading={loading} onCreate={createProject} onOpen={openProject} projects={projects} />;
  }

  return (
    <EditorWorkspace
      dirty={dirty}
      error={error}
      onBack={() => { setProject(null); setDirty(false); setError(null); }}
      onDeleteProject={deleteProject}
      onProjectChange={changeProject}
      onProjectSynced={(nextProject) => void syncProject(nextProject)}
      onRenameProject={renameProject}
      onSaveNow={autosave.saveNow}
      project={project}
      saveState={autosave.state as AutosaveState}
    />
  );
}
