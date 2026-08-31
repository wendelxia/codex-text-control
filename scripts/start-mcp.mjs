import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const missing = ["@modelcontextprotocol/ext-apps", "@modelcontextprotocol/sdk", "zod"].some((name) => !existsSync(path.join(root, "node_modules", ...name.split("/"))));
if (missing) {
  const result = spawnSync(process.platform === "win32" ? "cmd.exe" : "npm", process.platform === "win32" ? ["/d", "/s", "/c", "npm", "install"] : ["install"], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`npm install 失败，退出码：${result.status}`);
}
process.chdir(root);
await import(pathToFileURL(path.join(root, "mcp", "server.mjs")).href);
