import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DocsIndex, READ_LIMIT, TUTORIAL_URI, manualUri, type Lang } from "./index.js";

const NO_DOCS = "kasane のマニュアルが見つかりません。kasane をインストールするか、環境変数 KASANE_HOME にインストール先を設定してください。";
const LANG = z.enum(["ja", "en"]).optional().describe("マニュアルの言語。ja（日本語）か en（英語）。省略すると ja。ユーザーが英語で話しているときは en。");

export function registerDocs(server: McpServer, docs: DocsIndex): void {
  const noDocs = () => ({ isError: true, content: [{ type: "text" as const, text: NO_DOCS }] });
  const text = (t: string, isError = false) => ({ ...(isError ? { isError: true } : {}), content: [{ type: "text" as const, text: t }] });

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

  for (const lang of ["ja", "en"] as const) {
    server.registerResource(
      `manual-${lang}`,
      new ResourceTemplate(`kasane-doc://manual/${lang}/{page}`, {
        list: async () => ({
          resources: docs.pages
            .filter((p) => p.id.startsWith(`manual/${lang}/`))
            .map((p) => ({ uri: p.uri, name: p.id, title: p.title, mimeType: "text/markdown" })),
        }),
      }),
      { title: lang === "ja" ? "kasane マニュアル（日本語）" : "kasane manual (English)", mimeType: "text/markdown" },
      (_uri, vars) => read(manualUri(String(vars.page), lang)),
    );
  }

  server.registerTool(
    "kasane_list_docs",
    {
      title: "kasane のドキュメントの一覧",
      description:
        "kasane のマニュアルと CLI チュートリアルの、ページの一覧（ページ名、題名、節の見出し）を返す。どのページを読めばよいか分からないときに使う。ページの全文は kasane_read_doc で読む。読み取り専用。",
      inputSchema: { language: LANG },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ language }) => {
      if (docs.pages.length === 0) return noDocs();
      const lang: Lang = language ?? "ja";
      const pages = docs.list(lang);
      if (pages.length === 0) return text(`${lang === "en" ? "英語" : "日本語"}のマニュアルは、インストールされていません。読める言語: ${docs.languages().join(", ") || "なし"}`, true);
      const body = pages
        .map((p) => `- ${p.slug}: ${p.title}\n  節: ${p.sections.map((s) => s.heading).filter((h) => h && h !== p.title).join(" / ") || "（なし）"}`)
        .join("\n");
      return text(`${body}\n\nページの全文は、kasane_read_doc の page にページ名（例: ${pages[0].slug}）を渡して読む。`);
    },
  );

  server.registerTool(
    "kasane_read_doc",
    {
      title: "kasane のドキュメントを読む",
      description:
        "kasane のマニュアルまたは CLI チュートリアルの、ページの全文（または 1 つの節）を返す。kasane の機能の説明、設定の手順、設定ファイルに書く内容を答える前に、検索の抜粋で推測せず、必ずこれで該当ページを読む。ページ名は kasane_list_docs か kasane_search_docs の結果にある（例: 07-emergency、08-key-assign、cli-tutorial）。長いページは、続きの offset が返るので、続けて読む。読み取り専用。",
      inputSchema: {
        page: z.string().min(1).describe("ページ名（例: 07-emergency）。番号だけ（例: 7）、URI でもよい。CLI チュートリアルは cli-tutorial。"),
        section: z.string().optional().describe("読みたい節の見出し（の一部）。省略するとページ全体。"),
        language: LANG,
        offset: z.number().int().min(0).optional().describe(`続きを読むときの開始位置（文字数）。前の結果の「次の offset」を渡す。1 回に返すのは約 ${READ_LIMIT} 文字まで。`),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ page, section, language, offset }) => {
      if (docs.pages.length === 0) return noDocs();
      const r = docs.read(page, language ?? "ja", section, offset ?? 0);
      if (!r.ok || !r.page || r.text === undefined) return text(r.error ?? "読めませんでした。", true);
      const head = `【${r.page.title}】${r.page.uri}（全 ${r.total} 文字）`;
      const tail = r.next !== undefined ? `\n\n（続きがあります。kasane_read_doc を、page=${r.page.slug}${section ? `、section=${section}` : ""}、offset=${r.next} で呼んでください。続きを読むまで、答えを確定しないでください）` : "\n\n（ここまでで、このページ（または節）の全文です）";
      return text(`${head}\n\n${r.text}${tail}`);
    },
  );

  server.registerTool(
    "kasane_search_docs",
    {
      title: "kasane のドキュメントを検索",
      description:
        "インストール済みの kasane のマニュアルと CLI チュートリアルを検索し、該当する節の抜粋とページ名を返す。抜粋は短いので、これだけで答えたり、設定ファイルの内容を決めたりしない。該当したページを kasane_read_doc で読んでから答える。kasane の使い方、設定の手順、緊急解除、トラブル対応の質問には、答える前にこれを使う。読み取り専用。",
      inputSchema: {
        query: z.string().min(1).describe("検索語（例: 緊急解除、タップダンス、バックアップ。language が en なら英語の語）"),
        limit: z.number().int().min(1).max(10).optional(),
        language: LANG,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit, language }) => {
      if (docs.pages.length === 0) return noDocs();
      const hits = docs.search(query, limit ?? 5, language ?? "ja");
      const body = hits.length
        ? hits.map((h, i) => `${i + 1}. ${h.pageTitle} / ${h.heading || "（冒頭）"}\n   page: ${h.slug}${h.heading ? `、section: ${h.heading}` : ""}\n   ${h.excerpt}`).join("\n\n") +
          "\n\n抜粋は一部です。答える前に、該当するページを kasane_read_doc で読んでください。"
        : "該当する節が見つかりませんでした。別の語で試すか、kasane_list_docs でページの一覧を見てください。";
      return text(body);
    },
  );
}
