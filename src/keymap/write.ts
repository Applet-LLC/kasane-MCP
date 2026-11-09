import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateKeymap, type Issue, type ValidationResult } from "./validate.js";

export function defaultOutputDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.KASANE_MCP_OUTPUT_DIR || path.join(os.homedir(), "Documents", "kasane-mcp");
}

/** ファイル名に使える文字だけを残す。区切り文字（\ / :）や拡張子は含められない。 */
export function safeStem(name: string | undefined): string {
  const s = (name ?? "").normalize("NFC").replace(/\.kasane\.json$/i, "").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s;
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export type CreateResult =
  | { ok: true; path: string; validation: ValidationResult }
  | { ok: false; reason: "invalid"; validation: ValidationResult }
  | { ok: false; reason: "io"; message: string; validation: ValidationResult };

/**
 * 検証に通った設定を、出力フォルダに新しいファイルとして保存する。
 * 上書きはしない（同名があれば、連番をつける）。フォルダの外には書かない。
 */
export function createKeymapFile(keymap: unknown, opts: { name?: string; dir?: string; now?: Date } = {}): CreateResult {
  const parsed = typeof keymap === "string" ? safeParse(keymap) : keymap;
  const validation = validateKeymap(parsed ?? keymap);
  if (!validation.ok) return { ok: false, reason: "invalid", validation };

  const dir = path.resolve(opts.dir ?? defaultOutputDir());
  const stem = [stamp(opts.now ?? new Date()), safeStem(opts.name)].filter(Boolean).join("-");
  const text = JSON.stringify(parsed, null, 2) + "\n";
  try {
    mkdirSync(dir, { recursive: true });
    for (let n = 0; n < 100; n++) {
      const file = path.join(dir, `kasane-mcp-${stem}${n ? `-${n + 1}` : ""}.kasane.json`);
      if (path.dirname(file) !== dir) throw new Error("出力フォルダの外には書けません");
      try {
        writeFileSync(file, text, { encoding: "utf8", flag: "wx" });
        return { ok: true, path: file, validation };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      }
    }
    throw new Error("同じ名前のファイルが多すぎます");
  } catch (e) {
    return { ok: false, reason: "io", message: (e as Error).message, validation };
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

export type { Issue };

/** 保存したあとに、ユーザーがエディタでやる手順（マニュアル 14-import-export に沿う）。 */
export function importSteps(file: string): string[] {
  return [
    "（念のため）エディタの下の「インポート／エクスポート...」の「エクスポート」で、今の設定を書き出して、バックアップを取っておく。",
    `エディタの下の「インポート／エクスポート...」を開き、「インポート」タブの「ファイルを選ぶ...」で、次のファイルを選ぶ: ${file}`,
    "「読み込む項目」を選び、読み込み方を選ぶ。今の設定に、この変更だけを足すときは「追加」（ほかのキーは、今のまま残る）。「置き換え」は、選んだ項目を、このファイルの内容で作り直す（ファイルに無いキーは、初期状態に戻る）ので、設定全体を入れ替えるときだけ使う。",
    "ファイルの中のキーボードを、接続中のキーボードに対応づける（自動で割り当てられる。合わないときは画面で選ぶ）。",
    "「内容確認」を押して、結果を確かめる。問題がなければ「読み込む」を押す。",
    "最後に「キーボードに適用(ON)」を押す。ここで初めて、キーボードの動きが変わる。",
  ];
}

export const EMERGENCY_NOTE =
  "適用後にキーボードから入力できなくなったときは、左右の Ctrl と左右の Shift（既定の組み合わせ）を3秒同時に押し続けると、リマップが OFF になる。";
