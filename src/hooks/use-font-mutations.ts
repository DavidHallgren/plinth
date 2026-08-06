import { useState } from "react";
import type { EditorStore } from "../app/editor-store";
import { apiFetch } from "../lib/client-api";
import type { Project, ProjectFontFamily } from "../lib/schema";
import { ensureProjectFonts } from "../fonts/font-registry";

type Options = {
  project: Project;
  store: EditorStore;
  currentLocalRevision: () => number;
  flushPendingSave: () => Promise<Project>;
  commitProject: (project: Project) => void;
  syncProject: (project: Project) => void;
};

export function useFontMutations({ project, store, currentLocalRevision, flushPendingSave, commitProject, syncProject }: Options) {
  const [fontBusy, setFontBusy] = useState(false);

  function apply(serverProject: Project, flushedRevision: number): void {
    const latest = store.getSnapshot();
    const hasLocalChanges = currentLocalRevision() !== flushedRevision || latest.isInTransaction;
    const next = hasLocalChanges ? { ...latest.project, fonts: serverProject.fonts, updatedAt: serverProject.updatedAt } : serverProject;
    store.replaceExternalProject(next);
    if (next === serverProject) syncProject(next);
    else commitProject(next);
  }

  async function uploadFont(file: File): Promise<ProjectFontFamily | null> {
    if (!window.confirm("I confirm that I have the right to use and share this font in this project.")) return null;
    setFontBusy(true);
    try {
      await flushPendingSave();
      const flushedRevision = currentLocalRevision();
      const formData = new FormData();
      formData.append("file", file, file.name);
      formData.append("licenseConfirmed", "true");
      const result = await apiFetch<{ font: ProjectFontFamily; project: Project }>(`/api/projects/${encodeURIComponent(project.slug)}/fonts`, { method: "POST", body: formData });
      apply(result.project, flushedRevision);
      await ensureProjectFonts(result.project);
      return result.font;
    } finally {
      setFontBusy(false);
    }
  }

  async function deleteFont(font: ProjectFontFamily): Promise<void> {
    if (!window.confirm(`Remove “${font.name}” and its files from this project?`)) return;
    setFontBusy(true);
    try {
      await flushPendingSave();
      const flushedRevision = currentLocalRevision();
      const result = await apiFetch<{ project: Project }>(`/api/projects/${encodeURIComponent(project.slug)}/fonts/${encodeURIComponent(font.id)}`, { method: "DELETE" });
      apply(result.project, flushedRevision);
    } finally {
      setFontBusy(false);
    }
  }

  return { fontBusy, uploadFont, deleteFont };
}
