# Plinth

Like we needed another screenshot tool. Well, what I wanted was a bit different from what I could find.

Plinth is a local-first editor for composing App Store screenshots. Your scenes stay editable. Projects are stored as human-readable JSON. Assets live beside them. Exports are ordinary PNGs. Your work lives on your machine and does not require relying on any cloud services.

This also makes Plinth a particularly willing accomplice for ChatGPT Work and Codex. Because the entire project is made of legible files rather than an inscrutable design format, an agent can inspect scenes, rewrite copy, rearrange layouts, manage assets, and drive exports. The result is a workflow you can review, version, and automate instead of a tiny artisanal clicking ritual performed anew for every release.

In short: Plinth makes polished screenshots without taking your files hostage or turning “move this text three pixels left” into a recurring subscription.

## Setup

Plinth requires Bun 1.3 or newer.

```sh
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). The bundled example project is stored in `data/projects/example/`; other projects under `data/` are ignored by Git.

The project picker lives at `/`. Open editors use `/projects/<project-id>`, where the stable persisted ID keeps bookmarks and reloads working even if the project's editable slug changes. Other browser paths show the app's not-found state.

## Development

```sh
bun run dev        # Start the development server
bun run check      # Typecheck and test
bun run build      # Build the standalone executable
bun run tool help  # Show CLI commands
```

## Project storage

Projects are stored under `data/projects/<slug>/` with a human-readable `project.json`, an `assets/` directory, and generated `exports/`. Image data is never embedded in project JSON.

The asset library provides searchable grid and list views, editable display names, stored filename details, usage navigation, and image or frame placement. The shared frame menu can also wrap a selected canvas image or change an existing frame from the inspector. Stored filenames remain immutable and content-addressed. Uploads are validated by content and decoded before use; deleting a referenced asset also deletes its image/device layers and resets matching backgrounds so project JSON cannot retain broken references.

Image layers support reusable normalized source crops, per-instance backgrounds, rounded corners, borders, and shadows. A visual crop mode shows the complete source image with a draggable, resizable crop region; Enter or the inspector's Done action applies the session, while Escape cancels it. A selected image can create an independent editable crop callout that references the same asset. Shape overlays support solid, dashed, or dotted strokes, configurable line caps, arrows, and endpoint dots; editing and export use the same Konva scene renderer.

Each project contains ordered decks. A deck chooses its immutable pixel width and height at creation, and contains one or more ordered screens. The editor mounts only the active deck as one edge-to-edge horizontal canvas; clicking any screen focuses it and makes its layer stack the editing context. A screen stores an editable solid, gradient, transparent, or asset-backed background, an ordered `layers` array, notes, and export identity; its render and export dimensions are always resolved from the containing deck. Asset backgrounds persist cover/contain fit, a focal point, blur, an overlay, and optional seeded noise or texture so preview and export render the same effect. Owned layers contain the canonical element data once and an `overflow` flag. When overflow is enabled, target screens store compact links containing only the canonical element ID and owner screen ID. Links resolve from owner-local coordinates through deck-global coordinates into each target screen, while each screen keeps its own background crop and independent layer ordering. Selecting a linked projection still selects the one canonical element, and target-local moves or reorders affect only the focused screen's projection/order.

## Export

Use the Export dialog to export the focused screen, the current deck, or all decks. PNGs are rendered sequentially one screen at a time through the shared `SceneRenderer`, then downloaded through the browser or written to a configured local folder. Screens inherit their fixed dimensions from the deck that contains them.

## CLI

Plinth includes a CLI for inspecting and managing projects:

```sh
bun run tool help
```

PNG rendering remains in the browser editor.

## Bundled fonts

Plinth includes 17 Fontsource 5.3.0 families recorded in [`src/fonts/catalog.ts`](src/fonts/catalog.ts): Inter, DM Sans, Manrope, Space Grotesk, Source Sans 3, Quicksand, Nunito, Lora, Source Serif 4, Fraunces, JetBrains Mono, IBM Plex Mono, Bebas Neue, and localized Noto Sans families for Simplified Chinese, Traditional Chinese, Japanese, and Korean. [`src/fonts/font-faces.ts`](src/fonts/font-faces.ts) is the manifest for the corresponding face CSS; the existing stylesheet generator normalizes and bundles those declarations for consistent variable-font rendering. Every selected package declares the SIL Open Font License 1.1. Copyright attributions and the full license are tracked in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), and `bun run build` copies that notice plus each package's original license file beside the standalone executable under `dist/`.

Text styles persist stable font IDs rather than machine-dependent CSS stacks. WOFF2, WOFF, TTF, and OTF files can also be added from the searchable font picker after a rights confirmation; Plinth validates them, stores hash-addressed copies under the project’s `fonts/` directory, and includes them when the project folder is shared. Editor rendering and export both wait for registered font faces before using them.

## License

Plinth's original source and project content are licensed under the MIT License; see [LICENSE](LICENSE). Bundled fonts remain under the SIL Open Font License 1.1 included with each pinned Fontsource package. Bundled Apple device-frame assets remain subject to their original terms; see [`src/devices/frames/README.md`](src/devices/frames/README.md).
