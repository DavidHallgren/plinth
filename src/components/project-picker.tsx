import {
  Check,
  ChevronDown,
  ChevronRight,
  Layers3,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { CreateProjectInput } from "../hooks/use-project-persistence";
import { apiFetch } from "../lib/client-api";
import type { ProjectPreview } from "../lib/project-preview";
import type { ScreenPreset } from "../lib/schema";
import type { ProjectMetadata } from "../lib/storage";
import { APP_STORE_PRESETS, getPresetDefinition } from "../scene/presets";
import { ScreenThumbnail } from "./editor/screen-thumbnail";
import { PlinthMark } from "./icons/plinth-mark";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";

type ProjectPickerProps = {
  projects: ProjectMetadata[];
  loading: boolean;
  error: string | null;
  onOpen: (slug: string) => Promise<void>;
  onCreate: (input: CreateProjectInput) => Promise<void>;
  onDelete: (slug: string) => Promise<void>;
};

function formatUpdatedAt(value: string | null): string | null {
  if (!value) return null;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;

  const elapsed = Math.min(0, timestamp - Date.now());
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (elapsed > -minute) return "Updated just now";
  if (elapsed > -hour)
    return `Updated ${relative.format(Math.round(elapsed / minute), "minute")}`;
  if (elapsed > -day)
    return `Updated ${relative.format(Math.round(elapsed / hour), "hour")}`;
  if (elapsed > -7 * day)
    return `Updated ${relative.format(Math.round(elapsed / day), "day")}`;

  const date = new Date(timestamp);
  const includeYear = date.getFullYear() !== new Date().getFullYear();
  return `Updated ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: includeYear ? "numeric" : undefined }).format(date)}`;
}

function PresetDropdown({ height, onSelect, value, width }: { height: number; onSelect: (value: ScreenPreset) => void; value: ScreenPreset; width: number }) {
  const selectedPreset = getPresetDefinition(value);
  const selectedLabel = selectedPreset?.label ?? `Exact custom size · ${width} × ${height}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`First deck size: ${selectedLabel}`}
        className="group plinth-focus-ring flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-line bg-black/20 px-3 text-left text-sm text-ink hover:border-white/20 hover:bg-white/[0.04]"
        id="create-project-deck-preset"
        type="button"
      >
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <ChevronDown className="shrink-0 text-muted transition group-data-[popup-open]:rotate-180" size={15} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[min(22rem,var(--available-height))] w-[var(--anchor-width)] overflow-y-auto" sideOffset={6}>
        {APP_STORE_PRESETS.map((preset) => (
          <DropdownMenuItem className="justify-between py-2.5" key={preset.id} onClick={() => onSelect(preset.id)}>
            <span className="min-w-0">
              <span className="block text-xs text-ink">{preset.shortLabel}</span>
              <span className="mt-0.5 block text-[10px] text-muted">{preset.width} × {preset.height}</span>
            </span>
            {value === preset.id ? <Check className="shrink-0 text-accent-soft" size={13} /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem className="justify-between py-2.5" onClick={() => onSelect("custom")}>
          <span className="min-w-0">
            <span className="block text-xs text-ink">Exact custom size</span>
            <span className="mt-0.5 block text-[10px] text-muted">{width} × {height}</span>
          </span>
          {value === "custom" ? <Check className="shrink-0 text-accent-soft" size={13} /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProjectPicker({
  projects,
  loading,
  error,
  onOpen,
  onCreate,
  onDelete,
}: ProjectPickerProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [exportDirectory, setExportDirectory] = useState("");
  const [deckPreset, setDeckPreset] = useState<ScreenPreset>(
    APP_STORE_PRESETS[0]?.id ?? "custom",
  );
  const [deckWidth, setDeckWidth] = useState<number>(
    APP_STORE_PRESETS[0]?.width ?? 1320,
  );
  const [deckHeight, setDeckHeight] = useState<number>(
    APP_STORE_PRESETS[0]?.height ?? 2868,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, ProjectPreview | null>>({});

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setPreviews({});

    for (const project of projects) {
      if (!project.valid) continue;
      void apiFetch<{ preview: ProjectPreview }>(`/api/projects/${encodeURIComponent(project.slug)}/preview`, { signal: controller.signal })
        .then(({ preview }) => {
          if (active) setPreviews((current) => ({ ...current, [project.slug]: preview }));
        })
        .catch(() => {
          if (active) setPreviews((current) => ({ ...current, [project.slug]: null }));
        });
    }

    return () => {
      active = false;
      controller.abort();
    };
  }, [projects]);

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !name.trim() ||
      !Number.isInteger(deckWidth) ||
      deckWidth < 1 ||
      deckWidth > 100_000 ||
      !Number.isInteger(deckHeight) ||
      deckHeight < 1 ||
      deckHeight > 100_000
    ) {
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
      setAdvancedOpen(false);
      setCreateOpen(false);
    } catch {
      // The app shell presents the structured API error above the project list.
    } finally {
      setCreating(false);
    }
  }

  async function deleteProject(project: ProjectMetadata) {
    if (
      !window.confirm(
        `Delete “${project.name}”? This removes its local project directory.`,
      )
    )
      return;
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
      <div className="mx-auto w-full max-w-4xl px-5 pb-16 pt-6 sm:px-8 sm:pt-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PlinthMark className="h-9 w-9" />
            <p className="text-sm font-semibold tracking-[0.22em] text-ink">
              PLINTH
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            type="button"
            variant="primary"
          >
            <Plus size={15} /> New project
          </Button>
        </header>

        <main className="pt-14 sm:pt-20">
          <section className="w-full">
            <h1 className="text-xl font-semibold text-ink">Projects</h1>

            {error ? (
              <div className="mt-5 rounded-xl border border-red-300/20 bg-red-300/[0.08] px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            <div className="mt-6 space-y-2.5">
              {loading && projects.length === 0 ? (
                <div className="rounded-xl border border-line bg-panel/90 px-4 py-10 text-center text-sm text-muted">
                  Loading projects…
                </div>
              ) : projects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/15 bg-panel/60 px-4 py-10 text-center text-sm text-muted">
                  No projects yet.
                </div>
              ) : (
                projects.map((project) => {
                  const updatedAt = formatUpdatedAt(project.updatedAt);
                  const deckCount = `${project.deckCount} ${project.deckCount === 1 ? "deck" : "decks"}`;
                  const screenCount = `${project.screenCount} ${project.screenCount === 1 ? "screen" : "screens"}`;
                  const preview = previews[project.slug];

                  return (
                    <div
                      className="group flex w-full items-center gap-1 rounded-xl border border-line bg-panel/90 shadow-sm shadow-black/20 transition hover:border-white/20 hover:bg-panel-strong"
                      key={project.slug}
                    >
                      <button
                        className="plinth-focus-ring flex min-w-0 flex-1 items-center gap-4 rounded-xl px-4 py-3.5 text-left"
                        disabled={loading || !project.valid}
                        onClick={() => void onOpen(project.slug)}
                        type="button"
                      >
                        <div aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-black/20 text-muted transition group-hover:border-white/15 group-hover:text-accent-soft">
                          {preview ? <ScreenThumbnail assets={preview.assets} maxHeight={46} maxWidth={46} projectSlug={project.slug} screen={preview.screen} /> : <Layers3 size={18} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-ink">
                              {project.name}
                            </p>
                            {!project.valid ? (
                              <span className="text-[11px] font-medium text-red-200">
                                Invalid
                              </span>
                            ) : null}
                          </div>
                          <p
                            className="mt-1 truncate text-xs text-muted"
                            title={
                              project.updatedAt
                                ? new Date(project.updatedAt).toLocaleString()
                                : undefined
                            }
                          >
                            {project.valid
                              ? [updatedAt, deckCount, screenCount]
                                  .filter(Boolean)
                                  .join(" · ")
                              : project.error}
                          </p>
                        </div>
                        <ChevronRight
                          className="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ink"
                          size={18}
                        />
                      </button>
                      <div className="mr-2.5 shrink-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`More actions for ${project.name}`}
                            className="plinth-focus-ring grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-white/[0.07] hover:text-ink"
                          >
                            <MoreHorizontal size={17} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-40">
                            <DropdownMenuItem
                              danger
                              disabled={
                                loading || deletingSlug === project.slug
                              }
                              onClick={() => void deleteProject(project)}
                            >
                              <Trash2 size={12} />
                              {deletingSlug === project.slug
                                ? "Deleting…"
                                : "Delete project"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </main>
      </div>

      <Dialog
        footer={
          <>
            <Button
              disabled={creating}
              onClick={() => setCreateOpen(false)}
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={
                creating ||
                !name.trim() ||
                !Number.isInteger(deckWidth) ||
                deckWidth < 1 ||
                deckWidth > 100_000 ||
                !Number.isInteger(deckHeight) ||
                deckHeight < 1 ||
                deckHeight > 100_000
              }
              form="create-project"
              type="submit"
              variant="primary"
            >
              {creating ? "Creating…" : "Create project"}
            </Button>
          </>
        }
        onOpenChange={(open) => {
          if (!creating) setCreateOpen(open);
        }}
        open={createOpen}
        title="Create new project"
      >
        <form
          id="create-project"
          onSubmit={(event) => void submitCreate(event)}
        >
          {error ? (
            <div className="rounded-lg border border-red-300/20 bg-red-300/[0.08] px-3 py-2.5 text-sm text-red-100">
              {error}
            </div>
          ) : null}
          <div className={error ? "mt-4" : undefined}>
            <label
              className="mb-1.5 block text-xs font-medium text-muted"
              htmlFor="create-project-name"
            >
              Name
            </label>
            <Input
              autoFocus
              id="create-project-name"
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="My screenshots"
              value={name}
            />
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-xs font-medium text-muted">
              First deck size
            </p>
            <PresetDropdown
              height={deckHeight}
              onSelect={(value) => {
                setDeckPreset(value);
                const definition = getPresetDefinition(value);
                if (definition) {
                  setDeckWidth(definition.width);
                  setDeckHeight(definition.height);
                } else {
                  setAdvancedOpen(true);
                }
              }}
              value={deckPreset}
              width={deckWidth}
            />
            <p className="mt-1.5 text-[10px] leading-4 text-muted">
              Deck size is permanent after creation.
            </p>
          </div>

          <details
            className="group mt-4 border-t border-line pt-4"
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
            open={advancedOpen}
          >
            <summary className="plinth-focus-ring flex cursor-pointer list-none items-center justify-between rounded-lg text-xs font-medium text-muted hover:text-ink">
              <span>Advanced options</span>
              <ChevronDown
                className="transition group-open:rotate-180"
                size={14}
              />
            </summary>
            <div className="mt-4 space-y-4">
              {deckPreset === "custom" ? (
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className="block text-xs font-medium text-muted"
                    htmlFor="create-project-deck-width"
                  >
                    <span className="mb-1.5 block">Width</span>
                    <Input
                      id="create-project-deck-width"
                      max={100000}
                      min={1}
                      onChange={(event) =>
                        setDeckWidth(Number(event.target.value))
                      }
                      type="number"
                      value={deckWidth}
                    />
                  </label>
                  <label
                    className="block text-xs font-medium text-muted"
                    htmlFor="create-project-deck-height"
                  >
                    <span className="mb-1.5 block">Height</span>
                    <Input
                      id="create-project-deck-height"
                      max={100000}
                      min={1}
                      onChange={(event) =>
                        setDeckHeight(Number(event.target.value))
                      }
                      type="number"
                      value={deckHeight}
                    />
                  </label>
                </div>
              ) : null}
              <div>
                <label
                  className="mb-1.5 block text-xs font-medium text-muted"
                  htmlFor="create-project-slug"
                >
                  Slug{" "}
                  <span className="font-normal text-muted/70">(optional)</span>
                </label>
                <Input
                  id="create-project-slug"
                  maxLength={64}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="Generated from the name"
                  value={slug}
                />
              </div>
              <div>
                <label
                  className="mb-1.5 block text-xs font-medium text-muted"
                  htmlFor="create-project-export-directory"
                >
                  Export folder{" "}
                  <span className="font-normal text-muted/70">(optional)</span>
                </label>
                <Input
                  id="create-project-export-directory"
                  maxLength={4096}
                  onChange={(event) => setExportDirectory(event.target.value)}
                  placeholder="/absolute/path/to/exports"
                  value={exportDirectory}
                />
                <p className="mt-1.5 text-[10px] leading-4 text-muted">
                  Folder exports create timestamped directories here.
                </p>
              </div>
            </div>
          </details>
        </form>
      </Dialog>
    </div>
  );
}
