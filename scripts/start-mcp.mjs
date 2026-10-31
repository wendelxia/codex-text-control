import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const missing = Object.keys(manifest.dependencies).some((name) => !existsSync(path.join(root, "node_modules", ...name.split("/"))));
if (missing) {
  const installArgs = ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org/"];
  // MCP stdout is a protocol stream; dependency installation must only log to stderr.
  const result = spawnSync(process.platform === "win32" ? "cmd.exe" : "npm", process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...installArgs] : installArgs, { cwd: root, stdio: ["ignore", 2, 2] });
  if (result.status !== 0) throw new Error(`npm install 失败，退出码：${result.status}`);
}
process.chdir(root);
await import(pathToFileURL(path.join(root, "mcp", "server.mjs")).href);
