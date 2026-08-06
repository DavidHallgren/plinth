# Font handling plan

## Recommendation

Make fonts explicit, versioned project resources rather than unchecked CSS strings.

The recommended product shape is:

- a small, curated, self-hosted built-in library that works offline;
- stable font IDs in project JSON instead of raw fallback stacks;
- one shared browser font registry used by editing, thumbnails, measurement, and export;
- project-local font uploads for additional typefaces;
- explicit missing-font states, with export blocked rather than silently using a fallback;
- variable-weight support in the data model and renderer, while deferring arbitrary variable axes until the core flow is reliable.

This gives Plinth deterministic canvas and PNG output without turning the first release into a full font marketplace.

## Confirmed product decisions

- New scene text must use a bundled font or a font stored inside the project. System-font stacks are not an authoring option.
- Existing local projects will be updated directly when schema v10 lands; no legacy system-font mode is required.
- If a referenced bundled or project font cannot be resolved, opening the project shows a warning and replaces it with the bundled default rather than silently rendering a browser fallback.
- The built-in catalog contains 16 pinned Fontsource packages. Uploaded fonts are project-local so a shared project directory is self-contained.
- The initial typography controls are family, size, weight, and italic. Other variable axes are deferred.
- Built-in fonts must be freely redistributable open fonts. The selected catalog is entirely SIL OFL 1.1. License confirmation applies to user-uploaded fonts, and their source/license notes are retained with project metadata.
- The built-in set includes dedicated Simplified Chinese, Traditional Chinese, Japanese, and Korean families.

## Current diagnosis

Plinth has the beginnings of font readiness, but the current model is not portable or deterministic:

- `TextStyle.fontFamily` stores an arbitrary CSS font stack. It does not identify a known font resource or version.
- The inspector offers Inter, SF Pro, Arial, Georgia, and a system monospace stack, but Plinth does not bundle or register any of them. Inter therefore falls back on a clean machine, and SF Pro is platform-specific.
- The editor defaults and presets claim Inter while relying on whatever fonts the browser and operating system happen to provide.
- Both Konva rendering and Canvas 2D measurement collapse weights below 700 to regular and weights at or above 700 to bold. Persisted values such as 500, 750, and 820 are therefore misleading and do not render as requested.
- Export readiness calls `document.fonts.load()`, but ignores the returned matching faces. A resolved promise does not prove that Plinth registered the intended font or that a fallback was not used.
- Export mounts its Konva scene before waiting for fonts. Konva may already have calculated wrapping and line metrics using a fallback by the time the font becomes ready.
- Browser text auto-height uses Canvas 2D metrics, while Bun migrations and server-only operations use a character-width estimate. Server code cannot reproduce browser layout for an arbitrary project font.

These are correctness issues, not only picker-UX limitations: changing machines can change wrapping, layer height, and final pixels.

## Product principles

1. **No silent fallback for scene text.** A missing requested face is an actionable project error.
2. **One model for editor and export.** Fonts are registered before the shared `SceneRenderer` mounts or measures the affected text.
3. **Offline by default.** An existing project must remain editable and exportable without contacting a font CDN.
4. **Stable identity, editable labels.** Persist a font ID; use family and style names for display only.
5. **Project portability.** Additional fonts travel inside the project directory, subject to the user's license rights.
6. **Font-dependent geometry is browser-owned.** The server validates stored geometry but does not reflow current text using an approximate font.
7. **Explicit synthesis policy.** Only expose weights and styles that the registered family can provide; do not fabricate italic or bold without telling the user.

## Proposed architecture

### Schema v10

Replace `TextStyle.fontFamily` with a stable reference such as:

```ts
fontFamilyId: "builtin:inter" | "font_ab12cd..."
fontWeight: 100..900
italic: boolean
```

Add a project-level `fonts` collection for uploaded families. Built-ins remain in a versioned application catalog and are not repeated in every project.

```ts
type ProjectFontFamily = {
  id: string
  name: string
  source: "uploaded"
  faces: Array<{
    id: string
    path: `fonts/${string}`
    sourceFileName: string
    mimeType: "font/woff2" | "font/woff" | "font/ttf" | "font/otf"
    contentHash: string
    byteSize: number
    style: "normal" | "italic"
    weightMin: number
    weightMax: number
    postscriptName: string | null
  }>
}
```

