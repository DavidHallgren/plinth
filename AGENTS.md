# Plinth repository guide

Plinth is a local-first screenshot composition tool. Phase 3 includes the Bun server, React editor, versioned serializable project data, safe JSON-backed storage, asset APIs, a CLI, validated image assets, and vector device frames. Keep the canvas/editor and storage boundaries explicit as later export work is added.

## Architecture

- `src/server.ts` owns the Bun.serve entrypoint and API route table. The HTML entrypoint is imported directly so Bun handles development bundling/HMR and the production HTML manifest.
- `src/lib/schema.ts`, `src/lib/migrations.ts`, and `src/lib/defaults.ts` are the source of truth for project data. Do not put UI-only state into the persisted schema.
- `src/lib/storage.ts` is the only filesystem boundary for projects and assets. Project directories are `data/projects/<slug>/` with `project.json`, `assets/`, and `exports/`; asset references are canonical `assets/<safe-file-name>` paths, never duplicated id/path state or embedded image data.
- `src/lib/asset-validation.ts` owns safe asset names/paths, signature and dimension parsing, size limits, deterministic names/hashes, and conservative SVG policy. Keep these helpers pure/testable and do not trust an extension or browser MIME alone.
- `src/lib/api.ts` is the shared request handler used by the server. API errors are structured and stable enough for the UI and future clients.
- `src/cli/index.ts` shares the schema and storage modules. Add CLI commands without duplicating persistence logic.
- `src/canvas/scene-renderer.tsx` is the reusable Konva scene boundary for both the full active editor and lightweight inactive-document thumbnails. `src/canvas/image-loading.tsx` and `src/canvas/image-cache.ts` own image readiness/error state and cache invalidation.
- `src/devices/` contains data-driven device presets and pure screen/fit geometry. Render frames as vector shapes and clipping; do not add large third-party frame artwork.
- `src/components/ui/` contains small shadcn-style primitives. Screens should compose these primitives rather than adding one-off controls.
- There is no router, database, ORM, Electron/Tauri shell, or global state library in the current phase.

## Required checks

Before a Phase 3 change is considered complete, run:

```sh
bun run typecheck
bun run test
bun run check
bun run build
```

The build contract produces the standalone `dist/plinth` executable. Tailwind's ignored `src/styles.generated.css` is refreshed by package lifecycle hooks before dev, start, and build commands.

Also review `git diff --stat`, the complete diff, generated files, secrets, and oversized files. Keep commits focused and use Conventional Commit messages. Do not push or create a pull request without explicit instruction.

## Extension points

Phase 4 can add final PNG export, export UI/download/progress, CLI export behavior, final polish, full text auto-height, and true drag-to-reorder behind the existing renderer and schema/storage/API boundaries. New persisted fields require a schema version and migration. Binary data belongs in `assets/`, never in `project.json`.
