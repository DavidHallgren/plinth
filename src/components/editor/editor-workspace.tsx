import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AssetMetadata, DeviceElement, Project, ScreenPreset, ImageElement, ShapeElement, TextElement } from "../../lib/schema";
import { createId, nowIso } from "../../lib/ids";
import { EditorStore } from "../../app/editor-store";
import { resolveScreen, selectActiveDeck, selectAssetUsages, selectSelectedElements } from "../../scene/selectors";
import { addElement, replaceElement } from "../../scene/element-operations";
import { updateDeck } from "../../scene/structure-operations";
import { DeckCanvas, type DeckFitMode } from "../../canvas/deck-canvas";
import { ScreenNavigator } from "../sidebar/screen-navigator";
import { EditorToolbar } from "../toolbar/editor-toolbar";
import { Inspector } from "./inspector";
import { AssetLibrary } from "./asset-library";
import { ExportDialog } from "./export-dialog";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { APP_STORE_PRESETS, getPresetDefinition } from "../../scene/presets";
import { getDevicePreset, type DevicePresetId } from "../../devices/presets";
import { useAssetMutations } from "../../hooks/use-asset-mutations";
import { useFontMutations } from "../../hooks/use-font-mutations";
import { ensureFontReady, ensureProjectFonts, projectFontLoadKey } from "../../fonts/font-registry";

type EditorWorkspaceProps = {
  project: Project;
  error: string | null;
  onProjectChange: (project: Project) => void;
  onProjectSynced: (project: Project) => void;
  onSaveNow: (project?: Project) => Promise<Project>;
  onBack: () => Promise<void>;
  onRenameProject: (name: string, slug?: string, exportDirectory?: string | null) => Promise<void>;
  readOnly?: boolean;
};

export function shouldIgnoreEditorShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const candidate = target as HTMLElement & { isContentEditable?: boolean };
  if (candidate.isContentEditable === true) return true;
  if (typeof candidate.closest !== "function") return false;
  return Boolean(candidate.closest("input, textarea, select, [contenteditable]"));
}

