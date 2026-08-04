import { ArrowUpRight, Layers3, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { CreateProjectInput } from "../hooks/use-project-persistence";
import type { ScreenPreset } from "../lib/schema";
import type { ProjectMetadata } from "../lib/storage";
import { APP_STORE_PRESETS, getPresetDefinition } from "../scene/presets";
import { PlinthMark } from "./icons/plinth-mark";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Input } from "./ui/input";

type ProjectPickerProps = {
  projects: ProjectMetadata[];
  loading: boolean;
  error: string | null;
  onOpen: (slug: string) => Promise<void>;
  onCreate: (input: CreateProjectInput) => Promise<void>;
  onDelete: (slug: string) => Promise<void>;
};

export function ProjectPicker({ projects, loading, error, onOpen, onCreate, onDelete }: ProjectPickerProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [exportDirectory, setExportDirectory] = useState("");
  const [deckPreset, setDeckPreset] = useState<ScreenPreset>(APP_STORE_PRESETS[0]?.id ?? "custom");
  const [deckWidth, setDeckWidth] = useState<number>(APP_STORE_PRESETS[0]?.width ?? 1320);
  const [deckHeight, setDeckHeight] = useState<number>(APP_STORE_PRESETS[0]?.height ?? 2868);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !Number.isInteger(deckWidth) || deckWidth < 1 || deckWidth > 100_000 || !Number.isInteger(deckHeight) || deckHeight < 1 || deckHeight > 100_000) {
      return;
    }
    setCreating(true);
    try {
      await onCreate({
        name: name.trim(),
        slug: slug.trim() || undefined,
        exportDirectory: exportDirectory.trim() || null,
        firstDeck: {
          width: Math.round(deckWidth),
          height: Math.round(deckHeight),
          screenPreset: deckPreset,
        },
      });
      setName("");
      setSlug("");
      setExportDirectory("");
      setCreateOpen(false);
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
            <PlinthMark className="h-9 w-9" />
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
                            {project.valid ? `${project.deckCount} ${project.deckCount === 1 ? "deck" : "decks"} · ${project.screenCount} ${project.screenCount === 1 ? "screen" : "screens"}` : project.error}
                          </p>
                        </div>
                        <ArrowUpRight className="shrink-0 text-muted transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accent-soft" size={17} />
                      </button>
                      <div className="mr-2 shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger aria-label={`More actions for ${project.name}`} className="plinth-focus-ring grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-ink"><MoreHorizontal size={16} /></DropdownMenuTrigger>
                          <DropdownMenuContent className="w-40">
                            <DropdownMenuItem danger disabled={deletingSlug === project.slug} onClick={() => void deleteProject(project)}>
                              <Trash2 size={12} />
                              {deletingSlug === project.slug ? "Deleting…" : "Delete project"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 border-t border-line pt-4">
                <Button className="w-full" onClick={() => setCreateOpen(true)} type="button" variant="primary">
                  <Plus size={15} /> Create new project
                </Button>
              </div>
            </div>
          </section>
        </main>
      </div>

      <Dialog
        description="Choose the project details and dimensions for its first deck."
        footer={<><Button disabled={creating} onClick={() => setCreateOpen(false)} variant="ghost">Cancel</Button><Button disabled={creating || !name.trim() || !Number.isInteger(deckWidth) || deckWidth < 1 || deckWidth > 100_000 || !Number.isInteger(deckHeight) || deckHeight < 1 || deckHeight > 100_000} form="create-project" type="submit" variant="primary">{creating ? "Creating…" : "Create project"}</Button></>}
        onOpenChange={(open) => { if (!creating) setCreateOpen(open); }}
        open={createOpen}
        title="Create new project"
      >
        <form className="space-y-3" id="create-project" onSubmit={(event) => void submitCreate(event)}>
          {error ? <div className="rounded-lg border border-red-300/20 bg-red-300/[0.08] px-3 py-2.5 text-sm text-red-100">{error}</div> : null}
          <label className="block text-xs font-medium text-muted" htmlFor="create-project-name">Name</label>
          <Input autoFocus id="create-project-name" maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="My screenshots" value={name} />
          <label className="block pt-2 text-xs font-medium text-muted" htmlFor="create-project-slug">Slug <span className="font-normal text-muted/70">(optional)</span></label>
          <Input id="create-project-slug" maxLength={64} onChange={(event) => setSlug(event.target.value)} placeholder="Generated from the name" value={slug} />
          <label className="block pt-2 text-xs font-medium text-muted" htmlFor="create-project-export-directory">Export folder <span className="font-normal text-muted/70">(optional)</span></label>
          <Input id="create-project-export-directory" maxLength={4096} onChange={(event) => setExportDirectory(event.target.value)} placeholder="/absolute/path/to/exports" value={exportDirectory} />
          <p className="text-[10px] leading-4 text-muted">Folder exports create timestamped directories inside this existing absolute path.</p>
          <label className="block pt-2 text-xs font-medium text-muted" htmlFor="create-project-deck-preset">First deck size</label>
          <select className="plinth-focus-ring h-10 w-full rounded-xl border border-line bg-black/20 px-3 text-sm text-ink outline-none focus:border-accent/70" id="create-project-deck-preset" onChange={(event) => { const value = event.target.value as ScreenPreset; setDeckPreset(value); const definition = getPresetDefinition(value); if (definition) { setDeckWidth(definition.width); setDeckHeight(definition.height); } }} value={deckPreset}>{APP_STORE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}<option value="custom">Exact custom size</option></select>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-muted" htmlFor="create-project-deck-width"><span className="mb-1 block">Width</span><Input id="create-project-deck-width" max={100000} min={1} onChange={(event) => { setDeckPreset("custom"); setDeckWidth(Number(event.target.value)); }} type="number" value={deckWidth} /></label>
            <label className="block text-xs font-medium text-muted" htmlFor="create-project-deck-height"><span className="mb-1 block">Height</span><Input id="create-project-deck-height" max={100000} min={1} onChange={(event) => { setDeckPreset("custom"); setDeckHeight(Number(event.target.value)); }} type="number" value={deckHeight} /></label>
          </div>
          <p className="text-[10px] leading-4 text-muted">Deck dimensions cannot be changed after creation.</p>
        </form>
      </Dialog>
    </div>
  );
}
