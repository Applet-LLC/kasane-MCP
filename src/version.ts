import { readFileSync } from "node:fs";

/** kasane-MCP 自身のバージョン。package.json を唯一の出どころにする（dist/ と src/ のどちらからでも、1つ上にある）。 */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

export const VERSION: string = readVersion();
export const NAME = "kasane-mcp";