Use a separate project `fonts/` directory rather than widening the existing image-only `assets` contract. Image code currently assumes dimensions, image MIME types, and `assets/` paths; a separate boundary keeps those invariants clear.

Each runtime face should receive a collision-proof CSS alias derived from its stable ID, for example `Plinth_builtin_inter_v1` or `Plinth_project_font_ab12cd`. The displayed family name remains human-friendly, but rendering never accidentally binds to a same-named system font.

### Migration

- Map every current stack containing Inter to `builtin:inter`.
- Replace every legacy system stack with `builtin:inter`; opening a current project with an unknown reference warns, substitutes Inter, and schedules the repaired project to save.
- New text and new presets use a bundled built-in ID only.
- Stop server-side migration from overwriting current font-dependent auto-height with its fallback estimator. Preserve valid stored geometry, then let the browser reconcile it after the exact face is ready.
- Keep v9 `fontFamily` migration-only; do not persist both representations indefinitely.

### Runtime font registry

Create a focused font subsystem, for example:

- `src/fonts/catalog.ts`: versioned built-in metadata, face URLs, weights, styles, subsets, and license references.
- `src/fonts/font-registry.ts`: `FontFace` creation, loading, deduplication, status, cleanup, and CSS aliases.
- `src/fonts/font-selection.ts`: face matching and allowed weights/styles.
- `src/hooks/use-project-fonts.ts`: project lifecycle and a render-readiness gate.
- `src/lib/font-validation.ts` and `src/lib/font-storage.ts`: upload and filesystem boundaries.

Register faces through the CSS Font Loading API using same-origin URLs or binary buffers. Cache by stable face ID plus content hash, and track `idle`, `loading`, `ready`, and `error` states directly. Do not infer availability from a CSS family name.

Load the fonts needed by a project before mounting full-resolution scene text. A newly selected or uploaded face should load first, then update the element and recalculate auto-height as one history operation. Thumbnails and export should observe the same font-registry revision so they cannot retain stale layout.

Export should preflight all exact faces for the queued screens before mounting each sequential export stage. Any missing or failed face blocks export with the family/style and affected screens listed.

### Rendering and measurement

- Replace the current regular/bold threshold with one shared canvas font descriptor that includes the numeric weight and italic state. Konva builds its Canvas 2D `font` value from `fontStyle`, so the implementation should pass a valid numeric-weight descriptor and test it with the bundled variable face.
- Use the same descriptor builder in `SceneRenderer`, text auto-height measurement, and readiness checks.
- Recalculate text geometry only after the face is ready. Font selection plus resulting height is one operation/history entry.
- Prevent synthetic weights and italics by limiting the controls to real faces/ranges. If synthesis is intentionally allowed later, represent that policy explicitly.
- Defer custom variable axes such as width, optical size, slant, and grade. Preserve room for an `axes` map in a later schema, but first make `wght` and normal/italic reliable.
- Later, parse `cmap` coverage to warn when the current text contains unsupported glyphs. A fallback for missing glyphs must be explicit if it is ever supported.

## Storage and API

Add project-scoped endpoints for listing, uploading, serving, renaming, and deleting fonts. Upload should accept one or several files so static regular/bold/italic faces can be grouped into one family; a single variable file is the simplest happy path.

Server validation should include:

- strict safe paths under `fonts/` and hash-derived immutable filenames;
- atomic writes and deduplication by content hash;
- supported signatures and structurally valid TTF, OTF, WOFF, or WOFF2 data;
- conservative per-file and per-project byte limits;
- parsed family, subfamily, PostScript name, weight/style, variable axes, and character map;
- rejection of truncated, malformed, mismatched, or unsupported collections;
- inspection of OpenType `fsType` embedding bits as a warning/rejection signal, without presenting those bits as a complete license determination;
- correct same-origin MIME types and `X-Content-Type-Options: nosniff`.

Evaluate a mature OpenType parser in a short spike before choosing a dependency. The chosen parser must work in Bun's compiled server, handle WOFF2 safely, and avoid rewriting font bytes unless subsetting becomes a separately designed feature.

Deleting an in-use font should not delete text. Block deletion and offer an atomic **Replace across project** action, then remove the unused family and files.

