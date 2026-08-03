# Plinth

Plinth is a local-first screenshot composition studio. It keeps editable project data in human-readable JSON, keeps binary assets beside the project, and renders compositions with a shared Konva scene graph for both the editor and exact PNG export.

Screenshot placeholder: capture the editor at a laptop viewport and add it at `docs/plinth-editor-screenshot.png`.

## Prerequisites and setup

- Bun 1.3 or newer
- A modern browser with canvas, image decoding, and local font APIs

Install dependencies and start the local server:

```sh
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). The deterministic starter project is stored at `data/projects/plinth-starter/`.

Use an alternate storage root for tests or scripts:

```sh
PLINTH_DATA_ROOT=/tmp/plinth-projects bun run tool list --json
```

## Scripts

| Script | Purpose |
| --- | --- |
| `bun run dev` | Start the Bun development server with HMR |
| `bun run start` | Start the server without HMR |
| `bun run build` | Build the standalone `dist/plinth` executable |
| `bun run test` | Run the unit and storage/API tests |
| `bun run typecheck` | Run strict TypeScript validation |
| `bun run check` | Run typecheck and tests |
| `bun run tool help` | Show every CLI command and option |

Tailwind 4 refreshes the ignored `src/styles.generated.css` file through the lifecycle hooks. Do not commit that generated file.

## Storage and project format

Projects live at `data/projects/<project-slug>/`:

```text
project.json
assets/       # validated binary image files
exports/      # atomically written PNG copies
```

`project.json` is pretty-printed and contains normalized metadata, project-relative asset paths, and an optional absolute export-directory setting. It never contains base64 image data or embedded image bytes. Asset files are validated from their signatures, dimensions, size, and conservative SVG policy before ingestion and again when served.

Schema v5 adds the optional `settings.exportDirectory` absolute path for server-written export runs. Schema v4 added `document.exportSlug`, an editable export-safe stem separate from the display name and internal document `slug`. Older projects migrate through the current schema, and future schema versions fail clearly instead of being silently discarded.

Writes use temporary files followed by rename. Project saves, asset mutations, export writes, project rename/delete, and navigation flush pending editor changes so stale autosaves do not resurrect deleted or renamed state.

## Editor architecture

- `src/lib/schema.ts`, `src/lib/migrations.ts`, and `src/lib/defaults.ts` are the persisted data boundary. UI-only selection, zoom, clipboard, transaction state, export progress, and image cache state stay out of JSON.
- `src/scene/operations.ts` owns immutable scene/document operations, bounded transforms, normalized z-order, fresh IDs, document protection, and text auto-height normalization.
- `src/scene/history.ts` provides bounded operation-level undo/redo. Pointer drags, transforms, and debounced inspector edits commit as one completed gesture.
- `src/canvas/scene-renderer.tsx` is the only scene drawing implementation. It renders backgrounds, text, images, shapes, and data-driven device frames for the active editor, thumbnails, and export stage.
- `src/canvas/image-loading.tsx`, `src/canvas/image-cache.ts`, and `src/canvas/export-readiness.ts` own asset readiness/error boundaries and preflight project images, bundled device frames, and fonts before capture.
- `src/devices/` contains device presets, pure fit geometry, vector fallbacks, and bundled official transparent Apple frame overlays. Project JSON stores only the selected preset and finish color; it never duplicates the bundled frame bytes.
- `src/lib/storage.ts` is the filesystem boundary. `src/lib/api.ts` is the structured request boundary. `src/components/ui/` contains reusable compact controls.

Do not add a second canvas renderer, server-side substitute renderer, duplicated background/element drawing code, base64 asset storage, pointer-move saves, or permanent object URLs.

## Export workflow

The editor’s Export dialog supports the current document or all documents and a mutually exclusive destination: browser download or the project’s configured export folder. Selecting the folder destination reveals its path field and disables the export action until a non-empty path is configured. The same persisted path is editable from the pencil-icon project editor. The dialog lists display names, numbered safe filenames such as `01-home.png`, exact dimensions, per-document progress, failures, and saved paths.

For each document, the browser:

1. Flushes pending project changes.
2. Verifies every referenced asset exists and decodes, and waits for the document’s usable font faces.
3. Mounts one full-resolution `SceneRenderer` stage, captures it at pixel ratio 1 with image smoothing, and verifies the canvas dimensions.
4. For configured-folder export, asks `POST /api/projects/:slug/export-runs` to validate the existing absolute folder and create a unique timestamped directory.
5. Posts the PNG bytes and metadata as multipart form data to `POST /api/projects/:slug/exports`.
6. For download export, lets the browser download the result and revokes the generated object URL. For folder export, the server writes every selected file into the same timestamped directory.

The server independently validates project membership, safe numbered filename, payload limit, PNG signature/chunks/CRCs and IHDR dimensions, client metadata, and every path boundary before atomically writing inside the project `exports/` directory or a server-created run beneath the configured folder. Project-local files are available through `GET /api/projects/:slug/exports/:fileName`; `GET /api/projects/:slug/exports` returns the export plan.

All-document export is sequential so inactive documents remain lightweight thumbnails rather than mounted full-resolution stages.

## CLI

The CLI shares schema, migrations, validation, and storage with the app:

```sh
bun run tool help
bun run tool list [--json]
bun run tool new <name> [--slug <slug>] [--json]
bun run tool inspect <slug> [--json]
bun run tool validate [slug] [--json]
bun run tool duplicate <slug> <new-slug> [--name <name>] [--json]
bun run tool rename <slug> <name> [--slug <slug>] [--json]
bun run tool delete <slug> --yes [--json]
bun run tool add-document <slug> <preset> [name] [--width <pixels>] [--height <pixels>] [--json]
bun run tool export <slug> [--json]
```

`export` intentionally returns a documented nonzero browser-required response. A headless CLI renderer would duplicate the shared Konva scene graph; use the local editor’s Export dialog for PNG rendering.

## API and limits

- `GET/POST /api/projects` lists or creates projects.
- `GET/PUT/DELETE /api/projects/:slug` loads, saves, or deletes a project.
- `POST /api/projects/:slug/rename`, `/duplicate`, and `/documents` manage project structure.
- `GET/POST /api/projects/:slug/assets` lists or uploads validated local images.
- `GET/DELETE /api/projects/:slug/assets/:fileName` serves or removes an asset; referenced deletion requires explicit force confirmation.
- `GET/POST /api/projects/:slug/exports` plans or stores browser-rendered PNGs.
- `POST /api/projects/:slug/export-runs` validates the configured export folder and creates a timestamped output directory.
- `GET /api/projects/:slug/exports/:fileName` downloads a validated stored export.

Uploads are limited to 25 MB. Exports are limited to 50 MB and must be PNGs whose decoded dimensions exactly match their document. SVG is intentionally conservative and rejects scripts, external references, linked images, unsafe styles, and event attributes. Fonts are local CSS/fallback families; arbitrary remote font fetching is not part of the local-first workflow.

## Required validation checklist

Before completing a change:

1. Run `bun run typecheck`
2. Run `bun test`
3. Confirm project JSON remains human-readable
4. Confirm no image data is stored in JSON
5. Confirm editor and export use the same scene model
6. Update `AGENTS.md` or `README.md` when architecture changes
