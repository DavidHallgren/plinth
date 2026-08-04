import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, apiFetch, jsonRequest } from "../lib/client-api";
import type { Project } from "../lib/schema";
import type { ProjectMetadata } from "../lib/storage";
import { useDebouncedAutosave } from "./use-autosave";

type RefreshProjects = () => Promise<ProjectMetadata[]>;

export function rebaseProjectAfterRename(latest: Project, renamed: Project): Project {
  return {
    ...latest,
    slug: renamed.slug,
    name: renamed.name,
    settings: { ...latest.settings, exportDirectory: renamed.settings.exportDirectory },
    assets: renamed.assets,
    updatedAt: renamed.updatedAt,
  };
}

export function useProjectPersistence(refreshProjects: RefreshProjects) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const projectRef = useRef<Project | null>(null);
  const dirtyRef = useRef(false);
  const revisionRef = useRef(0);
  const projectRevisionsRef = useRef(new WeakMap<Project, number>());

  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const acceptProject = useCallback((nextProject: Project, options: { dirty: boolean; incrementRevision?: boolean }) => {
    if (options.incrementRevision) revisionRef.current += 1;
    projectRevisionsRef.current.set(nextProject, revisionRef.current);
    projectRef.current = nextProject;
    setProject(nextProject);
    setDirty(options.dirty);
    dirtyRef.current = options.dirty;
  }, []);

  const saveProject = useCallback(async (nextProject: Project): Promise<Project> => {
    const snapshotRevision = projectRevisionsRef.current.get(nextProject) ?? revisionRef.current;
    setError(null);
    try {
      const result = await apiFetch<{ project: Project }>(`/api/projects/${encodeURIComponent(nextProject.slug)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextProject),
      });
      if (projectRef.current === nextProject && revisionRef.current === snapshotRevision) acceptProject(result.project, { dirty: false });
      await refreshProjects();
      return result.project;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the project.");
      throw reason;
    }
  }, [acceptProject, refreshProjects]);

  const autosave = useDebouncedAutosave({
    value: project,
    enabled: dirty && Boolean(project?.settings.autosave),
    delayMs: project?.settings.autosaveDelayMs ?? 800,
    save: saveProject,
  });

  const saveLatestProject = useCallback(async (): Promise<Project | null> => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const latest = projectRef.current;
      if (!latest || !dirtyRef.current) return latest;
      await autosave.saveNow(latest);
    }
    throw new Error("The project kept changing while Plinth was trying to save it. Try again.");
  }, [autosave.saveNow]);

  const openProject = useCallback(async (slug: string) => {
    setError(null);
    try {
      const result = await apiFetch<{ project: Project }>(`/api/projects/${encodeURIComponent(slug)}`);
      revisionRef.current = 0;
      acceptProject(result.project, { dirty: false });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open project.");
    }
  }, [acceptProject]);

  const createProject = useCallback(async (name: string, slug?: string) => {
    setError(null);
    try {
      const result = await apiFetch<{ project: Project }>("/api/projects", jsonRequest({ name, slug }));
      revisionRef.current = 0;
      acceptProject(result.project, { dirty: false });
      await refreshProjects();
    } catch (reason) {
      setError(reason instanceof ApiClientError && reason.code === "PROJECT_EXISTS" ? "That project slug already exists." : reason instanceof Error ? reason.message : "Could not create project.");
      throw reason;
    }
  }, [acceptProject, refreshProjects]);

  const changeProject = useCallback((nextProject: Project) => acceptProject(nextProject, { dirty: true, incrementRevision: true }), [acceptProject]);
  const syncProject = useCallback(async (nextProject: Project) => {
    acceptProject(nextProject, { dirty: false, incrementRevision: true });
    await refreshProjects();
  }, [acceptProject, refreshProjects]);

  const deleteProject = useCallback(async (slug: string) => {
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
    if (!projectRef.current) return;
    setError(null);
    setBusy(true);
    try {
      await saveLatestProject();
      const current = projectRef.current;
      if (!current) return;
      const renameRevision = revisionRef.current;
      const result = await apiFetch<{ project: Project }>(`/api/projects/${encodeURIComponent(current.slug)}/rename`, jsonRequest({ name, slug, exportDirectory }));
      const latest = projectRef.current;
      if (latest && latest.id === result.project.id && revisionRef.current !== renameRevision) {
        const rebased = rebaseProjectAfterRename(latest, result.project);
        acceptProject(rebased, { dirty: true, incrementRevision: true });
        await autosave.saveNow(rebased);
      } else {
        acceptProject(result.project, { dirty: false });
      }
      await refreshProjects();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the project.");
      throw reason;
    } finally {
      setBusy(false);
    }
  }, [acceptProject, autosave.saveNow, refreshProjects, saveLatestProject]);

  const leaveProject = useCallback(async () => {
    setBusy(true);
    try {
      await saveLatestProject();
      projectRef.current = null;
      setProject(null);
      setDirty(false);
      dirtyRef.current = false;
      setError(null);
    } finally {
      setBusy(false);
    }
  }, [saveLatestProject]);

  return {
    project,
    error,
    busy,
    setError,
    openProject,
    createProject,
    changeProject,
    syncProject,
    deleteProject,
    renameProject,
    leaveProject,
    saveNow: autosave.saveNow,
  };
}
