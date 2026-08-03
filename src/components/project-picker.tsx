import { ArrowUpRight, Layers3, MoreHorizontal, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ProjectMetadata } from "../lib/storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

type ProjectPickerProps = {
  projects: ProjectMetadata[];
  loading: boolean;
  error: string | null;
  onOpen: (slug: string) => Promise<void>;
  onCreate: (name: string, slug?: string) => Promise<void>;
  onDelete: (slug: string) => Promise<void>;
};

export function ProjectPicker({ projects, loading, error, onOpen, onCreate, onDelete }: ProjectPickerProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    setCreating(true);
    try {
      await onCreate(name.trim(), slug.trim() || undefined);
      setName("");
      setSlug("");
    } catch {
      // The app shell presents the structured API error above the project list.
    } finally {
      setCreating(false);
    }
  }

  async function deleteProject(project: ProjectMetadata) {
    if (!window.confirm(`Delete “${project.name}”? This removes its local project directory.`)) return;
    setDeletingSlug(project.slug);
    try {
      await onDelete(project.slug);
    } catch {
      // The app shell presents the structured API error above the project list.
    } finally {
      setDeletingSlug(null);
    }
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg border border-accent/30 bg-accent/[0.12] text-accent-soft">
              <Sparkles size={17} />
            </div>
            <p className="text-sm font-semibold tracking-[0.22em] text-ink">PLINTH</p>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center py-12">
          <section className="w-full rounded-lg border border-white/10 bg-panel/90 p-4 shadow-xl shadow-black/25 sm:p-5">
            <div>
              <div className="flex items-center justify-between gap-4">
                <h1 className="text-base font-semibold text-ink">Projects</h1>
                <span className="text-xs text-muted">{projects.length} {projects.length === 1 ? "project" : "projects"}</span>
              </div>

              {error ? (
                <div className="mt-4 rounded-lg border border-red-300/20 bg-red-300/[0.08] px-3 py-2.5 text-sm text-red-100">
                  {error}
                </div>
              ) : null}

              <div className="mt-4 space-y-2">
                {loading && projects.length === 0 ? (
                  <div className="rounded-lg border border-line bg-white/[0.025] px-4 py-8 text-center text-sm text-muted">Loading projects…</div>
                ) : projects.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center text-sm text-muted">No projects yet.</div>
                ) : (
                  projects.map((project) => (
                    <div className="group flex w-full items-center gap-1 rounded-lg border border-line bg-white/[0.025] transition hover:border-accent/35 hover:bg-accent/[0.07]" key={project.slug}>
                      <button
                        className="plinth-focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3.5 py-3 text-left"
                        disabled={!project.valid}
                        onClick={() => void onOpen(project.slug)}
                        type="button"
                      >
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/20 text-muted transition group-hover:text-accent-soft">
                          <Layers3 size={17} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-ink">{project.name}</p>
                            {!project.valid ? <span className="text-[11px] font-medium text-red-200">Invalid</span> : null}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {project.valid ? `${project.documentCount} ${project.documentCount === 1 ? "document" : "documents"}` : project.error}
                          </p>
                        </div>
                        <ArrowUpRight className="shrink-0 text-muted transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent-soft" size={17} />
                      </button>
                      <details className="relative mr-2 shrink-0">
                        <Tooltip>
                          <TooltipTrigger render={<summary aria-label={`More actions for ${project.name}`} className="plinth-focus-ring grid h-8 w-8 cursor-pointer list-none place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-ink"><MoreHorizontal size={16} /></summary>} />
                          <TooltipContent>More actions for {project.name}</TooltipContent>
                        </Tooltip>
                        <div className="absolute right-0 top-10 z-30 w-40 rounded-lg border border-white/10 bg-[#212121] p-1 shadow-xl shadow-black/40">
                          <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-red-200 hover:bg-red-400/10 disabled:pointer-events-none disabled:opacity-45" disabled={deletingSlug === project.slug} onClick={() => void deleteProject(project)} type="button">
                            <Trash2 size={12} />
                            {deletingSlug === project.slug ? "Deleting…" : "Delete project"}
                          </button>
                        </div>
                      </details>
                    </div>
                  ))
                )}
              </div>

              <form className="mt-4 border-t border-line pt-4" onSubmit={(event) => void submitCreate(event)}>
                <div className="flex items-center gap-2 text-sm font-medium text-ink"><Plus size={15} className="text-primary" /> New project</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_0.75fr]">
                  <Input aria-label="Project name" onChange={(event) => setName(event.target.value)} placeholder="Project name" value={name} />
                  <Input aria-label="Project slug" onChange={(event) => setSlug(event.target.value)} placeholder="slug (optional)" value={slug} />
                </div>
                <Button className="mt-3 w-full" disabled={creating || !name.trim()} type="submit" variant="primary">
                  {creating ? "Creating…" : "Create project"}
                </Button>
              </form>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
