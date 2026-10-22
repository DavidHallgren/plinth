# Plinth

Like we needed another screenshot tool. Well, what I wanted was a bit different from what I could find.

Plinth is a local-first editor for composing App Store screenshots. Your scenes stay editable. Projects are stored as human-readable JSON. Assets live beside them. Exports are ordinary PNGs. Your work lives on your machine and does not require relying on any cloud services.

This also makes Plinth a particularly willing accomplice for ChatGPT Work and Codex. Because the entire project is made of legible files rather than an inscrutable design format, an agent can inspect scenes, rewrite copy, rearrange layouts, manage assets, and drive exports. The result is a workflow you can review, version, and automate instead of a tiny artisanal clicking ritual performed anew for every release.

In short: Plinth makes polished screenshots without taking your files hostage or turning “move this text three pixels left” into a recurring subscription.

## Current standalone build

`bun run build` produces a self-contained executable that does not require Bun or a repository checkout. Starting it chooses an available local port, opens the editor in the default browser, and stores projects under `~/Library/Application Support/Plinth/projects` on macOS.

```sh
./dist/plinth
```

There is not yet a published binary release or Homebrew formula. The compiled executable currently launches the editor server; the development project-management CLI described below is not yet exposed as installed `plinth` subcommands.

Runtime options:

```text
--data-dir <path>  Store projects in this directory
--port <number>    Listen on an exact port; 0 chooses an available port
--no-open          Do not open the default browser
--help             Show runtime help
```

`PLINTH_DATA_ROOT`, `PORT`, `HOST`, and `PLINTH_NO_OPEN` provide equivalent environment configuration. Linux defaults to `$XDG_DATA_HOME/plinth/projects` or `~/.local/share/plinth/projects`; Windows defaults to `%LOCALAPPDATA%\Plinth\projects`.

## Development setup

Plinth requires Bun 1.3 or newer.

