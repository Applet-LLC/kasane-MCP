# kasane-MCP

[kasane（かさね）](https://appletllc.com/)のマニュアルを、AI エージェントが読めるようにする MCP サーバーです。「緊急解除のやり方は？」「タップダンスとは？」といった質問に、インストール済みのバージョンに合った手順で答えられます。

**このサーバーは、ドライバにも kasane の設定にも書き込みません。** 設定の反映は、ユーザーが kasane のエディタで行います。

状態: v0.1（ドキュメント参照のみ）。設定ファイルの生成や、デバイス情報の読み取りは、今後の版で追加します。

## 提供するもの

| 種類 | 名前 | 内容 |
|---|---|---|
| ツール | `kasane_search_docs` | マニュアルと CLI チュートリアルを検索し、節の抜粋と URI を返す |
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

## 開発

```
npm install
npm run build
npm test
```

## ライセンス

Apache License 2.0。
