import { ProjectStorage } from "../lib/storage";
import { PlinthError, isPlinthError } from "../lib/errors";
import { ScreenPresetSchema } from "../lib/schema";

const HELP = `Plinth CLI

Usage:
  bun run tool <command> [options]

Commands:
  list                                  List project metadata
  new <name> [--slug <slug>]            Create a project (never overwrites)
  inspect <slug>                        Print a project with decks and screens
  validate [slug]                       Validate one project or all projects
  duplicate <slug> <new-slug>           Copy a project (never overwrites)
  rename <slug> <name> [--slug <slug>]  Rename a project and optionally its slug
  delete <slug> --yes                   Delete a project directory
  add-deck <slug> [name]                 Add a fixed-size deck with a starter screen
  add-screen <slug> <deck-id> <preset>  Add an App Store or custom screen
  export <slug>                         Explain the browser-required export workflow
  help                                  Show this help

Options:
  --json                                Emit machine-readable output
  --yes                                 Confirm destructive operations
  --slug <slug>                         Set a project slug
  --preset <preset>                     Set the starter screen preset
  --deck-slug <slug>                    Set a deck slug for add-deck
  --screen-slug <slug>                  Set a screen slug for add-screen
  --export-slug <slug>                  Set an export slug for add-screen
  --name <name>                         Set a project, deck, or screen name
  --width <pixels>                      Set the deck width at creation
  --height <pixels>                     Set the deck height at creation
`;

type ParsedArgs = {
  command: string;
  positionals: string[];
  json: boolean;
  yes: boolean;
  help: boolean;
  options: Map<string, string>;
};

function parseArgs(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options = new Map<string, string>();
  let json = false;
  let yes = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value) continue;
    if (value === "--json") {
      json = true;
      continue;
    }
    if (value === "--yes") {
      yes = true;
      continue;
    }
    if (value === "--help" || value === "-h") {
      help = true;
      continue;
    }
    if (value.startsWith("--")) {
      const key = value.slice(2);
      const next = args[index + 1];
      if (!next || next.startsWith("--")) {
        throw new PlinthError("INVALID_REQUEST", 400, `Option ${value} requires a value.`);
      }
      options.set(key, next);
      index += 1;
      continue;
    }
    positionals.push(value);
  }

  return {
    command: positionals.shift() ?? "help",
    positionals,
    json,
    yes,
    help,
    options,
  };
}

function required(value: string | undefined, label: string): string {
  if (!value?.trim()) {
    throw new PlinthError("INVALID_REQUEST", 400, `Missing ${label}.`);
  }
  return value.trim();
}

function optionalDimension(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const dimension = Number(value);
  if (!Number.isInteger(dimension) || dimension <= 0 || dimension > 100_000) {
    throw new PlinthError("INVALID_REQUEST", 400, `${label} must be an integer between 1 and 100000.`);
  }
  return dimension;
}