```sh
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). Development uses the same platform application-data directory as the standalone app, so projects no longer depend on the repository checkout. On the first launch into an empty project directory, Plinth copies its bundled example from `fixtures/projects/example/`. The copy is an ordinary editable project and stays deleted if you remove it.

The project picker lives at `/`. Each valid project loads a lightweight first-screen preview containing only the resolved screen model and its referenced asset metadata, then renders it through the shared scene renderer. Open editors use `/projects/<project-id>`, where the stable persisted ID keeps bookmarks and reloads working even if the project's editable slug changes. Other browser paths show the app's not-found state.

## Development

```sh
bun run dev        # Start the development server
bun run check      # Typecheck and test
bun run build      # Build the standalone executable
bun run tool help  # Show CLI commands
```

`bun run build` creates a clean `dist/` distribution containing the standalone executable, Plinth's license, `THIRD_PARTY_NOTICES.md`, and the original bundled-font license files.

## Project storage

Projects are stored under the platform application-data directory described above in both standalone and development modes. Pass `--data-dir` to either the server or CLI to use another root. Opening the app with a fresh, empty root seeds a writable copy of the bundled example project once; a small initialization marker prevents a deleted example from returning. Every project contains a human-readable `project.json`, an `assets/` directory, and generated `exports/`. Image data is never embedded in project JSON.

The default roots are:

```text
macOS:  ~/Library/Application Support/Plinth/projects
Linux:  $XDG_DATA_HOME/plinth/projects or ~/.local/share/plinth/projects
Windows: %LOCALAPPDATA%\Plinth\projects
```

Each immediate child directory is one project, for example `~/Library/Application Support/Plinth/projects/zibyzi-cards/`. Runtime projects are not stored in this repository. The tracked example in `fixtures/projects/example/` is an immutable seed source, not the live editable copy.

## Agent workflows today

Plinth projects are deliberately legible enough for an agent to inspect and edit, but the polished installed-agent workflow is not built yet. Work performed from this repository benefits from the repository `AGENTS.md`, source code, tests, and `bun run tool`. A standalone executable does not currently install a Plinth skill, add agent instructions to project folders, expose an “Open in Codex” action, or provide the development CLI as installed subcommands.

An agent can be pointed manually at an individual project directory when focused access is desired, or at the projects root for cross-project work. Direct file edits should only be made after any pending browser save has completed, and the result should be validated before reopening or continuing in the editor; a future installed CLI should make that coordination safer.

The asset library provides searchable grid and list views, editable display names, stored filename details, usage navigation, and image or frame placement. The shared frame menu can also wrap a selected canvas image or change an existing frame from the inspector. Stored filenames remain immutable and content-addressed. Uploads are validated by content and decoded before use; deleting a referenced asset also deletes its image/device layers and resets matching backgrounds so project JSON cannot retain broken references.

Image layers support reusable normalized source crops, per-instance backgrounds, rounded corners, borders, and shadows. A visual crop mode shows the complete source image with a draggable, resizable crop region; Enter or the inspector's Done action applies the session, while Escape cancels it. A selected image can create an independent editable crop callout that references the same asset. Shape overlays support solid, dashed, or dotted strokes, configurable line caps, arrows, and endpoint dots; editing and export use the same Konva scene renderer.

Each project contains ordered decks. A deck chooses its immutable pixel width and height at creation, and contains one or more ordered screens. The editor mounts only the active deck as one edge-to-edge horizontal canvas; clicking any screen focuses it and makes its layer stack the editing context. A screen stores an editable solid, gradient, transparent, or asset-backed background, an ordered `layers` array, notes, and export identity; its render and export dimensions are always resolved from the containing deck. Asset backgrounds persist cover/contain fit, a focal point, blur, an overlay, and optional seeded noise or texture so preview and export render the same effect. Owned layers contain the canonical element data once and an `overflow` flag. When overflow is enabled, target screens store compact links containing only the canonical element ID and owner screen ID. Links resolve from owner-local coordinates through deck-global coordinates into each target screen, while each screen keeps its own background crop and independent layer ordering. Selecting a linked projection still selects the one canonical element, and target-local moves or reorders affect only the focused screen's projection/order.

## Export

Use the Export dialog to export the focused screen, the current deck, or all decks. PNGs are rendered sequentially one screen at a time through the shared `SceneRenderer`, then downloaded through the browser or written to a configured local folder. Screens inherit their fixed dimensions from the deck that contains them.

## CLI

The source checkout includes a development CLI for inspecting and managing projects:

```sh
bun run tool help
```

The CLI uses the platform application-data directory by default. Pass `--data-dir <path>` to inspect or modify an isolated project directory instead.

The standalone executable does not yet expose these commands. PNG rendering remains in the browser editor.

## Duo and App Store artwork presets

The deck picker includes these additional canvas presets. Duo canvases start with the matching editable device; header and search canvases start blank with an opaque background.

| Preset ID | Canvas pixels | Device frame ID |
| --- | --- | --- |
| `iphone-duo-outer` | 1398 × 2034 | `iphone-duo-outer` |
| `iphone-duo-outer-landscape` | 2034 × 1398 | `iphone-duo-outer-landscape` |
| `iphone-duo-inner` | 2007 × 2853 | `iphone-duo-inner` |
| `iphone-duo-inner-landscape` | 2853 × 2007 | `iphone-duo-inner-landscape` |
| `app-store-header` | 3840 × 1646 | — |
| `app-store-search` | 3840 × 2560 | — |

Duo frames use Apple's official PNG bezels in Night Sky and Star White through the shared renderer. Both folded and unfolded views have dedicated portrait and landscape artwork, with measured apertures matching the App Store screenshot aspect ratios. Choose the matching landscape frame for a landscape screenshot without rotating its pixels. Import the screenshot through the asset library and use **Add with frame**, or replace the screenshot on a seeded device. Keep the frame's aspect ratio when resizing; both Cover and Contain fit a matching screenshot without cropping or letterboxing. Hardware details come from the artwork, with no synthetic camera overlay; Duo bezels remain visible when the Camera toggle is off. See [asset provenance and aperture measurements](src/devices/frames/README.md).

The source CLI still requires explicit deck dimensions. For example, add an unfolded landscape deck to an existing project:

```sh
bun run tool add-deck <project-slug> "Duo inner landscape" --width 2853 --height 2007 --preset iphone-duo-inner-landscape
```

`add-screen` accepts the same preset IDs but inherits the existing deck dimensions. Dimensions were checked on 2026-10-22 against Apple's [screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/), [creative asset specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/), and `asc screenshots sizes --all` (`APP_IPHONE_DUO`). Apple requires opaque artwork; these canvases use the same browser PNG export path as all other decks.

## iPad and iPhone 18 presets

The frame picker and deck picker include iPad Pro M5 and iPad Air M4 in both 11-inch and 13-inch sizes, plus iPhone 18 Pro and Pro Max. Every model has portrait and landscape presets backed by Apple's dedicated PNG artwork. The iPhone 18 download contains the two Pro models; a base iPhone 18 frame is not included.

| Portrait preset ID | Native screenshot pixels | Finishes |
| --- | --- | --- |
| `ipad-pro-m5-11` | 1668 × 2420 | Space Black, Silver |
| `ipad-pro-m5-13` | 2064 × 2752 | Space Black, Silver |
| `ipad-air-m4-11` | 1640 × 2360 | Space Gray, Blue, Purple, Starlight |
| `ipad-air-m4-13` | 2048 × 2732 | Space Gray, Blue, Purple, Starlight |
| `iphone-18-pro` | 1206 × 2622 | Black, Burgundy, Glacier, Silver |
| `iphone-18-pro-max` | 1320 × 2868 | Black, Burgundy, Glacier, Silver |

Append `-landscape` to the preset ID for the corresponding landscape frame and canvas; screenshot width and height are reversed. Import a screenshot and choose **Add with frame**, or use the matching canvas preset to start with an editable device. Keep the frame's aspect ratio when resizing. Hardware details come from the PNG, with no extra camera overlay, and the artwork remains visible when Camera is off. All presets use the shared editor/export renderer and image-readiness checks. See [the source packages and measured apertures](src/devices/frames/README.md).

## MacBook M5 presets

The Mac frame picker includes Apple's front-facing MacBook Air M5 and MacBook Pro M5 bezels, with matching native screenshot canvases:

| Preset ID | Native screenshot pixels | Finishes |
| --- | --- | --- |
| `macbook-air-m5-13` | 2560 × 1664 | Sky Blue, Silver, Starlight, Midnight |
| `macbook-air-m5-15` | 2880 × 1864 | Sky Blue, Silver, Starlight, Midnight |
| `macbook-pro-m5-14` | 3024 × 1964 | Space Black, Silver |
| `macbook-pro-m5-16` | 3456 × 2234 | Space Black, Silver |

Choose **Add with frame** on an imported screenshot, change an existing device's frame, or create a matching deck preset. Use a full-display screenshot, including the menu-bar area, and keep the device's aspect ratio when resizing. Cover and Contain fit the matching dimensions without cropping or padding. The official PNG supplies the notch, camera, and laptop body; screenshot clipping preserves the square bottom display corners. Editor, thumbnails, and export share the same rendering and image-readiness paths. These are native display canvases; check App Store Connect's accepted sizes separately when preparing store submissions. See [asset provenance and measured geometry](src/devices/frames/README.md).

## Apple Watch presets

Apple Watch frames include every case-and-band combination in the Series 11, Ultra 3, and Ultra 2 packages currently linked from [Apple Design Resources](https://developer.apple.com/design/resources/). Select the model and size from **Apple Watch**, then choose the complete combination in **Frame finish**.

| Preset ID | Native screenshot pixels | Available artwork |
| --- | --- | --- |
| `apple-watch-series-11-42` | 374 × 446 | 22 combinations across 7 case finishes |
| `apple-watch-series-11-46` | 416 × 496 | 22 combinations across 7 case finishes |
| `apple-watch-ultra-3-49` | 422 × 514 | 13 combinations in Natural or Black titanium |
| `apple-watch-ultra-2-49` | 410 × 502 | 19 combinations in Natural or Black titanium |

Series 11 includes Jet Black, Rose Gold, Silver, and Space Gray aluminum, plus Gold, Natural, and Slate titanium. Its supplied bands are Sport Band, Sport Loop, Magnetic Link, and Milanese Loop. Ultra artwork includes Alpine Loop, Ocean Band, Trail Loop, and Milanese Loop. The picker exposes the combinations Apple supplies; available band colors differ between cases and generations.

Import a native screenshot through **Add with frame**, convert an existing image, or create a matching canvas preset. Preserve the frame aspect ratio when resizing. Cover and Contain fill the measured display opening, while the original PNG provides the case, crown, and band. The 42 mm canvas uses the device's native resolution; App Store Connect's accepted Watch screenshot sizes are listed [separately](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/). See [the package sources, licenses, and aperture measurements](src/devices/frames/README.md).

## Bundled fonts

Plinth includes 17 Fontsource 5.3.0 families recorded in [`src/fonts/catalog.ts`](src/fonts/catalog.ts): Inter, DM Sans, Manrope, Space Grotesk, Source Sans 3, Quicksand, Nunito, Lora, Source Serif 4, Fraunces, JetBrains Mono, IBM Plex Mono, Bebas Neue, and localized Noto Sans families for Simplified Chinese, Traditional Chinese, Japanese, and Korean. [`src/fonts/font-faces.ts`](src/fonts/font-faces.ts) is the manifest for the corresponding face CSS; the existing stylesheet generator normalizes and bundles those declarations for consistent variable-font rendering. Every selected package declares the SIL Open Font License 1.1. Copyright attributions and the full license are tracked in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), and `bun run build` copies that notice plus each package's original license file beside the standalone executable under `dist/`.

Text styles persist stable font IDs rather than machine-dependent CSS stacks. WOFF2, WOFF, TTF, and OTF files can also be added from the searchable font picker after a rights confirmation; Plinth validates them, stores hash-addressed copies under the project’s `fonts/` directory, and includes them when the project folder is shared. Editor rendering and export both wait for registered font faces before using them.

## License

Plinth's original source and project content are licensed under the MIT License; see [LICENSE](LICENSE). Bundled fonts remain under the SIL Open Font License 1.1 included with each pinned Fontsource package. Bundled Apple device-frame assets remain subject to their original terms; see [`src/devices/frames/README.md`](src/devices/frames/README.md).
