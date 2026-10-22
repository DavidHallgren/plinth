import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectSchema } from "../src/lib/schema";
import { ownedElements } from "./helpers";

describe("source CLI", () => {
  test("manages projects with Duo and artwork presets through every command", async () => {
    const root = await mkdtemp(join(tmpdir(), "plinth-cli-test-"));
    async function run(args: string[], exitCode = 0) {
      const child = Bun.spawn([process.execPath, join(import.meta.dir, "../src/cli/index.ts"), ...args, "--data-dir", root, "--json"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect({ code, error: code === exitCode ? "" : stderr }).toEqual({ code: exitCode, error: "" });
      return JSON.parse(exitCode === 0 ? stdout : stderr);
    }
    try {
      expect((await run(["help"])).data).toContain("add-deck");
      expect((await run(["--help"])).data).toContain("--preset");
      await run(["new", "Duo CLI", "--slug", "duo-cli"]);
      expect((await run(["list"])).data.projects).toContainEqual(expect.objectContaining({ slug: "duo-cli", valid: true }));
      for (const [preset, width, height] of [
        ["iphone-duo-outer", 1398, 2034],
        ["iphone-duo-outer-landscape", 2034, 1398],
        ["iphone-duo-inner", 2007, 2853],
        ["iphone-duo-inner-landscape", 2853, 2007],
        ["app-store-header", 3840, 1646],
        ["app-store-search", 3840, 2560],
      ] as const) {
        const added = await run(["add-deck", "duo-cli", preset, "--deck-slug", preset, "--width", String(width), "--height", String(height), "--preset", preset]);
        const deck = ProjectSchema.parse(added.data.project).decks.find((deck) => deck.slug === preset)!;
        expect(deck).toMatchObject({ width, height });
        expect(deck.screens[0]?.preset).toBe(preset);
        const updated = await run(["add-screen", "duo-cli", deck.id, preset]);
        const screens = ProjectSchema.parse(updated.data.project).decks.find((candidate) => candidate.slug === preset)!.screens;
        expect(screens).toHaveLength(2);
        expect(screens[1]?.preset).toBe(preset);
        expect(Object.hasOwn(screens[1]!, "width")).toBe(false);
        if (preset.startsWith("iphone-duo")) {
          expect(ownedElements(screens[1]!).find((element) => element.type === "device")).toMatchObject({ preset, deviceId: preset });
        } else {
          expect(screens[1]?.layers).toEqual([]);
        }
      }
      const inspected = ProjectSchema.parse((await run(["inspect", "duo-cli"])).data.project);
      expect(inspected.decks).toHaveLength(7);
      const saved = await readFile(join(root, "duo-cli", "project.json"), "utf8");
      expect(saved).toBe(`${JSON.stringify(JSON.parse(saved), null, 2)}\n`);
      expect(saved).not.toMatch(/data:image|base64|blob:/);
      expect((await run(["validate", "duo-cli"])).data.valid).toBe(true);
      expect((await run(["validate"])).data.valid).toBe(true);
      expect((await run(["add-deck", "duo-cli", "--width", "100", "--height", "100", "--preset", "iphone-duo-unknown"], 1)).error).toMatchObject({ code: "INVALID_REQUEST" });
      const duplicated = ProjectSchema.parse((await run(["duplicate", "duo-cli", "duo-copy"])).data.project);
      expect(duplicated.decks.map((deck) => [deck.width, deck.height])).toEqual(inspected.decks.map((deck) => [deck.width, deck.height]));
      expect((await run(["rename", "duo-copy", "Renamed Duo", "--slug", "duo-renamed"])).data.project.name).toBe("Renamed Duo");
      expect((await run(["export", "duo-cli"], 1)).error).toMatchObject({ code: "NOT_IMPLEMENTED", details: { browserRequired: true } });
      expect((await run(["delete", "duo-renamed"], 1)).error.code).toBe("CONFIRMATION_REQUIRED");
      expect((await run(["delete", "duo-renamed", "--yes"])).data.deleted).toBe("duo-renamed");
      expect((await run(["delete", "duo-cli", "--yes"])).data.deleted).toBe("duo-cli");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 60_000);
});
