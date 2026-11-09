import { BASE_KEYS } from "./data.js";

/** ドライバの上限（driver/common/kbdlayer_ioctl.h）。 */
export const MAX_LAYERS = 16;
export const MAX_MACROS = 128;
export const MAX_COMBOS = 16;
export const MAX_TAPDANCES = 16;
export const MAX_KEY_OVERRIDES = 128;

const BASE = new Map<string, number>(BASE_KEYS);

/** 誤って割り当てると、PC が止まる・眠るキー。 */
export const DANGEROUS_KEYS = new Set(["KC_PWR", "KC_SYSTEM_POWER", "KC_SLEP", "KC_SYSTEM_SLEEP", "KC_WAKE", "KC_SYSTEM_WAKE"]);

const MOD_BITS = new Set(["MOD_LCTL", "MOD_LSFT", "MOD_LALT", "MOD_LGUI", "MOD_RCTL", "MOD_RSFT", "MOD_RALT", "MOD_RGUI"]);
const MOD_FUNCS = new Set(["LCTL", "LSFT", "LALT", "LGUI", "RCTL", "RSFT", "RALT", "RGUI", "C", "S", "A", "G"]);

export type TokenKind = "none" | "transparent" | "key" | "modded" | "layer" | "mod-tap" | "layer-tap" | "macro" | "tapdance" | "helper" | "mark" | "oneshot-mod";

export interface TokenResult {
  ok: boolean;
  kind?: TokenKind;
  /** 使っている基本キー（危険キーの検出用）。 */
  baseKeys: string[];
  /** 参照する番号（MACRO / TAPDANCE）。 */
  macroId?: number;
  tapDanceId?: number;
  /** 切り替え先のレイヤー番号（MO / TG / LT など）。 */
  layerRef?: number;
  error?: string;
}

/** SC_XXXX（Enc16 の16進4桁。上位2桁は 00 / E0 / E1、下位2桁は 0 以外）。 */
export function parseRawScanCode(token: string): number | null {
  if (!/^SC_[0-9A-Fa-f]{4}$/.test(token)) return null;
  const v = parseInt(token.slice(3), 16);
  const prefix = v >> 8;
  if ((prefix !== 0x00 && prefix !== 0xe0 && prefix !== 0xe1) || (v & 0xff) === 0) return null;
  return v;
}

function baseKey(token: string): { sc: number; name: string } | null {
  const sc = BASE.get(token);
  if (sc !== undefined) return { sc, name: token };
  const raw = parseRawScanCode(token);
  return raw === null ? null : { sc: raw, name: token };
}

function splitCall(token: string): { name: string; args: string } | null {
  const open = token.indexOf("(");
  if (open <= 0 || !token.endsWith(")")) return null;
  return { name: token.slice(0, open), args: token.slice(open + 1, -1) };
}

function intIn(s: string, max: number): number | null {
  return /^\d+$/.test(s) && Number(s) < max ? Number(s) : null;
}

function fail(error: string): TokenResult {
  return { ok: false, baseKeys: [], error };
}

