import { useCallback, useEffect, useState } from "react";
import type { ProjectMetadata } from "../lib/storage";
import { apiFetch } from "../lib/client-api";
import { useProjectPersistence } from "../hooks/use-project-persistence";
import { ProjectPicker } from "./project-picker";
import { EditorWorkspace } from "./editor/editor-workspace";

export function App() {
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

  if (!persistence.project) {
    return <ProjectPicker error={persistence.error} loading={loading} onCreate={persistence.createProject} onDelete={persistence.deleteProject} onOpen={persistence.openProject} projects={projects} />;
  }

  return (
    <EditorWorkspace
      error={persistence.error}
      onBack={persistence.leaveProject}
      onProjectChange={persistence.changeProject}
      onProjectSynced={(nextProject) => void persistence.syncProject(nextProject)}
      onRenameProject={persistence.renameProject}
      onSaveNow={persistence.saveNow}
      project={persistence.project}
      readOnly={persistence.busy}
    />
  );
}
