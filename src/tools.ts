import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { DocsIndex } from "./docs/index.js";
import { KeymapTool, KeymapToolError, type KeymapEntry } from "./adapters/keymaptool.js";
import { nameForScanCode, scanCodeHex, searchKeycodes } from "./keycodes/index.js";
import { validateKeymap } from "./keymap/validate.js";
import { renderFormat } from "./keymap/format.js";

const FORMAT_URI = "kasane-doc://format/kasane-export";
import { EMERGENCY_NOTE, createKeymapFile, importSteps } from "./keymap/write.js";

type Content = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const json = (value: unknown): Content => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });
const failure = (text: string): Content => ({ isError: true, content: [{ type: "text", text }] });

async function guard(fn: () => Promise<Content>): Promise<Content> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof KeymapToolError) return failure(e.message);
    throw e;
  }
}

const RO = { readOnlyHint: true, openWorldHint: false } as const;
const uniqId = z.string().regex(/^[0-9A-Fa-f]{1,8}$/).describe("kasane_list_devices で得た UniqId（16進数。例: 55F70000）");

/** kasane のバージョンを、マニュアルの先頭行（「かさね1.01 2026-11-02」）から読む。 */
export function kasaneVersion(docs: DocsIndex): string | null {
  const html = docs.manualHeader();
  return html ? (/かさね\s*([0-9]+(?:\.[0-9]+)+)/.exec(html)?.[1] ?? null) : null;
}

function describeEntry(e: KeymapEntry) {
  const src = parseInt(e.source, 16);
  return {
    key: nameForScanCode(src) ?? scanCodeHex(src),
    scanCode: scanCodeHex(src),
    layers: e.layers.map((l) => ({ layer: l.layer, action: describeAction(l.type, l.param1, l.param2) })),
  };
}

function describeAction(type: string, p1: number, p2: string): string {
  const sc = parseInt(p2, 16);
  const key = nameForScanCode(sc) ?? scanCodeHex(sc);
  switch (type) {
    case "none": return "KC_NO";
    case "transparent": return "KC_TRNS";
    case "key": return key;
    case "MO": case "TG": case "DF": case "OSL": case "TO": case "TT": return `${type}(${p1})`;
    case "MACRO": case "TAPDANCE": return `${type}(${p1})`;
    case "LT": return `LT(${p1}, ${key})`;
    case "HLP": return `HLP(${sc})`;
    default: return `${type}(param1=${p1}, param2=${p2})`;
  }
}

