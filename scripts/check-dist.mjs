import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, "");
const dist = join(root, "dist");
const forbidden = [
  /navigator\.serviceWorker/i,
  /register-sw\.js/i,
  /stripe/i,
  /razorpay/i,
  /paypal/i,
  /paddle/i,
  /WebSocket/i,
  /localStorage\.setItem\([^)]*(wallet|ticket|rank|leaderboard)/i,
];
const rootForbiddenNames = new Set(["test-results", "playwright-report"]);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

let totalBytes = 0;
const findings = [];
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (rootForbiddenNames.has(entry.name)) {
    findings.push(`root contains local-only artifact: ${entry.name}`);
  }
}

for await (const file of walk(dist)) {
  totalBytes += (await stat(file)).size;
  const ext = file.split(".").pop()?.toLowerCase();
  if (!["html", "js", "css", "json", "txt"].includes(ext ?? "")) {
    continue;
  }
  const text = await readFile(file, "utf8");
  if (file.endsWith("index.html") && /\\n/.test(text)) {
    findings.push(`${relative(dist, file)} contains literal escaped newline text`);
  }
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      findings.push(`${relative(dist, file)} matched ${pattern}`);
    }
  }
}

if (totalBytes > 300 * 1024 * 1024) {
  findings.push(`dist is larger than 300MB: ${totalBytes} bytes`);
}

if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log(`dist check passed (${totalBytes} bytes)`);
