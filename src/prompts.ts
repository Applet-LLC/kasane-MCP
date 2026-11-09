import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const GROUNDING =
  "答えは kasane_search_docs と kasane-doc:// の内容に基づけること。ドキュメントに無いこと（ドライバの内部動作など）は推測せず、「ドキュメントには書かれていない」と答えること。";

function user(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "setup-first-time",
    { title: "はじめての設定", description: "インストールから、最初のリマップまでを案内する" },
    () =>
      user(
        [
          "kasane を初めて使うユーザーを、次の順に案内してください。",
          "1. kasane-doc://manual/ja/01-install、03-license、06-calibration を確認し、導入の手順を短くまとめる。",
          "2. 緊急解除の方法（kasane-doc://manual/ja/07-emergency）を、設定を変える前に必ず伝える。",
          "3. 最初のリマップを1つ決めてもらい、エディタでの設定手順を案内する。",
          GROUNDING,
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "remap-key",
    {
      title: "キーを割り当てる",
      description: "やりたいキー割り当てを、エディタでの手順にして案内する",
      argsSchema: { request: z.string().describe("例: CapsLock を左Ctrl にしたい") },
    },
    ({ request }) =>
      user(
        [
          `ユーザーの依頼: ${request}`,
          "次の順に進めてください。",
          "1. kasane_status で導入状況を確かめる。",
          "2. kasane_list_devices と kasane_get_keymap で、対象のキーボードと今の割り当てを確かめる。",
          "3. 使うキーコードは、書く前に kasane_search_keycodes で確かめる。マクロやコンボなどの書き方は、kasane_search_docs（08-key-assign、09-advanced、12-recipes）で確かめる。",
          "4. 設定を *.kasane.json にして、kasane_validate_keymap で点検し、通ったら kasane_create_keymap_file で保存する。",
          "5. 結果の stepsForUser と ifLockedOut を、ユーザーにそのまま伝える。",
          "設定の書き込みは、この MCP からは行えません。ファイルを作るだけで、ユーザーがエディタで読み込んで適用します。",
          "電源系のキー（スリープ、電源）を割り当てる場合は、その危険を先に伝えてください。",
          GROUNDING,
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "recover-lockout",
    { title: "入力できなくなったとき", description: "緊急解除の手順を案内する" },
    () =>
      user(
        [
          "キーボードから入力できなくなったユーザーを助けてください。",
          "kasane-doc://manual/ja/07-emergency を読み、緊急解除の手順（既定は左右の Ctrl と左右の Shift を3秒同時に押す）を最初に伝える。",
          "そのあと、原因になった設定を、エディタで直す手順を案内する。",
          GROUNDING,
        ].join("\n"),
      ),
  );
}
