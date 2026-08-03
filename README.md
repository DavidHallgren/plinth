# Plinth

Plinth is a local-first editor for composing and exporting App Store screenshots. Projects remain editable as human-readable JSON with assets stored alongside them.

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

## Export

Use the Export dialog to export the current document or every document. PNGs can be downloaded through the browser or written to a configured local folder.

## CLI

Plinth includes a CLI for inspecting and managing projects:

```sh
bun run tool help
```

PNG rendering remains in the browser editor.

## License

Plinth's original source and project content are licensed under the MIT License; see [LICENSE](LICENSE). Bundled Apple device-frame assets remain subject to their original terms; see [`src/devices/frames/README.md`](src/devices/frames/README.md).
