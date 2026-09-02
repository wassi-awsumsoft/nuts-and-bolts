# MiniAnt Readiness Notes

Recipe followed: `publish-new-game`.

Validator output:

```text
PASS — build output looks ready to publish.
```

What was added:

- `miniant.json` declares a solo portrait game with no relay, wallet, or save-state capability.
- `scripts/miniant-bridge.js` waits for `MiniAnt.init({ sdkVersion: 1 })` before loading the Construct runtime in embedded sessions.
- The bridge handles `pause`, `resume`, `settings_changed`, `terminate`, `ready`, `reportProgress`, and best-effort abandoned/completed `reportResult`.
- `scripts/miniant-scoring.js` adds Liquid Sort-style level scoring, persistent total score storage, a score HUD, and per-level `MiniAnt.reportProgress()` calls while leaving the extracted Construct game files and original screens unchanged.
- The bridge does not add replacement gameplay UI and does not reposition or resize the Construct canvas; the original game controls play, settings, and layout.
- MiniAnt `reportProgress` and `reportResult` use the accumulated wrapper score when available, with the original level number as fallback.
- The publish build removes only PWA/service-worker references and keeps the extracted gameplay runtime/assets intact.
- The publish checks reject literal escaped newline text in `dist/index.html`, which prevents `\n` strings from rendering in the top-left corner.
- Missing/corrupted HAR assets were recovered from the same captured source URL, including `scripts/c3runtime.js`, WebM media, icons, and `Level1.txt` through `Level100.txt`.

Verification:

- `npm run build` passed.
- `npm run check` passed: `dist check passed (4052949 bytes)`.
- `npm run miniant:validate` passed using the locally cached MiniAnt validator when the live validator download endpoint was unavailable.
- Playwright embedded SDK-stub smoke reached a visible canvas and observed `init`, lifecycle handler registration, `ready`, and immediate `reportProgress`.
- Playwright mobile touch smoke confirmed Play opens Level 1 and the native gear opens the original pause/settings popup.
- Playwright geometry smoke confirmed the wrapped build matches the raw Construct export at 390x844: canvas rect `0,75,390,693`.
- Browser smoke after the scoring update confirmed the score HUD is visible, the original completion modal remains the only completion screen, no wrapper completion modal selectors remain in `dist`, and the original gear opens the native pause/settings popup.

Residual limits:

- The score layer observes the preserved Construct runtime from the wrapper. It does not rewrite the compiled game events, level data, or original completion screen.
- Local HTTP smoke shows browser autoplay and insecure-context warnings; MiniAnt production hosting is HTTPS, and audio autoplay still depends on browser/user-gesture policy.
