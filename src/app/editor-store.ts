import { createId } from "../lib/ids";
import type { Project, SceneElement } from "../lib/schema";
import {
  addElement,
  addDocument,
  duplicateDocument,
  duplicateElements,
  moveElements,
  removeDocument,
  removeElements,
  reorderDocuments,
  reorderElements,
  resizeElement,
  updateDocument,
  updateElement,
  updateElements,
} from "../scene/operations";
import type { DocumentPatch, ElementPatch, ElementUpdate, MoveDelta, ResizeElementInput } from "../scene/operations";
import type { AddDocumentOptions } from "../scene/operations";
import { ProjectHistory, type ProjectOperation } from "../scene/history";
import type { DocumentPreset } from "../lib/schema";

export type EditorSnapshot = {
  project: Project;
  activeDocumentId: string;
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
    this.commit = onCommit;
    this.snapshot = {
      project,
      activeDocumentId: project.documents[0]?.id ?? "",
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
    const activeDocumentId = project.documents.some((document) => document.id === this.snapshot.activeDocumentId)
      ? this.snapshot.activeDocumentId
      : project.documents[0]?.id ?? "";
    this.updateSnapshot({
      project,
      activeDocumentId,
      selectedElementIds: this.validSelection(project, activeDocumentId, this.snapshot.selectedElementIds),
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      isInTransaction: false,
    });
  }

  setActiveDocument(documentId: string): void {
    if (!this.history.project.documents.some((document) => document.id === documentId)) return;
    this.updateSnapshot({
      activeDocumentId: documentId,
      selectedElementIds: [],
    });
  }

  setSelection(elementIds: readonly string[]): void {
    const selectedElementIds = this.validSelection(this.history.project, this.snapshot.activeDocumentId, elementIds);
    this.updateSnapshot({ selectedElementIds });
  }

  toggleSelection(elementId: string, additive = false): void {
    const selected = new Set(additive ? this.snapshot.selectedElementIds : []);
    if (selected.has(elementId)) selected.delete(elementId);
    else selected.add(elementId);
    this.setSelection([...selected]);
  }

  selectAll(): void {
    const document = this.history.project.documents.find((candidate) => candidate.id === this.snapshot.activeDocumentId);
    this.setSelection(document?.elements.map((element) => element.id) ?? []);
  }

  setZoom(zoom: number): void {
    this.updateSnapshot({ zoom: Math.min(3, Math.max(0.08, Number.isFinite(zoom) ? zoom : 0.45)) });
  }

  apply(label: string, operation: ProjectOperation): void {
    const project = this.history.apply(label, operation);
    if (project === this.snapshot.project) return;
    this.updateSnapshot({
      project,
      selectedElementIds: this.validSelection(project, this.snapshot.activeDocumentId, this.snapshot.selectedElementIds),
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
    this.updateSnapshot({
      project,
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      isInTransaction: false,
    });
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
    this.updateSnapshot({
      project,
      selectedElementIds: this.validSelection(project, this.snapshot.activeDocumentId, this.snapshot.selectedElementIds),
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      isInTransaction: false,
    });
    this.commit(project);
  }

  redo(): void {
    if (this.snapshot.isInTransaction) this.commitTransaction();
    const before = this.history.project;
    const project = this.history.redo();
    if (project === before) return;
    this.updateSnapshot({
      project,
      selectedElementIds: this.validSelection(project, this.snapshot.activeDocumentId, this.snapshot.selectedElementIds),
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      isInTransaction: false,
    });
    this.commit(project);
  }

  copy(): void {
    const document = this.activeDocument();
    const selected = document?.elements.filter((element) => this.snapshot.selectedElementIds.includes(element.id)) ?? [];
    this.clipboard = selected.map((element) => ({ ...element }));
    this.updateSnapshot({ clipboardCount: this.clipboard.length });
  }

  paste(): void {
    if (this.clipboard.length === 0) return;
    const documentId = this.snapshot.activeDocumentId;
    const clipboard = this.clipboard.map((element) => ({ ...element, id: createId(element.type) }));
    this.apply("Paste", (project) => clipboard.reduce((current, element, index) => addElement(current, documentId, {
      ...element,
      x: element.x + 24 + index * 8,
      y: element.y + 24 + index * 8,
    }), project));
    this.setSelection(clipboard.map((element) => element.id));
  }

  deleteSelection(): void {
    const ids = this.snapshot.selectedElementIds;
    if (ids.length === 0) return;
    const documentId = this.snapshot.activeDocumentId;
    this.apply("Delete selection", (project) => removeElements(project, documentId, ids));
    this.setSelection([]);
  }

  duplicateSelection(): void {
    const ids = this.snapshot.selectedElementIds;
    if (ids.length === 0) return;
    const documentId = this.snapshot.activeDocumentId;
    const beforeIds = new Set(this.activeDocument()?.elements.map((element) => element.id) ?? []);
    this.apply("Duplicate selection", (project) => duplicateElements(project, documentId, ids));
    const duplicatedIds = this.activeDocument()?.elements.filter((element) => !beforeIds.has(element.id)).map((element) => element.id) ?? [];
    this.setSelection(duplicatedIds);
  }

  duplicateElement(elementId: string): void {
    const documentId = this.snapshot.activeDocumentId;
    const beforeIds = new Set(this.activeDocument()?.elements.map((element) => element.id) ?? []);
    this.apply("Duplicate layer", (project) => duplicateElements(project, documentId, [elementId]));
    const duplicated = this.activeDocument()?.elements.find((element) => !beforeIds.has(element.id));
    if (duplicated) this.setSelection([duplicated.id]);
  }

  reorderElementByDirection(elementId: string, direction: -1 | 1): void {
    const document = this.activeDocument();
    if (!document) return;
    const ordered = [...document.elements].sort((left, right) => left.zIndex - right.zIndex);
    const index = ordered.findIndex((element) => element.id === elementId);
    if (index < 0) return;
    const documentId = document.id;
    this.apply("Reorder layer", (project) => reorderElements(project, documentId, [elementId], index + direction));
  }

  reorderElementToIndex(elementId: string, targetIndex: number): void {
    const document = this.activeDocument();
    if (!document) return;
    const selectedIds = this.snapshot.selectedElementIds.includes(elementId)
      ? this.snapshot.selectedElementIds
      : [elementId];
    const documentId = document.id;
    this.apply("Reorder layer", (project) => reorderElements(project, documentId, selectedIds, targetIndex));
  }

  bringForward(): void { this.reorderSelection(1, "Bring forward"); }
  sendBackward(): void { this.reorderSelection(-1, "Send backward"); }
  bringToFront(): void { this.reorderSelection(9999, "Bring to front"); }
  sendToBack(): void { this.reorderSelection(0, "Send to back"); }

  nudge(delta: MoveDelta): void {
    const ids = this.editableSelectedIds();
    if (ids.length === 0) return;
    const documentId = this.snapshot.activeDocumentId;
    this.apply("Nudge selection", (project) => moveElements(project, documentId, ids, delta));
  }

  updateElement(elementId: string, patch: ElementPatch): void {
    const documentId = this.snapshot.activeDocumentId;
    this.apply("Update element", (project) => updateElement(project, documentId, elementId, patch));
  }

  updateElements(updates: ElementUpdate[] | Record<string, ElementPatch>): void {
    const documentId = this.snapshot.activeDocumentId;
    this.apply("Update elements", (project) => updateElements(project, documentId, updates));
  }

  moveSelection(delta: MoveDelta): void {
    const ids = this.editableSelectedIds();
    if (ids.length === 0) return;
    const documentId = this.snapshot.activeDocumentId;
    this.apply("Move selection", (project) => moveElements(project, documentId, ids, delta));
  }

  resizeElement(elementId: string, input: ResizeElementInput): void {
    const documentId = this.snapshot.activeDocumentId;
    this.apply("Resize element", (project) => resizeElement(project, documentId, elementId, input));
  }

  updateCurrentDocument(patch: DocumentPatch): void {
    const documentId = this.snapshot.activeDocumentId;
    this.apply("Update document", (project) => updateDocument(project, documentId, patch));
  }

  addDocument(preset: DocumentPreset, options?: AddDocumentOptions): void {
    this.apply("Add document", (project) => addDocument(project, preset, options));
  }

  duplicateCurrentDocument(): void {
    this.duplicateDocumentById(this.snapshot.activeDocumentId);
  }

  duplicateDocumentById(documentId: string): void {
    const before = this.history.project.documents.map((document) => document.id);
    this.apply("Duplicate document", (project) => duplicateDocument(project, documentId));
    const added = this.history.project.documents.find((document) => !before.includes(document.id));
    if (added) this.setActiveDocument(added.id);
  }

  removeCurrentDocument(): void {
    this.removeDocumentById(this.snapshot.activeDocumentId);
  }

  removeDocumentById(documentId: string): void {
    const index = this.history.project.documents.findIndex((document) => document.id === documentId);
    const wasActive = documentId === this.snapshot.activeDocumentId;
    this.apply("Delete document", (project) => removeDocument(project, documentId));
    if (!wasActive) return;
    const next = this.history.project.documents[Math.min(Math.max(index - 1, 0), this.history.project.documents.length - 1)];
    if (next) this.setActiveDocument(next.id);
  }

  reorderCurrentDocuments(documentIds: string[], targetIndex: number): void {
    this.apply("Reorder documents", (project) => reorderDocuments(project, documentIds, targetIndex));
  }

  reorderElementTo(elementId: string, targetElementId: string): void {
    const document = this.activeDocument();
    if (!document || elementId === targetElementId) return;
    const ordered = [...document.elements].sort((left, right) => left.zIndex - right.zIndex);
    const remaining = ordered.filter((element) => element.id !== elementId);
    const targetIndex = remaining.findIndex((element) => element.id === targetElementId);
    if (targetIndex < 0) return;
    const documentId = document.id;
    this.apply("Reorder layer", (project) => reorderElements(project, documentId, [elementId], targetIndex));
  }

  reorderDocumentTo(documentId: string, targetDocumentId: string): void {
    if (documentId === targetDocumentId) return;
    const remaining = this.history.project.documents.filter((document) => document.id !== documentId);
    const targetIndex = remaining.findIndex((document) => document.id === targetDocumentId);
    if (targetIndex < 0) return;
    this.reorderCurrentDocuments([documentId], targetIndex);
  }

  private reorderSelection(direction: number, label: string): void {
    const document = this.activeDocument();
    if (!document || this.snapshot.selectedElementIds.length === 0) return;
    const ordered = [...document.elements].sort((left, right) => left.zIndex - right.zIndex);
    const selected = new Set(this.snapshot.selectedElementIds);
    const currentIndex = Math.min(...ordered.filter((element) => selected.has(element.id)).map((element) => element.zIndex));
    const target = direction === 9999 ? ordered.length : direction === 0 ? 0 : currentIndex + direction;
    const documentId = document.id;
    this.apply(label, (project) => reorderElements(project, documentId, this.snapshot.selectedElementIds, target));
  }

  private activeDocument() {
    return this.history.project.documents.find((document) => document.id === this.snapshot.activeDocumentId);
  }

  private editableSelectedIds(): string[] {
    const selected = new Set(this.snapshot.selectedElementIds);
    return this.activeDocument()?.elements.filter((element) => selected.has(element.id) && !element.locked).map((element) => element.id) ?? [];
  }

  private validSelection(project: Project, documentId: string, ids: readonly string[]): string[] {
    const document = project.documents.find((candidate) => candidate.id === documentId);
    const available = new Set(document?.elements.map((element) => element.id) ?? []);
    return ids.filter((id) => available.has(id));
  }

  private updateSnapshot(values: Partial<EditorSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...values };
    for (const listener of this.listeners) listener();
  }
}
