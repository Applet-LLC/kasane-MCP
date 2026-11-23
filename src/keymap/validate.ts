import type { TokenResult } from "../keycodes/index.js";
import { FORMAT_HINT } from "./format.js";
import { DANGEROUS_KEYS, MAX_COMBOS, MAX_KEY_OVERRIDES, MAX_LAYERS, MAX_MACROS, MAX_TAPDANCES, checkModMask, checkToken, parseRawScanCode } from "../keycodes/index.js";

export interface Issue {
  level: "error" | "warning";
  /** 例: keyboards[0].layers[1].keys.SC_003A */
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  /** 書式の誤りがあるときの、直し方の案内。 */
  hint?: string;
  errors: Issue[];
  warnings: Issue[];
  summary: { keyboards: number; layers: number; keys: number; macros: number; combos: number; tapDances: number; keyOverrides: number };
}

const SCOPES = ["all", "keyboard", "layer"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** *.kasane.json（Format="kasane-export"、Version 1）の中身を、ドライバや設定に触れずに点検する。 */
export function validateKeymap(input: unknown): ValidationResult {
  const issues: Issue[] = [];
  const err = (path: string, message: string): undefined => {
    issues.push({ level: "error", path, message });
    return undefined;
  };
  const warn = (path: string, message: string): undefined => {
    issues.push({ level: "warning", path, message });
    return undefined;
  };
  const summary = { keyboards: 0, layers: 0, keys: 0, macros: 0, combos: 0, tapDances: 0, keyOverrides: 0 };

  let doc: unknown = input;
  if (typeof input === "string") {
    try {
      doc = JSON.parse(input);
    } catch (e) {
      err("", `JSON として読めません: ${(e as Error).message}`);
      return finish(issues, summary);
    }
  }
  if (!isObj(doc)) {
    err("", "ファイルの最上位は、オブジェクトにしてください");
    return finish(issues, summary);
  }

  if (doc.Format !== "kasane-export") err("Format", 'Format は "kasane-export" にしてください');
  if (doc.Version !== 1) err("Version", "Version は 1 にしてください（この版が読めるのは 1 まで）");
  if (typeof doc.Scope !== "string" || !SCOPES.includes(doc.Scope.toLowerCase())) err("Scope", "Scope は All / Keyboard / Layer のいずれかにしてください");

  if (!Array.isArray(doc.Keyboards) || doc.Keyboards.length === 0) {
    err("Keyboards", "キーボードの設定が入っていません");
    return finish(issues, summary);
  }

  const dangerSeen = new Set<string>();
  const checkTok = (path: string, value: unknown, opts: { allowEmpty?: boolean } = {}): TokenResult | undefined => {
    if (typeof value !== "string") return err(path, "文字列にしてください");
    if (value === "" && opts.allowEmpty) return undefined;
    const r = checkToken(value);
    if (!r.ok) return err(path, r.error ?? "使えないキーコードです");
    for (const k of r.baseKeys) if (DANGEROUS_KEYS.has(k)) dangerSeen.add(`${path}: ${k}`);
    return r;
  };

  // エディタが、置ける場所ごとに受け付ける範囲（kasane の ProjectService.cs と同じ）。
  const TAP_KINDS = ["none", "key", "modded", "macro"];
  const HOLD_KINDS = ["none", "key", "modded", "mod-tap", "layer-tap", "macro"];
  /** 場所ごとの制約を点検する。許されない種類なら、エラーにする。 */
  const restrict = (path: string, r: TokenResult | undefined, allowed: (r: TokenResult) => boolean, what: string) => {
    if (r && !allowed(r)) err(path, `ここには置けません。${what}にしてください（エディタが、読み込み後の適用で断ります）`);
  };
  const tapOk = (r: TokenResult) => TAP_KINDS.includes(r.kind ?? "");
  const holdOk = (r: TokenResult) => HOLD_KINDS.includes(r.kind ?? "") || r.fn === "LM";

  doc.Keyboards.forEach((kb: unknown, ki: number) => {
    const kp = `Keyboards[${ki}]`;
    if (!isObj(kb)) return err(kp, "オブジェクトにしてください");
    summary.keyboards++;

    const macroIds = new Set<number>();
    const tdIds = new Set<number>();
    const usedMacros: Array<[string, number]> = [];
    const usedTds: Array<[string, number]> = [];
    const usedLayers: Array<[string, number]> = [];
    const note = (path: string, r: ReturnType<typeof checkTok>) => {
      if (r?.layerRef !== undefined) usedLayers.push([path, r.layerRef]);
      if (r?.macroId !== undefined) usedMacros.push([path, r.macroId]);
      if (r?.tapDanceId !== undefined) usedTds.push([path, r.tapDanceId]);
    };

    if (kb.Layers !== undefined) {
      if (!Array.isArray(kb.Layers)) err(`${kp}.Layers`, "配列にしてください");
      else {
        const seen = new Set<number>();
        kb.Layers.forEach((layer: unknown, li: number) => {
          const lp = `${kp}.Layers[${li}]`;
          if (!isObj(layer)) return err(lp, "オブジェクトにしてください");
          summary.layers++;
          const idx = layer.Index;
          if (!Number.isInteger(idx) || (idx as number) < 0 || (idx as number) >= MAX_LAYERS) err(`${lp}.Index`, `レイヤー番号は 0〜${MAX_LAYERS - 1} です`);
          else if (seen.has(idx as number)) err(`${lp}.Index`, `レイヤー ${idx} が重複しています`);
          else seen.add(idx as number);
          if (!isObj(layer.Keys)) return err(`${lp}.Keys`, '"SC_001E": "KC_B" の形のオブジェクトにしてください');
          for (const [sc, tok] of Object.entries(layer.Keys)) {
            const p = `${lp}.Keys.${sc}`;
            summary.keys++;
            if (parseRawScanCode(sc) === null) err(p, "キーの名前は SC_XXXX（16進4桁。例: SC_003A）にしてください");
            note(p, checkTok(p, tok));
            if (typeof tok === "string" && tok === "KC_TRNS") warn(p, "透過（KC_TRNS）のキーは、書かなくても同じです");
          }
        });
        if (seen.size > 0 && !seen.has(0)) warn(`${kp}.Layers`, "レイヤー 0（基本のレイヤー）がありません");
      }
    }

    const idList = (key: string, max: number, ids: Set<number>, each: (e: Obj, p: string) => void, count: () => void) => {
      const v = kb[key];
      if (v === undefined) return;
      if (!Array.isArray(v)) return err(`${kp}.${key}`, "配列にしてください");
      v.forEach((e: unknown, i: number) => {
        const p = `${kp}.${key}[${i}]`;
        if (!isObj(e)) return err(p, "オブジェクトにしてください");
        count();
        if (!Number.isInteger(e.Id) || (e.Id as number) < 0 || (e.Id as number) >= max) err(`${p}.Id`, `番号は 0〜${max - 1} です`);
        else if (ids.has(e.Id as number)) err(`${p}.Id`, `番号 ${e.Id} が重複しています`);
        else ids.add(e.Id as number);
        each(e, p);
      });
    };

    idList("Macros", MAX_MACROS, macroIds, (e, p) => {
      if (!Array.isArray(e.Keys)) return err(`${p}.Keys`, "キーコードの配列にしてください");
      if (e.Keys.length === 0) warn(`${p}.Keys`, "中身が空のマクロです");
      e.Keys.forEach((k: unknown, i: number) => {
        const r = checkTok(`${p}.Keys[${i}]`, k);
        restrict(`${p}.Keys[${i}]`, r, (x) => x.kind === "key" || x.kind === "modded", "キー（KC_*）か、修飾付きキー（LCTL(KC_C) など）");
      });
    }, () => summary.macros++);

    const comboIds = new Set<number>();
    idList("Combos", MAX_COMBOS, comboIds, (e, p) => {
      // コンボのメンバーは、KC_ ではなくスキャンコード（SC_XXXX）で書く（エディタの読み込みがそう読む）。
      for (const f of ["Key1", "Key2"]) {
        if (typeof e[f] !== "string" || parseRawScanCode(e[f] as string) === null) err(`${p}.${f}`, "コンボのキーは SC_XXXX（16進4桁。例: SC_0024）で書きます。KC_ の名前は使えません");
      }
      if (e.Key1 !== undefined && e.Key1 === e.Key2) err(`${p}.Key2`, "コンボの2つのキーは、別のキーにしてください");
      const out = checkTok(`${p}.Output`, e.Output);
      restrict(`${p}.Output`, out, (x) => x.kind === "key" || x.kind === "modded" || x.kind === "macro", "キー（KC_*）、修飾付きキー（LCTL(KC_Z) など）、MACRO(n) のどれか");
      note(`${p}.Output`, out);
    }, () => summary.combos++);

    idList("TapDances", MAX_TAPDANCES, tdIds, (e, p) => {
      for (const f of ["SingleTap", "SingleHold", "DoubleTap", "TripleTap"]) {
        const r = checkTok(`${p}.${f}`, e[f] ?? "", { allowEmpty: true });
        if (f === "SingleHold") restrict(`${p}.${f}`, r, holdOk, "キー（KC_*）、MT(mod,kc)、LT(layer,kc)、修飾付きキー、LM(layer,mod)、MACRO(n)、空欄のどれか。MO(n) などは使えません");
        else restrict(`${p}.${f}`, r, tapOk, "キー（KC_*）、修飾付きキー（LCTL(KC_C) など）、MACRO(n)、空欄のどれか");
        note(`${p}.${f}`, r);
      }
    }, () => summary.tapDances++);

    idList("KeyOverrides", MAX_KEY_OVERRIDES, new Set(), (e, p) => {
      if (typeof e.Mods !== "string" || !checkModMask(e.Mods)) err(`${p}.Mods`, "MOD_LSFT や MOD_LCTL|MOD_LSFT の形にしてください");
      restrict(`${p}.Key`, checkTok(`${p}.Key`, e.Key), (x) => x.kind === "key", "単純なキー（KC_*）");
      const rep = checkTok(`${p}.Replacement`, e.Replacement);
      restrict(`${p}.Replacement`, rep, (x) => ["key", "modded", "macro", "helper", "mark"].includes(x.kind ?? "") || ["OSL", "TG", "TO", "DF"].includes(x.fn ?? ""), "キー（KC_*）、修飾付きキー、MACRO(n)、OSL/TG/TO/DF(n)、HLP(n)、MARK(...) のどれか");
      note(`${p}.Replacement`, rep);
    }, () => summary.keyOverrides++);

    if (Array.isArray(kb.Layers) && kb.Layers.length > 0) {
      const count = Math.max(...kb.Layers.map((l: unknown) => (isObj(l) && Number.isInteger(l.Index) ? (l.Index as number) + 1 : 0)));
      for (const [p, n] of usedLayers) if (n >= count) warn(p, `レイヤー ${n} へ切り替えますが、このファイルにレイヤー ${n} がありません（読み込むと、レイヤーが足りない旨の注意が出ます）`);
    }
    for (const [p, id] of usedMacros) if (!macroIds.has(id)) warn(p, `MACRO(${id}) を使っていますが、このキーボードにマクロ ${id} の定義がありません`);
    for (const [p, id] of usedTds) if (!tdIds.has(id)) warn(p, `TAPDANCE(${id}) を使っていますが、このキーボードにタップダンス ${id} の定義がありません`);
  });

  for (const d of dangerSeen) {
    const [path, key] = d.split(": ");
    warn(path, `${key} は、電源・スリープに関わるキーです。OS の設定によっては、押すだけでシャットダウンや休止になります。本当に必要な場合だけ使ってください`);
  }

  return finish(issues, summary);
}

function finish(issues: Issue[], summary: ValidationResult["summary"]): ValidationResult {
  const errors = issues.filter((i) => i.level === "error");
  const result: ValidationResult = { ok: errors.length === 0, errors, warnings: issues.filter((i) => i.level === "warning"), summary };
  // 最上位の項目が足りない・違うときは、書式の説明とひな形のありかを添える。
  if (errors.some((e) => ["", "Format", "Version", "Scope", "Keyboards"].includes(e.path))) result.hint = FORMAT_HINT;
  return result;
}