## UX/UI

### Font picker

Replace the native select with a searchable popover:

- **Project fonts** first, then **Built-in fonts**, with Recent/Favorites later if useful;
- family names rendered in their own typeface only after the preview face is ready;
- a plain-system-font label while previews load, avoiding layout jumps in the control;
- category/filter metadata such as sans, serif, mono, and display;
- badges for Variable, Project, Missing, or Legacy system fonts;
- an **Add fonts…** action in the picker.

Keep controls truthful:

- weight is a named list for static faces and a numeric slider/input for a variable `wght` range;
- italic is enabled only when an italic face or axis exists;
- unsupported current values show a warning and a deliberate nearest-match action rather than changing silently.

### Font manager

Add a project Font Manager, reachable from the picker and project settings. It should show family, available styles/weights, source filenames, size, variable axes, usage count, load state, and license/source notes. Actions are rename display label, replace usages, reveal usages, retry, and delete when unused.

### Missing and legacy fonts

Canvas text with an unresolved font should remain selectable but show a clear warning treatment. The inspector should say why it cannot render and offer:

- replace with a built-in;
- upload the matching font file;
- import a local font where supported;
- keep the legacy system reference, acknowledging it is machine-dependent.

Do not export the fallback appearance.

## Where fonts should come from

### Recommended baseline: Fontsource packages