export function EditorWorkspace({ project, error, onProjectChange, onProjectSynced, onSaveNow, onBack, onRenameProject, readOnly = false }: EditorWorkspaceProps) {
  const storeRef = useRef<EditorStore | null>(null);
  const localCommitRevisionRef = useRef(0);
  const handleProjectCommit = useCallback((nextProject: Project) => {
    localCommitRevisionRef.current += 1;
    onProjectChange(nextProject);
  }, [onProjectChange]);
  if (!storeRef.current || storeRef.current.history.project.id !== project.id) {
    storeRef.current = new EditorStore(project, handleProjectCommit);
  }
  const store = storeRef.current;
  store.setCommitHandler(handleProjectCommit);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [fitRequest, setFitRequest] = useState(0);
  const [fitMode, setFitMode] = useState<DeckFitMode>("focused-screen");
  const [revealScreenRequest, setRevealScreenRequest] = useState(0);
  const [deckOpen, setDeckOpen] = useState(false);
  const [deckEditId, setDeckEditId] = useState<string | null>(null);
  const [deckName, setDeckName] = useState("");
  const [deckSlug, setDeckSlug] = useState("");
  const [deckPreset, setDeckPreset] = useState<ScreenPreset>(APP_STORE_PRESETS[0]?.id ?? "custom");
  const [deckWidth, setDeckWidth] = useState(1320);
  const [deckHeight, setDeckHeight] = useState(2868);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(project.name);
  const [renameSlug, setRenameSlug] = useState(project.slug);
  const [renameExportDirectory, setRenameExportDirectory] = useState(project.settings.exportDirectory ?? "");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportRendering, setExportRendering] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const fontLoadKey = projectFontLoadKey(project);
  const fontChangeRevisionRef = useRef(0);
  const inspectorCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { uploadStates, uploadFiles, dismissUpload, retryUpload, renameAsset, deleteAsset } = useAssetMutations({
    project,
    store,
    currentLocalRevision: () => localCommitRevisionRef.current,
    flushPendingSave,
    commitProject: handleProjectCommit,
    syncProject: onProjectSynced,
  });
  const { fontBusy, uploadFont, deleteFont } = useFontMutations({ project, store, currentLocalRevision: () => localCommitRevisionRef.current, flushPendingSave, commitProject: handleProjectCommit, syncProject: onProjectSynced });

  useEffect(() => {
    store.replaceProject(project);
  }, [project, store]);

  useEffect(() => {
    let active = true;
    setFontsReady(false);
    void ensureProjectFonts(project).then(() => { if (active) setFontsReady(true); }).catch((reason) => { if (active) setLocalError(reason instanceof Error ? reason.message : "A project font could not be loaded."); });
    return () => { active = false; };
  }, [fontLoadKey]);

  useEffect(() => {
    setRenameName(project.name);
    setRenameSlug(project.slug);
    setRenameExportDirectory(project.settings.exportDirectory ?? "");
  }, [project.name, project.settings.exportDirectory, project.slug]);

  const activeDeck = selectActiveDeck(snapshot.project, snapshot.activeDeckId);
  const activeScreen = resolveScreen(snapshot.project, snapshot.activeScreenId);
  const selectedElements = selectSelectedElements(activeScreen, snapshot.selectedElementIds);
  const selectedGroup = snapshot.selectedGroupIds.length === 1
    ? activeDeck.groups.find((group) => group.id === snapshot.selectedGroupIds[0] && group.elementIds.length === snapshot.selectedElementIds.length && group.elementIds.every((elementId) => snapshot.selectedElementIds.includes(elementId)))
    : undefined;
  const canGroupSelection = store.canGroupSelection();
  const selectedFrame = selectedElements.find((element) => element.type === "device");
  const frameTarget = {
    selectedFrameName: selectedFrame?.name ?? null,
  };
  const assetUsages = new Map(snapshot.project.assets.map((asset) => [asset.path, selectAssetUsages(snapshot.project, asset.path)]));
  const focusedOwnerScreen = selectedElements[0]?.ownerScreenId;
  const reportError = useCallback((reason: unknown) => {
    setLocalError(reason instanceof Error ? reason.message : "The editor could not apply that change.");
  }, []);
  const commitInspectorTransaction = useCallback(() => {
    if (inspectorCommitTimerRef.current) {
      clearTimeout(inspectorCommitTimerRef.current);
      inspectorCommitTimerRef.current = null;
    }
    if (store.getSnapshot().isInTransaction) store.commitTransaction();
  }, [store]);
  const changeTextFont = useCallback(async (elementId: string, fontFamilyId: string, fontWeight: number, italic: boolean): Promise<boolean> => {
    const requestRevision = ++fontChangeRevisionRef.current;
    commitInspectorTransaction();
    setLocalError(null);
    try {
      const before = store.getSnapshot();
      const beforeElement = before.project.decks.flatMap((deck) => deck.screens).flatMap((screen) => screen.layers)
        .find((layer) => layer.kind === "owned" && layer.element.id === elementId && layer.element.type === "text");
      if (!beforeElement || beforeElement.kind !== "owned" || beforeElement.element.type !== "text") throw new Error("The selected text layer is no longer available.");
      await ensureFontReady(before.project, fontFamilyId, fontWeight, italic, beforeElement.element.text || "Plinth 123");

      const latest = store.getSnapshot();
      const latestElement = latest.project.decks.flatMap((deck) => deck.screens).flatMap((screen) => screen.layers)
        .find((layer) => layer.kind === "owned" && layer.element.id === elementId && layer.element.type === "text");
      if (!latestElement || latestElement.kind !== "owned" || latestElement.element.type !== "text") throw new Error("The selected text layer is no longer available.");
      await ensureFontReady(latest.project, fontFamilyId, fontWeight, italic, latestElement.element.text || "Plinth 123");
      if (requestRevision !== fontChangeRevisionRef.current) return false;

      store.beginTransaction("Change font");
      store.updateElement(elementId, { style: { ...latestElement.element.style, fontFamilyId, fontWeight, italic } });
      store.commitTransaction();
      return true;
    } catch (reason) {
      if (store.getSnapshot().isInTransaction) store.cancelTransaction();
      reportError(reason);
      return false;
    }
  }, [commitInspectorTransaction, reportError, store]);
  useEffect(() => () => {
    if (inspectorCommitTimerRef.current) clearTimeout(inspectorCommitTimerRef.current);
  }, []);
  useEffect(() => {
    if (!localNotice) return;
    const timer = setTimeout(() => setLocalNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [localNotice]);
  function queueInspectorChange(label: string, action: () => void): void {
    setLocalError(null);
    try {
      if (!store.getSnapshot().isInTransaction) store.beginTransaction(label);
      action();
      if (inspectorCommitTimerRef.current) clearTimeout(inspectorCommitTimerRef.current);
      inspectorCommitTimerRef.current = setTimeout(() => {
        inspectorCommitTimerRef.current = null;
        if (store.getSnapshot().isInTransaction) store.commitTransaction();
      }, 450);
    } catch (reason) {
      if (store.getSnapshot().isInTransaction) store.cancelTransaction();
      reportError(reason);
    }
  }
  const run = useCallback((action: () => void) => {
    setLocalError(null);
    try {
      action();
    } catch (reason) {
      if (store.getSnapshot().isInTransaction) store.cancelTransaction();
      reportError(reason);
    }
  }, [reportError]);
  const fitZoom = useCallback((zoom: number) => store.setZoom(zoom), [store]);
  const requestActiveScreenReveal = useCallback(() => setRevealScreenRequest((value) => value + 1), []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (readOnly) return;
      if (shouldIgnoreEditorShortcutTarget(event.target)) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        run(() => event.shiftKey ? store.redo() : store.undo());
        return;
      }
      if (command && event.key.toLowerCase() === "y") {
        event.preventDefault();
        run(() => store.redo());
        return;
      }
      if (command && event.key.toLowerCase() === "c") {
        event.preventDefault();
        store.copy();
        return;
      }
      if (command && event.key.toLowerCase() === "v") {
        event.preventDefault();
        run(() => {
          if (store.getSnapshot().clipboardCount === 0) return;
          store.paste();
          requestActiveScreenReveal();
        });
        return;
      }
      if (command && event.key.toLowerCase() === "d") {
        event.preventDefault();
        run(() => {
          if (store.getSnapshot().selectedElementIds.length === 0) return;
          store.duplicateSelection();
          requestActiveScreenReveal();
        });
        return;
      }
      if (command && event.key.toLowerCase() === "g") {
        event.preventDefault();
        run(() => event.shiftKey ? store.ungroupSelection() : store.groupSelection());
        return;
      }
      if (!command && event.key === "]") {
        event.preventDefault();
        run(() => event.shiftKey ? store.bringToFront() : store.bringForward());
        return;
      }
      if (!command && event.key === "[") {
        event.preventDefault();
        run(() => event.shiftKey ? store.sendToBack() : store.sendBackward());
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        run(() => store.deleteSelection());
        return;
      }
      if (event.key === "Escape") {
        store.setSelection([]);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        const delta = event.key === "ArrowUp" ? { x: 0, y: -distance } : event.key === "ArrowDown" ? { x: 0, y: distance } : event.key === "ArrowLeft" ? { x: -distance, y: 0 } : { x: distance, y: 0 };
        run(() => store.nudge(delta));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [readOnly, requestActiveScreenReveal, run, store]);

  function addText() {
    const element: TextElement = {
      id: createId("text"),
      type: "text",
      name: "Text",
      x: Math.round(activeScreen.width * 0.1),
      y: Math.round(activeScreen.height * 0.12),
      width: Math.round(activeScreen.width * 0.72),
      height: 120,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      shadow: null,
      text: "New headline",
      style: {
        fontFamilyId: "builtin:inter",
        fontSize: 56,
        fontWeight: 700,
        italic: false,
        underline: false,
        lineHeight: 1.1,
        letterSpacing: -1,
        color: "#ffffff",
        align: "left",
        backgroundColor: null,
        padding: 0,
        backgroundRadius: 0,
        shadow: null,
        autoHeight: true,
      },
    };
    run(() => {
      store.apply("Add text", (current) => addElement(current, activeScreen.id, element));
      store.setSelection([element.id]);
      requestActiveScreenReveal();
    });
  }

  function addShape(shape: ShapeElement["shape"]) {
    const element: ShapeElement = {
      id: createId("shape"),
      type: "shape",
      name: shape === "line" ? "Line" : "Shape",
      x: Math.round(activeScreen.width * 0.12),
      y: Math.round(activeScreen.height * 0.62),
      width: Math.round(activeScreen.width * 0.5),
      height: shape === "line" ? 12 : Math.round(activeScreen.height * 0.12),
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      shadow: null,
      shape,
      fill: "#b0b0b0",
      stroke: "#dedede",
      strokeWidth: shape === "line" ? 4 : 1,
      radius: shape === "rounded-rectangle" ? 28 : 0,
    };
    run(() => {
      store.apply("Add shape", (current) => addElement(current, activeScreen.id, element));
      store.setSelection([element.id]);
      requestActiveScreenReveal();
    });
  }

  function addImage(asset: AssetMetadata) {
    const maxWidth = Math.max(120, Math.round(activeScreen.width * 0.58));
    const aspect = asset.width / Math.max(1, asset.height);
    const width = Math.min(maxWidth, Math.max(120, Math.round(activeScreen.width * 0.58)));
    const height = Math.max(80, Math.min(activeScreen.height * 0.42, Math.round(width / Math.max(0.1, aspect))));
    const element: ImageElement = {
      id: createId("image"),
      type: "image",
      name: asset.name,
      x: Math.round((activeScreen.width - width) / 2),
      y: Math.round((activeScreen.height - height) / 2),
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      shadow: null,
      assetPath: asset.path,
      fit: "cover",
      position: { x: 0.5, y: 0.5 },
      cornerRadius: Math.min(32, Math.round(Math.min(width, height) * 0.06)),
      alt: asset.name,
    };
    run(() => {
      store.apply("Add image", (current) => addElement(current, activeScreen.id, element));
      store.setSelection([element.id]);
      requestActiveScreenReveal();
      setLocalNotice(`Added “${asset.name}” as an image.`);
    });
  }

  function replaceAssetInSelectedFrame(asset: AssetMetadata) {
    if (!selectedFrame) return;
    run(() => store.updateElement(selectedFrame.id, { screenshotPath: asset.path }));
    setLocalNotice(`Updated ${selectedFrame.name} with “${asset.name}”.`);
  }

  function addAssetWithFrame(asset: AssetMetadata, presetId: DevicePresetId) {
    const preset = getDevicePreset(presetId);
    if (!preset) return;
    const maxWidth = Math.round(activeScreen.width * 0.46);
    const maxHeight = Math.round(activeScreen.height * 0.58);
    const width = Math.min(maxWidth, Math.round(maxHeight * preset.aspectRatio));
    const height = Math.round(width / preset.aspectRatio);
    const element: DeviceElement = {
      id: createId("device"),
      type: "device",
      preset: presetId,
      deviceId: presetId,
      deviceName: preset.label,
      frame: preset.category === "iPad" || presetId.includes("ipad") ? "tablet" : "phone",
      frameColor: preset.defaultFrameColor,
      screenColor: preset.defaultScreenColor,
      screenshotPath: asset.path,
      screenshotFit: "cover",
      screenshotPosition: { x: 0.5, y: 0.5 },
      bezelStyle: "solid",
      cornerRadius: null,
      screenCornerRadius: null,
      showGlare: false,
      showCamera: true,
      name: preset.label,
      x: Math.round((activeScreen.width - width) / 2),
      y: Math.round((activeScreen.height - height) / 2),
      width,
      height,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      shadow: null,
    };
    run(() => {
      store.apply("Add frame", (current) => addElement(current, activeScreen.id, element));
      store.setSelection([element.id]);
      requestActiveScreenReveal();
      setLocalNotice(`Added “${asset.name}” with a ${element.deviceName} frame.`);
    });
  }

  function convertImageToFrame(elementId: string, presetId: DevicePresetId) {
    const selected = selectedElements.find((element) => element.id === elementId);
    const preset = getDevicePreset(presetId);
    if (!selected || selected.type !== "image" || !preset) return;
    const image = selected;
    const maxWidth = activeScreen.width * 0.9;
    const maxHeight = activeScreen.height * 0.9;
    let height = Math.min(maxHeight, Math.max(image.height, image.width / preset.aspectRatio));
    let width = height * preset.aspectRatio;
    if (width > maxWidth) {
      width = maxWidth;
      height = width / preset.aspectRatio;
    }
    const frame: DeviceElement = {
      id: image.id,
      type: "device",
      preset: presetId,
      deviceId: presetId,
      deviceName: preset.label,
      frame: presetId.includes("ipad") ? "tablet" : "phone",
      frameColor: preset.defaultFrameColor,
      screenColor: preset.defaultScreenColor,
      screenshotPath: image.assetPath,
      screenshotFit: image.fit,
      screenshotPosition: image.position,
      bezelStyle: "solid",
      cornerRadius: null,
      screenCornerRadius: null,
      showGlare: false,
      showCamera: true,
      name: image.name,
      x: image.x + (image.width - width) / 2,
      y: image.y + (image.height - height) / 2,
      width,
      height,
      rotation: image.rotation,
      opacity: image.opacity,
      locked: image.locked,
      visible: image.visible,
      shadow: image.shadow,
    };
    run(() => {
      store.apply("Add frame", (current) => replaceElement(current, activeScreen.id, image.id, frame));
      setLocalNotice(`Added a ${preset.label} frame to “${image.name}”.`);
    });
  }

  async function handleDroppedFiles(files: FileList | File[]) {
    setDropActive(false);
    const uploaded = await uploadFiles(Array.from(files));
    for (const asset of uploaded) addImage(asset);
  }

  function addNewScreen() {
    commitInspectorTransaction();
    run(() => {
      store.addScreen("custom", { name: `Screen ${activeDeck.screens.length + 1}` });
      const added = store.history.project.decks.find((deck) => deck.id === activeDeck.id)?.screens.at(-1);
      if (added) store.setActiveScreen(added.id);
    });
  }

  function openNewDeck() {
    setDeckEditId(null);
    setDeckName("New deck");
    setDeckSlug("");
    setDeckPreset("custom");
    setDeckWidth(1320);
    setDeckHeight(2868);
    setDeckOpen(true);
  }

  function openDeckEdit(deckId: string) {
    const deck = snapshot.project.decks.find((candidate) => candidate.id === deckId);
    if (!deck) return;
    setDeckEditId(deck.id);
    setDeckName(deck.name);
    setDeckSlug(deck.slug);
    setDeckWidth(deck.width);
    setDeckHeight(deck.height);
    setDeckOpen(true);
  }

  function submitDeck(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = deckName.trim();
    if (!name) return;
    run(() => {
      if (deckEditId) {
        store.apply("Rename deck", (current) => updateDeck(current, deckEditId, { name, slug: deckSlug.trim() || undefined }));
      } else {
        const before = store.history.project.decks.map((deck) => deck.id);
        store.addDeck({ name, slug: deckSlug.trim() || undefined, width: Math.max(1, Math.round(deckWidth)), height: Math.max(1, Math.round(deckHeight)), screenPreset: deckPreset });
        const added = store.history.project.decks.find((deck) => !before.includes(deck.id));
        if (added) store.setActiveDeck(added.id);
      }
      setDeckOpen(false);
    });
  }

  async function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameName.trim()) return;
    commitInspectorTransaction();
    setBusy(true);
    setLocalError(null);
    try {
      await onRenameProject(renameName.trim(), renameSlug.trim() || undefined, renameExportDirectory.trim() || null);
      setRenameOpen(false);
    } catch (reason) {
      reportError(reason);
    } finally {
      setBusy(false);
    }
  }

  function deleteScreen(screenId = snapshot.activeScreenId) {
    const target = snapshot.project.decks.flatMap((deck) => deck.screens).find((screen) => screen.id === screenId);
    if (!target) return;
    const targetDeck = snapshot.project.decks.find((deck) => deck.screens.some((screen) => screen.id === screenId));
    if (!targetDeck || targetDeck.screens.length <= 1) {
      setLocalError("A deck must keep at least one screen.");
      return;
    }
    if (!window.confirm(`Delete “${target.name}”?`)) return;
    run(() => store.removeScreenById(targetDeck.id, screenId));
  }

  async function flushPendingSave(): Promise<Project> {
    commitInspectorTransaction();
    const current = store.getSnapshot().project;
    await onSaveNow(current);
    return current;
  }

  async function leaveProject(): Promise<void> {
    setBusy(true);
    try {
      await onBack();
    } catch (reason) {
      reportError(reason);
    } finally {
      setBusy(false);
    }
  }

  const visibleError = localError ?? error;

  return (
    <div aria-busy={readOnly || !fontsReady} className="relative flex h-screen min-h-[620px] min-w-[960px] flex-col overflow-hidden bg-[#0d0d0d]">
      {readOnly ? <div aria-hidden="true" className="absolute inset-0 z-[100] cursor-wait bg-black/10" /> : null}
      <EditorToolbar
        canRedo={snapshot.canRedo}
        canUndo={snapshot.canUndo}
        onAddShape={addShape}
        onAddText={addText}
        onOpenAssets={() => setAssetLibraryOpen(true)}
        onExport={() => setExportOpen(true)}
        onBack={() => { commitInspectorTransaction(); void leaveProject(); }}
        onDefaultZoom={() => { setFitMode("focused-screen"); setFitRequest((value) => value + 1); }}
        onFitDeck={() => { setFitMode("deck"); setFitRequest((value) => value + 1); }}
        onFitScreenWidth={() => { setFitMode("screen-width"); setFitRequest((value) => value + 1); }}
        onRedo={() => run(() => store.redo())}
        onRenameProject={() => setRenameOpen(true)}
        onUndo={() => run(() => store.undo())}
        onZoomChange={(zoom) => store.setZoom(zoom)}
        projectName={project.name}
        zoom={snapshot.zoom}
      />
      {visibleError ? <div className="flex shrink-0 items-center justify-between gap-3 border-b border-red-300/20 bg-red-400/[0.08] px-4 py-2 text-xs text-red-100" role="alert"><span>{visibleError}</span><button className="text-red-100/70 hover:text-red-50" onClick={() => setLocalError(null)} type="button">Dismiss</button></div> : null}
      {localNotice ? <div className="flex shrink-0 items-center justify-between gap-3 border-b border-emerald-300/20 bg-emerald-400/[0.08] px-4 py-2 text-xs text-emerald-100" role="status"><span>{localNotice}</span><button className="text-emerald-100/70 hover:text-emerald-50" onClick={() => setLocalNotice(null)} type="button">Dismiss</button></div> : null}
      {fontsReady ? <div className="flex min-h-0 flex-1">
        <ScreenNavigator
          activeDeckId={snapshot.activeDeckId}
          activeScreenId={snapshot.activeScreenId}
          assets={snapshot.project.assets}
          canGroupSelection={canGroupSelection}
          onAddDeck={openNewDeck}
          onAddScreen={addNewScreen}
          onDeleteDeck={(deckId) => run(() => { if (snapshot.project.decks.length <= 1) throw new Error("A project must keep at least one deck."); const deck = snapshot.project.decks.find((candidate) => candidate.id === deckId); if (deck && window.confirm(`Delete “${deck.name}”?`)) store.removeDeckById(deckId); })}
          onDeleteElement={(elementId) => run(() => { store.setSelection([elementId]); store.deleteSelection(); })}
          onDeleteGroup={(groupId) => run(() => store.deleteGroup(groupId))}
          onDeleteScreen={deleteScreen}
          onDuplicateDeck={(deckId) => run(() => store.duplicateDeckById(deckId))}
          onDuplicateElement={(elementId) => run(() => { store.duplicateElement(elementId); requestActiveScreenReveal(); })}
          onDuplicateGroup={(groupId) => run(() => { store.duplicateGroup(groupId); requestActiveScreenReveal(); })}
          onDuplicateScreen={(screenId) => run(() => store.duplicateScreenById(activeDeck.id, screenId))}
          onEditDeck={openDeckEdit}
          onGoToOwner={(ownerScreenId, elementId) => { commitInspectorTransaction(); store.setActiveScreen(ownerScreenId); store.toggleSelection(elementId); }}
          onMoveDeck={(deckId, direction) => run(() => { const index = snapshot.project.decks.findIndex((deck) => deck.id === deckId); store.reorderCurrentDecks([deckId], index + direction); })}
          onMoveLayer={(elementId, direction) => run(() => store.reorderElementByDirection(elementId, direction))}
          onMoveScreen={(screenId, direction) => run(() => { const index = activeDeck.screens.findIndex((screen) => screen.id === screenId); store.reorderCurrentScreens([screenId], index + direction); })}
          onRenameElement={(elementId, name) => run(() => store.updateElement(elementId, { name }))}
          onRenameGroup={(groupId, name) => run(() => store.renameGroup(groupId, name))}
          onReorderLayer={(elementId, targetIndex) => run(() => { const current = store.getSnapshot().project.decks.find((deck) => deck.id === store.getSnapshot().activeDeckId)?.screens.find((screen) => screen.id === store.getSnapshot().activeScreenId); const sourceIndex = current?.layers.findIndex((layer) => (layer.kind === "owned" ? layer.element.id : layer.elementId) === elementId) ?? -1; store.reorderElementToIndex(elementId, sourceIndex >= 0 && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex); })}
          onGroupSelection={() => run(() => store.groupSelection())}
          onUngroup={(groupId) => run(() => { store.selectGroup(groupId); store.ungroupSelection(); })}
          onSelectGroup={(groupId, additive) => store.selectGroup(groupId, additive)}
          onReorderScreen={(screenId, targetIndex) => run(() => { const sourceIndex = activeDeck.screens.findIndex((screen) => screen.id === screenId); store.reorderCurrentScreens([screenId], sourceIndex >= 0 && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex); })}
          onSelectDeck={(deckId) => { commitInspectorTransaction(); store.setActiveDeck(deckId); }}
          onSelectLayer={(elementId, additive, isolate) => store.toggleSelection(elementId, additive, isolate)}
          onSelectScreen={(screenId) => { commitInspectorTransaction(); store.setActiveScreen(screenId); }}
          onToggleLocked={(element) => run(() => store.updateElement(element.id, { locked: !element.locked }))}
          onToggleVisible={(element) => run(() => store.updateElement(element.id, { visible: !element.visible }))}
          project={snapshot.project}
          selectedElementIds={snapshot.selectedElementIds}
          selectedGroupIds={snapshot.selectedGroupIds}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          <div
            className="relative flex min-h-0 flex-1"
            onDragEnter={(event) => { event.preventDefault(); setDropActive(true); }}
            onDragLeave={(event) => { if (event.currentTarget === event.target) setDropActive(false); }}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
            onDrop={(event) => { event.preventDefault(); void handleDroppedFiles(event.dataTransfer.files); }}
          >
            {exportRendering ? <div className="grid min-h-0 flex-1 place-items-center text-xs text-muted">Rendering export…</div> : <DeckCanvas
              assets={snapshot.project.assets}
              deck={activeDeck}
              fitMode={fitMode}
              fitRequest={`${activeDeck.id}:${fitRequest}`}
              focusedScreenId={snapshot.activeScreenId}
              revealScreenRequest={revealScreenRequest}
              onClearSelection={() => store.setSelection([])}
              onFitZoom={fitZoom}
              onFocusScreen={(screenId) => store.focusScreen(screenId)}
              onGestureStart={(label, targetScreenId) => { store.focusScreen(targetScreenId); commitInspectorTransaction(); store.beginTransaction(label); }}
              onMoveEnd={(targetScreenId, elementId, x, y) => run(() => {
                const currentSnapshot = store.getSnapshot();
                const currentScreen = resolveScreen(currentSnapshot.project, targetScreenId);
                const current = currentScreen.elements.find((element) => element.id === elementId);
                if (!current) return;
                const dx = x - current.x;
                const dy = y - current.y;
                if (!currentSnapshot.selectedElementIds.includes(elementId)) store.setSelection([elementId]);
                store.moveSelection({ x: dx, y: dy }, targetScreenId);
                store.commitTransaction();
              })}
              onSelect={(targetScreenId, elementId, additive, isolate) => { store.focusScreen(targetScreenId); store.toggleSelection(elementId, additive, isolate); }}
              onTransformEnd={(targetScreenId, transforms) => run(() => {
                store.updateElements(transforms.map((transform) => ({ id: transform.id, patch: transform })), targetScreenId);
                store.commitTransaction();
              })}
              projectSlug={project.slug}
              selectedElementIds={snapshot.selectedElementIds}
              selectedGroupIds={snapshot.selectedGroupIds}
              screens={activeDeck.screens.map((screen) => resolveScreen(snapshot.project, screen.id))}
              zoom={snapshot.zoom}
            />}
            {dropActive ? <div className="pointer-events-none absolute inset-4 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent/[0.12] text-sm font-semibold text-accent-soft">Drop images to upload and place them</div> : null}
          </div>
        </main>
        <aside className="flex min-h-0 w-[276px] shrink-0 flex-col border-l border-white/[0.08] bg-[#171717]">
          <Inspector assets={snapshot.project.assets} canGroupSelection={canGroupSelection} fontBusy={fontBusy} onAdjustSelection={(adjustment, orderedElementIds) => { commitInspectorTransaction(); run(() => store.adjustSelection(adjustment, orderedElementIds)); }} onAlignSelection={(alignment) => { commitInspectorTransaction(); run(() => store.alignSelection(alignment)); }} onChangeTextFont={changeTextFont} onConvertImageToFrame={convertImageToFrame} onDeleteFont={async (font) => { try { await deleteFont(font); } catch (reason) { reportError(reason); } }} onDistributeSelection={(distribution) => { commitInspectorTransaction(); run(() => store.distributeSelection(distribution)); }} onGroupSelection={() => { commitInspectorTransaction(); run(() => store.groupSelection()); }} onMoveOwnership={(elementId) => queueInspectorChange("Move ownership", () => store.moveOwnershipToFocusedScreen(elementId))} onRenameGroup={(groupId, name) => queueInspectorChange("Rename group", () => store.renameGroup(groupId, name))} onToggleOverflow={(elementId, enabled) => queueInspectorChange("Toggle overflow", () => store.toggleElementOverflow(elementId, enabled))} onUpdateElement={(elementId, patch) => queueInspectorChange("Edit element", () => store.updateElement(elementId, patch))} onUpdateElements={(updates) => queueInspectorChange("Edit selection", () => store.updateElements(updates))} onUpdateScreen={(patch) => queueInspectorChange("Edit screen", () => store.updateCurrentScreen(patch))} onUploadFont={async (file) => { try { return await uploadFont(file); } catch (reason) { reportError(reason); return null; } }} ownerScreenName={focusedOwnerScreen ? snapshot.project.decks.flatMap((deck) => deck.screens).find((screen) => screen.id === focusedOwnerScreen)?.name : undefined} projectFonts={snapshot.project.fonts} screen={activeScreen} selectedElements={selectedElements} selectedGroup={selectedGroup} />
        </aside>
      </div> : <div className="grid min-h-0 flex-1 place-items-center text-sm text-ink" role="status">Loading exact project fonts…</div>}

      <Dialog footer={<><Button onClick={() => setDeckOpen(false)} variant="ghost">Cancel</Button><Button form="deck-editor" type="submit" variant="primary">{deckEditId ? "Save deck name" : "Create deck"}</Button></>} onOpenChange={setDeckOpen} open={deckOpen} title={deckEditId ? "Rename deck" : "New deck"}>
        <form className="space-y-3" id="deck-editor" onSubmit={submitDeck}>
          <label className="block text-xs font-medium text-muted" htmlFor="deck-name">Name</label>
          <Input id="deck-name" onChange={(event) => setDeckName(event.target.value)} value={deckName} />
          <label className="block text-xs font-medium text-muted" htmlFor="deck-slug">Slug</label>
          <Input id="deck-slug" onChange={(event) => setDeckSlug(event.target.value)} placeholder="marketing-deck" value={deckSlug} />
          {!deckEditId ? <>
            <label className="block text-xs font-medium text-muted" htmlFor="deck-preset">Size preset</label>
            <select className="plinth-focus-ring h-10 w-full rounded-xl border border-line bg-black/20 px-3 text-sm text-ink outline-none focus:border-accent/70" id="deck-preset" onChange={(event) => { const value = event.target.value as ScreenPreset; setDeckPreset(value); const definition = getPresetDefinition(value); if (definition) { setDeckWidth(definition.width); setDeckHeight(definition.height); } }} value={deckPreset}>{APP_STORE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}<option value="custom">Exact custom size</option></select>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-muted" htmlFor="deck-width"><span className="mb-1 block">Width</span><Input id="deck-width" min={1} onChange={(event) => { setDeckPreset("custom"); setDeckWidth(Number(event.target.value)); }} type="number" value={deckWidth} /></label>
              <label className="block text-xs font-medium text-muted" htmlFor="deck-height"><span className="mb-1 block">Height</span><Input id="deck-height" min={1} onChange={(event) => { setDeckPreset("custom"); setDeckHeight(Number(event.target.value)); }} type="number" value={deckHeight} /></label>
            </div>
            <p className="text-[10px] leading-4 text-muted">Deck dimensions are immutable after creation.</p>
          </> : <p className="text-[10px] leading-4 text-muted">{deckWidth} × {deckHeight}. Dimensions cannot be changed after creation.</p>}
        </form>
      </Dialog>

      <Dialog footer={<><Button onClick={() => setRenameOpen(false)} variant="ghost">Cancel</Button><Button disabled={busy || !renameName.trim()} form="rename-project" type="submit" variant="primary">{busy ? "Saving…" : "Save changes"}</Button></>} onOpenChange={setRenameOpen} open={renameOpen} title="Edit project">
        <form className="space-y-3" id="rename-project" onSubmit={(event) => void submitRename(event)}>
          <label className="block text-xs font-medium text-muted" htmlFor="rename-project-name">Project name</label>
          <Input id="rename-project-name" onChange={(event) => setRenameName(event.target.value)} value={renameName} />
          <label className="block pt-2 text-xs font-medium text-muted" htmlFor="rename-project-slug">Project slug</label>
          <Input id="rename-project-slug" onChange={(event) => setRenameSlug(event.target.value)} value={renameSlug} />
          <label className="block pt-2 text-xs font-medium text-muted" htmlFor="edit-project-export-directory">Export folder</label>
          <Input id="edit-project-export-directory" onChange={(event) => setRenameExportDirectory(event.target.value)} placeholder="/absolute/path/to/exports" value={renameExportDirectory} />
          <p className="text-[10px] leading-4 text-muted">Folder exports create timestamped directories here. Missing folders can be created when exporting.</p>
        </form>
      </Dialog>

      <AssetLibrary
        assets={snapshot.project.assets}
        frameTarget={frameTarget}
        onAddImage={addImage}
        onAddWithFrame={addAssetWithFrame}
        onDeleteAsset={deleteAsset}
        onDismissUpload={dismissUpload}
        onOpenChange={setAssetLibraryOpen}
        onReplaceSelectedFrame={replaceAssetInSelectedFrame}
        onRenameAsset={renameAsset}
        onRetryUpload={retryUpload}
        onRevealUsage={(usage) => {
          commitInspectorTransaction();
          store.setActiveScreen(usage.screenId);
          store.setSelection(usage.elementType === "background" ? [] : [usage.elementId]);
          requestActiveScreenReveal();
        }}
        onUploadFiles={uploadFiles}
        open={assetLibraryOpen}
        projectSlug={project.slug}
        uploadStates={uploadStates}
        usagesByPath={assetUsages}
      />
      <ExportDialog
        activeDeckId={snapshot.activeDeckId}
        activeScreenId={snapshot.activeScreenId}
        onBeforeExport={flushPendingSave}
        onExportDirectoryChange={(directory) => run(() => {
          const current = store.getSnapshot().project;
          if (current.settings.exportDirectory === directory) return;
          store.apply("Configure export folder", (value) => ({
            ...value,
            settings: { ...value.settings, exportDirectory: directory },
            updatedAt: nowIso(),
          }));
        })}
        onOpenChange={setExportOpen}
        onRenderingChange={setExportRendering}
        open={exportOpen}
        project={snapshot.project}
      />
    </div>
  );
}
