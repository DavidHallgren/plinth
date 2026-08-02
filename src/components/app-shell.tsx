import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  FileImage,
  Layers3,
  Pencil,
  Save,
  Sparkles,
  Square,
  Trash2,
  Type,
  MonitorSmartphone,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Document, Project } from "../lib/schema";
import { apiFetch, ApiClientError, jsonRequest } from "../lib/client-api";
import type { ProjectMetadata } from "../lib/storage";
import { useDebouncedAutosave, type AutosaveState } from "../hooks/use-autosave";
import { ProjectPicker } from "./project-picker";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Input, Textarea } from "./ui/input";

function readableDate(value: string | null): string {
  if (!value) {
    return "Unknown date";
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function elementCounts(document: Document): { devices: number; text: number; images: number; shapes: number } {
  return document.elements.reduce(
    (counts, element) => {
      if (element.type === "device") counts.devices += 1;
      if (element.type === "text") counts.text += 1;
      if (element.type === "image") counts.images += 1;
      if (element.type === "shape") counts.shapes += 1;
      return counts;
    },
    { devices: 0, text: 0, images: 0, shapes: 0 },
  );
}

function SaveStatus({ state }: { state: AutosaveState }) {
  const content: Record<AutosaveState, { label: string; tone: "green" | "violet" | "amber" | "red"; icon: React.ReactNode }> = {
    saved: { label: "All changes saved", tone: "green", icon: <Check size={12} /> },
    pending: { label: "Save pending", tone: "violet", icon: <Clock3 size={12} /> },
    saving: { label: "Saving…", tone: "amber", icon: <Save size={12} /> },
    error: { label: "Save failed", tone: "red", icon: <AlertCircle size={12} /> },
  };
  const item = content[state];
  return <Badge tone={item.tone}>{item.icon}{item.label}</Badge>;
}

type WorkspaceProps = {
  project: Project;
  projects: ProjectMetadata[];
  dirty: boolean;
  saveState: AutosaveState;
  onBack: () => void;
  onChangeDescription: (description: string) => void;
  onSaveNow: () => Promise<void>;
  onRename: (name: string, slug?: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

function DocumentCard({ document }: { document: Document }) {
  const counts = elementCounts(document);
  return (
    <article className="group rounded-2xl border border-line bg-panel/70 p-3 transition hover:border-white/15 hover:bg-panel-strong">
      <div className="plinth-grid relative flex aspect-[1.65/1] items-center justify-center overflow-hidden rounded-xl border border-white/[0.07] bg-[#0e1015]">
        <div className="absolute inset-0 bg-gradient-to-br from-violet/[0.08] via-transparent to-sky-400/[0.05]" />
        <div className="relative w-[68%] rounded-lg border border-white/20 bg-[#eceef6] p-2 shadow-xl shadow-black/30 transition group-hover:-translate-y-1">
          <div className="flex gap-1 border-b border-black/10 pb-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400/70" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300/80" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" />
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="h-2 w-3/4 rounded bg-slate-900/80" />
            <div className="h-1.5 w-full rounded bg-slate-500/30" />
            <div className="h-1.5 w-4/5 rounded bg-slate-500/20" />
            <div className="mt-3 h-5 w-1/3 rounded bg-violet/70" />
          </div>
        </div>
        <span className="absolute bottom-2 left-2 rounded-md border border-white/10 bg-black/50 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/60">
          {document.preset}
        </span>
      </div>
      <div className="px-1 pb-1 pt-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="truncate text-sm font-medium text-ink">{document.name}</h3>
          <ChevronRight className="shrink-0 text-muted" size={15} />
        </div>
        <p className="mt-1 text-xs text-muted">{document.width} × {document.height}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted">
          <span className="inline-flex items-center gap-1"><MonitorSmartphone size={12} /> {counts.devices}</span>
          <span className="inline-flex items-center gap-1"><Type size={12} /> {counts.text}</span>
          <span className="inline-flex items-center gap-1"><Square size={11} /> {counts.shapes}</span>
          <span className="inline-flex items-center gap-1"><FileImage size={12} /> {counts.images}</span>
        </div>
      </div>
    </article>
  );
}

function Workspace({ project, projects, dirty, saveState, onBack, onChangeDescription, onSaveNow, onRename, onDelete }: WorkspaceProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(project.name);
  const [renameSlug, setRenameSlug] = useState(project.slug);
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const validProjects = projects.filter((item) => item.valid);

  useEffect(() => {
    setRenameName(project.name);
    setRenameSlug(project.slug);
  }, [project.name, project.slug]);

  async function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameName.trim()) return;
    setRenameBusy(true);
    try {
      await onRename(renameName.trim(), renameSlug.trim() || undefined);
      setRenameOpen(false);
    } finally {
      setRenameBusy(false);
    }
  }

  async function confirmDelete() {
    if (!window.confirm(`Delete “${project.name}”? This removes its local project directory.`)) return;
    setDeleteBusy(true);
    try {
      await onDelete();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-[#0c0d10]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-[1500px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <Button aria-label="Back to projects" onClick={onBack} size="icon" variant="ghost"><ArrowLeft size={17} /></Button>
            <div className="hidden h-6 w-px bg-white/10 sm:block" />
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-violet/25 bg-violet/[0.1] text-violet-soft"><Sparkles size={15} /></div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{project.name}</p>
                <p className="truncate text-[11px] text-muted">{project.slug} · schema v{project.schemaVersion}</p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden sm:block"><SaveStatus state={saveState} /></div>
            <Button disabled={!dirty || saveState === "saving"} onClick={() => void onSaveNow().catch(() => undefined)} size="sm" variant="secondary"><Save size={14} /> <span className="hidden md:inline">Save now</span></Button>
            <Button onClick={() => setRenameOpen(true)} size="sm" variant="ghost"><Pencil size={14} /> <span className="hidden md:inline">Rename</span></Button>
            <Button disabled={deleteBusy} onClick={() => void confirmDelete()} size="sm" variant="danger"><Trash2 size={14} /> <span className="hidden md:inline">Delete</span></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-5 pb-16 pt-8 sm:px-8 lg:px-10">
        <div className="mb-6 flex items-center justify-between gap-4 sm:hidden"><SaveStatus state={saveState} /><span className="text-xs text-muted">{dirty ? "Local draft" : "Ready"}</span></div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0">
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-panel/80 p-6 shadow-2xl shadow-black/20 sm:p-8">
              <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-violet/[0.09] blur-3xl" />
              <div className="relative flex flex-wrap items-end justify-between gap-6">
                <div>
                  <Badge tone="violet">Composition workspace</Badge>
                  <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-5xl">The frame is ready when you are.</h1>
                  <p className="mt-4 max-w-xl text-sm leading-6 text-muted sm:text-base">Phase 1 keeps the project, document presets, and save boundary in place. The canvas arrives next.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-right">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Documents</p>
                  <p className="mt-0.5 text-2xl font-semibold tracking-tight text-ink">{project.documents.length.toString().padStart(2, "0")}</p>
                </div>
              </div>
              <div className="plinth-grid relative mt-8 flex min-h-64 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/15 bg-black/20 sm:min-h-80">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(157,140,255,0.12),transparent_42%)]" />
                <div className="relative max-w-sm px-6 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-violet/20 bg-violet/[0.1] text-violet-soft"><Layers3 size={21} /></div>
                  <h2 className="mt-4 text-sm font-semibold text-ink">Canvas and editor surface reserved</h2>
                  <p className="mt-2 text-xs leading-5 text-muted">Your project already has normalized scene data. Phase 2 can render and edit these device, text, image, and shape elements here.</p>
                </div>
                <div className="absolute bottom-4 left-4 text-[10px] uppercase tracking-[0.16em] text-white/25">Preview surface / not yet rendered</div>
              </div>
            </div>

            <div className="mt-8 flex items-end justify-between gap-4">
              <div><p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Documents</p><h2 className="mt-1 text-xl font-semibold text-ink">Your compositions</h2></div>
              <Badge>{project.documents.length} saved</Badge>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {project.documents.map((document) => <DocumentCard document={document} key={document.id} />)}
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-line bg-panel/60 p-5">
              <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Project note</p><CircleDot className="text-violet" size={15} /></div>
              <Textarea className="mt-4" onChange={(event) => onChangeDescription(event.target.value)} placeholder="What is this project helping you communicate?" value={project.description} />
              <p className="mt-2 text-[11px] leading-5 text-muted">Changes autosave after {project.settings.autosaveDelayMs} ms of quiet time.</p>
            </section>
            <section className="rounded-2xl border border-line bg-panel/60 p-5">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Project facts</p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4"><dt className="text-muted">Created</dt><dd className="text-right text-ink">{readableDate(project.createdAt)}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-muted">Updated</dt><dd className="text-right text-ink">{readableDate(project.updatedAt)}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-muted">Assets</dt><dd className="text-right text-ink">{project.assets.length} registered</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-muted">Other projects</dt><dd className="text-right text-ink">{Math.max(validProjects.length - 1, 0)}</dd></div>
              </dl>
            </section>
            <section className="rounded-2xl border border-violet/15 bg-violet/[0.06] p-5">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-soft">Local by design</p>
              <p className="mt-3 text-sm leading-6 text-ink/80">JSON stays readable. Binary assets have their own boundary. Exports are ready for the browser-rendering phase.</p>
            </section>
          </aside>
        </div>
      </main>

      <Dialog description="Update the project display name or its safe local slug." footer={<><Button onClick={() => setRenameOpen(false)} variant="ghost">Cancel</Button><Button disabled={renameBusy || !renameName.trim()} form="rename-project" type="submit" variant="primary">{renameBusy ? "Saving…" : "Save changes"}</Button></>} onOpenChange={setRenameOpen} open={renameOpen} title="Rename project">
        <form className="space-y-3" id="rename-project" onSubmit={(event) => void submitRename(event)}>
          <label className="block text-xs font-medium text-muted" htmlFor="rename-name">Project name</label>
          <Input id="rename-name" onChange={(event) => setRenameName(event.target.value)} value={renameName} />
          <label className="block pt-2 text-xs font-medium text-muted" htmlFor="rename-slug">Project slug</label>
          <Input id="rename-slug" onChange={(event) => setRenameSlug(event.target.value)} value={renameSlug} />
        </form>
      </Dialog>
    </div>
  );
}

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
    const result = await apiFetch<{ project: Project }>(`/api/projects/${encodeURIComponent(nextProject.slug)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nextProject),
    });
    setProject(result.project);
    setDirty(false);
    await refreshProjects();
  }, [refreshProjects]);

  const autosave = useDebouncedAutosave({
    value: project,
    enabled: dirty && Boolean(project?.settings.autosave),
    delayMs: project?.settings.autosaveDelayMs ?? 800,
    save: saveProject,
  });

  const changeDescription = useCallback((description: string) => {
    setProject((current) => current ? { ...current, description, updatedAt: new Date().toISOString() } : current);
    setDirty(true);
  }, []);

  const renameProject = useCallback(async (name: string, slug?: string) => {
    if (!project) return;
    const result = await apiFetch<{ project: Project }>(`/api/projects/${encodeURIComponent(project.slug)}/rename`, jsonRequest({ name, slug }));
    setProject(result.project);
    setDirty(false);
    await refreshProjects();
  }, [project, refreshProjects]);

  const deleteProject = useCallback(async () => {
    if (!project) return;
    await apiFetch<{ deleted: string }>(`/api/projects/${encodeURIComponent(project.slug)}`, { method: "DELETE" });
    setProject(null);
    setDirty(false);
    await refreshProjects();
  }, [project, refreshProjects]);

  const workspace = useMemo(() => project ? (
    <Workspace
      dirty={dirty}
      onBack={() => { setProject(null); setDirty(false); setError(null); }}
      onChangeDescription={changeDescription}
      onDelete={deleteProject}
      onRename={renameProject}
      onSaveNow={autosave.saveNow}
      project={project}
      projects={projects}
      saveState={autosave.state}
    />
  ) : null, [autosave.saveNow, autosave.state, changeDescription, deleteProject, dirty, project, projects, renameProject]);

  return workspace ?? <ProjectPicker error={error} loading={loading} onCreate={createProject} onOpen={openProject} projects={projects} />;
}
