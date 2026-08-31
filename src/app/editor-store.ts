import { createId } from "../lib/ids";
import type { LayerGroup, Project, SceneElement, Screen, ScreenPreset } from "../lib/schema";
import {
  addElement,
  createImageCropCallout,
  adjustElements,
  alignElements,
  distributeElements,
  duplicateElements,
  groupElements,
  moveElements,
  renameGroup,
  removeElements,
  reorderElements,
  resizeElement,
  updateElement,
  updateElements,
  ungroupElements,
} from "../scene/element-operations";
import type { ElementAdjustment, ElementAlignment, ElementDistribution, ElementPatch, ElementUpdate, MoveDelta, ResizeElementInput } from "../scene/element-operations";
import { addDeck, addScreen, duplicateDeck, duplicateScreen, removeDeck, removeScreen, reorderDecks, reorderScreens, updateDeck, updateScreen } from "../scene/structure-operations";
import type { AddDeckOptions, AddScreenOptions, DeckPatch, ScreenPatch } from "../scene/structure-operations";
import { toggleElementOverflow, transferElementOwnership } from "../scene/overflow-operations";
import { ProjectHistory, type ProjectOperation } from "../scene/history";
import { resolveScreen, selectGroupForElement } from "../scene/selectors";

export type EditorSnapshot = {
  project: Project;
  activeDeckId: string;
  activeScreenId: string;
  selectedElementIds: string[];
  selectedGroupIds: string[];
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
  private clipboardGroups: Array<Pick<LayerGroup, "name" | "elementIds">> = [];
  private transactionBefore: Project | null = null;
  private deferredPersistenceProject: Project | null = null;

  constructor(project: Project, onCommit: ProjectCommit) {
    this.history = new ProjectHistory(project, 100);
    const deck = project.decks[0];
    this.commit = onCommit;
    this.snapshot = {
      project,
      activeDeckId: deck?.id ?? "",
      activeScreenId: deck?.screens[0]?.id ?? "",
      selectedElementIds: [],
      selectedGroupIds: [],
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
    // Inspector and canvas transactions deliberately stay local until they
    // become one undoable commit. A save echo for the previous committed
    // snapshot must not replace those newer in-progress edits.
    if (this.snapshot.isInTransaction) {
      this.deferredPersistenceProject = project;
      return;
    }
    this.deferredPersistenceProject = null;
    this.history.replaceProject(project);
    this.replaceSnapshotProject(project);
  }

  replaceExternalProject(project: Project): void {
    this.deferredPersistenceProject = null;
    this.history.resetProject(project);
    this.replaceSnapshotProject(project);
  }

  private replaceSnapshotProject(project: Project): void {
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
      selectedGroupIds: this.validGroupSelection(project, activeScreenId, this.snapshot.selectedGroupIds, this.snapshot.selectedElementIds),
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      isInTransaction: false,
    });
  }

  setActiveDeck(deckId: string): void {
    const deck = this.history.project.decks.find((candidate) => candidate.id === deckId);
    if (!deck) return;
    this.updateSnapshot({ activeDeckId: deckId, activeScreenId: deck.screens[0]?.id ?? "", selectedElementIds: [], selectedGroupIds: [] });
  }

  setActiveScreen(screenId: string): void {
    for (const deck of this.history.project.decks) {
      if (deck.screens.some((screen) => screen.id === screenId)) {
        this.updateSnapshot({ activeDeckId: deck.id, activeScreenId: screenId, selectedElementIds: [], selectedGroupIds: [] });
        return;
      }
    }
  }

  focusScreen(screenId: string): void {
    if (this.snapshot.activeScreenId !== screenId) this.setActiveScreen(screenId);
  }

  setSelection(elementIds: readonly string[]): void {
    this.updateSnapshot({ selectedElementIds: this.validSelection(this.history.project, this.snapshot.activeScreenId, elementIds), selectedGroupIds: [] });
  }

  toggleSelection(elementId: string, additive = false, isolate = false): void {
    const deck = this.activeDeck();
    const available = new Set(resolveScreen(this.history.project, this.snapshot.activeScreenId).elements.map((element) => element.id));
    const owned = new Set(this.activeScreen()?.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element.id] : []) ?? []);
    const group = !isolate && deck ? selectGroupForElement(deck, elementId) : undefined;
    const selectableGroup = group?.elementIds.every((memberId) => available.has(memberId) && owned.has(memberId)) ? group : undefined;
    const ids = selectableGroup?.elementIds ?? [elementId];
    const selected = new Set(additive ? this.snapshot.selectedElementIds : []);
    const selectedGroups = new Set(additive ? this.snapshot.selectedGroupIds : []);
    const removing = ids.every((id) => selected.has(id));
    ids.forEach((id) => removing ? selected.delete(id) : selected.add(id));
    if (selectableGroup) removing ? selectedGroups.delete(selectableGroup.id) : selectedGroups.add(selectableGroup.id);
    this.updateSnapshot({
      selectedElementIds: this.validSelection(this.history.project, this.snapshot.activeScreenId, [...selected]),
      selectedGroupIds: [...selectedGroups],
    });
  }

  selectGroup(groupId: string, additive = false): void {
    const group = this.activeDeck()?.groups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    const selected = new Set(additive ? this.snapshot.selectedElementIds : []);
    const selectedGroups = new Set(additive ? this.snapshot.selectedGroupIds : []);
    const removing = group.elementIds.every((id) => selected.has(id));
    group.elementIds.forEach((id) => removing ? selected.delete(id) : selected.add(id));
    removing ? selectedGroups.delete(group.id) : selectedGroups.add(group.id);
    this.updateSnapshot({ selectedElementIds: [...selected], selectedGroupIds: [...selectedGroups] });
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
      selectedGroupIds: this.validGroupSelection(project, this.snapshot.activeScreenId, this.snapshot.selectedGroupIds, this.snapshot.selectedElementIds),
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
    const deferredProject = this.deferredPersistenceProject;
    this.deferredPersistenceProject = null;
    const project = this.history.commitTransaction();
    this.transactionBefore = null;
    if ((!before || project === before) && deferredProject?.id === project.id) {
      this.history.replaceProject(deferredProject);
      this.replaceSnapshotProject(deferredProject);
      return;
    }
    this.updateSnapshot({ project, canUndo: this.history.canUndo, canRedo: this.history.canRedo, isInTransaction: false });
    if (before && project !== before) this.commit(project);
  }

  cancelTransaction(): void {
    const deferredProject = this.deferredPersistenceProject;
    this.deferredPersistenceProject = null;
    const project = this.history.cancelTransaction();
    this.transactionBefore = null;
    if (deferredProject?.id === project.id) {
      this.history.replaceProject(deferredProject);
      this.replaceSnapshotProject(deferredProject);
      return;
    }
    this.updateSnapshot({ project, canUndo: this.history.canUndo, canRedo: this.history.canRedo, isInTransaction: false });
  }

  undo(): void {
    if (this.snapshot.isInTransaction) this.commitTransaction();
    const before = this.history.project;
    const project = this.history.undo();
    if (project === before) return;
    this.updateSnapshot({ project, selectedElementIds: this.validSelection(project, this.snapshot.activeScreenId, this.snapshot.selectedElementIds), selectedGroupIds: this.validGroupSelection(project, this.snapshot.activeScreenId, this.snapshot.selectedGroupIds, this.snapshot.selectedElementIds), canUndo: this.history.canUndo, canRedo: this.history.canRedo, isInTransaction: false });
    this.commit(project);
  }

  redo(): void {
    if (this.snapshot.isInTransaction) this.commitTransaction();
    const before = this.history.project;
    const project = this.history.redo();
    if (project === before) return;
    this.updateSnapshot({ project, selectedElementIds: this.validSelection(project, this.snapshot.activeScreenId, this.snapshot.selectedElementIds), selectedGroupIds: this.validGroupSelection(project, this.snapshot.activeScreenId, this.snapshot.selectedGroupIds, this.snapshot.selectedElementIds), canUndo: this.history.canUndo, canRedo: this.history.canRedo, isInTransaction: false });
    this.commit(project);
  }

  copy(): void {
    const screen = resolveScreen(this.history.project, this.snapshot.activeScreenId);
    const selected = screen.elements.filter((element) => this.snapshot.selectedElementIds.includes(element.id));
    const selectedIds = new Set(selected.map((element) => element.id));
    const ownedIds = new Set(this.activeScreen()?.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element.id] : []) ?? []);
    this.clipboardGroups = (this.activeDeck()?.groups ?? []).filter((group) => group.elementIds.every((elementId) => selectedIds.has(elementId) && ownedIds.has(elementId))).map((group) => ({ name: group.name, elementIds: [...group.elementIds] }));
    this.clipboard = selected.map((element) => {
      const {
        ownerScreenId: _ownerScreenId,
        targetScreenId: _targetScreenId,
        isOverflowLink: _isOverflowLink,
        renderOrder: _renderOrder,
        ...canonicalElement
      } = element;
      return canonicalElement;
    });
    this.updateSnapshot({ clipboardCount: this.clipboard.length });
  }

  paste(): void {
    if (this.clipboard.length === 0) return;
    const screenId = this.snapshot.activeScreenId;
    const idMap = new Map(this.clipboard.map((element) => [element.id, createId(element.type)]));
    const clipboard = this.clipboard.map((element) => ({ ...element, id: idMap.get(element.id)! }));
    this.apply("Paste", (project) => {
      const withElements = clipboard.reduce((current, element, index) => addElement(current, screenId, {
        ...element,
        x: element.x + 24 + index * 8,
        y: element.y + 24 + index * 8,
      }), project);
      return this.clipboardGroups.reduce((current, group) => groupElements(current, screenId, group.elementIds.map((elementId) => idMap.get(elementId)!), { name: group.name }), withElements);
    });
    this.setSelection(clipboard.map((element) => element.id));
    const pastedGroups = this.activeDeck()?.groups.filter((group) => group.elementIds.every((elementId) => clipboard.some((element) => element.id === elementId))).map((group) => group.id) ?? [];
    if (pastedGroups.length > 0) this.updateSnapshot({ selectedGroupIds: pastedGroups });
  }

  canGroupSelection(): boolean {
    const ids = this.snapshot.selectedElementIds;
    if (ids.length < 2 || this.snapshot.selectedGroupIds.length > 0) return false;
    const owned = new Set(this.activeScreen()?.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element.id] : []) ?? []);
    const grouped = new Set(this.activeDeck()?.groups.flatMap((group) => group.elementIds) ?? []);
    return ids.every((elementId) => owned.has(elementId) && !grouped.has(elementId));
  }

  groupSelection(): void {
    if (!this.canGroupSelection()) return;
    const before = new Set(this.activeDeck()?.groups.map((group) => group.id) ?? []);
    this.apply("Group layers", (project) => groupElements(project, this.snapshot.activeScreenId, this.snapshot.selectedElementIds));
    const group = this.activeDeck()?.groups.find((candidate) => !before.has(candidate.id));
    if (group) this.updateSnapshot({ selectedElementIds: [...group.elementIds], selectedGroupIds: [group.id] });
  }

  ungroupSelection(): void {
    const ids = [...this.snapshot.selectedGroupIds];
    if (ids.length === 0) return;
    this.apply("Ungroup layers", (project) => ids.reduce((current, groupId) => ungroupElements(current, groupId), project));
    this.updateSnapshot({ selectedGroupIds: [] });
  }

  renameGroup(groupId: string, name: string): void {
    this.apply("Rename group", (project) => renameGroup(project, groupId, name));
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
    const duplicatedIds = resolveScreen(this.history.project, screenId).elements.filter((element) => !beforeIds.has(element.id)).map((element) => element.id);
    this.setSelection(duplicatedIds);
    const duplicatedGroups = this.activeDeck()?.groups.filter((group) => group.elementIds.every((elementId) => duplicatedIds.includes(elementId))).map((group) => group.id) ?? [];
    if (duplicatedGroups.length > 0) this.updateSnapshot({ selectedGroupIds: duplicatedGroups });
  }

  duplicateElement(elementId: string): void {
    const screenId = this.snapshot.activeScreenId;
    const beforeIds = new Set(resolveScreen(this.history.project, screenId).elements.map((element) => element.id));
    this.apply("Duplicate layer", (project) => duplicateElements(project, screenId, [elementId]));
    const duplicate = resolveScreen(this.history.project, screenId).elements.find((element) => !beforeIds.has(element.id));
    if (duplicate) this.setSelection([duplicate.id]);
  }

  createCropCallout(elementId: string): void {
    const screenId = this.snapshot.activeScreenId;
    const beforeIds = new Set(resolveScreen(this.history.project, screenId).elements.map((element) => element.id));
    this.apply("Create crop callout", (project) => createImageCropCallout(project, screenId, elementId));
    const createdIds = resolveScreen(this.history.project, screenId).elements.filter((element) => !beforeIds.has(element.id)).map((element) => element.id);
    this.updateSnapshot({ selectedElementIds: createdIds, selectedGroupIds: [] });
  }

  duplicateGroup(groupId: string): void {
    this.selectGroup(groupId);
    this.duplicateSelection();
  }

  deleteGroup(groupId: string): void {
    this.selectGroup(groupId);
    this.deleteSelection();
  }

  reorderElementByDirection(elementId: string, direction: -1 | 1): void {
    const screen = this.activeScreen();
    if (!screen) return;
    const ordered = [...resolveScreen(this.history.project, screen.id).elements].sort((left, right) => left.renderOrder - right.renderOrder);
    const selectedIds = this.snapshot.selectedElementIds.includes(elementId) ? this.snapshot.selectedElementIds : [elementId];
    const selected = new Set(selectedIds);
    const indices = ordered.filter((element) => selected.has(element.id)).map((element) => element.renderOrder);
    const index = indices.length > 0 ? Math.min(...indices) : -1;
    if (index < 0) return;
    this.apply("Reorder layer", (project) => reorderElements(project, screen.id, selectedIds, index + direction));
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

  alignSelection(alignment: ElementAlignment): void {
    const ids = this.editableSelectedIds();
    if (ids.length < 2) return;
    const label = alignment === "horizontal-center" ? "Align horizontal centers" : alignment === "vertical-center" ? "Align vertical centers" : `Align ${alignment}`;
    this.apply(label, (project) => alignElements(project, this.snapshot.activeScreenId, ids, alignment));
  }

  distributeSelection(distribution: ElementDistribution): void {
    const ids = this.editableSelectedIds();
    if (ids.length < 3) return;
    this.apply(`Distribute ${distribution === "horizontal" ? "horizontally" : "vertically"}`, (project) => distributeElements(project, this.snapshot.activeScreenId, ids, distribution));
  }

  adjustSelection(adjustment: ElementAdjustment, orderedElementIds = this.snapshot.selectedElementIds): void {
    const selected = new Set(this.snapshot.selectedElementIds);
    const ids = orderedElementIds.filter((elementId) => selected.has(elementId));
    if (ids.length < 2) return;
    const label = adjustment === "width" ? "Set same width" : adjustment === "height" ? "Set same height" : "Set same rotation";
    this.apply(label, (project) => adjustElements(project, this.snapshot.activeScreenId, ids, adjustment));
  }

  updateElement(elementId: string, patch: ElementPatch, targetScreenId = this.snapshot.activeScreenId): void {
    this.apply("Update element", (project) => updateElement(project, targetScreenId, elementId, patch));
  }

  updateElements(updates: ElementUpdate[] | Record<string, ElementPatch>, targetScreenId = this.snapshot.activeScreenId): void {
    this.apply("Update elements", (project) => updateElements(project, targetScreenId, updates));
  }

  moveSelection(delta: MoveDelta, targetScreenId = this.snapshot.activeScreenId): void {
    const ids = this.editableSelectedIds();
    if (ids.length === 0) return;
    this.apply("Move selection", (project) => moveElements(project, targetScreenId, ids, delta));
  }

  resizeElement(elementId: string, input: ResizeElementInput, targetScreenId = this.snapshot.activeScreenId): void {
    this.apply("Resize element", (project) => resizeElement(project, targetScreenId, elementId, input));
  }

  toggleElementOverflow(elementId: string, enabled?: boolean, targetScreenId = this.snapshot.activeScreenId): void {
    this.apply("Toggle overflow", (project) => toggleElementOverflow(project, targetScreenId, elementId, enabled));
  }

  moveOwnershipToFocusedScreen(elementId: string): void {
    this.apply("Move ownership", (project) => transferElementOwnership(project, elementId, this.snapshot.activeScreenId));
  }

  updateCurrentScreen(patch: ScreenPatch): void {
    this.apply("Update screen", (project) => updateScreen(project, this.snapshot.activeScreenId, patch));
  }

  updateCurrentDeck(patch: DeckPatch): void {
    this.apply("Update deck", (project) => updateDeck(project, this.snapshot.activeDeckId, patch));
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
    const ordered = [...resolveScreen(this.history.project, screen.id).elements].sort((left, right) => left.renderOrder - right.renderOrder);
    const selected = new Set(this.snapshot.selectedElementIds);
    const currentIndex = Math.min(...ordered.filter((element) => selected.has(element.id)).map((element) => element.renderOrder));
    const target = direction === 9999 ? ordered.length : direction === 0 ? 0 : currentIndex + direction;
    this.apply(label, (project) => reorderElements(project, screen.id, this.snapshot.selectedElementIds, target));
  }

  private activeScreen(): Screen | undefined {
    return this.history.project.decks.flatMap((deck) => deck.screens).find((screen) => screen.id === this.snapshot.activeScreenId);
  }

  private activeDeck() {
    return this.history.project.decks.find((deck) => deck.id === this.snapshot.activeDeckId);
  }

  private editableSelectedIds(): string[] {
    const selected = new Set(this.snapshot.selectedElementIds);
    const resolved = resolveScreen(this.history.project, this.snapshot.activeScreenId).elements;
    const byId = new Map(resolved.map((element) => [element.id, element]));
    const blockedGroupMembers = new Set((this.activeDeck()?.groups ?? []).filter((group) => this.snapshot.selectedGroupIds.includes(group.id) && group.elementIds.some((elementId) => byId.get(elementId)?.locked)).flatMap((group) => group.elementIds));
    return resolved.filter((element) => selected.has(element.id) && !element.locked && !blockedGroupMembers.has(element.id)).map((element) => element.id);
  }

  private validSelection(project: Project, screenId: string, ids: readonly string[]): string[] {
    const screen = project.decks.flatMap((deck) => deck.screens).find((candidate) => candidate.id === screenId);
    const available = new Set(screen ? resolveScreen(project, screen.id).elements.map((element) => element.id) : []);
    return ids.filter((id) => available.has(id));
  }

  private validGroupSelection(project: Project, screenId: string, groupIds: readonly string[], selectedElementIds: readonly string[]): string[] {
    const context = project.decks.find((deck) => deck.screens.some((screen) => screen.id === screenId));
    if (!context) return [];
    const available = new Set(resolveScreen(project, screenId).elements.map((element) => element.id));
    const selected = new Set(selectedElementIds);
    return groupIds.filter((groupId) => context.groups.some((group) => group.id === groupId && group.elementIds.every((elementId) => available.has(elementId) && selected.has(elementId))));
  }

  private updateSnapshot(values: Partial<EditorSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...values };
    for (const listener of this.listeners) listener();
  }
}
