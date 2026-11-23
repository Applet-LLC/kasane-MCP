/**
 * 設定ファイル（*.kasane.json）の書式の説明と、動く例。
 * エージェントが、検証のエラーに頼らず、最初から正しい形で書けるようにするためのもの。
 * 書式は kasane の PortableFormat（Format="kasane-export"、Version 1）。
 * 例の中身は docs/examples/*.kasane.json と同じ（test/examples.test.ts が一致を確かめる）。
 */

export interface FormatExample {
  name: string;
  description: string;
  file: string;
  keymap: Record<string, unknown>;
}

export const EXAMPLES: FormatExample[] = [
  {
    name: "キーの入れ替え",
    description: "Caps Lock と左 Ctrl を入れ替える。レイヤー 0 のキーを書き換えるだけの、いちばん単純な形。",
    file: "capslock-ctrl-swap.kasane.json",
    keymap: {
      Format: "kasane-export",
      Version: 1,
      Scope: "Keyboard",
      Keyboards: [
        {
          Name: "Caps Lock と左 Ctrl を入れ替える",
          Layers: [{ Index: 0, Keys: { SC_003A: "KC_LCTL", SC_001D: "KC_CAPSLOCK" } }],
        },
      ],
    },
  },
  {
    name: "キーの列の出力（マクロ）とキー置換",
    description: "Ctrl+1 を押すと、マクロ 0（ローマ字で ありがとうございます）を打つ。Macros と KeyOverrides を使う形。レイヤーは書かない。",
    file: "ctrl1-macro.kasane.json",
    keymap: {
      Format: "kasane-export",
      Version: 1,
      Scope: "Keyboard",
      Keyboards: [
        {
          Name: "Ctrl+1 で「ありがとうございます」と打つ",
          Macros: [{ Id: 0, Keys: ["KC_A", "KC_R", "KC_I", "KC_G", "KC_A", "KC_T", "KC_O", "KC_U", "KC_G", "KC_O", "KC_Z", "KC_A", "KC_I", "KC_M", "KC_A", "KC_S", "KC_U"] }],
          MacroNames: { "0": "ありがとうございます" },
          KeyOverrides: [{ Id: 0, Mods: "MOD_LCTL", Key: "KC_1", Replacement: "MACRO(0)" }],
        },
      ],
    },
  },
  {
    name: "複数のレイヤー",
    description: "Space を押している間だけレイヤー 1 に切り替わり、H J K L が矢印キーになる。LT(1, KC_SPC) と、レイヤー 1 の Keys を使う形。",
    file: "space-arrows.kasane.json",
    keymap: {
      Format: "kasane-export",
      Version: 1,
      Scope: "Keyboard",
      Keyboards: [
        {
          Name: "Space を押しながら H J K L で矢印キー",
          Layers: [
            { Index: 0, Keys: { SC_0039: "LT(1, KC_SPC)" } },
            { Index: 1, Keys: { SC_0023: "KC_LEFT", SC_0024: "KC_DOWN", SC_0025: "KC_UP", SC_0026: "KC_RIGHT" } },
          ],
        },
      ],
    },
  },
];

