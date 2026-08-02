# Plinth

Plinth is a local-first screenshot composition tool for turning a few visual ingredients into repeatable, presentation-ready frames. Phase 1 is the foundation: it gives the project format, safe file storage, a small JSON API, CLI basics, and an intentional dark project picker shell. The composition canvas is reserved for a later phase.

## Requirements

- Bun 1.3 or newer
- A modern browser

Install dependencies and start the development server:

```sh
bun install
bun run dev
```

Then open [http://localhost:3000](http://localhost:3000). The default project is stored in `data/projects/plinth-starter/`.

Set `PLINTH_DATA_ROOT` when a script or test needs an alternate local project directory:

```sh
PLINTH_DATA_ROOT=/tmp/plinth-projects bun run tool -- list --json
```

## Scripts

| Script | Purpose |
| --- | --- |
| `bun run dev` | Tailwind watch plus Bun's HTML development server |
| `bun run start` | Run the production bundle after `bun run build` |
| `bun run build` | Compile Tailwind and build the Bun server/HTML bundle |
| `bun test` | Run schema, migration, storage, preset, and round-trip tests |
| `bun run typecheck` | Strict TypeScript validation |
| `bun run check` | Typecheck, tests, and a production build |
| `bun run tool -- help` | Run the project CLI |

## CLI

The CLI uses the same Zod schema and file storage as the app:

```sh
bun run tool -- list
bun run tool -- new "Client launch" --json
bun run tool -- inspect client-launch
bun run tool -- validate client-launch
bun run tool -- duplicate client-launch client-launch-copy
bun run tool -- rename client-launch "Client launch v2"
bun run tool -- add-document client-launch browser "Desktop frame"
bun run tool -- delete client-launch-copy --yes
bun run tool -- export client-launch
```

`--json` wraps successful results and failures in machine-readable objects. Commands fail with a nonzero exit code on invalid input or storage errors. `export` intentionally reports that browser rendering is required; it reserves the command shape without pretending Phase 1 can render a browser.

## Project format

Each project is a directory containing a human-readable `project.json` plus binary-friendly `assets/` and `exports/` directories. JSON writes are validated, pretty printed, and committed through a temporary file followed by rename. Slugs and child paths are checked before any filesystem access so traversal cannot escape the project root.

The root `schemaVersion` is currently `1`. Migrations are present from the start: legacy/unversioned input is upgraded before validation, and future versions fail clearly rather than being silently discarded.

## Phase 1 boundaries

- No canvas, editor interactions, selection model, or browser screenshot rendering yet.
- Assets and exports have reserved API route shapes, but their upload/render behavior is intentionally not implemented.
- Autosave is wired as a debounced client architecture around project JSON; Phase 2 can connect richer editor mutations without changing the persistence boundary.
- The local server is designed for one trusted machine. Authentication, multi-user concurrency, and file locking are outside this phase.
