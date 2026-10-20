const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.version !== "1.0.0") throw new Error(`Expected manifest version 1.0.0, found ${manifest.version}`);
const files = [
  "manifest.json", "background.js", "content.js", "popup.html", "popup.js", "popup.css",
  "options.html", "options.js", "options.css", "sounds/sounds.js", "icons/quickcut.svg",
  "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png"
];
for (const file of files) {
  if (!fs.statSync(path.join(root, file)).isFile()) throw new Error(`Missing runtime file: ${file}`);
}
const dist = path.join(root, "dist");
fs.mkdirSync(dist, { recursive: true });
const output = path.join(dist, `quickcut-${manifest.version}.zip`);
fs.rmSync(output, { force: true });
const staging = fs.mkdtempSync(path.join(os.tmpdir(), "quickcut-release-"));
try {
  for (const file of files) {
    const destination = path.join(staging, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  execFileSync("zip", ["-q", "-X", "-D", "-r", output, "."], { cwd: staging });
  const listed = execFileSync("unzip", ["-Z1", output], { encoding: "utf8" })
    .trim().split(/\r?\n/).filter(Boolean).sort();
  const expected = [...files].sort();
  if (JSON.stringify(listed) !== JSON.stringify(expected)) {
    throw new Error(`ZIP contents differ from runtime allowlist.\nExpected: ${expected.join(", ")}\nFound: ${listed.join(", ")}`);
  }
  if (listed[0] !== "background.js" && !listed.includes("manifest.json")) {
    throw new Error("manifest.json is missing from the ZIP root.");
  }
  console.log(`Created ${path.relative(root, output)} (${listed.length} files)`);
  console.log(listed.map((file) => `- ${file}`).join("\n"));
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
