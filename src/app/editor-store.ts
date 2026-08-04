import { createId } from "../lib/ids";
import type { Project, SceneElement, Screen, ScreenPreset } from "../lib/schema";
import {
  addDeck,
  addElement,
  addScreen,
  duplicateDeck,
  duplicateElements,
  duplicateScreen,
  moveElements,
  removeDeck,
  removeElements,
  removeScreen,
  reorderDecks,
  reorderElements,
  reorderScreens,
  resizeElement,
  toggleElementOverflow,
  updateElement,
  updateElements,
  updateScreen,
} from "../scene/operations";
import type { AddDeckOptions, AddScreenOptions, ElementPatch, ElementUpdate, MoveDelta, ResizeElementInput, ScreenPatch } from "../scene/operations";
import { ProjectHistory, type ProjectOperation } from "../scene/history";
import { resolveScreen } from "../scene/selectors";

export type EditorSnapshot = {
  project: Project;
  activeDeckId: string;
  activeScreenId: string;
  selectedElementIds: string[];
  zoom: number;
  clipboardCount: number;
  canUndo: boolean;
  canRedo: boolean;
  isInTransaction: boolean;
};

type ProjectCommit = (project: Project) => void;

export class EditorStore {
  readonly history: ProjectHistory;
  private listeners = new Set<() => void>();
  private commit: ProjectCommit;
  private snapshot: EditorSnapshot;
  private clipboard: SceneElement[] = [];
  private transactionBefore: Project | null = null;

  constructor(project: Project, onCommit: ProjectCommit) {
    this.history = new ProjectHistory(project, 100);
    const deck = project.decks[0];
    this.commit = onCommit;
    this.snapshot = {
      project,
      activeDeckId: deck?.id ?? "",
      activeScreenId: deck?.screens[0]?.id ?? "",
      selectedElementIds: [],
      zoom: 0.45,
      clipboardCount: 0,
      canUndo: false,
      canRedo: false,
      isInTransaction: false,
    };
  }

  getSnapshot = (): EditorSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setCommitHandler(onCommit: ProjectCommit): void {
    this.commit = onCommit;
  }

  replaceProject(project: Project): void {
    if (project === this.history.project) return;
    this.history.replaceProject(project);
    this.transactionBefore = null;
    const deck = project.decks.some((candidate) => candidate.id === this.snapshot.activeDeckId)
      ? project.decks.find((candidate) => candidate.id === this.snapshot.activeDeckId)
      : project.decks[0];
    const activeDeckId = deck?.id ?? "";
    const activeScreenId = deck?.screens.some((screen) => screen.id === this.snapshot.activeScreenId)
      ? this.snapshot.activeScreenId
      : deck?.screens[0]?.id ?? "";
    this.updateSnapshot({
      project,
      activeDeckId,
      activeScreenId,
      selectedElementIds: this.validSelection(project, activeScreenId, this.snapshot.selectedElementIds),
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      isInTransaction: false,
    });
  }

  setActiveDeck(deckId: string): void {
    const deck = this.history.project.decks.find((candidate) => candidate.id === deckId);
    if (!deck) return;
    this.updateSnapshot({ activeDeckId: deckId, activeScreenId: deck.screens[0]?.id ?? "", selectedElementIds: [] });
  }

  setActiveScreen(screenId: string): void {
    for (const deck of this.history.project.decks) {
      if (deck.screens.some((screen) => screen.id === screenId)) {
        this.updateSnapshot({ activeDeckId: deck.id, activeScreenId: screenId, selectedElementIds: [] });
        return;
      }
    }
  }

  setSelection(elementIds: readonly string[]): void {
    this.updateSnapshot({ selectedElementIds: this.validSelection(this.history.project, this.snapshot.activeScreenId, elementIds) });
  }

  toggleSelection(elementId: string, additive = false): void {
    const selected = new Set(additive ? this.snapshot.selectedElementIds : []);
    if (selected.has(elementId)) selected.delete(elementId);
    else selected.add(elementId);
    this.setSelection([...selected]);
  }

