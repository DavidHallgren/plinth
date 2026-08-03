import { describe, expect, test } from "bun:test";
import { createDefaultProject, createDocumentPreset } from "../src/lib/defaults";
import { ProjectSchema, type Project, type ShapeElement } from "../src/lib/schema";
import {
  addDocument,
  addElement,
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
} from "../src/scene/operations";
import { ProjectHistory } from "../src/scene/history";
import { EditorStore } from "../src/app/editor-store";

function shape(id: string, x = 20, y = 20, zIndex = 0): ShapeElement {
  return {
    id,
    type: "shape",
    name: id,
    x,
    y,
    width: 100,
    height: 80,
    rotation: 0,
    opacity: 1,
    zIndex,
    locked: false,
    visible: true,
    shadow: null,
    shape: "rounded-rectangle",
    fill: "#9d8cff",
    stroke: "#ffffff",
    strokeWidth: 1,
    radius: 12,
  };
}

function fixture() {
  const seed = createDefaultProject("Operations fixture", { now: "2026-08-02T00:00:00.000Z" });
  const document = createDocumentPreset("custom", {
    id: "doc_operations",
    name: "Operations",
    slug: "operations",
    width: 400,
    height: 300,
    now: "2026-08-02T00:00:00.000Z",
  });
  return ProjectSchema.parse({ ...seed, documents: [document] });
}

