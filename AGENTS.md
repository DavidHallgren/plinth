# Plinth repository guide

Plinth is a local-first screenshot composition studio. Project JSON is the source of truth for editable scenes; validated binary assets and generated exports remain in project-relative directories. Work directly in the existing checkout unless the user explicitly requests isolation. Preserve unrelated changes, do not push or create a PR, and use focused Conventional Commits when asked to commit.

The repository is currently both the application source and the richest agent workspace. `bun run build` creates a self-contained editor-server executable, but Plinth does not yet publish a Homebrew formula, expose the development CLI through installed `plinth` subcommands, install a companion agent skill, generate project-local `AGENTS.md` files, or provide an “Open in Codex” workflow. Do not document any of those as existing behavior until they are implemented.

## Architecture and directories

- `src/server.ts` owns the Bun.serve entrypoint and route table. `src/lib/runtime-options.ts` owns standalone data-root defaults, runtime option parsing, free-port selection, and platform-native browser launch commands. `src/lib/api.ts` contains structured request handlers shared by tests and the server.
- `src/lib/schema.ts`, `src/lib/migrations.ts`, and `src/lib/defaults.ts` define persisted project data. Current schema v12 stores one or more fixed-size `Deck`s on each project, with ordered nested `Screen`s; screens inherit their containing deck's dimensions and do not persist width/height. Text styles persist stable built-in or project font IDs, and project-local uploaded face metadata lives in the top-level `fonts` collection. Image elements may persist a normalized source crop plus per-instance background, border, radius, and shadow presentation; assets remain immutable shared sources. Shape elements persist dash, cap, and endpoint marker styles for editable overlay arrows and connectors. Each screen persists one ordered `layers` array of owned element entries (`{ kind: "owned", element, overflow }`) and overflow-link entries (`{ kind: "overflow-link", elementId, ownerScreenId }`). Deck-level `groups` persist named, non-nested sets of contiguous canonical element IDs without parent transforms or duplicated geometry; grouped members share an owner screen and transfer ownership as a unit. Owned element data exists exactly once per project; link entries never clone it, and render-only layer order is derived from array position. Asset metadata keeps an editable display `name` and original `sourceFileName` separate from the immutable, hash-derived storage path. Screen backgrounds may reference a project-relative asset and persist cover/contain geometry plus deterministic blur, overlay, and seeded texture settings. Project `settings.exportDirectory` and editable `Screen.exportSlug` support export-safe names; display `name` and internal `slug` remain separate. UI-only state must not enter JSON.
- `src/lib/storage.ts` is the filesystem façade. Project JSON I/O, asset and font metadata, export-run binding, mutation locking, PNG structure checks, and canonical path policy are split across focused modules. Standalone, development, and the source CLI default to the platform application-data project root (`~/Library/Application Support/Plinth/projects` on macOS, `$XDG_DATA_HOME/plinth/projects` or `~/.local/share/plinth/projects` on Linux, and `%LOCALAPPDATA%\Plinth\projects` on Windows). `--data-dir` and `PLINTH_DATA_ROOT` override it. `src/lib/example-project.ts` seeds a writable copy of the bundled `fixtures/projects/example/` only when a project root is first initialized and empty; `.plinth-initialized` prevents a user-deleted example from returning. Each immediate child is one `<slug>/` project containing `project.json`, `assets/`, `fonts/`, and `exports/`. Runtime projects never belong in this repository; the tracked example is only an immutable seed source. JSON and binary writes are atomic. Asset and font references are canonical project-relative paths; never embed binary data in JSON.
- `src/lib/asset-validation.ts` validates signatures, dimensions, size, hashes, safe paths, deterministic names, and conservative SVG content.
- `src/lib/export-validation.ts` validates numbered safe names, PNG signature/chunks/CRCs/IHDR dimensions, payload limits, export plans, and deck-resolved screen dimension matches. Export files may only be written inside the project `exports/` directory or a server-created timestamped run beneath the project's validated configured export directory.
- `src/scene/operations.ts` owns the shared immutable operation implementation; callers use the focused `element-operations.ts`, `structure-operations.ts`, and `overflow-operations.ts` boundaries. Fixed deck dimensions, bounded transforms, text auto-height geometry, conservative deck-coordinate overflow bounds, ownership transfer/reconciliation, contiguous render layer order, fresh IDs, deck/screen reorder, and final-deck/final-screen protection remain shared invariants. `src/scene/text-geometry.ts` uses active Canvas 2D font metrics when available so browser operations and Konva rendering wrap the same way, with a deterministic fallback for Bun/server-only paths. `src/scene/overflow.ts` resolves linked layers into target-local render elements. `src/scene/history.ts` provides bounded operation-level undo/redo and gesture transactions.
- `src/app/editor-store.ts` keeps selection, zoom, clipboard, transaction state, and history outside project JSON. `src/hooks/use-project-persistence.ts` owns the client revision/dirty/save coordinator, while `src/hooks/use-asset-mutations.ts` owns serialized asset mutation orchestration and its explicit history boundary.
- `src/canvas/deck-canvas.tsx` is the only editing canvas. It mounts one Stage and one shared Konva Layer for the active deck, packs layerless `SceneContents` groups at `index * deck.width`, clips each resolved target root, marks seams/focus, and owns fit/scroll/pan plus target-aware transformer identity. `src/canvas/crop-editor-overlay.tsx` provides the UI-only full-source crop overlay and crop-region transformer; its session is committed or canceled through editor history and never enters project JSON. `src/canvas/scene-renderer.tsx` owns shared scene contents and the standalone `SceneRenderer` wrapper, which adds one `Layer` for lightweight thumbnails and the sequential 1× export stage. `src/canvas/react-konva.ts` is the ESM-only ReactKonva boundary and must load full Konva before re-exporting its typed core bindings. Callers pass distinct resolved screens so linked layers use the same renderer and independent screen backgrounds/crops. `src/canvas/image-loading.tsx`, `src/canvas/image-cache.ts`, and `src/canvas/export-readiness.ts` own image readiness, cache invalidation, and pre-capture checks.
- `src/fonts/catalog.ts` defines the 17-family built-in font catalog with stable IDs, real weight/style ranges, script coverage, pinned Fontsource/source versions, and OFL attribution. `src/fonts/font-faces.ts` is the manifest for the corresponding Fontsource face CSS, including Quicksand, Nunito, and four localized Noto Sans CJK families; `scripts/generate-styles.ts` normalizes and bundles those declarations for consistent variable-font rendering. `src/fonts/font-registry.ts` registers project-local faces and gates exact browser/export readiness; `src/lib/font-validation.ts` validates uploaded binaries. Keep picker choices and font readiness derived from these boundaries rather than duplicating family metadata in components.
- `src/devices/` contains data-driven device presets, official Apple PNG bezels, generic vector frames, and pure screen/fit geometry. `apple-bezel-presets.ts` records measured native apertures for MacBook Air/Pro M5, iPad Pro M5, iPad Air M4, and iPhone 18; these also supply matching canvas presets. MacBooks use the `laptop` frame kind and top-only rounded screen corners; `deviceFrameKind` centralizes classification for seeded devices and picker actions. Keep artwork provenance and licenses in `src/devices/frames/`. Add third-party artwork only when explicitly requested, and never add parallel drawing logic.
- `src/components/editor/`, `src/components/sidebar/`, and `src/components/toolbar/` compose the editor. `screen-navigator.tsx` owns deck/screen/layer management and distinguishes owned rows from linked projections; `src/components/ui/` contains reusable controls.