  selectAll(): void {
    this.setSelection(resolveScreen(this.history.project, this.snapshot.activeScreenId).elements.map((element) => element.id));
  }

  setZoom(zoom: number): void {
    this.updateSnapshot({ zoom: Math.min(3, Math.max(0.08, Number.isFinite(zoom) ? zoom : 0.45)) });
  }

  apply(label: string, operation: ProjectOperation): void {
    const project = this.history.apply(label, operation);
    if (project === this.snapshot.project) return;
    this.updateSnapshot({
      project,
      selectedElementIds: this.validSelection(project, this.snapshot.activeScreenId, this.snapshot.selectedElementIds),
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
    if (!this.snapshot.isInTransaction) this.commit(project);
  }

  beginTransaction(label: string): void {
    if (!this.snapshot.isInTransaction) this.transactionBefore = this.history.project;
    this.history.beginTransaction(label);
    this.updateSnapshot({ isInTransaction: true });
  }

  commitTransaction(): void {
    const before = this.transactionBefore;
    const project = this.history.commitTransaction();
    this.transactionBefore = null;
    this.updateSnapshot({ project, canUndo: this.history.canUndo, canRedo: this.history.canRedo, isInTransaction: false });
    if (before && project !== before) this.commit(project);
  }

  cancelTransaction(): void {
    const project = this.history.cancelTransaction();
    this.transactionBefore = null;
    this.updateSnapshot({ project, canUndo: this.history.canUndo, canRedo: this.history.canRedo, isInTransaction: false });
  }

  undo(): void {
    if (this.snapshot.isInTransaction) this.commitTransaction();
    const before = this.history.project;
    const project = this.history.undo();
    if (project === before) return;
    this.updateSnapshot({ project, selectedElementIds: this.validSelection(project, this.snapshot.activeScreenId, this.snapshot.selectedElementIds), canUndo: this.history.canUndo, canRedo: this.history.canRedo, isInTransaction: false });
    this.commit(project);
  }

  redo(): void {
    if (this.snapshot.isInTransaction) this.commitTransaction();
    const before = this.history.project;
    const project = this.history.redo();
    if (project === before) return;
    this.updateSnapshot({ project, selectedElementIds: this.validSelection(project, this.snapshot.activeScreenId, this.snapshot.selectedElementIds), canUndo: this.history.canUndo, canRedo: this.history.canRedo, isInTransaction: false });
    this.commit(project);
  }

  copy(): void {
    const screen = resolveScreen(this.history.project, this.snapshot.activeScreenId);
    const selected = screen?.elements.filter((element) => this.snapshot.selectedElementIds.includes(element.id)) ?? [];
    this.clipboard = selected.map((element) => {
      const {
        zIndex: _zIndex,
        ownerScreenId: _ownerScreenId,
        targetScreenId: _targetScreenId,
        isOverflowLink: _isOverflowLink,
        ...canonicalElement
      } = element;
      return canonicalElement;
    });
    this.updateSnapshot({ clipboardCount: this.clipboard.length });
  }

  paste(): void {
    if (this.clipboard.length === 0) return;
    const screenId = this.snapshot.activeScreenId;
    const clipboard = this.clipboard.map((element) => ({ ...element, id: createId(element.type) }));
    this.apply("Paste", (project) => clipboard.reduce((current, element, index) => addElement(current, screenId, {
      ...element,
      x: element.x + 24 + index * 8,
      y: element.y + 24 + index * 8,
    }), project));
    this.setSelection(clipboard.map((element) => element.id));
  }

  deleteSelection(): void {
    const ids = this.snapshot.selectedElementIds;
    if (ids.length === 0) return;
    this.apply("Delete selection", (project) => removeElements(project, this.snapshot.activeScreenId, ids));
    this.setSelection([]);
  }

  duplicateSelection(): void {
    const ids = this.snapshot.selectedElementIds;
    if (ids.length === 0) return;
    const screenId = this.snapshot.activeScreenId;
    const beforeIds = new Set(resolveScreen(this.history.project, screenId).elements.map((element) => element.id));
    this.apply("Duplicate selection", (project) => duplicateElements(project, screenId, ids));
    this.setSelection(resolveScreen(this.history.project, screenId).elements.filter((element) => !beforeIds.has(element.id)).map((element) => element.id));
  }

  duplicateElement(elementId: string): void {
    const screenId = this.snapshot.activeScreenId;
    const beforeIds = new Set(resolveScreen(this.history.project, screenId).elements.map((element) => element.id));
    this.apply("Duplicate layer", (project) => duplicateElements(project, screenId, [elementId]));
    const duplicate = resolveScreen(this.history.project, screenId).elements.find((element) => !beforeIds.has(element.id));
    if (duplicate) this.setSelection([duplicate.id]);
  }

  reorderElementByDirection(elementId: string, direction: -1 | 1): void {
    const screen = this.activeScreen();
    if (!screen) return;
    const ordered = [...resolveScreen(this.history.project, screen.id).elements].sort((left, right) => left.zIndex - right.zIndex);
    const index = ordered.findIndex((element) => element.id === elementId);
    if (index < 0) return;
    this.apply("Reorder layer", (project) => reorderElements(project, screen.id, [elementId], index + direction));
  }

  reorderElementToIndex(elementId: string, targetIndex: number): void {
    const screen = this.activeScreen();
    if (!screen) return;
    const selectedIds = this.snapshot.selectedElementIds.includes(elementId) ? this.snapshot.selectedElementIds : [elementId];
    this.apply("Reorder layer", (project) => reorderElements(project, screen.id, selectedIds, targetIndex));
  }

  bringForward(): void { this.reorderSelection(1, "Bring forward"); }
  sendBackward(): void { this.reorderSelection(-1, "Send backward"); }
  bringToFront(): void { this.reorderSelection(9999, "Bring to front"); }
  sendToBack(): void { this.reorderSelection(0, "Send to back"); }

  nudge(delta: MoveDelta): void {
    const ids = this.editableSelectedIds();
    if (ids.length === 0) return;
    this.apply("Nudge selection", (project) => moveElements(project, this.snapshot.activeScreenId, ids, delta));
  }

  updateElement(elementId: string, patch: ElementPatch): void {
    this.apply("Update element", (project) => updateElement(project, this.snapshot.activeScreenId, elementId, patch));
  }

  updateElements(updates: ElementUpdate[] | Record<string, ElementPatch>): void {
    this.apply("Update elements", (project) => updateElements(project, this.snapshot.activeScreenId, updates));
  }

  moveSelection(delta: MoveDelta): void {
    const ids = this.editableSelectedIds();
    if (ids.length === 0) return;
    this.apply("Move selection", (project) => moveElements(project, this.snapshot.activeScreenId, ids, delta));
  }

  resizeElement(elementId: string, input: ResizeElementInput): void {
    this.apply("Resize element", (project) => resizeElement(project, this.snapshot.activeScreenId, elementId, input));
  }

  toggleElementOverflow(elementId: string, enabled?: boolean): void {
    this.apply("Toggle overflow", (project) => toggleElementOverflow(project, this.snapshot.activeScreenId, elementId, enabled));
  }

  updateCurrentScreen(patch: ScreenPatch): void {
    this.apply("Update screen", (project) => updateScreen(project, this.snapshot.activeScreenId, patch));
  }

  addDeck(options: AddDeckOptions): void {
    this.apply("Add deck", (project) => addDeck(project, options));
  }

  duplicateDeckById(deckId: string): void {
    const before = this.history.project.decks.map((deck) => deck.id);
    this.apply("Duplicate deck", (project) => duplicateDeck(project, deckId));
    const added = this.history.project.decks.find((deck) => !before.includes(deck.id));
    if (added) this.setActiveDeck(added.id);
  }

  removeDeckById(deckId: string): void {
    const index = this.history.project.decks.findIndex((deck) => deck.id === deckId);
    const wasActive = deckId === this.snapshot.activeDeckId;
    this.apply("Delete deck", (project) => removeDeck(project, deckId));
    if (!wasActive) return;
    const next = this.history.project.decks[Math.min(Math.max(index - 1, 0), this.history.project.decks.length - 1)];
    if (next) this.setActiveDeck(next.id);
  }

  reorderCurrentDecks(deckIds: string[], targetIndex: number): void {
    this.apply("Reorder decks", (project) => reorderDecks(project, deckIds, targetIndex));
  }

  addScreen(preset: ScreenPreset, options?: AddScreenOptions): void {
    this.apply("Add screen", (project) => addScreen(project, this.snapshot.activeDeckId, preset, options));
  }

  duplicateCurrentScreen(): void {
    this.duplicateScreenById(this.snapshot.activeDeckId, this.snapshot.activeScreenId);
  }

  duplicateScreenById(deckId: string, screenId: string): void {
    const before = this.history.project.decks.flatMap((deck) => deck.screens.map((screen) => screen.id));
    this.apply("Duplicate screen", (project) => duplicateScreen(project, deckId, screenId));
    const added = this.history.project.decks.flatMap((deck) => deck.screens).find((screen) => !before.includes(screen.id));
    if (added) this.setActiveScreen(added.id);
  }

  removeCurrentScreen(): void {
    this.removeScreenById(this.snapshot.activeDeckId, this.snapshot.activeScreenId);
  }

  removeScreenById(deckId: string, screenId: string): void {
    const deck = this.history.project.decks.find((candidate) => candidate.id === deckId);
    const index = deck?.screens.findIndex((screen) => screen.id === screenId) ?? -1;
    const wasActive = screenId === this.snapshot.activeScreenId;
    this.apply("Delete screen", (project) => removeScreen(project, deckId, screenId));
    if (!wasActive || !deck) return;
    const next = this.history.project.decks.find((candidate) => candidate.id === deckId)?.screens[Math.min(Math.max(index - 1, 0), (deck.screens.length - 2))];
    if (next) this.setActiveScreen(next.id);
  }

  reorderCurrentScreens(screenIds: string[], targetIndex: number): void {
    this.apply("Reorder screens", (project) => reorderScreens(project, this.snapshot.activeDeckId, screenIds, targetIndex));
  }

  reorderScreenTo(screenId: string, targetScreenId: string): void {
    if (screenId === targetScreenId) return;
    const deck = this.history.project.decks.find((candidate) => candidate.id === this.snapshot.activeDeckId);
    if (!deck) return;
    const remaining = deck.screens.filter((screen) => screen.id !== screenId);
    const targetIndex = remaining.findIndex((screen) => screen.id === targetScreenId);
    if (targetIndex < 0) return;
    this.reorderCurrentScreens([screenId], targetIndex);
  }

  private reorderSelection(direction: number, label: string): void {
    const screen = this.activeScreen();
    if (!screen || this.snapshot.selectedElementIds.length === 0) return;
    const ordered = [...resolveScreen(this.history.project, screen.id).elements].sort((left, right) => left.zIndex - right.zIndex);
    const selected = new Set(this.snapshot.selectedElementIds);
    const currentIndex = Math.min(...ordered.filter((element) => selected.has(element.id)).map((element) => element.zIndex));
    const target = direction === 9999 ? ordered.length : direction === 0 ? 0 : currentIndex + direction;
    this.apply(label, (project) => reorderElements(project, screen.id, this.snapshot.selectedElementIds, target));
  }

  private activeScreen(): Screen | undefined {
    return this.history.project.decks.flatMap((deck) => deck.screens).find((screen) => screen.id === this.snapshot.activeScreenId);
  }

  private editableSelectedIds(): string[] {
    const selected = new Set(this.snapshot.selectedElementIds);
    return resolveScreen(this.history.project, this.snapshot.activeScreenId).elements.filter((element) => selected.has(element.id) && !element.locked).map((element) => element.id);
  }

  private validSelection(project: Project, screenId: string, ids: readonly string[]): string[] {
    const screen = project.decks.flatMap((deck) => deck.screens).find((candidate) => candidate.id === screenId);
    const available = new Set(screen ? resolveScreen(project, screen.id).elements.map((element) => element.id) : []);
    return ids.filter((id) => available.has(id));
  }

  private updateSnapshot(values: Partial<EditorSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...values };
    for (const listener of this.listeners) listener();
  }
}