[Fontsource](https://fontsource.org/docs/getting-started/introduction) packages open-source fonts for self-hosting, version-locking, privacy, and offline use. Its variable packages expose weight and other axes and let the build import only the necessary files. It is the easiest maintenance path for a curated built-in library, provided Plinth vendors the corresponding license text and verifies Bun's standalone build includes the font assets.

The selected set is pinned to Fontsource 5.3.0:

- Sans: Inter, DM Sans, Manrope, Space Grotesk, Source Sans 3, and Quicksand.
- Serif: Lora, Source Serif 4, and Fraunces.
- Monospace: JetBrains Mono and IBM Plex Mono.
- Display: Bebas Neue.
- CJK: Noto Sans SC, Noto Sans TC, Noto Sans JP, and Noto Sans KR.

Fourteen packages are variable WOFF2 families. IBM Plex Mono provides discrete 100–700 static weights with normal and italic faces; Bebas Neue provides its intended 400 normal face. The four Noto families provide localized Simplified Chinese, Traditional Chinese, Japanese, and Korean glyph forms with variable 100–900 weights. All 16 packages declare SIL OFL 1.1 and include their license text and attribution in the installed package.

### Maximum provenance control: Google Fonts source repository

The [Google Fonts source repository](https://github.com/google/fonts) contains redistributable files, per-family metadata, and license files. Vendoring exact files from it provides strong provenance and no runtime dependency, but Plinth would own more update, conversion, subsetting, and catalog-manifest work.

### Optional online catalog: Google Fonts or Bunny Fonts APIs

The [Google Fonts CSS v2 API](https://developers.google.com/fonts/docs/css2) supports exact styles and variable-axis ranges. [Bunny Fonts](https://fonts.bunny.net/about) offers a privacy-oriented, Google Fonts v1-compatible CDN. Either could power a later browse-and-install experience, but live CDN rendering should not be the project format: it introduces network failures, upstream changes, privacy considerations, and nondeterministic exports. If added, selecting a family should download a pinned file and license into Plinth-managed storage before the project uses it.

### User-provided files

Project-local upload is the broadest and most deterministic extension point. The user should confirm that they have rights to use and copy the font. Plinth can surface OpenType embedding flags, but those flags do not replace the actual license. The [SIL OFL](https://software.sil.org/oflt/) permits bundling and redistribution subject to its terms; the license file still needs to accompany built-in OFL fonts.

### Local system font access

Treat system-font discovery as an optional import convenience, not a foundation. Chromium's Local Font Access API requires explicit `local-fonts` permission and is not a portable cross-browser contract. Where available, **Import local font** can copy the chosen face into the project only after a rights confirmation. Elsewhere, use the regular file picker. A no-copy system-font mode can remain available for legacy compatibility but should be visibly non-portable and should never silently substitute during export.

## Delivery phases

### Phase 0: technical spike

- Prove a bundled WOFF2 variable font survives `bun run build` and the standalone executable.
- Prove numeric weights and italic use the same Canvas 2D descriptor in Konva and measurement.
- Select and test the server font parser, especially WOFF2, variable metadata, malformed files, and compiled-Bun compatibility.
- Measure bundle cost for the proposed character subsets and families.

### Phase 1: deterministic foundation

- Add schema v10, migration, built-in catalog, and bundled Inter normal/italic.
- Add the shared registry and gate editor, thumbnails, measurement, and export on exact readiness.
- Fix numeric weight rendering and remove server font-dependent reflow.
- Add missing-font diagnostics and block unsafe export.

This phase fixes current correctness even if the picker still offers only one or a few built-ins.

### Phase 2: curated library and picker

- Ship the approved curated families and license notices.
- Add searchable previews, category filters, real style/weight controls, and loading/error states.
- Update defaults and presets to stable built-in IDs.

### Phase 3: project font uploads

- Add validation, storage, APIs, multi-face grouping, the Font Manager, usage tracking, replacement, and deletion rules.
- Add explicit license confirmation and OpenType embedding warnings.
- Ensure project rename, duplicate, and delete operations include font files atomically.

### Phase 4: optional expansion

- Add local-font import where supported.
- Consider browse-and-install from a pinned open-font catalog.
- Add glyph-coverage warnings, more language subsets, and advanced variable axes.
- Consider a global personal library only if fonts are still copied into each project for portability.

## Validation and acceptance criteria

- The same project renders the same bundled/uploaded font faces after restart and without internet access.
- Weight 500 is distinguishable from 400 and 700 when the font supports it; 750/820 work on a variable face.
- Editor, thumbnails, overflow projections, auto-height, and PNG export use the same registered face and descriptor.
- A scene never exports while a requested face is missing, failed, or still loading.
- Loading a face after opening a project deterministically invalidates measurement and Konva layout.
- Project JSON remains readable and contains metadata/references only, never font bytes or data URLs.
- Invalid, oversized, restricted, mismatched, and path-traversal uploads are rejected without partial writes.
- Duplicate uploads deduplicate safely; project duplication and rename preserve all font references.
- In-use deletion requires replacement; unused deletion removes metadata and the validated file atomically.
- Every bundled family includes its exact source/version, license notice, and a reproducible manifest entry.
- Existing v9 projects migrate without silently changing non-Inter families.

## Decisions to make

1. **Portability policy**
   - Recommended: deterministic built-in/project fonts for all new text; legacy system references are allowed only with warnings.
   - Alternative: freely allow system stacks, accepting machine-dependent wrapping and exports.

2. **Built-in catalog size**
   - Recommended: 10–15 curated families, primarily variable WOFF2, with Latin Extended coverage and clear categories.
   - Lean alternative: Inter plus one serif and one mono; rely on uploads.
   - Broad alternative: a browse-and-install Google Fonts catalog, with significantly more network, metadata, and licensing UX.

3. **Uploaded-font scope**
   - Recommended: project-local first, because it matches Plinth's source-of-truth and portability model.
   - Alternative: a global library, which needs lifecycle, broken-reference, backup, and project-sharing rules. A later global library should vendor selected faces into each project.

4. **Variable font UX**
   - Recommended: implement variable ranges internally now; expose weight plus italic first and add other axes later.
   - Alternative: expose all axes immediately, increasing schema, controls, presets, measurement, and testing scope.

5. **Existing system-font migration**
   - Recommended: map Inter stacks automatically; preserve Arial/Georgia/mono as warned legacy references until the user replaces or imports them.
   - Alternative: map every old choice to a bundled approximation, which is deterministic but changes existing layouts.

6. **Language coverage**
   - Recommended initial default: Latin Extended across the curated set, with clearly identified broader-script families or uploads.
   - Alternative: bundle broad Noto coverage immediately, accepting a much larger distribution.

7. **Online catalog**
   - Recommended: defer it until uploads are solid; if added, download and pin files rather than rendering from a CDN.
   - Alternative: use live CDN fonts for instant breadth, accepting that offline and reproducible export guarantees become weaker.

8. **License confirmation for uploads**
   - Recommended: a concise confirmation on import plus persistent source/license notes in the Font Manager.
   - Alternative: accept files without confirmation and leave all rights tracking outside Plinth.
