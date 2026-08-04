import { describe, expect, test } from "bun:test";
import { sceneReadiness } from "../src/canvas/export-readiness";
import { createDefaultProject, createDeckPreset, createScreenPreset } from "../src/lib/defaults";
import { parseProject } from "../src/lib/migrations";
import { ProjectSchema, type Project, type ShapeElement } from "../src/lib/schema";
import {
  addElement,
  duplicateDeck,
  moveElements,
  removeScreen,
  reorderElements,
  reorderScreens,
  toggleElementOverflow,
  transferElementOwnership,
  updateElement,
} from "../src/scene/operations";
import { elementLocalBounds, overflowTargetScreenIds } from "../src/scene/overflow";
import { resolveScreen } from "../src/scene/selectors";

const timestamp = "2026-08-02T00:00:00.000Z";

function shape(id: string, values: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id,
    type: "shape",
    name: id,
    x: 20,
    y: 20,
    width: 100,
    height: 80,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    locked: false,
    visible: true,
    shadow: null,
    shape: "rectangle",
    fill: "#9d8cff",
    stroke: "#ffffff",
    strokeWidth: 1,
    radius: 12,
    ...values,
  };
}

function fixture(screenCount = 3): Project {
  const seed = createDefaultProject("Overflow fixture", { now: timestamp });
  const deck = createDeckPreset("custom", {
    id: "deck_overflow",
    name: "Overflow deck",
    slug: "overflow-deck",
    width: 400,
    height: 300,
    screenPreset: "blank",
    now: timestamp,
  });
  const first = deck.screens[0];
  if (!first) throw new Error("Missing first screen.");
  const screens = [
    { ...first, id: "screen_1", slug: "screen-1", exportSlug: "screen-1" },
    ...Array.from({ length: Math.max(0, screenCount - 1) }, (_, index) => createScreenPreset("blank", {
      id: `screen_${index + 2}`,
      name: `Screen ${index + 2}`,
      slug: `screen-${index + 2}`,
      exportSlug: `screen-${index + 2}`,
      now: timestamp,
    })),
  ];
  return ProjectSchema.parse({ ...seed, decks: [{ ...deck, screens }] });
}

function ownerScreen(project: Project, elementId: string): string | undefined {
  return project.decks[0]?.screens.find((screen) => screen.layers.some((layer) => layer.kind === "owned" && layer.element.id === elementId))?.id;
}

