import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateKeymap } from "../src/keymap/validate.js";

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
