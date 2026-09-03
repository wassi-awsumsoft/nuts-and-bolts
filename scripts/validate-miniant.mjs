import { access, copyFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, "");
const cacheDir = join(root, ".cache");
const validatorPath = join(cacheDir, "miniant-validate.mjs");
const tempValidatorPath = join(cacheDir, "miniant-validate.tmp.mjs");
const fallbackValidator = "/Users/wassi/Documents/Codex/growtail-miniant/miniant-validate.mjs";

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadValidator() {
  await rm(tempValidatorPath, { force: true });
  const download = spawn("curl", [
    "-fsSL",
    "--max-time",
    "30",
    "-o",
    tempValidatorPath,
    "https://publish.miniant.games/tools/miniant-validate.mjs",
  ], { stdio: "inherit" });

  const code = await new Promise((resolve) => download.on("close", resolve));
  if (code === 0) {
    await rename(tempValidatorPath, validatorPath);
    return true;
  }
  await rm(tempValidatorPath, { force: true });
  return false;
}

async function ensureValidator() {
  await mkdir(cacheDir, { recursive: true });

  if (await downloadValidator()) {
    return;
  }

  if (await fileExists(validatorPath)) {
    console.warn("Warning: live MiniAnt validator download failed; using cached validator.");
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
