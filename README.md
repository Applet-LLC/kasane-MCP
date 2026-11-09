# kasane-MCP

[kasane（かさね）](https://appletllc.com/)のマニュアルを、AI エージェントが読めるようにする MCP サーバーです。「緊急解除のやり方は？」「タップダンスとは？」といった質問に、インストール済みのバージョンに合った手順で答えられます。

**このサーバーは、ドライバにも kasane の設定にも書き込みません。** 設定の反映は、ユーザーが kasane のエディタで行います。

状態: v0.3（ドキュメント参照、読み取りツール、設定ファイルの生成）。

## 提供するもの

| 種類 | 名前 | 内容 |
|---|---|---|
| ツール | `kasane_search_docs` | マニュアルと CLI チュートリアルを検索し、節の抜粋と URI を返す |
| ツール | `kasane_status` | 導入状況（KeymapTool、マニュアル、バージョン、キーボード数、ライセンスの兆候）と、次にやること |
| ツール | `kasane_list_devices` | 接続中のキーボードの一覧（UniqId など） |
| ツール | `kasane_get_keymap` | キーボードに今読み込まれているキーマップ（リマップされたキーだけ。`all` で全部） |
| ツール | `kasane_get_layer_state` | 有効なレイヤー、リマップの ON/OFF、NICOLA |
| ツール | `kasane_get_settings` | 機能の有効/無効、タイミング、設定の共有範囲 |
| ツール | `kasane_search_keycodes` | `KC_*` のキーコードを、名前の一部やスキャンコードで探す |
| ツール | `kasane_validate_keymap` | `*.kasane.json` を、設定に触れずに点検する（キーコード、番号の範囲、重複、存在しないレイヤーへの参照、電源キーの警告） |
| ツール | `kasane_create_keymap_file` | 検証に通った設定を、`*.kasane.json` として新しいファイルに保存する。反映の手順を返す |
| リソース | `kasane-doc://manual/ja/{page}` | マニュアル（日本語）のページ全文 |
| リソース | `kasane-doc://cli-tutorial` | KeymapTool（CLI）のチュートリアル |
| プロンプト | `setup-first-time` / `remap-key` / `recover-lockout` | 初回設定、キーの割り当て、入力できなくなったとき |

## 使い方

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
