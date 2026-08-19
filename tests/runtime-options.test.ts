import { describe, expect, test } from "bun:test";
import { browserOpenCommand, defaultProjectDirectory, parseServerRuntimeOptions, resolveDataDirectory, resolveServerPort, serverHelp } from "../src/lib/runtime-options";

describe("standalone runtime options", () => {
  test("stores macOS projects in Application Support by default", () => {
    expect(defaultProjectDirectory({ platform: "darwin", homeDirectory: "/Users/example", environment: {} })).toBe("/Users/example/Library/Application Support/Plinth/projects");
  });

  test("uses platform-appropriate data roots outside macOS", () => {
    expect(defaultProjectDirectory({ platform: "linux", homeDirectory: "/home/example", environment: {} })).toBe("/home/example/.local/share/plinth/projects");
    expect(defaultProjectDirectory({ platform: "linux", homeDirectory: "/home/example", environment: { XDG_DATA_HOME: "/srv/data" } })).toBe("/srv/data/plinth/projects");
    expect(defaultProjectDirectory({ platform: "win32", homeDirectory: "/Users/example", environment: { LOCALAPPDATA: "/Local" } })).toBe("/Local/Plinth/projects");
  });

  test("defaults to an available port and opens the browser", () => {
    expect(parseServerRuntimeOptions([], { platform: "darwin", homeDirectory: "/Users/example", environment: {}, currentDirectory: "/work" })).toEqual({
      dataDirectory: "/Users/example/Library/Application Support/Plinth/projects",
      hostname: "127.0.0.1",
      openBrowser: true,
      port: 0,
      showHelp: false,
    });
  });

  test("parses command-line overrides ahead of environment defaults", () => {
    expect(parseServerRuntimeOptions(
      ["--data-dir", "~/Plinth Data", "--port=4312", "--no-open"],
      { platform: "darwin", homeDirectory: "/Users/example", currentDirectory: "/work", environment: { PLINTH_DATA_ROOT: "/environment", PORT: "3000", HOST: "localhost" } },
    )).toEqual({
      dataDirectory: "/Users/example/Plinth Data",
      hostname: "localhost",
      openBrowser: false,
      port: 4312,
      showHelp: false,
    });
  });

  test("validates options and expands data paths", () => {
    expect(resolveDataDirectory("relative/projects", { currentDirectory: "/work", homeDirectory: "/Users/example" })).toBe("/work/relative/projects");
    expect(() => parseServerRuntimeOptions(["--port", "70000"], { environment: {} })).toThrow(/between 0 and 65535/);
    expect(() => parseServerRuntimeOptions(["--unknown"], { environment: {} })).toThrow(/Unknown option/);
    expect(serverHelp("/projects")).toContain("--data-dir <path>");
  });

  test("selects the native browser opener without shell interpolation", () => {
    expect(browserOpenCommand("http://127.0.0.1:1234", "darwin")).toEqual(["open", "http://127.0.0.1:1234"]);
    expect(browserOpenCommand("http://127.0.0.1:1234", "linux")).toEqual(["xdg-open", "http://127.0.0.1:1234"]);
    expect(browserOpenCommand("http://127.0.0.1:1234", "win32")).toEqual(["cmd", "/c", "start", "", "http://127.0.0.1:1234"]);
  });

  test("resolves the automatic port before starting Bun's server", async () => {
    expect(await resolveServerPort(4312, "127.0.0.1")).toBe(4312);
    expect(await resolveServerPort(0, "127.0.0.1", async (hostname) => {
      expect(hostname).toBe("127.0.0.1");
      return 54321;
    })).toBe(54321);
  });
});
