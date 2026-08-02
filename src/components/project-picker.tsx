import { ArrowUpRight, Clock3, Database, FolderOpen, Layers3, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ProjectMetadata } from "../lib/storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";

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
    <div className="min-h-screen overflow-hidden">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-violet/30 bg-violet/[0.12] text-violet-soft">
              <Sparkles size={17} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.22em] text-ink">PLINTH</p>
              <p className="text-[11px] text-muted">Local-first composition</p>
            </div>
          </div>
          <Badge tone="green">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
            Local workspace
          </Badge>
        </header>

        <main className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1fr_1.15fr] lg:py-20">
          <section className="max-w-xl">
            <Badge tone="violet">Foundation / 01</Badge>
            <h1 className="mt-5 max-w-lg text-4xl font-semibold leading-[1.05] tracking-[-0.045em] text-ink sm:text-6xl">
              A calmer way to frame the work.
            </h1>
            <p className="mt-6 max-w-md text-base leading-7 text-muted sm:text-lg">
              Pick up a project, keep the source close, and build a visual story without leaving your machine.
            </p>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted">
              <span className="inline-flex items-center gap-2"><Database size={14} className="text-violet" /> JSON-backed</span>
              <span className="inline-flex items-center gap-2"><FolderOpen size={14} className="text-violet" /> No cloud required</span>
            </div>
          </section>

          <section className="relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-violet/[0.06] blur-3xl" />
            <div className="relative rounded-[1.5rem] border border-white/10 bg-panel/90 p-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="rounded-[1.05rem] border border-white/[0.07] bg-black/20 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Your projects</p>
                    <p className="mt-1 text-sm text-ink">Choose a place to begin.</p>
                  </div>
                  <Badge>{projects.length} {projects.length === 1 ? "project" : "projects"}</Badge>
                </div>

                {error ? (
                  <div className="mt-5 rounded-xl border border-red-300/20 bg-red-300/[0.08] px-3 py-2.5 text-sm text-red-100">
                    {error}
                  </div>
                ) : null}

                <div className="mt-5 space-y-2">
                  {loading && projects.length === 0 ? (
                    <div className="rounded-xl border border-line bg-white/[0.025] px-4 py-8 text-center text-sm text-muted">Loading projects…</div>
                  ) : projects.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center">
                      <p className="text-sm font-medium text-ink">No projects yet</p>
                      <p className="mt-1 text-xs leading-5 text-muted">Create the first one below. It will live in data/projects.</p>
                    </div>
                  ) : (
                    projects.map((project) => (
                      <button
                        className="plinth-focus-ring group flex w-full items-center gap-3 rounded-xl border border-line bg-white/[0.025] px-3.5 py-3 text-left transition hover:border-violet/35 hover:bg-violet/[0.07]"
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
                            {!project.valid ? <Badge tone="red">Invalid</Badge> : null}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted">
                            {project.valid ? `${project.documentCount} ${project.documentCount === 1 ? "document" : "documents"} · ${project.slug}` : project.error}
                          </p>
                        </div>
                        <ArrowUpRight className="shrink-0 text-muted transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-violet-soft" size={17} />
                      </button>
                    ))
                  )}
                </div>

                <form className="mt-5 border-t border-line pt-5" onSubmit={(event) => void submitCreate(event)}>
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
              <div className="flex items-center justify-between px-2.5 pt-3 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1.5"><Clock3 size={12} /> Autosave architecture ready</span>
                <span>Phase 1</span>
              </div>
            </div>
          </section>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] py-5 text-[11px] text-muted">
          <span>Projects stay in your local workspace.</span>
          <span>Plinth foundation · schema v1</span>
        </footer>
      </div>
    </div>
  );
}
