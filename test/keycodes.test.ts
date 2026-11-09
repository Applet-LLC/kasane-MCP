import { describe, expect, it } from "vitest";
import { checkToken, nameForScanCode, searchKeycodes } from "../src/keycodes/index.js";
import { validateKeymap } from "../src/keymap/validate.js";

describe("checkToken", () => {
  it.each(["KC_A", "KC_CAPS", "KC_TRNS", "KC_NO", "MO(1)", "TG(15)", "LT(2, KC_ENT)", "MT(MOD_LCTL, KC_A)", "LCTL(KC_C)", "C(S(KC_T))", "MACRO(127)", "TAPDANCE(15)", "HLP(0x10)", "SC_E01D", "LM(1, MOD_LCTL|MOD_LSFT)", "MARK(toggle)", "OSM(MOD_LSFT)"])("%s は有効", (t) => {
    expect(checkToken(t).ok).toBe(true);
  });
  it.each(["", "KC_NOPE", "MO(16)", "MO(-1)", "MO()", "MACRO(128)", "TAPDANCE(16)", "LT(1)", "MT(KC_A, KC_B)", "FOO(1)", "SC_0000", "SC_E100", "SC_12", "LCTL(NOPE)", "HLP(70000)"])("%j は無効", (t) => {
    expect(checkToken(t).ok).toBe(false);
  });
  it("参照する番号を返す", () => {
    expect(checkToken("MACRO(3)").macroId).toBe(3);
    expect(checkToken("TAPDANCE(2)").tapDanceId).toBe(2);
  });
});

describe("searchKeycodes", () => {
  it("名前の一部で探す", () => {
    expect(searchKeycodes("CAPS")[0].name).toMatch(/KC_CAPS/);
    expect(searchKeycodes("kc_enter")[0].scanCode).toBe("SC_001C");
  });
  it("電源系は dangerous", () => {
    expect(searchKeycodes("PWR").some((h) => h.dangerous)).toBe(true);
  });
  it("スキャンコードから名前を引く", () => {
    expect(nameForScanCode(0x003a)).toMatch(/CAPS/);
    expect(nameForScanCode(0xffff)).toBeNull();
  });
});

const base = () => ({
  Format: "kasane-export",
  Version: 1,
  Scope: "Keyboard",
  Keyboards: [{ UniqId: "0x55F70000", Layers: [{ Index: 0, Keys: { SC_003A: "KC_LCTL" } }] }],
});

describe("validateKeymap", () => {
  it("正しい設定は ok", () => {
    const r = validateKeymap(base());
    expect(r.ok).toBe(true);
    expect(r.summary).toMatchObject({ keyboards: 1, layers: 1, keys: 1 });
  });
  it("JSON の文字列も受け付け、壊れていればエラー", () => {
    expect(validateKeymap(JSON.stringify(base())).ok).toBe(true);
    expect(validateKeymap("{").errors[0].message).toContain("JSON");
  });
  it("Format・Version・Scope を点検する", () => {
    const r = validateKeymap({ ...base(), Format: "x", Version: 2, Scope: "Nope" });
    expect(r.errors.map((e) => e.path).sort()).toEqual(["Format", "Scope", "Version"]);
  });
  it("存在しないキーコードと、不正なキー名を指摘する", () => {
    const b = base();
    b.Keyboards[0].Layers[0].Keys = { SC_003A: "KC_NOPE", CAPS: "KC_A" } as never;
    const r = validateKeymap(b);
    expect(r.errors.map((e) => e.path)).toEqual(expect.arrayContaining(["Keyboards[0].Layers[0].Keys.SC_003A", "Keyboards[0].Layers[0].Keys.CAPS"]));
  });
  it("レイヤー番号の範囲と重複", () => {
    const b = base();
    (b.Keyboards[0].Layers as unknown[]).push({ Index: 16, Keys: {} }, { Index: 0, Keys: {} });
    const r = validateKeymap(b);
    expect(r.errors).toHaveLength(2);
  });
  it("電源キーは警告（エラーではない）", () => {
    const b = base();
    b.Keyboards[0].Layers[0].Keys = { SC_003A: "KC_PWR" };
    const r = validateKeymap(b);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.message.includes("電源"))).toBe(true);
  });
  it("定義の無いマクロの参照は警告", () => {
    const b = base();
    b.Keyboards[0].Layers[0].Keys = { SC_003A: "MACRO(5)" };
    expect(validateKeymap(b).warnings.some((w) => w.message.includes("MACRO(5)"))).toBe(true);
  });
  it("マクロ・コンボ・タップダンス・キー置換の点検", () => {
    const b = base() as Record<string, any>;
    b.Keyboards[0].Macros = [{ Id: 0, Keys: ["KC_A", "LCTL(KC_C)"] }, { Id: 0, Keys: [] }];
    b.Keyboards[0].Combos = [{ Id: 16, Key1: "KC_A", Key2: "KC_B", Output: "KC_C" }];
    b.Keyboards[0].TapDances = [{ Id: 0, SingleTap: "KC_A", SingleHold: "", DoubleTap: "KC_B", TripleTap: "" }];
    b.Keyboards[0].KeyOverrides = [{ Id: 0, Mods: "MOD_BAD", Key: "KC_BSPC", Replacement: "KC_DEL" }];
    const r = validateKeymap(b);
    expect(r.errors.map((e) => e.path)).toEqual(expect.arrayContaining(["Keyboards[0].Macros[1].Id", "Keyboards[0].Combos[0].Id", "Keyboards[0].KeyOverrides[0].Mods"]));
    expect(r.errors).toHaveLength(3);
  });
});
