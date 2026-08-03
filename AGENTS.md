# Plinth repository guide

Plinth is a local-first screenshot composition studio. Project JSON is the source of truth for editable scenes; validated binary assets and generated exports remain in project-relative directories. Work directly in the existing checkout unless the user explicitly requests isolation. Preserve unrelated changes, do not push or create a PR, and use focused Conventional Commits when asked to commit.

## Architecture and directories

- `src/server.ts` owns the Bun.serve entrypoint and route table. `src/lib/api.ts` contains structured request handlers shared by tests and the server.
- `src/lib/schema.ts`, `src/lib/migrations.ts`, and `src/lib/defaults.ts` define persisted project data. Current schema v5 includes optional project `settings.exportDirectory` and editable `Document.exportSlug` for export-safe names; display `name` and internal `slug` remain separate. UI-only state must not enter JSON.
- `src/lib/storage.ts` is the only filesystem boundary. A project is `data/projects/<slug>/project.json`, `assets/`, and `exports/`. JSON and binary writes are atomic. Asset references are canonical `assets/<safe-file-name>` paths; never embed base64 or duplicate binary data in JSON.
- `src/lib/asset-validation.ts` validates signatures, dimensions, size, hashes, safe paths, deterministic names, and conservative SVG content.
- `src/lib/export-validation.ts` validates numbered safe names, PNG signature/chunks/CRCs/IHDR dimensions, payload limits, export plans, and document dimension matches. Export files may only be written inside the project `exports/` directory or a server-created timestamped run beneath the project's validated configured export directory.
- `src/scene/operations.ts` owns immutable document/layer operations, bounded transforms, text auto-height geometry, contiguous z-order, fresh IDs, document reorder, and final-document protection. `src/scene/history.ts` provides bounded operation-level undo/redo and gesture transactions.
- `src/app/editor-store.ts` keeps selection, zoom, clipboard, transaction state, and history outside project JSON.
- `src/canvas/scene-renderer.tsx` is the single shared Konva renderer for the active editor, lightweight thumbnails, and the sequential 1× export stage. `src/canvas/image-loading.tsx`, `src/canvas/image-cache.ts`, and `src/canvas/export-readiness.ts` own image readiness, cache invalidation, and pre-capture checks.
- `src/devices/` contains data-driven vector device presets and pure screen/fit geometry. Do not add third-party frame artwork or parallel drawing logic.
- `src/components/editor/`, `src/components/sidebar/`, and `src/components/toolbar/` compose the editor. `src/components/ui/` contains reusable controls.

## Operations and persistence

- Keep normalized JSON pretty-printed and human-readable.
- Migrate old project versions safely and reject future versions with actionable structured errors.
- Flush pending saves before project rename/delete/navigation, asset mutation, and export. Do not allow stale autosave responses to overwrite newer in-memory state.
- Surface invalid JSON/schema, duplicate IDs, missing/tampered/unsupported/oversized assets, failed writes, list/load failures, final-document deletion, and active-project deletion errors.
- Use project-relative asset paths and `AssetMetadata`; never store image bytes or object URLs in project JSON.
- Export requests are browser-produced bytes; the server does not render scenes. Validate client metadata, then independently decode PNG signature/chunks/CRCs and IHDR dimensions, check membership and filename, enforce payload limits, and atomically write within `exports/`.

## Editor and renderer pitfalls

- Never duplicate background, text, shape, image, or device drawing for export. Export must mount `SceneRenderer` with the same normalized `Document`.
- Keep only one full-resolution export stage mounted at a time; inactive documents use light thumbnails.
- Do not save on pointer move. A drag/transform/inspector edit is one history entry after the gesture completes.
- Never intercept Cmd/Ctrl shortcuts while focus is in `input`, `textarea`, `select`, or any contenteditable element. Escape, copy, paste, duplicate, delete, nudge, reorder, and undo/redo should remain conventional.
- Preserve selection when normalizing z-index or reordering. Keep arrow-button/keyboard fallbacks alongside HTML drag-and-drop.
- Locked elements cannot be transformed/nudged; hidden elements remain represented in layers and JSON.
- Use the image cache/readiness boundary for every image. Detect missing/failed/not-ready assets before export instead of capturing placeholders.
- Revoke browser-generated object URLs after download. Do not introduce permanent URL caches or base64 data URLs in persisted state.

## Generated image assets

- Unless explicitly requested otherwise, generate standalone decorative assets intended for placement in a Plinth scene as tightly framed PNG cutouts with true transparency.
- Do not bake in a background, floor, horizon, border, text, checkerboard pattern, or cast shadow. Preserve only shadows that are intrinsic to the subject.
- Before importing the asset, verify that the PNG has an alpha channel and that background pixels are actually transparent—not black, white, or transparency-like artwork.

## Commands and generated files

```sh
bun install
bun run dev
bun run typecheck
bun test
bun run check
bun run build
bun run tool help
```

`src/styles.generated.css` is generated by Tailwind lifecycle hooks and is ignored. `dist/` is generated by the standalone build and is ignored. Do not commit logs, secrets, `.env` files, temporary data, screenshots, or oversized/generated output unless the user explicitly asks for them.

## Required checks

Before completing a change:

1. Run `bun run typecheck`
2. Run `bun test`
3. Confirm project JSON remains human-readable
4. Confirm no image data is stored in JSON
5. Confirm editor and export use the same scene model
6. Update `AGENTS.md` or `README.md` when architecture changes

Also review the complete diff and `git diff --stat`, test CLI help/all commands, validate relevant API CRUD/assets/export paths, and inspect for accidental unrelated/generated/secret/oversized files. Do not use a second renderer or a server-side canvas substitute.
