# Nuts and Bolts MiniAnt Package

This package wraps the extracted Construct game from `game-source/` for MiniAnt.
The extracted game runtime and assets are kept intact for auditability.
`npm run build` copies them to `dist/`, removes only PWA/service-worker
references from the publish output, and adds `scripts/miniant-bridge.js` for the
MiniAnt lifecycle.

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