export function registerTools(server: McpServer, docs: DocsIndex, tool: KeymapTool): void {
  server.registerTool(
    "kasane_status",
    {
      title: "kasane の状態",
      description:
        "kasane の導入状況を調べる。KeymapTool とドキュメントの有無、バージョン、接続中のキーボード数、ライセンスが無効らしい兆候（UniqId=00000000）を返し、次にやることを示す。導入やトラブルの相談では、最初にこれを呼ぶ。読み取り専用。",
      inputSchema: {},
      annotations: RO,
    },
    async () => {
      const next: string[] = [];
      const status: Record<string, unknown> = {
        kasaneHome: docs.location.home,
        docsFound: docs.pages.length > 0,
        keymapToolFound: tool.exe !== null,
        keymapToolPath: tool.exe,
        kasaneVersion: kasaneVersion(docs),
      };
      if (!tool.exe) next.push("kasane をインストールするか、環境変数 KASANE_HOME にインストール先を設定してください。");
      else {
        try {
          const list = await tool.list();
          status.deviceCount = list.deviceCount;
          status.devices = list.devices.length;
          if (list.licenseHint) {
            status.licenseHint = list.licenseHint;
            next.push("ライセンスの認証を確認してください（kasane-doc://manual/ja/03-license）。");
          }
          if (list.deviceCount === 0) next.push("ドライバが読み込まれていないか、キーボードを認識していません。インストールと再起動を確認してください（kasane-doc://manual/ja/01-install）。");
        } catch (e) {
          status.keymapToolError = (e as Error).message;
          next.push("KeymapTool がデバイス一覧を返しませんでした。ドライバの導入と、再起動の保留を確認してください。");
        }
      }
      if (docs.pages.length === 0) next.push("マニュアルが見つかりません。");
      status.next = next.length ? next : ["特に問題は見つかりませんでした。"];
      return json(status);
    },
  );

  server.registerTool(
    "kasane_list_devices",
    {
      title: "キーボードの一覧",
      description: "ドライバが認識している、接続中のキーボードを一覧にする（UniqId、リマップが有効か、レイヤーの状態、HardwareId）。他の kasane_get_* ツールに渡す UniqId は、ここから得る。読み取り専用。",
      inputSchema: {},
      annotations: RO,
    },
    () => guard(async () => json(await tool.list())),
  );

  server.registerTool(
    "kasane_get_keymap",
    {
      title: "今のキーマップ",
      description:
        "キーボードに今読み込まれているキーマップを返す。既定では、レイヤー 0 で元のキーと違うキー（リマップされたキー）と、レイヤー 1 以降に割り当てのあるキーだけを返す。all=true で全キー。読み取り専用で、ドライバの設定は変えない。",
      inputSchema: { uniqId, all: z.boolean().optional().describe("true で、変更のないキーも含めて全部返す") },
      annotations: RO,
    },
    ({ uniqId: id, all }) =>
      guard(async () => {
        const km = await tool.keymap(id);
        const described = km.entries.map((e) => ({ raw: e, d: describeEntry(e) }));
        const changed = described.filter(({ raw, d }) => {
          if (all) return true;
          return raw.layers.some((l) => (l.layer === 0 ? !(l.type === "key" && parseInt(l.param2, 16) === parseInt(raw.source, 16)) : l.type !== "transparent"));
        });
        return json({
          uniqId: km.uniqId,
          layerCount: km.layerCount,
          keyCount: km.keyCount,
          shown: changed.length,
          note: all ? undefined : "元のキーと同じ割り当てのキーは省いています（all=true で全部）。",
          keys: changed.map((x) => x.d),
        });
      }),
  );

  server.registerTool(
    "kasane_get_layer_state",
    {
      title: "レイヤーの状態",
      description: "今有効なレイヤー（ビットマスク）、リマップが ON か、NICOLA（親指シフト）が ON かを返す。読み取り専用。",
      inputSchema: { uniqId },
      annotations: RO,
    },
    ({ uniqId: id }) => guard(async () => json(await tool.layerState(id))),
  );

  server.registerTool(
    "kasane_get_settings",
    {
      title: "キーボードの設定",
      description: "機能の有効・無効（マクロ、コンボ、タップダンス、キー置換）、タイミング（TapTerm など）、設定の共有範囲（型番ごと／この1台／すべて）をまとめて返す。読み取り専用。",
      inputSchema: { uniqId },
      annotations: RO,
    },
    ({ uniqId: id }) =>
      guard(async () => {
        const [features, config, scope] = await Promise.all([tool.features(id), tool.config(id), tool.scope(id)]);
        return json({ features, config, scope });
      }),
  );

  server.registerTool(
    "kasane_search_keycodes",
    {
      title: "キーコードを探す",
      description:
        "kasane で使える KC_* のキーコードを、名前の一部（英語。例: CAPS、ENTER、LCTL、HENK）かスキャンコード（SC_003A）で探す。キーコードを書く前に、推測せずこれで確かめる。電源系のキーには dangerous=true が付く。読み取り専用。",
      inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(50).optional() },
      annotations: RO,
    },
    ({ query, limit }) => {
      const hits = searchKeycodes(query, limit ?? 20);
      return hits.length ? json(hits) : { content: [{ type: "text" as const, text: "該当するキーコードはありません。英語の名前の一部（例: CAPS）で試してください。" }] };
    },
  );

  server.registerTool(
    "kasane_get_file_format",
    {
      title: "設定ファイルの書式",
      description:
        "kasane の設定ファイル（*.kasane.json）の書式の説明と、動く例（キーの入れ替え、マクロとキー置換、複数のレイヤー）を返す。必須の項目（Format、Version、Scope、Keyboards）、レイヤー・マクロ・コンボ・タップダンス・キー置換の書き方、動作の書き方（MO、LT、MT、LCTL(KC_C) など）、スキャンコードの例が入っている。設定ファイルを書く前に、まず呼ぶ。読み取り専用。",
      inputSchema: {},
      annotations: RO,
    },
    () => ({ content: [{ type: "text" as const, text: renderFormat() }] }),
  );

  server.registerResource(
    "file-format",
    FORMAT_URI,
    { title: "kasane の設定ファイルの書式", mimeType: "text/markdown" },
    () => ({ contents: [{ uri: FORMAT_URI, mimeType: "text/markdown", text: renderFormat() }] }),
  );

  server.registerTool(
    "kasane_validate_keymap",
    {
      title: "設定ファイルを検証",
      description:
        "kasane の設定ファイル（*.kasane.json。Format=\"kasane-export\"）の中身を、ドライバにも設定にも触れずに点検する。キーコードの書き方、番号の範囲、重複、使っていないマクロの参照、電源系キーの警告を返す。設定を人に渡す前に必ず使う。書式が分からないときは、先に kasane_get_file_format を呼ぶ（推測で組み立てない）。",
      inputSchema: { keymap: z.union([z.string(), z.record(z.unknown())]).describe("*.kasane.json の中身（JSON の文字列、またはオブジェクト）") },
      annotations: RO,
    },
    ({ keymap }) => json(validateKeymap(keymap)),
  );

  server.registerTool(
    "kasane_create_keymap_file",
    {
      title: "設定ファイルを作る",
      description:
        "kasane の設定ファイル（*.kasane.json。Format=\"kasane-export\"、Version 1、キーは \"SC_003A\": \"KC_LCTL\" のスキャンコード形式）を、検証したうえで出力フォルダ（既定: ドキュメント\\kasane-mcp）に新しいファイルとして保存する。検証でエラーがあれば保存しない。ドライバにも kasane の設定にも書き込まない: 反映は、ユーザーがエディタの「インポート／エクスポート...」で読み込み、「キーボードに適用(ON)」を押して行う。結果の手順と緊急解除の方法を、そのままユーザーに伝えること。一部のキーだけを変える設定は、ユーザーに「追加」で読み込むよう伝える（「置き換え」だと、ファイルに無いキーが初期状態に戻る）。キーコードは、書く前に kasane_search_keycodes で確かめる。ファイルの書式（必須の項目、レイヤー・マクロ・コンボなどの書き方）と動く例は、kasane_get_file_format で得られる。書く前に、まず呼ぶ。",
      inputSchema: {
        keymap: z.union([z.string(), z.record(z.unknown())]).describe("*.kasane.json の中身（JSON の文字列、またはオブジェクト）"),
        name: z.string().max(60).optional().describe("ファイル名に入れる短い名前（例: capslock-to-ctrl）。省略可"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    ({ keymap, name }) => {
      const r = createKeymapFile(keymap, { name });
      if (!r.ok && r.reason === "invalid") {
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ saved: false, message: "検証でエラーが見つかったため、ファイルは作っていません。直してから、もう一度呼んでください。", errors: r.validation.errors, warnings: r.validation.warnings, hint: r.validation.hint }, null, 2) }] };
      }
      if (!r.ok) return failure(`ファイルを保存できませんでした: ${r.message}`);
      return json({
        saved: true,
        path: r.path,
        summary: r.validation.summary,
        warnings: r.validation.warnings,
        stepsForUser: importSteps(r.path),
        ifLockedOut: EMERGENCY_NOTE,
        note: "このファイルを作っただけで、キーボードの設定は何も変わっていません。",
      });
    },
  );
}
