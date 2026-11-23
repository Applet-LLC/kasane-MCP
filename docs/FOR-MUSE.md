# kasane-mcp を Muse (muse.ai) に組み込むための手順書

対象: Meta の Muse エージェント（Linux VM 上で動作）向けの指示書です。
人間のユーザーが読むためのものではありません。ユーザーは、Muse に、次のように頼みます。

> あなたの Muse に、kasane 用の MCP サーバー「kasane-mcp」を組み込んでください。
> 手順書は https://github.com/Applet-LLC/kasane-MCP/blob/main/docs/FOR-MUSE.md にあります。
> その手順書を読んで、その通りにインストールと検証を行い、使えるツールと使えないツールを報告してください。

この方法では、kasane-mcp は Muse の VM の中で動きます。ユーザーのパソコンには、何も公開しません。
Claude Desktop の登録方法は、GETTING-STARTED.md にあります（Muse には使えません）。

## これは何か

- 入手元は npm 公式レジストリの `kasane-mcp`（発行: Applet LLC）のみです。同名の別パッケージや、他の入手元からはインストールしないでください。
- kasane（Windows 用キーリマッパー）の MCP サーバー。npm パッケージ `kasane-mcp`、
  stdio 型、Node.js >= 18。
- ドライバにも kasane の設定にも**書き込みません**。マニュアル参照と、
  設定ファイル（*.kasane.json）の生成・検証だけを行います。
- Muse の VM には kasane 本体（Windows）が無いため、以下のツールは使えません。
  使えないことをユーザーに正直に伝えてください。動くふりをしないでください。
  - 使えない: `kasane_search_docs`、`kasane_list_devices`、`kasane_get_keymap`、
    `kasane_get_layer_state`、`kasane_get_settings`
  - 使える: `kasane_mcp_version`、`kasane_search_keycodes`、`kasane_get_file_format`、
    `kasane_validate_keymap`、`kasane_create_keymap_file`、`kasane_get_output_settings`、
    `kasane_status`（kasane 未検出として正常に返る）
- 作ったファイルは、VM の中にできます。ユーザーが自分のパソコンで読み込めるように、
  ファイル自体をユーザーに渡してください。

## 手順 1: VM にインストールする

配置先は `~/workspace/custom-connectors/custom.kasane-mcp/server/` に統一してください。
0.1.8 以降は、Linux でも通常どおりインストールできます。0.1.7 以前は、package.json の
`"os": ["win32"]` のため、Linux では EBADPLATFORM で失敗します。必ず最新版を入れてください。

```sh
VER=$(npm view kasane-mcp version)
mkdir -p /tmp/kasane-mcp-install && cd /tmp/kasane-mcp-install
npm pack "kasane-mcp@$VER"
mkdir -p ~/workspace/custom-connectors/custom.kasane-mcp/server
tar xzf "kasane-mcp-$VER.tgz" -C ~/workspace/custom-connectors/custom.kasane-mcp/server --strip-components=1
cd ~/workspace/custom-connectors/custom.kasane-mcp/server
npm install --omit=dev
```

## 手順 2: stdio クライアントを用意する

先に、クライアントの置き場所を作ってください。

```sh
mkdir -p ~/workspace/custom-connectors/custom.kasane-mcp/bin
```

Muse には MCP サーバー登録 UI がありません。サーバーを子プロセスとして起動し、
JSON-RPC を stdio でやり取りする小さなクライアントを使ってください。
`~/workspace/custom-connectors/custom.kasane-mcp/bin/client.py` に以下を保存してください。

