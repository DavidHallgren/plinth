import { ArrowUpRight, Layers3, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ProjectMetadata } from "../lib/storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type ProjectPickerProps = {
  projects: ProjectMetadata[];
  loading: boolean;
  error: string | null;
  onOpen: (slug: string) => Promise<void>;
  onCreate: (name: string, slug?: string) => Promise<void>;
};

export function ProjectPicker({ projects, loading, error, onOpen, onCreate }: ProjectPickerProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);

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

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg border border-violet/30 bg-violet/[0.12] text-violet-soft">
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
                    <button
                      className="plinth-focus-ring group flex w-full items-center gap-3 rounded-lg border border-line bg-white/[0.025] px-3.5 py-3 text-left transition hover:border-violet/35 hover:bg-violet/[0.07]"
                      disabled={!project.valid}
                      key={project.slug}
                      onClick={() => void onOpen(project.slug)}
                      type="button"
                    >
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/20 text-muted transition group-hover:text-violet-soft">
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
                      <ArrowUpRight className="shrink-0 text-muted transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-violet-soft" size={17} />
                    </button>
                  ))
                )}
              </div>

              <form className="mt-4 border-t border-line pt-4" onSubmit={(event) => void submitCreate(event)}>
                <div className="flex items-center gap-2 text-sm font-medium text-ink"><Plus size={15} className="text-violet" /> New project</div>
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
