import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DocsIndex, TUTORIAL_URI, manualUri } from "./index.js";

export function registerDocs(server: McpServer, docs: DocsIndex): void {
  const read = (uri: string) => {
    const page = docs.get(uri);
    if (!page) throw new Error(`ドキュメントが見つかりません: ${uri}`);
    return { contents: [{ uri, mimeType: "text/markdown", text: docs.render(page) }] };
  };

  if (docs.get(TUTORIAL_URI)) {
    server.registerResource(
      "cli-tutorial",
      TUTORIAL_URI,
      { title: "KeymapTool（CLI）チュートリアル", mimeType: "text/markdown" },
      () => read(TUTORIAL_URI),
    );
  }

  server.registerResource(
    "manual-ja",
    new ResourceTemplate("kasane-doc://manual/ja/{page}", {
      list: async () => ({
        resources: docs.pages
          .filter((p) => p.id.startsWith("manual/ja/"))
          .map((p) => ({ uri: p.uri, name: p.id, title: p.title, mimeType: "text/markdown" })),
      }),
    }),
    { title: "kasane マニュアル（日本語）", mimeType: "text/markdown" },
    (_uri, vars) => read(manualUri(String(vars.page))),
  );

  server.registerTool(
    "kasane_search_docs",
    {
      title: "kasane のドキュメントを検索",
      description:
        "インストール済みの kasane のマニュアルと CLI チュートリアルを検索し、該当する節の抜粋と URI を返す。kasane の使い方、設定の手順、緊急解除、トラブル対応の質問には、答える前にこれを使う。全文は、返された URI を resources から読む。読み取り専用。",
      inputSchema: {
        query: z.string().min(1).describe("検索語（例: 緊急解除、タップダンス、バックアップ）"),
        limit: z.number().int().min(1).max(10).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit }) => {
      if (docs.pages.length === 0) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "kasane のマニュアルが見つかりません。kasane をインストールするか、環境変数 KASANE_HOME にインストール先を設定してください。" }],
        };
      }
      const hits = docs.search(query, limit ?? 5);
      const body = hits.length
        ? hits.map((h, i) => `${i + 1}. ${h.pageTitle} / ${h.heading || "（冒頭）"}\n   ${h.uri}\n   ${h.excerpt}`).join("\n\n")
        : "該当する節が見つかりませんでした。別の語で試してください。";
      return { content: [{ type: "text" as const, text: body }] };
    },
  );
}