```python
#!/usr/bin/env python3
import argparse, json, subprocess, os
SERVER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server")
ENTRY = os.path.join(SERVER_DIR, "dist", "index.js")

def run(requests):
    proc = subprocess.Popen(["node", ENTRY], stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=SERVER_DIR)
    msgs = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2025-03-26", "capabilities": {},
                    "clientInfo": {"name": "muse-kasane-client", "version": "0.1"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
    ] + requests
    out, _ = proc.communicate("\n".join(json.dumps(m) for m in msgs) + "\n", timeout=30)
    return {o["id"]: o for line in out.splitlines() if line.strip()
            for o in [json.loads(line)] if "id" in o}

ap = argparse.ArgumentParser()
sub = ap.add_subparsers(dest="cmd", required=True)
sub.add_parser("list-tools")
ct = sub.add_parser("call-tool")
ct.add_argument("--name", required=True)
ct.add_argument("--arguments")
ct.add_argument("--arguments-file")
a = ap.parse_args()
if a.cmd == "list-tools":
    r = run([{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}])
    print(json.dumps(r.get(2, {}).get("result", {}), ensure_ascii=False, indent=2))
else:
    tool_args = (json.load(open(a.arguments_file, encoding="utf-8")) if a.arguments_file
                 else json.loads(a.arguments) if a.arguments else {})
    r = run([{"jsonrpc": "2.0", "id": 2, "method": "tools/call",
              "params": {"name": a.name, "arguments": tool_args}}])
    print(json.dumps(r.get(2, {}).get("result", r.get(2, {})), ensure_ascii=False, indent=2))
```

## 手順 3: 検証する（すべて通ってから「導入できた」と伝える）

```sh
python3 ~/workspace/custom-connectors/custom.kasane-mcp/bin/client.py list-tools
# -> tools が 12 個返ること（0.1.8時点。将来の版で増減した場合は、
#     その版の個数を正とし、減っている場合のみ異常として報告すること）

python3 ~/workspace/custom-connectors/custom.kasane-mcp/bin/client.py call-tool \
  --name kasane_mcp_version --arguments '{}'
# -> {"name": "kasane-mcp", "version": "<入れた版>", "kasaneVersion": null}

python3 ~/workspace/custom-connectors/custom.kasane-mcp/bin/client.py call-tool \
  --name kasane_search_keycodes --arguments '{"query":"KC_ESC"}'
# -> KC_ESCAPE / SC_0001 が返ること
```

## 手順 4: 記録を残す

`~/workspace/custom-connectors/custom.kasane-mcp/CONNECTOR.md` に、以下の雛形で記録してください。
次回以降の会話では、この記録を読んでから kasane の作業をしてください。

```markdown
# kasane-mcp connector (Muse VM)

- インストール先: ~/workspace/custom-connectors/custom.kasane-mcp/server/
- インストールした版: <手順3で kasane_mcp_version が返した版>
- クライアント: ~/workspace/custom-connectors/custom.kasane-mcp/bin/client.py
  - 一覧: python3 <クライアント> list-tools
  - 呼び出し: python3 <クライアント> call-tool --name <ツール名> --arguments '<JSON>'

## VM で使えるツール
kasane_mcp_version / kasane_search_keycodes / kasane_get_file_format /
kasane_validate_keymap / kasane_create_keymap_file /
kasane_get_output_settings / kasane_status（kasane 未検出として返る）

## VM では使えないツール（kasane 本体が Windows 側にあるため）
kasane_search_docs / kasane_list_devices / kasane_get_keymap /
kasane_get_layer_state / kasane_get_settings

## 注意
- このサーバーはドライバにも kasane の設定にも書き込まない。
- 作った *.kasane.json は、ファイル自体をユーザーに渡すこと。
  反映はユーザーが Windows の kasane エディタからインポートする。
```

## 導入後の使い方

ユーザーが「CapsLock を左 Ctrl にしたい」のように頼んだら:

1. `kasane_get_file_format` で書式を確認する
2. 設定を作り、`kasane_validate_keymap` で検証する
3. `kasane_create_keymap_file` で *.kasane.json を作り、**ファイル自体をユーザーに渡す**
4. 反映はユーザーが Windows の kasane エディタで
   「インポート／エクスポート...」→「インポート」から読み込む。ここは自動化しない
