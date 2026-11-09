import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createKeymapFile, importSteps, safeStem } from "../src/keymap/write.js";
import { validateKeymap } from "../src/keymap/validate.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const good = () => ({
  Format: "kasane-export",
  Version: 1,
  Scope: "Keyboard",
  Keyboards: [{ Name: "テスト", Layers: [{ Index: 0, Keys: { SC_003A: "KC_LCTL" } }] }],
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "kasane-mcp-test-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("実在する設定ファイル", () => {
  it("kasane に同梱の Emacs の例は、エラーも警告もなく通る", () => {
    const r = validateKeymap(readFileSync(path.join(here, "fixtures", "keymaps", "emacs.kasane.json"), "utf8"));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.summary).toMatchObject({ macros: 9, keyOverrides: 34 });
  });
});

describe("createKeymapFile", () => {
  const now = new Date(2026, 10, 10, 9, 8, 7);

  it("検証に通った設定を、新しいファイルに保存する", () => {
    const r = createKeymapFile(good(), { dir, now, name: "capslock-to-ctrl" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(path.basename(r.path)).toBe("kasane-mcp-20261110-090807-capslock-to-ctrl.kasane.json");
    const saved = readFileSync(r.path, "utf8");
    expect(saved.charCodeAt(0)).not.toBe(0xfeff); // BOM なし
    expect(JSON.parse(saved)).toEqual(good());
    expect(saved).toContain("テスト"); // 日本語はそのまま
  });

  it("検証でエラーなら、何も作らない", () => {
    const bad = good();
    bad.Keyboards[0].Layers[0].Keys = { SC_003A: "KC_NOPE" };
    const r = createKeymapFile(bad, { dir });
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
    expect(readdirSync(dir)).toEqual([]);
  });

  it("壊れた JSON の文字列でも、何も作らない", () => {
    expect(createKeymapFile("{", { dir })).toMatchObject({ ok: false, reason: "invalid" });
    expect(readdirSync(dir)).toEqual([]);
  });

  it("上書きしない（同じ時刻なら連番をつける）", () => {
    const a = createKeymapFile(good(), { dir, now });
    const b = createKeymapFile(good(), { dir, now });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.path).not.toBe(b.path);
      expect(path.basename(b.path)).toBe("kasane-mcp-20261110-090807-2.kasane.json");
    }
    expect(readdirSync(dir)).toHaveLength(2);
  });

  it("名前にパスを入れても、出力フォルダの外には書けない", () => {
    const r = createKeymapFile(good(), { dir, now, name: "..\\..\\evil/../x" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(path.dirname(r.path)).toBe(path.resolve(dir));
    expect(existsSync(path.join(dir, "..", "x.kasane.json"))).toBe(false);
  });

  it("出力フォルダが無ければ作る", () => {
    const sub = path.join(dir, "a", "b");
    expect(createKeymapFile(good(), { dir: sub, now }).ok).toBe(true);
    expect(readdirSync(sub)).toHaveLength(1);
  });

  it("保存先が作れなければ io エラー", () => {
    const r = createKeymapFile(good(), { dir: path.join(dir, "x\0y"), now });
    expect(r).toMatchObject({ ok: false, reason: "io" });
  });

  it("電源キーは、警告つきで保存する（止めない）", () => {
    const k = good();
    k.Keyboards[0].Layers[0].Keys = { SC_003A: "KC_PWR" };
    const r = createKeymapFile(k, { dir });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.validation.warnings.length).toBeGreaterThan(0);
  });
});

describe("safeStem / importSteps", () => {
  it("使えない文字を落とす", () => {
    expect(safeStem("a/b\\c:d.kasane.json")).toBe("a-b-c-d");
    expect(safeStem(undefined)).toBe("");
    expect(safeStem("キー 入れ替え")).toBe("キー-入れ替え");
  });
  it("手順に、ファイルのパスと、適用(ON) が入る", () => {
    const s = importSteps("C:\\x\\a.kasane.json").join("\n");
    expect(s).toContain("C:\\x\\a.kasane.json");
    expect(s).toContain("キーボードに適用(ON)");
    expect(s).toContain("内容確認");
    expect(s).toMatch(/「追加」.*ほかのキーは、今のまま残る/);
    expect(s).toContain("初期状態に戻る");
  });
});