describe("screen overflow model", () => {
  test("migrates v6 elements and z-order into canonical v7 owned layers", () => {
    const project = fixture(1);
    const screen = project.decks[0]?.screens[0];
    if (!screen) throw new Error("Missing screen.");
    const rawV6 = {
      ...project,
      schemaVersion: 6,
      decks: project.decks.map((deck) => ({
        ...deck,
        screens: deck.screens.map((candidate) => ({
          ...candidate,
          elements: candidate.layers
            .filter((layer) => layer.kind === "owned")
            .map((layer, index) => ({ ...layer.element, zIndex: candidate.layers.length - index })),
          layers: undefined,
        })),
      })),
    };
    const migrated = parseProject(rawV6);
    expect(migrated.schemaVersion).toBe(7);
    expect(migrated.decks[0]?.screens[0]?.layers.every((layer) => layer.kind === "owned" && layer.overflow === false)).toBe(true);
    expect(JSON.stringify(migrated)).not.toContain("\"elements\"");
    expect(JSON.stringify(migrated)).not.toContain("\"zIndex\"");
  });

  test("creates left, right, and multi-screen links with translated target coordinates", () => {
    let project = fixture(3);
    project = addElement(project, "screen_1", shape("right", { x: 350, width: 120 }));
    project = addElement(project, "screen_2", shape("left", { x: -50, width: 120, y: 100 }));
    project = addElement(project, "screen_1", shape("wide", { x: 350, width: 850, y: 180 }));
    project = toggleElementOverflow(project, "screen_1", "right", true);
    project = toggleElementOverflow(project, "screen_2", "left", true);
    project = toggleElementOverflow(project, "screen_1", "wide", true);

    const screens = project.decks[0]?.screens ?? [];
    expect(screens[0]?.layers.filter((layer) => layer.kind === "overflow-link").map((layer) => layer.elementId)).toEqual(["left"]);
    expect(screens[1]?.layers.filter((layer) => layer.kind === "overflow-link").map((layer) => layer.elementId)).toEqual(["right", "wide"]);
    expect(screens[2]?.layers.filter((layer) => layer.kind === "overflow-link").map((layer) => layer.elementId)).toEqual(["wide"]);

    const resolved = resolveScreen(project, "screen_2").elements;
    expect(resolved.find((element) => element.id === "right")).toMatchObject({ x: -50, ownerScreenId: "screen_1", targetScreenId: "screen_2", isOverflowLink: true });
    expect(resolved.find((element) => element.id === "wide")).toMatchObject({ x: -50, ownerScreenId: "screen_1", targetScreenId: "screen_2", isOverflowLink: true });

    const disabled = toggleElementOverflow(project, "screen_1", "wide", false);
    expect(disabled.decks[0]?.screens.flatMap((screen) => screen.layers).some((layer) => layer.kind === "overflow-link" && layer.elementId === "wide")).toBe(false);
    const moved = updateElement(disabled, "screen_1", "right", { x: 40 });
    expect(moved.decks[0]?.screens[1]?.layers.some((layer) => layer.kind === "overflow-link" && layer.elementId === "right")).toBe(false);
  });

  test("reorders a target link independently of the owner screen", () => {
    let project = fixture(2);
    project = addElement(project, "screen_1", shape("first", { x: 350 }));
    project = addElement(project, "screen_1", shape("second", { x: 360, y: 120 }));
    project = toggleElementOverflow(project, "screen_1", "first", true);
    project = toggleElementOverflow(project, "screen_1", "second", true);
    const beforeOwner = project.decks[0]?.screens[0]?.layers.map((layer) => layer.kind === "owned" ? layer.element.id : layer.elementId);
    project = reorderElements(project, "screen_2", ["first"], 0);
    expect(project.decks[0]?.screens[1]?.layers.map((layer) => layer.kind === "owned" ? layer.element.id : layer.elementId)).toEqual(["first", "second"]);
    expect(project.decks[0]?.screens[0]?.layers.map((layer) => layer.kind === "owned" ? layer.element.id : layer.elementId)).toEqual(beforeOwner);
  });

  test("transfers ownership after a move leaves the owner and exposes an explicit transfer operation", () => {
    let project = fixture(3);
    project = addElement(project, "screen_1", shape("moving", { x: 320, width: 80 }));
    project = toggleElementOverflow(project, "screen_1", "moving", true);
    project = moveElements(project, "screen_1", ["moving"], { x: 180, y: 0 });
    expect(ownerScreen(project, "moving")).toBe("screen_2");
    const ownerLayer = project.decks[0]?.screens[1]?.layers.find((layer) => layer.kind === "owned" && layer.element.id === "moving");
    expect(ownerLayer?.kind === "owned" && ownerLayer.element.x).toBe(100);
    expect(project.decks[0]?.screens.flatMap((screen) => screen.layers).filter((layer) => layer.kind === "overflow-link" && layer.elementId === "moving")).toHaveLength(0);

    const explicit = transferElementOwnership(project, "moving", "screen_1");
    expect(ownerScreen(explicit, "moving")).toBe("screen_1");
    const explicitOwner = explicit.decks[0]?.screens[0]?.layers.find((layer) => layer.kind === "owned" && layer.element.id === "moving");
    expect(explicitOwner?.kind === "owned" && explicitOwner.element.x).toBe(500);
    expect(explicit.decks[0]?.screens[1]?.layers.some((layer) => layer.kind === "overflow-link" && layer.elementId === "moving")).toBe(true);
  });

  test("removes stale links and transfers owned content when screens are reordered or deleted", () => {
    let project = fixture(3);
    project = addElement(project, "screen_1", shape("content", { x: 350, width: 100 }));
    project = toggleElementOverflow(project, "screen_1", "content", true);
    project = reorderScreens(project, "deck_overflow", ["screen_1"], 2);
    expect(project.decks[0]?.screens.map((screen) => screen.id)).toEqual(["screen_2", "screen_3", "screen_1"]);
    expect(project.decks[0]?.screens.flatMap((screen) => screen.layers).some((layer) => layer.kind === "overflow-link" && layer.ownerScreenId === "screen_1")).toBe(false);
    project = removeScreen(project, "deck_overflow", "screen_1");
    expect(project.decks[0]?.screens).toHaveLength(2);
    expect(ownerScreen(project, "content")).toBe("screen_3");
    expect(project.decks[0]?.screens.flatMap((screen) => screen.layers).some((layer) => layer.kind === "overflow-link" && layer.ownerScreenId === "screen_1")).toBe(false);
    expect(() => ProjectSchema.parse({
      ...project,
      decks: project.decks.map((deck) => ({
        ...deck,
        screens: deck.screens.map((screen, index) => index === 0
          ? { ...screen, layers: [{ kind: "overflow-link", elementId: "missing", ownerScreenId: "missing-screen" }] }
        : screen),
      })),
    })).toThrow(/Overflow link references missing/);
    expect(() => ProjectSchema.parse({
      ...project,
      decks: project.decks.map((deck) => ({
        ...deck,
        screens: deck.screens.map((screen, index) => index === 0
          ? { ...screen, layers: [{ kind: "overflow-link", elementId: "content", ownerScreenId: screen.id }] }
          : screen),
      })),
    })).toThrow(/owner screen/);
  });

  test("duplicates a deck with remapped overflow links and unique canonical ids", () => {
    let project = fixture(2);
    project = addElement(project, "screen_1", shape("duplicated", { x: 350, width: 120 }));
    project = toggleElementOverflow(project, "screen_1", "duplicated", true);
    const duplicated = duplicateDeck(project, "deck_overflow");
    const copy = duplicated.decks[1];
    if (!copy) throw new Error("Missing duplicated deck.");
    const ownedIds = new Set(copy.screens.flatMap((screen) => screen.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element.id] : [])));
    const copiedLinks = copy.screens.flatMap((screen) => screen.layers.filter((layer) => layer.kind === "overflow-link"));
    expect(copiedLinks).toHaveLength(1);
    const link = copiedLinks[0];
    expect(link?.kind === "overflow-link" && ownedIds.has(link.elementId)).toBe(true);
    expect(link?.kind === "overflow-link" && copy.screens.some((screen) => screen.id === link.ownerScreenId)).toBe(true);
    expect(ownedIds.has("duplicated")).toBe(false);
    expect(new Set(duplicated.decks.flatMap((deck) => deck.screens.flatMap((screen) => screen.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element.id] : [])))).size).toBe(duplicated.decks.flatMap((deck) => deck.screens.flatMap((screen) => screen.layers.flatMap((layer) => layer.kind === "owned" ? [layer.element.id] : []))).length);
  });

  test("includes conservative rotated, stroke, shadow, and text bounds in readiness and target selection", () => {
    const deck = createDeckPreset("custom", { width: 400, height: 300, screenPreset: "blank", now: timestamp });
    const rotated = shape("rotated", { x: 395, width: 10, height: 80, rotation: 45, strokeWidth: 12, shadow: { color: "#000", blur: 20, offsetX: 8, offsetY: 4, opacity: 0.4 } });
    expect(overflowTargetScreenIds(deck, deck.screens[0]?.id ?? "", rotated)).toEqual([]);
    const bounds = elementLocalBounds(rotated);
    expect(bounds.right - bounds.left).toBeGreaterThan(80);

    let project = fixture(2);
    const image = {
      id: "linked-image",
      type: "image" as const,
      name: "Linked image",
      x: 350,
      y: 20,
      width: 120,
      height: 100,
      rotation: 0,
      opacity: 1,
      locked: false,
      visible: true,
      shadow: null,
      assetPath: "assets/linked.png" as const,
      fit: "cover" as const,
      position: { x: 0.5, y: 0.5 },
      cornerRadius: 0,
      alt: "linked",
    };
    const text = {
      id: "linked-text",
      type: "text" as const,
      name: "Linked text",
      x: 350,
      y: 150,
      width: 120,
      height: 40,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      locked: false,
      visible: true,
      shadow: null,
      text: "Linked",
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 24,
        fontWeight: 400,
        lineHeight: 1.2,
        letterSpacing: 0,
        color: "#fff",
        align: "left" as const,
        backgroundColor: null,
        padding: 0,
        backgroundRadius: 0,
        shadow: null,
        autoHeight: true,
      },
    };
    project = { ...project, assets: [{ id: "asset_linked", kind: "image", path: "assets/linked.png", fileName: "linked.png", mimeType: "image/png", width: 120, height: 100, byteSize: 10 }] };
    project = toggleElementOverflow(addElement(addElement(project, "screen_1", image), "screen_1", text), "screen_1", "linked-image", true);
    project = toggleElementOverflow(project, "screen_1", "linked-text", true);
    const readiness = sceneReadiness(resolveScreen(project, "screen_2"));
    expect(readiness.assetPaths).toEqual(["assets/linked.png"]);
    expect(readiness.fontFamilies).toContain("Arial, sans-serif");
  });

  test("keeps independent deck-resolved export dimensions for every screen", () => {
    const project = fixture(3);
    const resolved = resolveScreen(project, "screen_2");
    const target = project.decks[0]?.screens[1];
    if (!target) throw new Error("Missing target screen.");
    expect(resolved.width).toBe(400);
    expect(resolved.height).toBe(300);
    expect(resolved.background).toEqual(target.background);
    expect(JSON.stringify(project)).not.toContain("data:image");
  });
});
