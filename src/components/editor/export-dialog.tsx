import type Konva from "konva";
import { Download, FileOutput, FolderOutput, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Stage } from "react-konva";
import type { Project } from "../../lib/schema";
import type { ResolvedScreen } from "../../scene/selectors";
import { apiFetch } from "../../lib/client-api";
import { buildExportPlan } from "../../lib/export-validation";
import { waitForSceneReady } from "../../canvas/export-readiness";
import { SceneRenderer } from "../../canvas/scene-renderer";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type Document = ResolvedScreen;

type ExportDialogProps = {
  open: boolean;
  project: Project;
  activeScreenId: string;
  onOpenChange: (open: boolean) => void;
  onError?: (message: string) => void;
  onBeforeExport?: () => Promise<Project>;
  onExportDirectoryChange?: (directory: string | null) => void;
  onRenderingChange?: (rendering: boolean) => void;
};

type ExportStatus = "pending" | "rendering" | "uploading" | "done" | "error";

type ExportRow = {
  document: Document;
  fileName: string;
  status: ExportStatus;
  path?: string;
  error?: string;
  downloaded?: boolean;
};

function statusText(status: ExportStatus): string {
  if (status === "rendering") return "Rendering…";
  if (status === "uploading") return "Saving…";
  if (status === "done") return "Exported";
  if (status === "error") return "Failed";
  return "Waiting";
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The browser could not encode the rendered canvas as PNG.");
  return blob;
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

function planForProject(sourceProject: Project): Array<{ document: Document; fileName: string }> {
  return buildExportPlan(sourceProject).map((item) => {
    const document = sourceProject.decks.flatMap((deck) => deck.screens).find((candidate) => candidate.id === item.screenId);
    if (!document) throw new Error(`Export screen "${item.screenId}" is missing from the project.`);
    const deck = sourceProject.decks.find((candidate) => candidate.id === item.deckId);
    if (!deck) throw new Error(`Export deck "${item.deckId}" is missing from the project.`);
    return { document: { ...document, deckId: deck.id, deckName: deck.name, width: deck.width, height: deck.height }, fileName: item.exportName };
  });
}

export function ExportDialog({ open, project, activeScreenId, onOpenChange, onError, onBeforeExport, onExportDirectoryChange, onRenderingChange }: ExportDialogProps) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const [mode, setMode] = useState<"current" | "all">("current");
  const [destination, setDestination] = useState<"download" | "folder">("download");
  const [exportDirectory, setExportDirectory] = useState(project.settings.exportDirectory ?? "");
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [renderDocument, setRenderDocument] = useState<Document | null>(null);
  const [renderProject, setRenderProject] = useState<Project | null>(null);
  const [exporting, setExporting] = useState(false);

  const currentScreen = project.decks.flatMap((deck) => deck.screens).find((screen) => screen.id === activeScreenId) ?? project.decks[0]?.screens[0];
  const currentDeck = project.decks.find((deck) => deck.screens.some((screen) => screen.id === currentScreen?.id));
  const currentDocument = currentScreen && currentDeck
    ? { ...currentScreen, deckId: currentDeck.id, deckName: currentDeck.name, width: currentDeck.width, height: currentDeck.height }
    : undefined;
  const planResult = useMemo(() => {
    try {
      return {
        plan: planForProject(project),
        error: null,
      };
    } catch (error) {
      return {
        plan: [],
        error: error instanceof Error ? error.message : "The export plan is invalid.",
      };
    }
  }, [project.decks]);
  const { plan, error: planError } = planResult;
  const configuredExportDirectory = exportDirectory.trim();

  useEffect(() => {
    setExportDirectory(project.settings.exportDirectory ?? "");
  }, [project.settings.exportDirectory]);

  useEffect(() => {
    if (planError) onError?.(planError);
  }, [onError, planError]);

  async function waitForStage(documentId: string): Promise<Konva.Stage> {
    void documentId;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const stage = stageRef.current;
      if (stage) return stage;
      await nextFrame();
    }
    throw new Error("The export canvas did not become ready. Close other previews and try again.");
  }

  async function renderPng(sourceProject: Project, document: Document): Promise<Blob> {
    setRenderProject(sourceProject);
    setRenderDocument(document);
    await nextFrame();
    await nextFrame();
    const stage = await waitForStage(document.id);
    await waitForSceneReady(sourceProject, document, sourceProject.assets);
    stage.draw();
    const canvas = stage.toCanvas({ imageSmoothingEnabled: true, pixelRatio: 1 });
    if (canvas.width !== document.width || canvas.height !== document.height) {
      throw new Error(`The browser produced ${canvas.width}×${canvas.height}, but ${document.name} requires ${document.width}×${document.height}.`);
    }
    return canvasBlob(canvas);
  }

  function updateRow(documentId: string, values: Partial<ExportRow>): void {
    setRows((current) => current.map((row) => row.document.id === documentId ? { ...row, ...values } : row));
  }

  async function runExport(): Promise<void> {
    if (destination === "folder" && !configuredExportDirectory) return;
    setExporting(true);
    setDestinationError(null);
    onRenderingChange?.(true);
    try {
      onExportDirectoryChange?.(configuredExportDirectory || null);
      let sourceProject = project;
      try {
        sourceProject = (await onBeforeExport?.()) ?? project;
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "The project could not be saved before export.");
        return;
      }
      let sourcePlan: Array<{ document: Document; fileName: string }>;
      try {
        sourcePlan = planForProject(sourceProject);
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "The export plan is invalid.");
        return;
      }
      const sourceCurrentDocument = sourcePlan.find(({ document }) => document.id === activeScreenId)?.document ?? sourcePlan[0]?.document;
      const selected = mode === "all" ? sourcePlan : sourcePlan.filter(({ document }) => document.id === sourceCurrentDocument?.id);
      if (selected.length === 0) {
        onError?.("There is no screen available to export.");
        return;
      }
      let exportRun: { id: string; absolutePath: string } | null = null;
      if (destination === "folder") {
        try {
          const result = await apiFetch<{ exportRun: { id: string; absolutePath: string } }>(`/api/projects/${encodeURIComponent(sourceProject.slug)}/export-runs`, { method: "POST" });
          exportRun = result.exportRun;
        } catch (error) {
          const message = error instanceof Error ? error.message : "The server could not create the timestamped export directory.";
          setDestinationError(`Could not export to the configured folder. ${message}`);
          return;
        }
      }
      const initialRows = selected.map(({ document, fileName }) => ({ document, fileName, status: "pending" as const }));
      setRows(initialRows);
      for (const item of initialRows) {
        updateRow(item.document.id, { status: "rendering", error: undefined, path: undefined, downloaded: false });
        try {
          const blob = await renderPng(sourceProject, item.document);
          updateRow(item.document.id, { status: "uploading" });
          const formData = new FormData();
          formData.append("metadata", JSON.stringify({
            screenId: item.document.id,
            fileName: item.fileName,
            width: item.document.width,
            height: item.document.height,
            ...(exportRun ? { exportRunId: exportRun.id } : {}),
          }));
          formData.append("file", new File([blob], item.fileName, { type: "image/png" }), item.fileName);
          const result = await apiFetch<{ export: { relativePath: string; absolutePath?: string } }>(`/api/projects/${encodeURIComponent(sourceProject.slug)}/exports`, {
            method: "POST",
            body: formData,
          });
          if (destination === "download") downloadBlob(blob, item.fileName);
          updateRow(item.document.id, { status: "done", path: result.export.absolutePath ?? result.export.relativePath, downloaded: destination === "download" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "The screen could not be exported.";
          updateRow(item.document.id, { status: "error", error: message });
        } finally {
          setRenderDocument(null);
          setRenderProject(null);
          stageRef.current = null;
          await nextFrame();
        }
      }
    } finally {
      setRenderDocument(null);
      setRenderProject(null);
      stageRef.current = null;
      setExporting(false);
      onRenderingChange?.(false);
    }
  }

  const completed = rows.filter((row) => row.status === "done").length;
  const failed = rows.filter((row) => row.status === "error").length;

  return (
    <>
      <Dialog
        footer={(
          <>
            <Button disabled={exporting} onClick={() => { onExportDirectoryChange?.(configuredExportDirectory || null); onOpenChange(false); }} variant="ghost">Close</Button>
            <Button disabled={exporting || !currentDocument || (destination === "folder" && !configuredExportDirectory)} onClick={() => void runExport()} variant="primary">
              {exporting ? <LoaderCircle className="animate-spin" size={14} /> : <FileOutput size={14} />}
              {mode === "all" ? "Export all" : "Export current"}
            </Button>
          </>
        )}
        onOpenChange={(nextOpen) => {
          if (exporting) return;
          if (!nextOpen) onExportDirectoryChange?.(configuredExportDirectory || null);
          onOpenChange(nextOpen);
        }}
        open={open}
        title="Export PNG"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-black/15 p-1">
            {(["current", "all"] as const).map((value) => (
              <button className={`h-8 rounded-lg text-xs font-medium ${mode === value ? "bg-accent/[0.16] text-accent-soft" : "text-muted hover:text-ink"}`} key={value} onClick={() => setMode(value)} type="button">
                {value === "current" ? "Current screen" : "All screens"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-black/15 p-1">
            <button className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-medium ${destination === "download" ? "bg-accent/[0.16] text-accent-soft" : "text-muted hover:text-ink"}`} onClick={() => { onExportDirectoryChange?.(configuredExportDirectory || null); setDestination("download"); setDestinationError(null); }} type="button">
              <Download size={13} /> Download
            </button>
            <button className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-xs font-medium ${destination === "folder" ? "bg-accent/[0.16] text-accent-soft" : "text-muted hover:text-ink"}`} onClick={() => { setDestination("folder"); setDestinationError(null); }} type="button">
              <FolderOutput size={13} /> Configured folder
            </button>
          </div>
          {destination === "folder" ? (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-muted" htmlFor="project-export-directory">Project export folder</label>
              <Input
                id="project-export-directory"
                onBlur={() => onExportDirectoryChange?.(configuredExportDirectory || null)}
                onChange={(event) => { setExportDirectory(event.target.value); setDestinationError(null); }}
                placeholder="/absolute/path/to/exports"
                value={exportDirectory}
              />
              <p className="text-[10px] leading-4 text-muted">Folder exports create one timestamped directory for the selected screens. The server requires an existing absolute directory.</p>
            </div>
          ) : null}
          {destinationError ? <p className="rounded-xl border border-red-300/20 bg-red-400/[0.08] px-3 py-2 text-[11px] leading-5 text-red-200" role="alert">{destinationError}</p> : null}
          <div className="space-y-2" aria-live="polite">
            {(mode === "all" ? plan : plan.filter(({ document }) => document.id === currentDocument?.id)).map(({ document, fileName }) => {
              const row = rows.find((candidate) => candidate.document.id === document.id);
              return (
                <div className="rounded-xl border border-line bg-white/[0.025] px-3 py-2.5" key={document.id}>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-ink">{document.name}</p>
                      <p className="mt-0.5 truncate text-[10px] text-muted">{fileName} · {document.width} × {document.height}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] ${row?.status === "error" ? "text-red-200" : row?.status === "done" ? "text-emerald-200" : "text-muted"}`}>{statusText(row?.status ?? "pending")}</span>
                    {row?.status === "done" && destination === "download" ? (
                      <Tooltip>
                        <TooltipTrigger render={<a aria-label={`Download ${fileName}`} className="text-accent-soft hover:text-ink" download={fileName} href={`/api/projects/${encodeURIComponent(project.slug)}/exports/${encodeURIComponent(fileName)}`} />}>
                          <Download size={14} />
                        </TooltipTrigger>
                        <TooltipContent>Download {fileName}</TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>
                  {row?.path ? <p className="mt-1 truncate text-[10px] text-emerald-200/75" title={row.path}>{row.downloaded ? "Download started" : `Saved to ${row.path}`}</p> : null}
                  {row?.error ? <p className="mt-1 text-[10px] leading-4 text-red-200" role="alert">{row.error}</p> : null}
                </div>
              );
            })}
          </div>
          {rows.length > 0 ? <p className="text-[11px] text-muted">{completed} of {rows.length} complete{failed > 0 ? ` · ${failed} failed` : ""}.</p> : null}
        </div>
      </Dialog>
      {renderDocument ? (
        <div aria-hidden="true" className="pointer-events-none fixed -left-[100000px] top-0 h-px w-px overflow-hidden opacity-0">
          <Stage
            height={renderDocument.height}
            ref={(stage) => { stageRef.current = stage; }}
            width={renderDocument.width}
          >
            <SceneRenderer assets={renderProject?.assets ?? project.assets} document={renderDocument} projectSlug={renderProject?.slug ?? project.slug} />
          </Stage>
        </div>
      ) : null}
    </>
  );
}