## Operations and persistence

- Repository agents may use `bun run tool` against the platform default project root or an explicit `--data-dir`. Installed-binary agent tooling does not exist yet. When editing a live project directly, account for pending browser autosaves so an older client snapshot cannot overwrite the external change; prefer existing API/storage operations and validate the result.
- Keep normalized JSON pretty-printed and human-readable.
- Migrate old project versions safely and reject future versions with actionable structured errors.
- Runtime schema v12 is strict: persisted screens require `layers`, decks require `groups`, image crops and presentation styles are per-element, text styles require a stable `fontFamilyId`, and uploaded font metadata is server-owned. Persisted `elements`, element `zIndex`, and CSS `fontFamily` stacks are migration-only inputs. Load-time reconciliation adds missing required overflow links and removes stale non-intersecting links deterministically.
- Flush pending saves before project rename/delete/navigation, asset mutation, and export. Do not allow stale autosave responses to overwrite newer in-memory state.
- Surface invalid JSON/schema, duplicate IDs, missing/tampered/unsupported/oversized assets, failed writes, list/load failures, final-deck/final-screen deletion, and active-project deletion errors.
- Use project-relative asset paths and `AssetMetadata`; never store image bytes or object URLs in project JSON.
- Deleting a referenced asset must atomically delete every image/device layer that owns it, remove corresponding overflow links, and reset matching backgrounds; never leave missing references through the normal UI.
- Export requests are browser-produced bytes; the server does not render scenes. Validate client metadata, then independently decode PNG signature/chunks/CRCs and IHDR dimensions, check membership and filename, enforce payload limits, and atomically write within `exports/`.

## Editor and renderer pitfalls

- Never duplicate background, text, shape, image, or device drawing for export. Export must mount `SceneRenderer` with the same normalized screen model, resolving dimensions from its containing deck.
- Keep only one full-resolution export stage mounted at a time; inactive screens use light thumbnails.
- The focused screen is always one screen in the active deck. Projection identity is `(targetScreenId, canonicalElementId)`; operations route geometry through the target screen while persistence keeps one owned canonical element.
- Do not save on pointer move. A drag/transform/inspector edit is one history entry after the gesture completes.
- Never let an autosave response or other persistence echo replace the editor project while an inspector or canvas transaction is active. Defer the echo until cancellation, or discard it when the newer local transaction commits.
- Never intercept Cmd/Ctrl shortcuts while focus is in `input`, `textarea`, `select`, or any contenteditable element. Escape, copy, paste, duplicate, delete, nudge, reorder, and undo/redo should remain conventional.
- Preserve selection when reordering layers. Keep grouped members contiguous and move their ownership and z-order as one block while leaving their element geometry flat. Keep arrow-button/keyboard fallbacks alongside HTML drag-and-drop.
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
