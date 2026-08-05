import { describe, expect, test } from "bun:test";
import { createBackgroundTexturePixels } from "../src/canvas/background-texture";
import { sceneReadiness } from "../src/canvas/export-readiness";
import { createDefaultProject } from "../src/lib/defaults";
import { resolveScreen } from "../src/scene/selectors";

describe("deterministic background texture", () => {
  test("repeats pixels for the same settings and changes them with the seed", () => {
    const settings = { type: "noise" as const, seed: 2026, opacity: 0.08, scale: 1 };
    const first = createBackgroundTexturePixels(settings, 16);
    const second = createBackgroundTexturePixels(settings, 16);
    const changed = createBackgroundTexturePixels({ ...settings, seed: 2027 }, 16);

    expect(first).toEqual(second);
    expect(first).not.toEqual(changed);
    expect(first.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
  });

  test("uses a distinct coarse texture algorithm", () => {
    const noise = createBackgroundTexturePixels({ type: "noise", seed: 12, opacity: 0.1, scale: 2 }, 16);
    const texture = createBackgroundTexturePixels({ type: "texture", seed: 12, opacity: 0.1, scale: 2 }, 16);
    expect(noise).not.toEqual(texture);
  });

  test("includes a background asset in export readiness", () => {
    const project = createDefaultProject("Background readiness");
    const deck = project.decks[0];
    const screen = deck?.screens[0];
    if (!deck || !screen) throw new Error("Missing starter screen.");
    const withBackground = {
      ...project,
      decks: [{
        ...deck,
        screens: [{ ...screen, background: { type: "asset" as const, assetPath: "assets/hero.png", fit: "cover" as const, position: { x: 0.5, y: 0.5 }, blur: 12, overlayColor: "#000000", overlayOpacity: 0.2, texture: null } }],
      }],
    };

    expect(sceneReadiness(resolveScreen(withBackground, screen.id)).assetPaths).toContain("assets/hero.png");
  });
});
