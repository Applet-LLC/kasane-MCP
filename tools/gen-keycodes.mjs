// kasane の driver/KeymapTool/KeycodeTable.cpp から、基本キーの表（名前 → スキャンコード）を取り出し、
// src/keycodes/data.ts を作る開発用スクリプト。kasane のソースは、この生成のときだけ読む（実行時には使わない）。
// 将来は、kasane 側のリリースで作る「知識パック」から取得する形に置き換える。
//
// 使い方: node tools/gen-keycodes.mjs <KeycodeTable.cpp のパス>
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) {
  console.error("usage: node tools/gen-keycodes.mjs <KeycodeTable.cpp>");
  process.exit(2);
}
const text = readFileSync(src, "utf8");
const start = text.indexOf("BaseKeyTable()");
const end = text.indexOf("ModifierBitTable()", start);
if (start < 0 || end < 0) throw new Error("BaseKeyTable が見つかりません");
const block = text.slice(start, end);

const entries = [];
const re = /\{"(KC_[A-Z0-9_]+)",\s*(SC1|SCE0|SC)\(([^)]*)\)\}/g;
for (const m of block.matchAll(re)) {
  const [, name, fn, args] = m;
  const nums = args.split(",").map((s) => parseInt(s.trim(), 16));
  const code = fn === "SC1" ? nums[0] : fn === "SCE0" ? 0xe000 | nums[0] : (nums[0] << 8) | nums[1];
  entries.push([name, code]);
}
if (entries.length < 100) throw new Error(`取り出せた件数が少なすぎます: ${entries.length}`);

const lines = entries.map(([n, c]) => `  ["${n}", 0x${c.toString(16).toUpperCase().padStart(4, "0")}],`);
const out = `// 自動生成: tools/gen-keycodes.mjs（kasane の KeycodeTable.cpp の BaseKeyTable から）。手で編集しない。
// 名前 → スキャンコード（Enc16: 上位8bit = 00/E0/E1、下位8bit = Set1 の make コード）。
export const BASE_KEYS: ReadonlyArray<readonly [string, number]> = [
${lines.join("\n")}
];
`;
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "keycodes", "data.ts");
writeFileSync(dest, out);
console.log(`${entries.length} 件を ${dest} に書きました`);