function printResult(value: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ data: value }, null, 2));
    return;
  }

  if (typeof value === "string") {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

async function run(parsed: ParsedArgs, storage: ProjectStorage): Promise<{ value: unknown; valid?: boolean }> {
  switch (parsed.command) {
    case "help":
    case "--help":
    case "-h":
      return { value: HELP };

    case "list": {
      const projects = await storage.listProjectMetadata();
      return { value: { projects } };
    }

    case "new": {
      const name = required(parsed.positionals[0], "project name");
      const project = await storage.createProject({
        name,
        slug: parsed.options.get("slug"),
        description: "A local-first composition project.",
      });
      return { value: { project } };
    }

    case "inspect": {
      const slug = required(parsed.positionals[0], "project slug");
      return { value: { project: await storage.loadProject(slug) } };
    }

    case "validate": {
      const slug = parsed.positionals[0];
      if (slug) {
        const project = await storage.loadProject(slug);
        return { value: { valid: true, slug: project.slug, schemaVersion: project.schemaVersion } };
      }
      const projects = await storage.listProjectMetadata();
      const valid = projects.every((project) => project.valid);
      return { value: { valid, projects }, valid };
    }

    case "duplicate": {
      const slug = required(parsed.positionals[0], "source project slug");
      const targetSlug = required(parsed.positionals[1] ?? parsed.options.get("slug"), "new project slug");
      const project = await storage.duplicateProject(slug, targetSlug, parsed.options.get("name"));
      return { value: { project } };
    }

    case "rename": {
      const slug = required(parsed.positionals[0], "project slug");
      const name = required(parsed.positionals[1], "new project name");
      const project = await storage.renameProject(slug, name, parsed.options.get("slug"));
      return { value: { project } };
    }

    case "delete": {
      const slug = required(parsed.positionals[0], "project slug");
      if (!parsed.yes) {
        throw new PlinthError("CONFIRMATION_REQUIRED", 400, "Refusing to delete without --yes.");
      }
      await storage.deleteProject(slug);
      return { value: { deleted: slug } };
    }

    case "add-deck": {
      const slug = required(parsed.positionals[0], "project slug");
      const width = optionalDimension(parsed.options.get("width"), "Deck width");
      const height = optionalDimension(parsed.options.get("height"), "Deck height");
      if (!width || !height) throw new PlinthError("INVALID_REQUEST", 400, "add-deck requires --width and --height.");
      const presetValue = parsed.options.get("preset") ?? "blank";
      const presetResult = ScreenPresetSchema.safeParse(presetValue);
      if (!presetResult.success) {
        throw new PlinthError("INVALID_REQUEST", 400, `Unknown screen preset "${presetValue}".`, {
          allowed: ScreenPresetSchema.options,
        });
      }
      const project = await storage.addDeck(slug, {
        name: parsed.positionals[1] ?? parsed.options.get("name"),
        slug: parsed.options.get("deck-slug"),
        width,
        height,
        screenPreset: presetResult.data,
      });
      return { value: { project } };
    }

    case "add-screen": {
      const slug = required(parsed.positionals[0], "project slug");
      const deckId = required(parsed.positionals[1], "deck id");
      const presetValue = required(parsed.positionals[2] ?? parsed.options.get("preset"), "screen preset");
      const presetResult = ScreenPresetSchema.safeParse(presetValue);
      if (!presetResult.success) {
        throw new PlinthError("INVALID_REQUEST", 400, `Unknown screen preset "${presetValue}".`, {
          allowed: ScreenPresetSchema.options,
        });
      }
      const project = await storage.addScreen(slug, deckId, presetResult.data, parsed.positionals[3] ?? parsed.options.get("name"), {
        slug: parsed.options.get("screen-slug"),
        exportSlug: parsed.options.get("export-slug"),
      });
      return { value: { project } };
    }

    case "export":
      throw new PlinthError("NOT_IMPLEMENTED", 501, "CLI export requires browser rendering. Open the local Plinth editor, choose Export, and use Focused screen, Current deck, or All decks; the browser writes exact PNGs to the project's exports/ directory. The CLI deliberately does not duplicate the shared Konva renderer.", {
        browserRequired: true,
        projectSlug: parsed.positionals[0],
        workflow: "Open the editor -> Export -> choose screens -> render/download.",
      });

    default:
      throw new PlinthError("INVALID_REQUEST", 400, `Unknown command "${parsed.command}". Use help for usage.`);
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help || parsed.command === "help" || parsed.command === "--help" || parsed.command === "-h") {
    printResult(HELP, parsed.json);
    return;
  }

  const storage = new ProjectStorage();
  const result = await run(parsed, storage);
  printResult(result.value, parsed.json);
  if (result.valid === false) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const normalized = isPlinthError(error) ? error : new PlinthError("INTERNAL_ERROR", 500, error instanceof Error ? error.message : String(error));
    const json = process.argv.includes("--json");
    if (json) {
      console.error(JSON.stringify({ error: { code: normalized.code, message: normalized.message, ...(normalized.details === undefined ? {} : { details: normalized.details }) } }, null, 2));
    } else {
      console.error(`${normalized.code}: ${normalized.message}`);
    }
    process.exitCode = 1;
  });
}
