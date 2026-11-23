import { describe, expect, it } from "vitest";
import { validateKeymap } from "../src/keymap/validate.js";

// エディタ（kasane の ProjectService.cs）が置く場所ごとに受け付ける範囲と、検証が同じになっていること。
const doc = (kb: Record<string, unknown>) => ({ Format: "kasane-export", Version: 1, Scope: "Keyboard", Keyboards: [{ Layers: [{ Index: 0, Keys: { SC_003A: "KC_LCTL" } }, { Index: 1, Keys: {} }], ...kb }] });
const td = (f: Record<string, string>) => doc({ TapDances: [{ Id: 0, ...f }] });
const errorPaths = (d: unknown) => validateKeymap(d).errors.map((i) => i.path);

describe("タップダンス", () => {
  it("長押しに MO(n) は置けない（エディタが断る）", () => {
    const r = validateKeymap(td({ SingleTap: "KC_A", SingleHold: "MO(1)" }));
    expect(r.ok).toBe(false);
    expect(errorPaths(td({ SingleTap: "KC_A", SingleHold: "MO(1)" }))).toContain("Keyboards[0].TapDances[0].SingleHold");
  });
  it("長押しに置けるもの: KC_*、修飾付き、MT、LT、LM、MACRO、空欄、KC_NO", () => {
    for (const h of ["KC_LCTL", "LCTL(KC_Z)", "MT(MOD_LCTL, KC_A)", "LT(1, KC_A)", "LM(1, MOD_LSFT)", "KC_NO", ""]) {
      expect(errorPaths(td({ SingleTap: "KC_A", SingleHold: h })), h).toEqual([]);
    }
    expect(errorPaths(doc({ Macros: [{ Id: 0, Keys: ["KC_A"] }], TapDances: [{ Id: 0, SingleTap: "KC_A", SingleHold: "MACRO(0)" }] }))).toEqual([]);
  });
  it("長押しに置けないもの: TG / OSL / TO / DF / TT / OSM / MARK / HLP / TAPDANCE / KC_TRNS", () => {
    for (const h of ["TG(1)", "OSL(1)", "TO(1)", "DF(1)", "TT(1)", "OSM(MOD_LSFT)", "MARK(on)", "HLP(1)", "TAPDANCE(1)", "KC_TRNS"]) {
      expect(errorPaths(td({ SingleTap: "KC_A", SingleHold: h })), h).toContain("Keyboards[0].TapDances[0].SingleHold");
    }
  });
  it("タップ側は、キー・修飾付き・MACRO だけ。MO / MT / LT は置けない", () => {
    for (const f of ["SingleTap", "DoubleTap", "TripleTap"]) {
      expect(errorPaths(td({ [f]: "KC_A" }))).toEqual([]);
      expect(errorPaths(td({ [f]: "LCTL(KC_C)" }))).toEqual([]);
      for (const t of ["MO(1)", "MT(MOD_LCTL, KC_A)", "LT(1, KC_A)", "TG(1)"]) expect(errorPaths(td({ [f]: t })), `${f} ${t}`).toContain(`Keyboards[0].TapDances[0].${f}`);
    }
  });
});

describe("コンボの出力", () => {
  const combo = (o: string) => doc({ Combos: [{ Id: 0, Key1: "SC_001E", Key2: "SC_0030", Output: o }] });
  it("キー・修飾付き・MACRO だけ", () => {
    expect(errorPaths(combo("KC_ESC"))).toEqual([]);
    expect(errorPaths(combo("LCTL(KC_Z)"))).toEqual([]);
    for (const o of ["MO(1)", "MT(MOD_LCTL, KC_A)", "KC_TRNS", "KC_NO"]) expect(errorPaths(combo(o)), o).toContain("Keyboards[0].Combos[0].Output");
  });
});

describe("マクロの中身", () => {
  const macro = (k: string) => doc({ Macros: [{ Id: 0, Keys: [k] }] });
  it("キーと修飾付きキーだけ", () => {
    expect(errorPaths(macro("KC_A"))).toEqual([]);
    expect(errorPaths(macro("LCTL(KC_C)"))).toEqual([]);
    for (const k of ["MO(1)", "MACRO(1)", "KC_TRNS", "KC_NO"]) expect(errorPaths(macro(k)), k).toContain("Keyboards[0].Macros[0].Keys[0]");
  });
});

describe("キー置換", () => {
  const ko = (key: string, rep: string) => doc({ KeyOverrides: [{ Id: 0, Mods: "MOD_LSFT", Key: key, Replacement: rep }] });
  it("置き換え先: キー・修飾付き・MACRO・OSL/TG/TO/DF・HLP・MARK。MO / LM / OSM / MT / LT は置けない", () => {
    for (const r of ["KC_A", "LCTL(KC_Z)", "MACRO(0)", "OSL(1)", "TG(1)", "TO(1)", "DF(1)", "HLP(1)", "MARK(on)"]) expect(errorPaths(ko("KC_1", r)), r).not.toContain("Keyboards[0].KeyOverrides[0].Replacement");
    for (const r of ["MO(1)", "LM(1, MOD_LSFT)", "OSM(MOD_LSFT)", "MT(MOD_LCTL, KC_A)", "LT(1, KC_A)", "TT(1)"]) expect(errorPaths(ko("KC_1", r)), r).toContain("Keyboards[0].KeyOverrides[0].Replacement");
  });
  it("対象のキーは、単純なキー（KC_*）だけ", () => {
    expect(errorPaths(ko("KC_1", "KC_A"))).not.toContain("Keyboards[0].KeyOverrides[0].Key");
    expect(errorPaths(ko("LCTL(KC_1)", "KC_A"))).toContain("Keyboards[0].KeyOverrides[0].Key");
  });
});
