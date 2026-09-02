import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, "");
const dist = join(root, "dist");
const sourceGame = join(root, "game-source");

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "scripts"), { recursive: true });
await cp(join(root, "miniant.json"), join(dist, "miniant.json"));
await cp(join(root, "README.md"), join(dist, "README.md"));
await cp(sourceGame, dist, {
  recursive: true,
  filter: (source) => !source.endsWith("/scripts/register-sw.js") && !source.endsWith("/.DS_Store"),
});
await cp(join(root, "src", "miniant-bridge.js"), join(dist, "scripts", "miniant-bridge.js"));
await cp(join(root, "src", "miniant-scoring.js"), join(dist, "scripts", "miniant-scoring.js"));
await cp(join(root, "src", "miniant.css"), join(dist, "miniant.css"));

const mainScriptPath = join(dist, "scripts", "main.js");
const mainScript = await readFile(mainScriptPath, "utf8");
await writeFile(
  mainScriptPath,
  mainScript.replace("const enableWorker=true;", "const enableWorker=false;"),
  "utf8",
);

async function hashAsset(relativePath) {
  const sourcePath = join(dist, relativePath);
  const contents = await readFile(sourcePath);
  const hash = createHash("sha256").update(contents).digest("hex").slice(0, 8);
  const parsed = parse(relativePath);
  const hashedPath = join(parsed.dir, `${parsed.name}.${hash}${parsed.ext}`).replaceAll("\\", "/");
  await rename(sourcePath, join(dist, hashedPath));
  return hashedPath;
}

const styleCssPath = await hashAsset("style.css");
const miniantCssPath = await hashAsset("miniant.css");
const miniantBridgePath = await hashAsset("scripts/miniant-bridge.js");
const miniantScoringPath = await hashAsset("scripts/miniant-scoring.js");

const gameIndexPath = join(dist, "index.html");
const originalIndex = await readFile(gameIndexPath, "utf8");
const miniantIndex = originalIndex
  .replace(/href="style\.css"/g, `href="${styleCssPath}"`)
  .replace(/\s*<link rel="manifest" href="appmanifest\.json">\s*/g, "\n")
  .replace(/\s*<link rel="apple-touch-icon"[^>]+>\s*/g, "\n")
  .replace(/\s*<link rel="icon"[^>]+>\s*/g, "\n")
  .replace(/\s*<script src="scripts\/supportcheck\.js"><\/script>\s*/g, "\n")
  .replace(/\s*<script src="scripts\/offlineclient\.js" type="module"><\/script>\s*/g, "\n")
  .replace(/\s*<script src="scripts\/main\.js" type="module"><\/script>\s*/g, "\n")
  .replace(/\s*<script src="scripts\/register-sw\.js" type="module"><\/script>\s*/g, "\n")
  .replace(
    "</head>",
    `<link rel="stylesheet" href="${miniantCssPath}">\n<script async src="https://www.miniant.games/sdk/v1.js"></script>\n</head>`,
  )
  .replace("<body>", '<body>\n<div id="miniant-status" aria-live="polite">Loading...</div>')
  .replace(
    "</body>",
    `<script type="module" src="${miniantBridgePath}"></script>\n<script type="module" src="${miniantScoringPath}"></script>\n</body>`,
  );

await writeFile(gameIndexPath, miniantIndex, "utf8");
