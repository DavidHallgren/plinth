import type Konva from "konva";
import { Download, FileOutput, FolderOutput, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Stage } from "../../canvas/react-konva";
import type { Project } from "../../lib/schema";
import { resolveScreen, type ResolvedScreen } from "../../scene/selectors";
import { ApiClientError, apiFetch, jsonRequest } from "../../lib/client-api";
import { buildExportPlan, type ExportScope } from "../../lib/export-validation";
import { encodeCanvasPng } from "../../lib/png-encoding";
import { waitForSceneReady } from "../../canvas/export-readiness";
import { SceneRenderer } from "../../canvas/scene-renderer";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type ExportDialogProps = {
  open: boolean;
  project: Project;
  activeDeckId: string;
  activeScreenId: string;
  onOpenChange: (open: boolean) => void;
  onBeforeExport?: () => Promise<Project>;
  onExportDirectoryChange?: (directory: string | null) => void;
  onRenderingChange?: (rendering: boolean) => void;
};

type ExportStatus = "pending" | "rendering" | "uploading" | "done" | "error";

type ExportRow = {
  screen: ResolvedScreen;
  fileName: string;
  status: ExportStatus;
  path?: string;
  error?: string;
  downloaded?: boolean;
};

type ExportAlert = {
  title: string;
  message: string;
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function errorPath(error: ApiClientError, fallback: string): string {
  if (error.details && typeof error.details === "object" && "path" in error.details && typeof error.details.path === "string") {
    return error.details.path;
  }
  return fallback;
}

function statusText(status: ExportStatus): string {
  if (status === "rendering") return "Rendering…";
  if (status === "uploading") return "Saving…";
  if (status === "done") return "Exported";
  if (status === "error") return "Failed";
  return "Ready";
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function downloadBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = "none";
  window.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function planForProject(sourceProject: Project, scope: ExportScope): Array<{ screen: ResolvedScreen; fileName: string }> {
  return buildExportPlan(sourceProject, scope).map((item) => {
    const screen = sourceProject.decks.flatMap((deck) => deck.screens).find((candidate) => candidate.id === item.screenId);
    if (!screen) throw new Error(`Export screen "${item.screenId}" is missing from the project.`);
    const deck = sourceProject.decks.find((candidate) => candidate.id === item.deckId);
    if (!deck) throw new Error(`Export deck "${item.deckId}" is missing from the project.`);
    return { screen: resolveScreen(sourceProject, screen.id), fileName: item.exportName };
  });
}

export function ExportDialog({ open, project, activeDeckId, activeScreenId, onOpenChange, onBeforeExport, onExportDirectoryChange, onRenderingChange }: ExportDialogProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const [mode, setMode] = useState<"screen" | "deck" | "all">("screen");
  const [destination, setDestination] = useState<"download" | "folder">("download");
  const [exportDirectory, setExportDirectory] = useState(project.settings.exportDirectory ?? "");
  const [missingExportDirectory, setMissingExportDirectory] = useState<string | null>(null);
  const [exportAlert, setExportAlert] = useState<ExportAlert | null>(null);
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [renderScreen, setRenderScreen] = useState<ResolvedScreen | null>(null);
  const [renderProject, setRenderProject] = useState<Project | null>(null);
  const [exporting, setExporting] = useState(false);

  const currentScreen = project.decks.flatMap((deck) => deck.screens).find((screen) => screen.id === activeScreenId) ?? project.decks[0]?.screens[0];
  const currentDeck = project.decks.find((deck) => deck.id === activeDeckId) ?? project.decks.find((deck) => deck.screens.some((screen) => screen.id === currentScreen?.id));
  const currentRenderScreen = currentScreen && currentDeck ? resolveScreen(project, currentScreen.id) : undefined;
  const scope: ExportScope = mode === "screen" ? { mode: "screen", screenId: activeScreenId } : mode === "deck" ? { mode: "deck", deckId: currentDeck?.id ?? activeDeckId } : { mode: "all" };
  const planResult = useMemo(() => {
    try {
      return {
        plan: planForProject(project, scope),
        error: null,
      };
    } catch (error) {
      return {
        plan: [],
        error: error instanceof Error ? error.message : "The export plan is invalid.",
      };
    }
  }, [activeDeckId, activeScreenId, mode, project]);
  const { plan, error: planError } = planResult;
  const configuredExportDirectory = exportDirectory.trim();
  const groupedPlan = useMemo(() => {
    const groups: Array<{ deckId: string; deckName: string; width: number; height: number; items: Array<{ screen: ResolvedScreen; fileName: string }> }> = [];
    for (const item of plan) {
      const group = groups.find((candidate) => candidate.deckId === item.screen.deckId);
      if (group) {
        group.items.push(item);
      } else {
        groups.push({
          deckId: item.screen.deckId,
          deckName: item.screen.deckName,
          width: item.screen.width,
          height: item.screen.height,
          items: [item],
        });
      }
    }
    return groups;
  }, [plan]);
  const rowByScreenId = useMemo(() => new Map(rows.map((row) => [row.screen.id, row])), [rows]);

  useEffect(() => {
    setExportDirectory(project.settings.exportDirectory ?? "");
  }, [project.settings.exportDirectory]);

  useEffect(() => {
    if (!open) {
      setMissingExportDirectory(null);
      setExportAlert(null);
    }
  }, [open]);

  useEffect(() => {
    if (open && planError) setExportAlert({ title: "Could not prepare export", message: planError });
  }, [open, planError]);

  async function waitForStage(screenId: string): Promise<Konva.Stage> {
    void screenId;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const stage = stageRef.current;
      if (stage) return stage;
      await nextFrame();
    }
    throw new Error("The export canvas did not become ready. Close other export operations and try again.");
  }

  async function renderPng(sourceProject: Project, screen: ResolvedScreen): Promise<Blob> {
    await waitForSceneReady(sourceProject, screen, sourceProject.assets);
    setRenderProject(sourceProject);
    setRenderScreen(screen);
    await nextFrame();
    await nextFrame();
    const stage = await waitForStage(screen.id);
    stage.draw();
    const canvas = stage.toCanvas({ imageSmoothingEnabled: true, pixelRatio: 1 });
    if (canvas.width !== screen.width || canvas.height !== screen.height) {
      throw new Error(`The browser produced ${canvas.width}×${canvas.height}, but ${screen.name} requires ${screen.width}×${screen.height}.`);
    }
    return encodeCanvasPng(canvas, screen.background.type === "transparent" ? "transparent" : "opaque");
  }

  function updateRow(screenId: string, values: Partial<ExportRow>): void {
    setRows((current) => current.map((row) => row.screen.id === screenId ? { ...row, ...values } : row));
  }

  async function runExport(createDirectory = false): Promise<void> {
    if (destination === "folder" && !configuredExportDirectory) return;
    setExporting(true);
    setExportAlert(null);
    onRenderingChange?.(true);
    try {
      onExportDirectoryChange?.(configuredExportDirectory || null);
      let sourceProject = project;
      try {
        sourceProject = (await onBeforeExport?.()) ?? project;
      } catch (error) {
        setExportAlert({ title: "Could not prepare export", message: errorMessage(error, "The project could not be saved before export.") });
        return;
      }
      let sourcePlan: Array<{ screen: ResolvedScreen; fileName: string }>;
      let sourceScope: ExportScope = { mode: "all" };
      try {
        const sourceDeck = sourceProject.decks.find((deck) => deck.id === activeDeckId) ?? sourceProject.decks[0];
        sourceScope = mode === "screen" ? { mode: "screen", screenId: activeScreenId } : mode === "deck" ? { mode: "deck", deckId: sourceDeck?.id ?? activeDeckId } : { mode: "all" };
        sourcePlan = planForProject(sourceProject, sourceScope);
      } catch (error) {
        setExportAlert({ title: "Could not prepare export", message: errorMessage(error, "The export plan is invalid.") });
        return;
      }
      const selected = sourcePlan;
      if (selected.length === 0) {
        setExportAlert({ title: "Nothing to export", message: "There is no screen available to export." });
        return;
      }
      let exportRun: { id: string; absolutePath: string } | null = null;
      if (destination === "folder") {
        try {
          const result = await apiFetch<{ exportRun: { id: string; absolutePath: string } }>(
            `/api/projects/${encodeURIComponent(sourceProject.slug)}/export-runs`,
            createDirectory ? jsonRequest({ createDirectory: true }) : { method: "POST" },
          );
          exportRun = result.exportRun;
        } catch (error) {
          if (error instanceof ApiClientError && error.code === "EXPORT_DIRECTORY_MISSING") {
            setMissingExportDirectory(errorPath(error, configuredExportDirectory));
          } else {
            setExportAlert({
              title: "Could not export to folder",
              message: errorMessage(error, "The server could not create the timestamped export directory."),
            });
          }
          return;
        }
      }
      const initialRows = selected.map(({ screen, fileName }) => ({ screen, fileName, status: "pending" as const }));
      const exportFailures: Array<{ screenName: string; message: string }> = [];
      setRows(initialRows);
      for (const item of initialRows) {
        updateRow(item.screen.id, { status: "rendering", error: undefined, path: undefined, downloaded: false });
        try {
          const blob = await renderPng(sourceProject, item.screen);
          updateRow(item.screen.id, { status: "uploading" });
          const formData = new FormData();
          formData.append("metadata", JSON.stringify({
            screenId: item.screen.id,
            fileName: item.fileName,
            width: item.screen.width,
            height: item.screen.height,
            scope: sourceScope,
            ...(exportRun ? { exportRunId: exportRun.id } : {}),
          }));
          formData.append("file", new File([blob], item.fileName, { type: "image/png" }), item.fileName);
          const result = await apiFetch<{ export: { relativePath: string; absolutePath?: string } }>(`/api/projects/${encodeURIComponent(sourceProject.slug)}/exports`, {
            method: "POST",
            body: formData,
          });
          if (destination === "download") downloadBlob(blob, item.fileName);
          updateRow(item.screen.id, { status: "done", path: result.export.absolutePath ?? result.export.relativePath, downloaded: destination === "download" });
        } catch (error) {
          const message = errorMessage(error, "The screen could not be exported.");
          exportFailures.push({ screenName: item.screen.name, message });
          updateRow(item.screen.id, { status: "error", error: message });
        } finally {
          setRenderScreen(null);
          setRenderProject(null);
          stageRef.current = null;
          await nextFrame();
        }
      }
      if (exportFailures.length === 1) {
        const failure = exportFailures[0];
        if (failure) setExportAlert({ title: `Could not export ${failure.screenName}`, message: failure.message });
      } else if (exportFailures.length > 1) {
        setExportAlert({
          title: `${exportFailures.length} screenshots could not be exported`,
          message: exportFailures.map((failure) => `${failure.screenName}: ${failure.message}`).join("\n"),
        });
      }
    } finally {
      setRenderScreen(null);
      setRenderProject(null);
      stageRef.current = null;
      setExporting(false);
      onRenderingChange?.(false);
    }
  }

  const completed = rows.filter((row) => row.status === "done").length;
  const failed = rows.filter((row) => row.status === "error").length;
  const scopeLabels = {
    screen: "Focused",
    deck: "Current deck",
    all: "All decks",
  } as const;
  const progressText = rows.length > 0
    ? `${completed} of ${rows.length} complete${failed > 0 ? ` · ${failed} failed` : ""}`
    : `${plan.length} screen${plan.length === 1 ? "" : "s"} ready`;

  function selectMode(nextMode: typeof mode): void {
    if (exporting || mode === nextMode) return;
    setMode(nextMode);
    setRows([]);
    setExportAlert(null);
  }

  function selectDestination(nextDestination: typeof destination): void {
    if (exporting || destination === nextDestination) return;
    if (nextDestination === "download") onExportDirectoryChange?.(configuredExportDirectory || null);
    setDestination(nextDestination);
    setRows([]);
    setExportAlert(null);
  }

  return (
    <>
      <Dialog
        bodyClassName="flex min-h-0 flex-1 flex-col"
        className="flex h-[min(44rem,calc(100dvh-2rem))] max-w-xl flex-col overflow-hidden"
        description="Choose the screens and destination, then review the files before exporting."
        footer={(
          <>
            <p aria-live="polite" className="mr-auto hidden truncate text-[11px] text-muted sm:block">{progressText}</p>
            <Button disabled={exporting} onClick={() => { onExportDirectoryChange?.(configuredExportDirectory || null); onOpenChange(false); }} variant="ghost">Close</Button>
            <Button className="min-w-40" disabled={exporting || !currentRenderScreen || (destination === "folder" && !configuredExportDirectory)} onClick={() => void runExport()} variant="primary">
              {exporting ? <LoaderCircle className="animate-spin" size={14} /> : <FileOutput size={14} />}
              {exporting ? "Exporting…" : `Export ${plan.length} screen${plan.length === 1 ? "" : "s"}`}
            </Button>
          </>
        )}
        footerClassName="shrink-0 items-center border-t border-line pt-4"
        onOpenChange={(nextOpen) => {
          if (exporting) return;
          if (!nextOpen) onExportDirectoryChange?.(configuredExportDirectory || null);
          onOpenChange(nextOpen);
        }}
        open={open}
        title="Export PNG"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="grid shrink-0 gap-3 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.13em] text-muted">Screens</legend>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-black/15 p-1">
                {(["screen", "deck", "all"] as const).map((value) => (
                  <button
                    aria-pressed={mode === value}
                    className={`plinth-focus-ring h-9 whitespace-nowrap rounded-lg text-[11px] font-medium transition-colors ${mode === value ? "bg-white/10 text-ink shadow" : "text-muted hover:bg-white/[0.04] hover:text-ink"}`}
                    disabled={exporting}
                    key={value}
                    onClick={() => selectMode(value)}
                    type="button"
                  >
                    {scopeLabels[value]}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.13em] text-muted">Destination</legend>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-black/15 p-1">
                <button aria-pressed={destination === "download"} className={`plinth-focus-ring flex h-9 items-center justify-center gap-1.5 rounded-lg text-[11px] font-medium transition-colors ${destination === "download" ? "bg-white/10 text-ink shadow" : "text-muted hover:bg-white/[0.04] hover:text-ink"}`} disabled={exporting} onClick={() => selectDestination("download")} type="button">
                  <Download size={13} /> Download
                </button>
                <button aria-pressed={destination === "folder"} className={`plinth-focus-ring flex h-9 items-center justify-center gap-1.5 rounded-lg text-[11px] font-medium transition-colors ${destination === "folder" ? "bg-white/10 text-ink shadow" : "text-muted hover:bg-white/[0.04] hover:text-ink"}`} disabled={exporting} onClick={() => selectDestination("folder")} type="button">
                  <FolderOutput size={13} /> Folder
                </button>
              </div>
            </fieldset>
          </div>
          <div className="h-[5.25rem] shrink-0 rounded-xl border border-line bg-white/[0.025] p-2.5">
            {destination === "folder" ? (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-medium text-muted" htmlFor="project-export-directory">Project export folder</label>
                <Input
                  className="h-9 text-xs"
                  disabled={exporting}
                  id="project-export-directory"
                  onBlur={() => onExportDirectoryChange?.(configuredExportDirectory || null)}
                  onChange={(event) => { setExportDirectory(event.target.value); setExportAlert(null); }}
                  placeholder="Absolute directory"
                  value={exportDirectory}
                />
              </div>
            ) : (
              <div className="flex h-full items-center gap-3 px-1">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-accent-soft"><Download size={15} /></span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink">Download {plan.length} PNG{plan.length === 1 ? "" : "s"}</p>
                  <p className="mt-0.5 truncate text-[10px] text-muted">Your browser will save each completed screen separately.</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-black/10">
            <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.13em] text-muted">Export queue</p>
              <p className="text-[10px] text-muted">{plan.length} screen{plan.length === 1 ? "" : "s"} · {groupedPlan.length} deck{groupedPlan.length === 1 ? "" : "s"}</p>
            </div>
            <div aria-label="Screens to export" className="min-h-0 flex-1 overflow-y-auto" role="list">
              {groupedPlan.map((group) => (
                <div key={group.deckId}>
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-[#202020] px-3 py-1.5">
                    <p className="truncate text-[10px] font-medium text-ink/80">{group.deckName}</p>
                    <p className="shrink-0 text-[10px] text-muted">{group.items.length} · {group.width} × {group.height}</p>
                  </div>
                  <div className="divide-y divide-white/[0.06]">
                    {group.items.map(({ screen, fileName }) => {
                      const row = rowByScreenId.get(screen.id);
                      return (
                        <div className="px-3 py-2.5" key={screen.id} role="listitem">
                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-ink">{screen.name}</p>
                              <p className="mt-0.5 truncate text-[10px] text-muted">{fileName}</p>
                            </div>
                            <span className={`w-[4.5rem] shrink-0 text-right text-[10px] ${row?.status === "error" ? "text-red-200" : row?.status === "done" ? "text-emerald-200" : "text-muted"}`}>{statusText(row?.status ?? "pending")}</span>
                            <span className="grid h-5 w-5 shrink-0 place-items-center">
                              {row?.status === "done" && destination === "download" ? (
                                <Tooltip>
                                  <TooltipTrigger render={<a aria-label={`Download ${fileName}`} className="text-accent-soft hover:text-ink" download={fileName} href={`/api/projects/${encodeURIComponent(project.slug)}/exports/${encodeURIComponent(fileName)}`} />}>
                                    <Download size={14} />
                                  </TooltipTrigger>
                                  <TooltipContent>Download {fileName}</TooltipContent>
                                </Tooltip>
                              ) : null}
                            </span>
                          </div>
                          {row?.path ? <p className="mt-1 truncate text-[10px] text-emerald-200/75" title={row.path}>{row.downloaded ? "Download started" : `Saved to ${row.path}`}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Dialog>
      <Dialog
        description="The configured export folder does not exist."
        footer={(
          <>
            <Button disabled={exporting} onClick={() => setMissingExportDirectory(null)} variant="ghost">Cancel</Button>
            <Button
              disabled={exporting}
              onClick={() => {
                setMissingExportDirectory(null);
                void runExport(true);
              }}
              variant="primary"
            >
              Create Folder
            </Button>
          </>
        )}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !exporting) setMissingExportDirectory(null);
        }}
        open={missingExportDirectory !== null}
        title="Create export folder?"
      >
        <div className="space-y-3 text-sm leading-6 text-muted">
          <p>Plinth will create this folder and any missing parent folders:</p>
          <p className="break-all rounded-xl border border-line bg-black/20 px-3 py-2 font-mono text-xs leading-5 text-ink">{missingExportDirectory}</p>
        </div>
      </Dialog>
      <Dialog
        footer={<Button onClick={() => setExportAlert(null)} variant="primary">OK</Button>}
        onOpenChange={(nextOpen) => { if (!nextOpen) setExportAlert(null); }}
        open={exportAlert !== null}
        title={exportAlert?.title ?? "Export failed"}
      >
        <p className="whitespace-pre-line text-sm leading-6 text-muted">{exportAlert?.message}</p>
      </Dialog>
      {renderScreen ? (
        <div aria-hidden="true" className="pointer-events-none fixed -left-[100000px] top-0 h-px w-px overflow-hidden opacity-0">
          <Stage
            height={renderScreen.height}
            ref={(stage) => { stageRef.current = stage; }}
            width={renderScreen.width}
          >
            <SceneRenderer assets={renderProject?.assets ?? project.assets} projectSlug={renderProject?.slug ?? project.slug} screen={renderScreen} />
          </Stage>
        </div>
      ) : null}
    </>
  );
}