describe("scene operations", () => {
  test("adds, updates, moves, and removes normalized elements", () => {
    const project = fixture();
    const added = addElement(project, "doc_operations", shape("shape_one", 340, 280));
    const element = added.documents[0]?.elements[0];
    expect(element?.zIndex).toBe(0);
    expect(element?.x).toBe(340);
    expect(element?.y).toBe(280);

    const updated = updateElement(added, "doc_operations", "shape_one", { name: "Updated", opacity: 0.4 });
    expect(updated.documents[0]?.elements[0]).toMatchObject({ name: "Updated", opacity: 0.4 });
    const moved = moveElements(updated, "doc_operations", ["shape_one"], { x: -1000, y: -1000 });
    expect(moved.documents[0]?.elements[0]).toMatchObject({ x: -99, y: -79 });
    const removed = removeElements(moved, "doc_operations", ["shape_one"]);
    expect(removed.documents[0]?.elements).toHaveLength(0);
  });

  test("keeps z-order valid and gives duplicates fresh identities", () => {
    let project = fixture();
    project = addElement(project, "doc_operations", shape("bottom", 0, 0));
    project = addElement(project, "doc_operations", shape("middle", 20, 20));
    project = addElement(project, "doc_operations", shape("top", 40, 40));
    project = reorderElements(project, "doc_operations", ["bottom"], 2);
    const ordered = [...(project.documents[0]?.elements ?? [])].sort((a, b) => a.zIndex - b.zIndex);
    expect(ordered.map((element) => element.id)).toEqual(["middle", "top", "bottom"]);
    const duplicated = duplicateElements(project, "doc_operations", ["bottom"], { x: 10, y: 10 });
    const elements = duplicated.documents[0]?.elements ?? [];
    expect(elements).toHaveLength(4);
    expect(new Set(elements.map((element) => element.id)).size).toBe(4);
    expect(elements.find((element) => element.name === "bottom copy")).toMatchObject({ x: 10, y: 10, zIndex: 3 });
    expect(new Set(elements.map((element) => element.zIndex)).size).toBe(elements.length);
  });

  test("normalizes negative resize transforms and clamps to document bounds", () => {
    const project = addElement(fixture(), "doc_operations", shape("resize_me", 40, 40));
    const resized = resizeElement(project, "doc_operations", "resize_me", { x: 50, y: 40, width: -800, height: -500, rotation: 32 });
    const element = resized.documents[0]?.elements[0];
    expect(element?.width).toBe(400);
    expect(element?.height).toBe(300);
    expect(element?.x).toBe(-399);
    expect(element?.y).toBe(-299);
    expect(element?.rotation).toBe(32);
    expect(() => addElement(resized, "doc_operations", shape("resize_me"))).toThrow(/already in use/);
  });

  test("normalizes committed geometry while preserving fractional visual properties", () => {
    const project = addElement(fixture(), "doc_operations", shape("resize_me", 40, 40));
    const transformed = updateElements(project, "doc_operations", [{
      id: "resize_me",
      patch: { x: 50.25, y: 40.75, width: 299.6, height: 199.4, rotation: 4.092700945, opacity: 0.437 },
    }]);
    const element = transformed.documents[0]?.elements.find((candidate) => candidate.id === "resize_me");
    expect(element?.width).toBe(300);
    expect(element?.height).toBe(199);
    expect(element?.x).toBe(50);
    expect(element?.y).toBe(41);
    expect(element?.rotation).toBe(4.1);
    expect(element?.opacity).toBe(0.437);
  });

  test("preserves partially off-canvas layer positions while keeping a recovery edge", () => {
    const project = addElement(fixture(), "doc_operations", shape("off_canvas", 40, 40));
    const partiallyOutside = updateElement(project, "doc_operations", "off_canvas", { x: -45, y: 260 });
    expect(partiallyOutside.documents[0]?.elements[0]).toMatchObject({ x: -45, y: 260 });

    const beyondRecoveryEdge = updateElement(partiallyOutside, "doc_operations", "off_canvas", { x: -500, y: 500 });
    expect(beyondRecoveryEdge.documents[0]?.elements[0]).toMatchObject({ x: -99, y: 299 });
  });

  test("preserves existing z-order when updating element or document properties", () => {
    const project = createDefaultProject("Layer order fixture", { now: "2026-08-02T00:00:00.000Z" });
    const document = project.documents[0];
    if (!document) throw new Error("Missing document");
    const expectedOrder = [...document.elements].sort((left, right) => left.zIndex - right.zIndex).map((element) => element.id);

    const updatedElement = updateElement(project, document.id, document.elements[0]?.id ?? "", { locked: true });
    const afterElementUpdate = updatedElement.documents[0]?.elements.slice().sort((left, right) => left.zIndex - right.zIndex).map((element) => element.id);
    expect(afterElementUpdate).toEqual(expectedOrder);

    const updatedDocument = updateDocument(updatedElement, document.id, { background: { type: "transparent" } });
    const afterDocumentUpdate = updatedDocument.documents[0]?.elements.slice().sort((left, right) => left.zIndex - right.zIndex).map((element) => element.id);
    expect(afterDocumentUpdate).toEqual(expectedOrder);
  });

  test("does not move, resize, or transform locked elements", () => {
    const project = updateElement(addElement(fixture(), "doc_operations", shape("locked_shape", 40, 50)), "doc_operations", "locked_shape", { locked: true });
    const moved = moveElements(project, "doc_operations", ["locked_shape"], { x: 100, y: 100 });
    const resized = resizeElement(project, "doc_operations", "locked_shape", { x: 12, y: 14, width: 220, height: 180, rotation: 30 });
    const patched = updateElement(project, "doc_operations", "locked_shape", { x: 12, y: 14, width: 220, height: 180, rotation: 30, name: "Still locked" });
    const original = project.documents[0]?.elements[0];
    expect(moved).toBe(project);
    expect(resized).toBe(project);
    expect(moved.documents[0]?.elements[0]).toEqual(original);
    expect(resized.documents[0]?.elements[0]).toEqual(original);
    expect(patched.documents[0]?.elements[0]).toMatchObject({ x: 40, y: 50, width: 100, height: 80, rotation: 0, name: "Still locked", locked: true });
  });

  test("adds, duplicates, reorders, and protects the final document", () => {
    const project = fixture();
    const withIpad = addDocument(project, "ipad-13", { name: "iPad frame" });
    expect(withIpad.documents[1]).toMatchObject({ name: "iPad frame", width: 2064, height: 2752, preset: "ipad-13" });
    const custom = addDocument(project, "custom", { name: "Custom frame", width: 640, height: 1136 });
    expect(custom.documents[1]).toMatchObject({ name: "Custom frame", width: 640, height: 1136, preset: "custom" });
    const duplicate = duplicateDocument(withIpad, "doc_operations");
    expect(duplicate.documents).toHaveLength(3);
    expect(new Set(duplicate.documents.map((document) => document.id)).size).toBe(3);
    expect(new Set(duplicate.documents.flatMap((document) => document.elements.map((element) => element.id))).size).toBe(
      duplicate.documents.reduce((count, document) => count + document.elements.length, 0),
    );
    const reordered = reorderDocuments(duplicate, [duplicate.documents[2]?.id ?? ""], 0);
    expect(reordered.documents[0]?.id).toBe(duplicate.documents[2]?.id);
    const removed = removeDocument(reordered, reordered.documents[0]?.id ?? "");
    expect(removed.documents).toHaveLength(2);
    expect(() => removeDocument(fixture(), "doc_operations")).toThrow(/at least one document/);
  });
});

