# kasane-MCP

[kasane（かさね）](https://appletllc.com/)のマニュアルを、AI エージェントが読めるようにする MCP サーバーです。「緊急解除のやり方は？」「タップダンスとは？」といった質問に、インストール済みのバージョンに合った手順で答えられます。

**このサーバーは、ドライバにも kasane の設定にも書き込みません。** 設定の反映は、ユーザーが kasane のエディタで行います。

状態: v0.1.6（ドキュメント参照、読み取りツール、設定ファイルの生成）。

## 提供するもの

| 種類 | 名前 | 内容 |
|---|---|---|
| ツール | `kasane_search_docs` | マニュアルと CLI チュートリアルを検索し、節の抜粋と URI を返す |
| ツール | `kasane_status` | 導入状況（KeymapTool、マニュアル、kasane と kasane-MCP のバージョン、キーボード数、ライセンスの兆候）と、次にやること |
| ツール | `kasane_mcp_version` | kasane-MCP 自身のバージョン |
| ツール | `kasane_get_output_settings` | 設定ファイルの保存先（既定、環境変数 `KASANE`、`KASANE` への保存の許可の有無） |
| ツール | `kasane_list_devices` | 接続中のキーボードの一覧（UniqId など） |
| ツール | `kasane_get_keymap` | キーボードに今読み込まれているキーマップ（リマップされたキーだけ。`all` で全部） |
| ツール | `kasane_get_layer_state` | 有効なレイヤー、リマップの ON/OFF、NICOLA |
| ツール | `kasane_get_settings` | 機能の有効/無効、タイミング、設定の共有範囲 |
| ツール | `kasane_search_keycodes` | `KC_*` のキーコードを、名前の一部やスキャンコードで探す |
| ツール | `kasane_get_file_format` | 設定ファイル（`*.kasane.json`）の書式の説明と、動く例を返す。ファイルを書く前に呼ぶ |
| ツール | `kasane_validate_keymap` | `*.kasane.json` を、設定に触れずに点検する（キーコード、番号の範囲、重複、存在しないレイヤーへの参照、電源キーの警告） |
| ツール | `kasane_create_keymap_file` | 検証に通った設定を、`*.kasane.json` として新しいファイルに保存する。反映の手順を返す。保存先は `destination` で選べる（`KASANE` は許可が要る） |
| リソース | `kasane-doc://manual/ja/{page}` | マニュアル（日本語）のページ全文 |
| リソース | `kasane-doc://format/kasane-export` | 設定ファイルの書式の説明と例（`kasane_get_file_format` と同じ） |
| リソース | `kasane-doc://cli-tutorial` | KeymapTool（CLI）のチュートリアル |
| プロンプト | `setup-first-time` / `remap-key` / `recover-lockout` | 初回設定、キーの割り当て、入力できなくなったとき |

## 使い方

Claude Desktop と Muse での登録のしかた、キーの入れ替えやキーの列の出力などの頼み方は、[はじめてのガイド](docs/GETTING-STARTED.md)にあります。以下は、要点だけです。

kasane をインストールした Windows で、MCP クライアントに登録します。

```json
{
  "mcpServers": {
    "kasane": { "command": "npx", "args": ["-y", "kasane-mcp"] }
  }
}
```

（npm への公開前は、リポジトリを clone して `npm install && npm run build` のあと、`node dist/index.js` を指定してください。）

ドキュメントは、次の順に探します。

1. 環境変数 `KASANE_HOME`（`manual\ja` と `docs\TUTORIAL-CLI.md` があるフォルダ）
2. レジストリの `InstallDir`
3. `C:\Program Files\applet\kasane`

見つからないときも、サーバーは起動します。ツールが、見つからないことを伝えます。

## 設定の反映のしかた

このサーバーは、設定ファイルを作るだけです。キーボードに反映するのは、ユーザー自身です。

1. エージェントに、「CapsLock を左 Ctrl にして」のように頼む。
2. エージェントが `*.kasane.json` を作る（既定の保存先は `ドキュメント\kasane-mcp\`。環境変数 `KASANE_MCP_OUTPUT_DIR` で変えられます）。
3. kasane のエディタで、下の「インポート／エクスポート...」の「インポート」タブから、そのファイルを選ぶ。
4. 読み込み方は、今の設定に足すだけなら「追加」を選ぶ（「置き換え」は、ファイルに無いキーを初期状態に戻します）。「内容確認」で結果を見て、「読み込む」を押す。
5. 「キーボードに適用(ON)」を押す。

作ったファイルは、エディタの読み込みコード（`PortableIO` と `PortableImporter`）に通して、読み込めることを確認しています。保存のときは、上書きせず、出力フォルダの外にも書きません。

## 設定ファイルの保存先

- **既定**は、`ドキュメント\kasane-mcp\` です。環境変数 `KASANE_MCP_OUTPUT_DIR` で、別のフォルダーにできます。
- **kasane の設定フォルダー**（環境変数 `KASANE`）の下の `kasane-mcp\` にも、保存できます。エディタの書き出しと読み込みの画面は、設定フォルダーを既定にするので、見つけやすくなります。ただし、**ユーザーが許可したときだけ**使えます。MCP の設定の kasane の項目に、`env` を足してください。許可は、エージェントからは変えられません。

  ```json
  "kasane": {
    "command": "npx",
    "args": ["-y", "kasane-mcp"],
    "env": { "KASANE_MCP_ALLOW_KASANE_DIR": "1" }
  }
  ```

  許可すると、エージェントが `kasane_create_keymap_file` の `destination` に `kasane` を指定したときだけ、`KASANE\kasane-mcp\` に保存します。指定しなければ、既定の保存先です。`KASANE` が未設定、絶対パスでない、実在しないフォルダーのときは、保存しません。設定フォルダーを新しく作ることもしません。
- ファイル名は、必ず `kasane-mcp-` で始まります。kasane が自動で読む `kasane-import.json` と `kasane-recovery.kasane.json` には、決して書きません。設定フォルダーの `project.json` などにも、触りません。

## 安全の仕組み

- KeymapTool.exe は、読み取りのコマンド（`--list`、`--get*`）だけを起動します。`--set-*`、`--on`、`--off`、`--apply*` などは、コードの上で許可していません。
- UniqId は16進数の最大8桁だけを受け付けます。それ以外は、起動前に拒否します。
- 管理者権限は要りません。

## キーコード表について

`src/keycodes/data.ts` は、kasane の `KeycodeTable.cpp` から `tools/gen-keycodes.mjs` で生成したものです。kasane のキーコードが増えたら、次のように作り直します（暫定の方法で、将来は kasane のリリースで作る「知識パック」から取得する予定です）。

```
node tools/gen-keycodes.mjs <kasane>\driver\KeymapTool\KeycodeTable.cpp
```

## 開発

```
npm install
npm run build
npm test
```

## ライセンス

Apache License 2.0。

## リリース（メンテナ向け）

タグ（`vX.Y.Z`）の push で、`.github/workflows/release.yml` が npm に公開します。長期有効なトークンは使わず、npm の Trusted Publishing（OIDC）です。最初の公開の前に、`release.yml` の冒頭にある準備（初回の手動公開と、Trusted publisher の登録）が要ります。リポジトリを public にしてから行います。

公開前の点検は `node scripts/check-package.mjs` で行えます（`dist/` が入っていること、テストのフィクスチャや開発用ファイルが入っていないことを確かめます）。