/** キーコードの文字列（KC_A、MO(1)、LCTL(KC_C) など）が、kasane で使える形かを調べる。 */
export function checkToken(raw: string): TokenResult {
  const token = raw.trim();
  if (token === "") return fail("空です");
  if (token === "KC_TRNS" || token === "_______" || token === "KC_TRANSPARENT") return { ok: true, kind: "transparent", baseKeys: [] };
  if (token === "KC_NO" || token === "XXXXXXX") return { ok: true, kind: "none", baseKeys: [] };

  const bk = baseKey(token);
  if (bk) return { ok: true, kind: "key", baseKeys: [bk.name] };

  // 修飾付きキー: LCTL(KC_C)、C(S(KC_T)) など
  let cur = token;
  let mods = 0;
  for (let depth = 0; depth < 8; depth++) {
    const c = splitCall(cur);
    if (!c || !MOD_FUNCS.has(c.name)) break;
    mods++;
    cur = c.args.replace(/ /g, "");
  }
  if (mods > 0) {
    const inner = baseKey(cur);
    return inner ? { ok: true, kind: "modded", baseKeys: [inner.name] } : fail(`修飾キーの中身「${cur}」は、使えるキーではありません`);
  }

  const call = splitCall(token);
  if (!call) return fail(`「${token}」は、kasane で使えるキーコードではありません（kasane_search_keycodes で探せます）`);
  const parts = call.args.split(",").map((s) => s.replace(/ /g, ""));
  const layer = (s: string) => intIn(s, MAX_LAYERS);
  const layerErr = `レイヤー番号は 0〜${MAX_LAYERS - 1} です`;

  switch (call.name) {
    case "MO":
    case "TG":
    case "DF":
    case "OSL":
    case "TO":
    case "TT":
      if (parts.length !== 1) return fail(`${call.name}(レイヤー番号) の形で書きます`);
      return layer(parts[0]) === null ? fail(layerErr) : { ok: true, kind: "layer", baseKeys: [], layerRef: layer(parts[0])! };
    case "LM": {
      if (parts.length !== 2) return fail("LM(レイヤー番号, MOD_LCTL|MOD_LSFT) の形で書きます");
      if (layer(parts[0]) === null) return fail(layerErr);
      const mods2 = parts[1].split("|");
      return mods2.every((m) => MOD_BITS.has(m)) ? { ok: true, kind: "layer", baseKeys: [], layerRef: layer(parts[0])! } : fail("修飾は MOD_LCTL などを | でつないで書きます");
    }
    case "OSM":
      return parts.length === 1 && parts[0].split("|").every((m) => MOD_BITS.has(m)) ? { ok: true, kind: "oneshot-mod", baseKeys: [] } : fail("OSM(MOD_LSFT) の形で書きます");
    case "MARK":
      return parts.length === 1 && ["on", "off", "toggle"].includes(parts[0]) ? { ok: true, kind: "mark", baseKeys: [] } : fail("MARK(on|off|toggle) の形で書きます");
    case "MT": {
      if (parts.length !== 2 || !MOD_BITS.has(parts[0])) return fail("MT(MOD_LCTL, KC_A) の形で書きます");
      const k = baseKey(parts[1]);
      return k ? { ok: true, kind: "mod-tap", baseKeys: [k.name] } : fail(`「${parts[1]}」は、使えるキーではありません`);
    }
    case "LT": {
      if (parts.length !== 2) return fail("LT(レイヤー番号, KC_A) の形で書きます");
      if (layer(parts[0]) === null) return fail(layerErr);
      const k = baseKey(parts[1]);
      return k ? { ok: true, kind: "layer-tap", baseKeys: [k.name], layerRef: layer(parts[0])! } : fail(`「${parts[1]}」は、使えるキーではありません`);
    }
    case "MACRO": {
      const id = parts.length === 1 ? intIn(parts[0], MAX_MACROS) : null;
      return id === null ? fail(`マクロ番号は 0〜${MAX_MACROS - 1} です`) : { ok: true, kind: "macro", baseKeys: [], macroId: id };
    }
    case "TAPDANCE": {
      const id = parts.length === 1 ? intIn(parts[0], MAX_TAPDANCES) : null;
      return id === null ? fail(`タップダンス番号は 0〜${MAX_TAPDANCES - 1} です`) : { ok: true, kind: "tapdance", baseKeys: [], tapDanceId: id };
    }
    case "HLP": {
      const p = parts[0] ?? "";
      const hex = /^0x[0-9a-f]+$/i.test(p);
      const dec = /^\d+$/.test(p);
      const v = hex ? parseInt(p.slice(2), 16) : dec ? Number(p) : NaN;
      return parts.length === 1 && v >= 0 && v <= 0xffff ? { ok: true, kind: "helper", baseKeys: [] } : fail("HLP(番号) の番号は 0〜65535 です");
    }
    default:
      return fail(`「${call.name}(...)」は、kasane で使える関数ではありません`);
  }
}

/** "MOD_LSFT" や "MOD_LCTL|MOD_LSFT"。 */
export function checkModMask(s: string): boolean {
  return s.split("|").every((m) => MOD_BITS.has(m.trim()));
}

export function scanCodeHex(sc: number): string {
  return `SC_${sc.toString(16).toUpperCase().padStart(4, "0")}`;
}

export interface KeycodeHit {
  name: string;
  scanCode: string;
  aliases: string[];
  dangerous: boolean;
}

/** 同じスキャンコードの名前をまとめた表（検索用）。 */
const GROUPS: Array<{ sc: number; names: string[] }> = (() => {
  const bySc = new Map<number, string[]>();
  for (const [name, sc] of BASE_KEYS) {
    const list = bySc.get(sc) ?? [];
    list.push(name);
    bySc.set(sc, list);
  }
  return [...bySc].map(([sc, names]) => ({ sc, names }));
})();

/** スキャンコード → 名前（最初の別名）。表に無ければ null。 */
export function nameForScanCode(sc: number): string | null {
  return GROUPS.find((g) => g.sc === sc)?.names[0] ?? null;
}

export function searchKeycodes(query: string, limit = 20): KeycodeHit[] {
  const q = query.trim().toUpperCase().replace(/^KC_/, "");
  if (!q) return [];
  const scoreOf = (names: string[], sc: number): number => {
    let best = 0;
    for (const n of names) {
      const short = n.replace(/^KC_/, "");
      if (short === q) best = Math.max(best, 100);
      else if (short.startsWith(q)) best = Math.max(best, 50 - Math.min(short.length - q.length, 40));
      else if (short.includes(q)) best = Math.max(best, 10);
    }
    if (scanCodeHex(sc) === `SC_${q}`) best = Math.max(best, 100);
    return best;
  };
  return GROUPS.map((g) => ({ g, s: scoreOf(g.names, g.sc) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ g }) => ({ name: g.names[0], scanCode: scanCodeHex(g.sc), aliases: g.names.slice(1), dangerous: g.names.some((n) => DANGEROUS_KEYS.has(n)) }));
}