export const FORMAT_REFERENCE = `# kasane の設定ファイル（*.kasane.json）の書式

kasane_create_keymap_file と kasane_validate_keymap に渡す設定の形です。読み込むのは、kasane のエディタの「インポート／エクスポート...」です。

## 最上位（4 項目すべて必須）

- Format: 文字列 "kasane-export" に固定。
- Version: 数値 1 に固定。
- Scope: "Keyboard"（1 台分の設定）、"Layer"、"All" のいずれか。通常は "Keyboard"。
- Keyboards: キーボードの配列（1 つ以上）。

## Keyboards の各要素（書く項目だけ書く。書かない項目は、読み込んでも変わらない）

- Name: 画面に出す名前（任意）。UniqId と HardwareId は書かなくてよい（エディタが、接続中のキーボードに自動で対応づける）。
- Layers: レイヤーの配列。{ "Index": 0〜15, "Keys": { "SC_003A": "KC_LCTL", ... } }。
  - Keys のキー（左側）は、押す物理キーの位置を表すスキャンコード SC_XXXX（16 進 4 桁）。右側は割り当てる動作。
  - レイヤー 0 が基本のレイヤー。変えたいキーだけを書く（書かないキーは、そのまま）。透過（KC_TRNS）は書かない。
  - Index が重複してはいけない。MO(1) などで使うレイヤーは、Layers に含める。
- Macros: [{ "Id": 0〜127, "Keys": ["KC_H", "KC_I", "LCTL(KC_C)"] }]。キーを順に打つ。1 つにつき 64 ステップまで（キー 1 つで 2 ステップ、修飾 1 つにつきさらに 2）。日本語の文字は入れられない（ローマ字のキーで書く）。
- Combos: [{ "Id": 0〜15, "Key1": "SC_0024", "Key2": "SC_0025", "Output": "KC_ESC" }]。2 つのキーの同時押し。Key1 と Key2 は、KC_ ではなく SC_XXXX で書く。
- TapDances: [{ "Id": 0〜15, "SingleTap": "KC_A", "SingleHold": "", "DoubleTap": "KC_B", "TripleTap": "" }]。使わない欄は "" にする。
- KeyOverrides: [{ "Id": 0〜127, "Mods": "MOD_LCTL", "Key": "KC_1", "Replacement": "MACRO(0)" }]。Mods は MOD_LSFT、MOD_LCTL|MOD_LSFT のように書く。Key は、レイヤーで解決した後の出力キー。
- MacroNames / ComboNames / TapDanceNames / KeyOverrideNames: { "0": "名前" }（任意）。
- Timing、EnabledFeatures、Nicola、Helper など、ほかの項目もあるが、この MCP は検証しない。書かない。

## 動作の書き方（右側の値）

- 1 つのキー: KC_A、KC_LCTL、KC_CAPSLOCK、KC_ENTER など。名前は kasane_search_keycodes で探す（推測しない）。SC_XXXX で直接書くこともできる。
- 修飾付きのキー: LCTL(KC_C)、LCTL(LSFT(KC_T))。C() S() A() G() は LCTL LSFT LALT LGUI の短い別名。
- レイヤー: MO(n)（押している間）、TG(n)（切り替え）、DF(n)、OSL(n)（次の 1 キーだけ）、TO(n)、TT(n)。n は 0〜15。LM(n, MOD_LCTL|MOD_LSFT)。
- 短く押す・長押し: MT(MOD_LCTL, KC_ESC)（短く押すと Esc、長押しで Ctrl）、LT(n, KC_SPC)（短く押すと Space、長押しでレイヤー n）。
- マクロ・タップダンス・ヘルパー: MACRO(n)、TAPDANCE(n)、HLP(n)。使う番号は、同じキーボードに定義を書く。
- 何もしない: KC_NO。

## キーの位置（スキャンコード）の例

SC_003A = Caps Lock（JIS では英数キー）、SC_001D = 左 Ctrl、SC_0039 = Space、SC_0023〜SC_0026 = H J K L。キー名から位置を知るには kasane_search_keycodes を使う（結果の scanCode）。

## 注意

- 変更を 1 つ足すだけなら、書くのはその変更だけでよい。ユーザーがエディタで「追加」で読み込めば、ほかの設定は残る。「置き換え」で読み込むと、ファイルに無いキーが初期状態に戻る。
- 電源・スリープのキー（KC_PWR、KC_SLEP、KC_WAKE）は、警告になる。
`;

/** 書式の説明と、動く例を、ひとつの文章にする。 */
export function renderFormat(): string {
  const parts = [FORMAT_REFERENCE, "## 動く例"];
  for (const ex of EXAMPLES) {
    parts.push(`### ${ex.name}\n\n${ex.description}\n\n\`\`\`json\n${JSON.stringify(ex.keymap, null, 2)}\n\`\`\``);
  }
  return parts.join("\n\n");
}

/** 最上位の項目が足りないときに、エラーに添えるひな形。 */
export const SKELETON = { Format: "kasane-export", Version: 1, Scope: "Keyboard", Keyboards: [{ Layers: [{ Index: 0, Keys: { SC_003A: "KC_LCTL" } }] }] };
export const FORMAT_HINT = "書式は kasane_get_file_format で確かめられます。最小の形: " + JSON.stringify(SKELETON);
