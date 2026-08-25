import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, "");
const cacheDir = join(root, ".cache");
const validatorPath = join(cacheDir, "miniant-validate.mjs");
const fallbackValidator = "/Users/wassi/Documents/Codex/growtail-miniant/miniant-validate.mjs";

async function ensureValidator() {
  await mkdir(cacheDir, { recursive: true });
  try {
    await access(validatorPath);
    return;
  } catch {
    // Continue to download/cache setup.
  }

  const download = spawn("curl", [
    "-fsSL",
    "--max-time",
    "30",
    "-o",
    validatorPath,
    "https://publish.miniant.games/tools/miniant-validate.mjs",
  ], { stdio: "inherit" });

  const code = await new Promise((resolve) => download.on("close", resolve));
  if (code === 0) {
    return;
  }

  await copyFile(fallbackValidator, validatorPath);
}

await ensureValidator();

const validate = spawn(process.execPath, [validatorPath, join(root, "dist"), "--checklist"], {
  stdio: "inherit",
});
const code = await new Promise((resolve) => validate.on("close", resolve));
process.exit(code ?? 1);