describe("operation history", () => {
  test("commits a completed editor gesture once for autosave", () => {
    const initial = addElement(fixture(), "doc_operations", shape("dragged", 10, 10));
    const commits: Project[] = [];
    const store = new EditorStore(initial, (project) => commits.push(project));
    store.setSelection(["dragged"]);
    store.beginTransaction("Drag");
    store.moveSelection({ x: 10, y: 0 });
    store.moveSelection({ x: 5, y: 0 });

    expect(commits).toHaveLength(0);
    store.commitTransaction();
    expect(commits).toHaveLength(1);
    expect(store.getSnapshot().project.documents[0]?.elements[0]).toMatchObject({ x: 25, y: 10 });

    store.undo();
    expect(commits).toHaveLength(2);
    expect(store.getSnapshot().project.documents[0]?.elements[0]).toMatchObject({ x: 10, y: 10 });
  });

  test("does not nudge a locked-only selection", () => {
    const initial = updateElement(addElement(fixture(), "doc_operations", shape("locked", 10, 10)), "doc_operations", "locked", { locked: true });
    const commits: Project[] = [];
    const store = new EditorStore(initial, (project) => commits.push(project));
    store.setSelection(["locked"]);
    store.nudge({ x: 10, y: 10 });

    expect(commits).toHaveLength(0);
    expect(store.getSnapshot().project.documents[0]?.elements[0]).toMatchObject({ x: 10, y: 10, locked: true });
  });

  test("leaves zoom fitting to the viewport when switching documents", () => {
    const initial = addDocument(fixture(), "ipad-13", { name: "iPad frame" });
    const store = new EditorStore(initial, () => undefined);
    const nextDocumentId = initial.documents[1]?.id;
    if (!nextDocumentId) throw new Error("Missing second document");

    store.setZoom(0.72);
    store.setActiveDocument(nextDocumentId);

    expect(store.getSnapshot()).toMatchObject({ activeDocumentId: nextDocumentId, zoom: 0.72 });
  });

  test("coalesces a gesture and supports bounded undo/redo", () => {
    const initial = fixture();
    const history = new ProjectHistory(initial, 100);
    history.beginTransaction("Drag");
    history.apply("drag move", (project) => addElement(project, "doc_operations", shape("dragged", 10, 10)));
    history.apply("drag resize", (project) => resizeElement(project, "doc_operations", "dragged", { x: 10, y: 10, width: 180, height: 140 }));
    history.commitTransaction();
    expect(history.past).toHaveLength(1);
    expect(history.canUndo).toBe(true);
    const undone = history.undo();
    expect(undone.documents[0]?.elements).toHaveLength(0);
    expect(history.redo().documents[0]?.elements[0]).toMatchObject({ width: 180, height: 140 });

    for (let index = 0; index < 110; index += 1) {
      history.apply(`noop-${index}`, (project) => updateElement(project, "doc_operations", "dragged", { x: index }));
    }
    expect(history.past.length).toBe(100);
  });
});
