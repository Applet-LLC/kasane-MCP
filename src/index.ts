#!/usr/bin/env node
/**
 * kasane-mcp: kasane（キーリマップ）のマニュアルを参照できる MCP サーバー（stdio）。
 * ドライバにも設定にも書き込まない。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DocsIndex } from "./docs/index.js";
import { registerDocs } from "./docs/register.js";
import { registerPrompts } from "./prompts.js";
import { registerTools } from "./tools.js";
import { NAME, VERSION } from "./version.js";
import { KeymapTool, locateKeymapTool } from "./adapters/keymaptool.js";

async function main(): Promise<void> {
  const docs = DocsIndex.load();
  if (docs.pages.length === 0) {
    process.stderr.write("kasane-mcp: kasane のマニュアルが見つかりません（KASANE_HOME を設定するか、kasane をインストールしてください）。\n");
  }
  const server = new McpServer({ name: NAME, version: VERSION });
  registerDocs(server, docs);
  registerTools(server, docs, new KeymapTool(locateKeymapTool(docs.location.home)));
  registerPrompts(server);
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  process.stderr.write(`kasane-mcp: fatal error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
