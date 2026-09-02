# Nuts and Bolts MiniAnt Package

This package wraps the extracted Construct game from `game-source/` for MiniAnt.
The extracted game runtime and assets are kept intact for auditability.
`npm run build` copies them to `dist/`, removes only PWA/service-worker
references from the publish output, and adds `scripts/miniant-bridge.js` for the
MiniAnt lifecycle. `scripts/miniant-scoring.js` adds a wrapper-level score HUD,
Liquid Sort-style level scoring, and per-level MiniAnt progress reporting
without changing the extracted Construct game files or original screens.
Entry CSS and wrapper script filenames are content-hashed in `dist/index.html`
to avoid stale MiniAnt player caches.

Run:

```bash
npm run build
npm run check
npm run miniant:validate
npm run dev
```

Open `http://127.0.0.1:4817/` for local testing. Do not double-click
`index.html`; Construct exports need an HTTP server because browsers block file
loading on `file://`.
