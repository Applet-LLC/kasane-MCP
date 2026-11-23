import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateKeymap } from "../src/keymap/validate.js";
import { EXAMPLES, FORMAT_REFERENCE, renderFormat } from "../src/keymap/format.js";
import { searchKeycodes } from "../src/keycodes/index.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "examples");
const files = readdirSync(dir).filter((f) => f.endsWith(".kasane.json"));

describe("docs/examples の設定ファイル（案内ドキュメントに載せている例）", () => {
  it("例が3つある", () => expect(files.length).toBe(3));
  it.each(files)("%s は、エラーも警告もなく通る", (f) => {
    const r = validateKeymap(readFileSync(path.join(dir, f), "utf8"));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });
});

describe("kasane_get_file_format の例", () => {
  it.each(EXAMPLES.map((e) => [e.file, e] as const))("%s は、docs/examples のファイルと同じ内容で、検証に通る", (file, ex) => {
    expect(JSON.parse(readFileSync(path.join(dir, file), "utf8"))).toEqual(ex.keymap);
    const r = validateKeymap(ex.keymap);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("書式の説明に、必須の項目と、各機能の書き方が入っている", () => {
    for (const w of ["Format", "Version", "Scope", "Keyboards", "Layers", "Macros", "Combos", "TapDances", "KeyOverrides", "SC_XXXX", "MO(n)", "LT(n, KC_SPC)", "追加", "置き換え"]) {
      expect(FORMAT_REFERENCE).toContain(w);
    }
    expect(renderFormat()).toContain("## 動く例");
  });

  it("説明に書いたスキャンコードが、キーコード表と合っている", () => {
    const sc = (name: string) => searchKeycodes(name, 5).find((h) => h.name === name || h.aliases.includes(name))?.scanCode;
    expect(sc("KC_CAPSLOCK")).toBe("SC_003A");
    expect(sc("KC_LCTL")).toBe("SC_001D");
    expect(sc("KC_SPC")).toBe("SC_0039");
    expect([sc("KC_H"), sc("KC_J"), sc("KC_K"), sc("KC_L")]).toEqual(["SC_0023", "SC_0024", "SC_0025", "SC_0026"]);
  });
});

describe("書式の誤りには、案内を添える", () => {
  it("最上位の項目が足りないと、hint が付く", () => {
    const r = validateKeymap({ Keyboards: [{ Layers: [] }] });
    expect(r.ok).toBe(false);
    expect(r.hint).toContain("kasane_get_file_format");
    expect(r.hint).toContain("kasane-export");
  });
  it("キーコードだけの誤りには、hint を付けない", () => {
    const r = validateKeymap({ Format: "kasane-export", Version: 1, Scope: "Keyboard", Keyboards: [{ Layers: [{ Index: 0, Keys: { SC_003A: "KC_NOPE" } }] }] });
    expect(r.ok).toBe(false);
    expect(r.hint).toBeUndefined();
  });
});
