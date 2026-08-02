# Plinth repository guide

Plinth is a local-first screenshot composition tool. Phase 1 establishes the foundation only: a Bun HTML server, a React shell, versioned serializable project data, safe JSON-backed storage, a JSON API, and a CLI. The canvas/editor is deliberately not implemented yet.

## Architecture

- `src/server.ts` owns the Bun.serve entrypoint and API route table. The HTML entrypoint is imported directly so Bun handles development bundling/HMR and the production HTML manifest.
- `src/lib/schema.ts`, `src/lib/migrations.ts`, and `src/lib/defaults.ts` are the source of truth for project data. Do not put UI-only state into the persisted schema.
- `src/lib/storage.ts` is the only filesystem boundary for projects. Project directories are `data/projects/<slug>/` with `project.json`, `assets/`, and `exports/`.
- `src/lib/api.ts` is the shared request handler used by the server. API errors are structured and stable enough for the UI and future clients.
- `src/cli.ts` shares the schema and storage modules. Add CLI commands without duplicating persistence logic.
- `src/components/ui/` contains small shadcn-style primitives. Screens should compose these primitives rather than adding one-off controls.
- There is no router, database, ORM, Electron/Tauri shell, or global state library in Phase 1.

## Required checks

Before a Phase 1 change is considered complete, run:

```sh
bun run typecheck
bun test
bun run check
bun run build
```

Also review `git diff --stat`, the complete diff, generated files, secrets, and oversized files. Keep commits focused and use Conventional Commit messages. Do not push or create a pull request without explicit instruction.

## Extension points

Future phases can add canvas editing, asset ingestion, browser rendering, export workers, and richer document presets behind the existing schema/storage/API boundaries. New persisted fields require a schema version and migration. Binary data belongs in `assets/`, never in `project.json`.
