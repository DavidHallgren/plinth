import { describe, expect, test } from "bun:test";
import { createDefaultProject, createDeckPreset, createScreenPreset } from "../src/lib/defaults";
import { ProjectSchema, type DeviceElement, type ImageElement, type Project, type ShapeElement } from "../src/lib/schema";
import {
  addDeck,
  addElement,
  addScreen,
  alignElements,
  distributeElements,
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
  replaceElement,
  resizeElement,
  updateScreen,
  updateElement,
  updateElements,
  updateDeck,
} from "../src/scene/operations";
import { elementAlignmentBounds } from "../src/scene/overflow";
import { ProjectHistory } from "../src/scene/history";
import { EditorStore } from "../src/app/editor-store";
import { ownedElements } from "./helpers";

const timestamp = "2026-08-02T00:00:00.000Z";

function shape(id: string, x = 20, y = 20): ShapeElement {
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

function fixture(): Project {
  const seed = createDefaultProject("Operations fixture", { now: timestamp });
  const deck = createDeckPreset("custom", {
    id: "deck_operations",
    name: "Operations deck",
    slug: "operations-deck",
    width: 400,
    height: 300,
    screenPreset: "blank",
    screenName: "Operations",
    screenSlug: "operations",
    screenExportSlug: "operations",
    now: timestamp,
  });
  const screen = createScreenPreset("blank", {
    id: "screen_operations",
    name: "Operations",
    slug: "operations",
    exportSlug: "operations",
    now: timestamp,
  });
  return ProjectSchema.parse({ ...seed, decks: [{ ...deck, screens: [screen] }] });
}

function firstScreen(project: Project) {
  const screen = project.decks[0]?.screens[0];
  if (!screen) throw new Error("Missing screen");
  return screen;
}

function elements(project: Project) {
  return ownedElements(firstScreen(project));
}

describe("scene operations", () => {
  test("adds, updates, moves, and removes normalized elements using deck bounds", () => {
    const project = fixture();
    const added = addElement(project, "screen_operations", shape("shape_one", 340, 280));
    const element = elements(added)[0];
    expect(element?.x).toBe(340);
    expect(element?.y).toBe(280);

    const updated = updateElement(added, "screen_operations", "shape_one", { name: "Updated", opacity: 0.4 });
    expect(elements(updated)[0]).toMatchObject({ name: "Updated", opacity: 0.4 });
    const moved = moveElements(updated, "screen_operations", ["shape_one"], { x: -1000, y: -1000 });
    expect(elements(moved)[0]).toMatchObject({ x: -99, y: -79 });
    const removed = removeElements(moved, "screen_operations", ["shape_one"]);
    expect(elements(removed)).toHaveLength(0);
  });

  test("keeps layer order valid and gives duplicates fresh identities", () => {
    let project = fixture();
    project = addElement(project, "screen_operations", shape("bottom", 0, 0));
    project = addElement(project, "screen_operations", shape("middle", 20, 20));
    project = addElement(project, "screen_operations", shape("top", 40, 40));
    project = reorderElements(project, "screen_operations", ["bottom"], 2);
    const ordered = elements(project);
    expect(ordered.map((element) => element.id)).toEqual(["middle", "top", "bottom"]);
    const duplicated = duplicateElements(project, "screen_operations", ["bottom"], { x: 10, y: 10 });
    const duplicatedElements = elements(duplicated);
    expect(duplicatedElements).toHaveLength(4);
    expect(new Set(duplicatedElements.map((element) => element.id)).size).toBe(4);
    expect(duplicatedElements.find((element) => element.name === "bottom copy")).toMatchObject({ x: 10, y: 10 });
  });

  test("normalizes negative resize transforms and clamps to fixed deck bounds", () => {
    const project = addElement(fixture(), "screen_operations", shape("resize_me", 40, 40));
    const resized = resizeElement(project, "screen_operations", "resize_me", { x: 50, y: 40, width: -800, height: -500, rotation: 32 });
    const element = elements(resized)[0];
    expect(element?.width).toBe(400);
    expect(element?.height).toBe(300);
    expect(element?.x).toBe(-399);
    expect(element?.y).toBe(-299);
    expect(element?.rotation).toBe(32);
    expect(() => addElement(resized, "screen_operations", shape("resize_me"))).toThrow(/already in use/);
  });

  test("normalizes committed geometry while preserving fractional visual properties", () => {
    const project = addElement(fixture(), "screen_operations", shape("resize_me", 40, 40));
    const transformed = updateElements(project, "screen_operations", [{
      id: "resize_me",
      patch: { x: 50.25, y: 40.75, width: 299.6, height: 199.4, rotation: 4.092700945, opacity: 0.437 },
    }]);
    const element = elements(transformed).find((candidate) => candidate.id === "resize_me");
    expect(element?.width).toBe(300);
    expect(element?.height).toBe(199);
    expect(element?.x).toBe(50);
    expect(element?.y).toBe(41);
    expect(element?.rotation).toBe(4.1);
    expect(element?.opacity).toBe(0.437);
  });

  test("preserves partially off-canvas layer positions while keeping a recovery edge", () => {
    const project = addElement(fixture(), "screen_operations", shape("off_canvas", 40, 40));
    const partiallyOutside = updateElement(project, "screen_operations", "off_canvas", { x: -45, y: 260 });
    expect(elements(partiallyOutside)[0]).toMatchObject({ x: -45, y: 260 });
    const beyondRecoveryEdge = updateElement(partiallyOutside, "screen_operations", "off_canvas", { x: -500, y: 500 });
    expect(elements(beyondRecoveryEdge)[0]).toMatchObject({ x: -99, y: 299 });
  });

  test("aligns transformed geometry on every selection edge while excluding shadows and locked layers", () => {
    let project = fixture();
    project = addElement(project, "screen_operations", {
      ...shape("rotated", 70, 40),
      width: 120,
      height: 60,
      rotation: 25,
      shadow: { color: "#000000", blur: 40, offsetX: 30, offsetY: 20, opacity: 0.5 },
    });
    project = addElement(project, "screen_operations", { ...shape("small", 230, 150), width: 45, height: 35 });
    project = addElement(project, "screen_operations", { ...shape("locked", 330, 250), locked: true });
    const ids = ["rotated", "small", "locked"];
    const cases = [
      ["left", "left"],
      ["horizontal-center", "horizontalCenter"],
      ["right", "right"],
      ["top", "top"],
      ["vertical-center", "verticalCenter"],
      ["bottom", "bottom"],
    ] as const;

    for (const [alignment, edge] of cases) {
      const aligned = alignElements(project, "screen_operations", ids, alignment);
      const arranged = elements(aligned);
      const firstBounds = elementAlignmentBounds(arranged.find((element) => element.id === "rotated")!);
      const secondBounds = elementAlignmentBounds(arranged.find((element) => element.id === "small")!);
      const firstValue = edge === "horizontalCenter" ? (firstBounds.left + firstBounds.right) / 2
        : edge === "verticalCenter" ? (firstBounds.top + firstBounds.bottom) / 2
          : firstBounds[edge];
      const secondValue = edge === "horizontalCenter" ? (secondBounds.left + secondBounds.right) / 2
        : edge === "verticalCenter" ? (secondBounds.top + secondBounds.bottom) / 2
          : secondBounds[edge];
      expect(secondValue).toBeCloseTo(firstValue, 8);
      expect(arranged.find((element) => element.id === "locked")).toMatchObject({ x: 330, y: 250, locked: true });
    }
  });

  test("distributes different-sized layers with equal gaps and fixed endpoints", () => {
    let project = fixture();
    project = addElement(project, "screen_operations", { ...shape("first", 10, 10), width: 40, height: 30 });
    project = addElement(project, "screen_operations", { ...shape("middle", 90, 70), width: 80, height: 60 });
    project = addElement(project, "screen_operations", { ...shape("last", 300, 220), width: 20, height: 20 });

    for (const distribution of ["horizontal", "vertical"] as const) {
      const distributed = distributeElements(project, "screen_operations", ["last", "middle", "first"], distribution);
      const arranged = elements(distributed).map((element) => ({ element, bounds: elementAlignmentBounds(element) }));
      const ordered = [...arranged].sort((left, right) => distribution === "horizontal" ? left.bounds.left - right.bounds.left : left.bounds.top - right.bounds.top);
      const gap = (left: typeof ordered[number], right: typeof ordered[number]) => distribution === "horizontal"
        ? right.bounds.left - left.bounds.right
        : right.bounds.top - left.bounds.bottom;
      expect(gap(ordered[0]!, ordered[1]!)).toBeCloseTo(gap(ordered[1]!, ordered[2]!), 8);
      expect(ordered[0]!.element.id).toBe("first");
      expect(ordered[2]!.element.id).toBe("last");
      expect(ordered[0]!.element).toMatchObject({ x: 10, y: 10 });
      expect(ordered[2]!.element).toMatchObject({ x: 300, y: 220 });
    }
  });

  test("preserves existing layer order when updating element or screen properties", () => {
    const project = createDefaultProject("Layer order fixture", { now: timestamp });
    const screen = firstScreen(project);
    const expectedOrder = screen.layers.map((layer) => layer.kind === "owned" ? layer.element.id : layer.elementId);
    const firstElementId = screen.layers.find((layer) => layer.kind === "owned")?.element.id ?? "";
    const updatedElement = updateElement(project, screen.id, firstElementId, { locked: true });
    const afterElementUpdate = firstScreen(updatedElement).layers.map((layer) => layer.kind === "owned" ? layer.element.id : layer.elementId);
    expect(afterElementUpdate).toEqual(expectedOrder);
    const updatedScreen = updateScreen(updatedElement, screen.id, { background: { type: "transparent" } });
    const afterScreenUpdate = firstScreen(updatedScreen).layers.map((layer) => layer.kind === "owned" ? layer.element.id : layer.elementId);
    expect(afterScreenUpdate).toEqual(expectedOrder);
  });

  test("replaces an image with a frame while preserving its layer identity and order", () => {
    const image: ImageElement = {
      id: "image_to_frame",
      type: "image",
      name: "Screenshot",
      x: 80,
      y: 30,
      width: 160,
      height: 220,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      shadow: null,
      assetPath: "assets/screenshot.png",
      fit: "cover",
      position: { x: 0.5, y: 0.5 },
      cornerRadius: 12,
      alt: "Screenshot",
    };
    let project = addElement(fixture(), "screen_operations", shape("below"));
    project = addElement(project, "screen_operations", image);
    const frame: DeviceElement = {
      id: image.id,
      type: "device",
      name: image.name,
      x: 106,
      y: 10,
      width: 108,
      height: 220,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      shadow: null,
      preset: "iphone-17-pro-max",
      deviceId: "iphone-17-pro-max",
      deviceName: "iPhone 17 Pro Max",
      frame: "phone",
      frameColor: "#182d55",
      screenColor: "#f7f8fc",
      screenshotPath: image.assetPath,
      screenshotFit: image.fit,
      screenshotPosition: image.position,
      bezelStyle: "solid",
      cornerRadius: null,
      screenCornerRadius: null,
      showGlare: false,
      showCamera: true,
    };
    const replaced = replaceElement(project, "screen_operations", image.id, frame);
    expect(elements(replaced).map((element) => element.id)).toEqual(["below", image.id]);
    expect(elements(replaced)[1]).toMatchObject({ type: "device", screenshotPath: image.assetPath, preset: "iphone-17-pro-max" });
    expect(() => replaceElement(project, "screen_operations", image.id, { ...frame, id: "different" })).toThrow(/preserve their existing id/);
  });

  test("does not move, resize, or transform locked elements", () => {
    const project = updateElement(addElement(fixture(), "screen_operations", shape("locked_shape", 40, 50)), "screen_operations", "locked_shape", { locked: true });
    const moved = moveElements(project, "screen_operations", ["locked_shape"], { x: 100, y: 100 });
    const resized = resizeElement(project, "screen_operations", "locked_shape", { x: 12, y: 14, width: 220, height: 180, rotation: 30 });
    const patched = updateElement(project, "screen_operations", "locked_shape", { x: 12, y: 14, width: 220, height: 180, rotation: 30, name: "Still locked" });
    const original = elements(project)[0];
    expect(moved).toBe(project);
    expect(resized).toBe(project);
    expect(elements(moved)[0]).toEqual(original);
    expect(elements(resized)[0]).toEqual(original);
    expect(elements(patched)[0]).toMatchObject({ x: 40, y: 50, width: 100, height: 80, rotation: 0, name: "Still locked", locked: true });
  });

  test("adds, duplicates, reorders, and protects final decks and screens", () => {
    const project = fixture();
    const deckId = project.decks[0]?.id ?? "";
    const withScreen = addScreen(project, deckId, "ipad-13", { name: "Second screen", slug: "second-screen", exportSlug: "second-screen" });
    const second = withScreen.decks[0]?.screens[1];
    expect(second).toMatchObject({ name: "Second screen", preset: "ipad-13" });
    expect(withScreen.decks[0]?.width).toBe(400);
    expect(withScreen.decks[0]?.height).toBe(300);
    expect(second && Object.hasOwn(second, "width")).toBe(false);

    const duplicate = duplicateScreen(withScreen, deckId, second?.id ?? "");
    expect(duplicate.decks[0]?.screens).toHaveLength(3);
    expect(new Set(duplicate.decks[0]?.screens.map((screen) => screen.id)).size).toBe(3);
    const reorderedScreens = reorderScreens(duplicate, deckId, [duplicate.decks[0]?.screens[2]?.id ?? ""], 0);
    expect(reorderedScreens.decks[0]?.screens[0]?.id).toBe(duplicate.decks[0]?.screens[2]?.id);
    const removedScreen = removeScreen(reorderedScreens, deckId, reorderedScreens.decks[0]?.screens[0]?.id ?? "");
    expect(removedScreen.decks[0]?.screens).toHaveLength(2);
    expect(() => removeScreen(project, deckId, project.decks[0]?.screens[0]?.id ?? "")).toThrow(/at least one screen/);

    const withDeck = addDeck(project, { name: "iPad deck", slug: "ipad-deck", width: 640, height: 1136, screenPreset: "custom", now: timestamp });
    expect(withDeck.decks[1]).toMatchObject({ name: "iPad deck", width: 640, height: 1136 });
    const duplicatedDeck = duplicateDeck(withDeck, deckId);
    expect(duplicatedDeck.decks).toHaveLength(3);
    expect(new Set(duplicatedDeck.decks.map((deck) => deck.id)).size).toBe(3);
    const reorderedDecks = reorderDecks(duplicatedDeck, [duplicatedDeck.decks[2]?.id ?? ""], 0);
    expect(reorderedDecks.decks[0]?.id).toBe(duplicatedDeck.decks[2]?.id);
    const removedDeck = removeDeck(reorderedDecks, reorderedDecks.decks[0]?.id ?? "");
    expect(removedDeck.decks).toHaveLength(2);
    expect(() => removeDeck(project, deckId)).toThrow(/at least one deck/);
  });

  test("never permits ordinary screen dimension updates", () => {
    const screen = firstScreen(fixture());
    expect(() => updateScreen(fixture(), screen.id, { width: 800 } as never)).toThrow(/inherited from its deck/);
  });

  test("renames decks while keeping their creation dimensions immutable", () => {
    const project = fixture();
    const deck = project.decks[0];
    if (!deck) throw new Error("Missing deck");
    const renamed = updateDeck(project, deck.id, { name: "Renamed deck", slug: "renamed-deck" });
    expect(renamed.decks[0]).toMatchObject({ name: "Renamed deck", slug: "renamed-deck", width: deck.width, height: deck.height });
    expect(() => updateDeck(project, deck.id, { width: 800 } as never)).toThrow(/immutable/);
  });
});

describe("operation history", () => {
  test("commits a completed editor gesture once for autosave", () => {
    const initial = addElement(fixture(), "screen_operations", shape("dragged", 10, 10));
    const commits: Project[] = [];
    const store = new EditorStore(initial, (project) => commits.push(project));
    store.setSelection(["dragged"]);
    store.beginTransaction("Drag");
    store.moveSelection({ x: 10, y: 0 });
    store.moveSelection({ x: 5, y: 0 });

    expect(commits).toHaveLength(0);
    store.commitTransaction();
    expect(commits).toHaveLength(1);
    expect(elements(store.getSnapshot().project)[0]).toMatchObject({ x: 25, y: 10 });

    store.undo();
    expect(commits).toHaveLength(2);
    expect(elements(store.getSnapshot().project)[0]).toMatchObject({ x: 10, y: 10 });
  });

  test("does not nudge a locked-only selection", () => {
    const initial = updateElement(addElement(fixture(), "screen_operations", shape("locked", 10, 10)), "screen_operations", "locked", { locked: true });
    const commits: Project[] = [];
    const store = new EditorStore(initial, (project) => commits.push(project));
    store.setSelection(["locked"]);
    store.nudge({ x: 10, y: 10 });
    expect(commits).toHaveLength(0);
    expect(elements(store.getSnapshot().project)[0]).toMatchObject({ x: 10, y: 10, locked: true });
  });

  test("commits an alignment as one undoable project change", () => {
    let initial = addElement(fixture(), "screen_operations", shape("first", 10, 10));
    initial = addElement(initial, "screen_operations", shape("second", 200, 100));
    const commits: Project[] = [];
    const store = new EditorStore(initial, (project) => commits.push(project));
    store.setSelection(["first", "second"]);
    store.alignSelection("left");

    expect(commits).toHaveLength(1);
    expect(elements(store.getSnapshot().project).map((element) => element.x)).toEqual([10, 10]);
    expect(store.getSnapshot().selectedElementIds).toEqual(["first", "second"]);
    store.undo();
    expect(elements(store.getSnapshot().project).map((element) => element.x)).toEqual([10, 200]);
  });

  test("keeps zoom when switching active decks and screens", () => {
    const initial = addDeck(fixture(), { name: "Second deck", width: 600, height: 800, screenPreset: "blank" });
    const store = new EditorStore(initial, () => undefined);
    const nextDeck = initial.decks[1];
    const nextScreen = nextDeck?.screens[0];
    if (!nextDeck || !nextScreen) throw new Error("Missing second deck.");
    store.setZoom(0.72);
    store.setActiveDeck(nextDeck.id);
    expect(store.getSnapshot()).toMatchObject({ activeDeckId: nextDeck.id, activeScreenId: nextScreen.id, zoom: 0.72 });
  });

  test("clears undo and redo when an external asset snapshot replaces the project", () => {
    const initial = fixture();
    const store = new EditorStore(initial, () => undefined);
    store.apply("Add local shape", (project) => addElement(project, "screen_operations", shape("local", 10, 10)));
    expect(store.getSnapshot().canUndo).toBe(true);

    const external = { ...store.getSnapshot().project, assets: [] };
    store.replaceExternalProject(external);
    expect(store.getSnapshot()).toMatchObject({ project: external, canUndo: false, canRedo: false, isInTransaction: false });
    store.undo();
    expect(store.getSnapshot().project).toBe(external);
  });

  test("coalesces a gesture and supports bounded undo/redo", () => {
    const initial = fixture();
    const history = new ProjectHistory(initial, 100);
    history.beginTransaction("Drag");
    history.apply("drag move", (project) => addElement(project, "screen_operations", shape("dragged", 10, 10)));
    history.apply("drag resize", (project) => resizeElement(project, "screen_operations", "dragged", { x: 10, y: 10, width: 180, height: 140 }));
    history.commitTransaction();
    expect(history.past).toHaveLength(1);
    expect(history.canUndo).toBe(true);
    const undone = history.undo();
    expect(elements(undone)).toHaveLength(0);
    expect(elements(history.redo())[0]).toMatchObject({ width: 180, height: 140 });

    for (let index = 0; index < 110; index += 1) {
      history.apply(`move-${index}`, (project) => updateElement(project, "screen_operations", "dragged", { x: index }));
    }
    expect(history.past.length).toBe(100);
  });
});
