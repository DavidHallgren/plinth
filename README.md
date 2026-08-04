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

## Development

```sh
bun run dev        # Start the development server
bun run check      # Typecheck and test
bun run build      # Build the standalone executable
bun run tool help  # Show CLI commands
```

## Project storage

Projects are stored under `data/projects/<slug>/` with a human-readable `project.json`, an `assets/` directory, and generated `exports/`. Image data is never embedded in project JSON.

Each project contains ordered decks. A deck chooses its immutable pixel width and height at creation, and contains one or more ordered screens. The editor mounts only the active deck as one edge-to-edge horizontal canvas; clicking any screen focuses it and makes its layer stack the editing context. A screen stores editable background, an ordered `layers` array, notes, and export identity; its render and export dimensions are always resolved from the containing deck. Owned layers contain the canonical element data once and an `overflow` flag. When overflow is enabled, target screens store compact links containing only the canonical element ID and owner screen ID. Links resolve from owner-local coordinates through deck-global coordinates into each target screen, while each screen keeps its own background crop and independent layer ordering. Selecting a linked projection still selects the one canonical element, and target-local moves or reorders affect only the focused screen's projection/order.

## Export

Use the Export dialog to export the focused screen, the current deck, or all decks. PNGs are rendered sequentially one screen at a time through the shared `SceneRenderer`, then downloaded through the browser or written to a configured local folder. Screens inherit their fixed dimensions from the deck that contains them.

## CLI

Plinth includes a CLI for inspecting and managing projects:

```sh
bun run tool help
```

PNG rendering remains in the browser editor.

## License

Plinth's original source and project content are licensed under the MIT License; see [LICENSE](LICENSE). Bundled Apple device-frame assets remain subject to their original terms; see [`src/devices/frames/README.md`](src/devices/frames/README.md).
