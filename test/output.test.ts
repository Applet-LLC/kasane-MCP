import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOW_ENV, outputSettings, readKasaneFromRegistry, resolveDestination } from "../src/keymap/output.js";
import { createKeymapFile } from "../src/keymap/write.js";
import { NAME, VERSION } from "../src/version.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const good = () => ({ Format: "kasane-export", Version: 1, Scope: "Keyboard", Keyboards: [{ Layers: [{ Index: 0, Keys: { SC_003A: "KC_LCTL" } }] }] });

const none = () => null;
let kasane: string;
let docs: string;
const env = (extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({ LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local", KASANE_MCP_OUTPUT_DIR: docs, ...extra });

beforeEach(() => {
  kasane = mkdtempSync(path.join(os.tmpdir(), "kasane-env-"));
  docs = path.join(mkdtempSync(path.join(os.tmpdir(), "kasane-docs-")), "kasane-mcp");
});
afterEach(() => {
  rmSync(kasane, { recursive: true, force: true });
  rmSync(path.dirname(docs), { recursive: true, force: true });
});

describe("バージョン", () => {
  it("package.json の version と一致する（コードに別の版番号を書かない）", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    expect(VERSION).toBe(pkg.version);
    expect(NAME).toBe(pkg.name);
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("outputSettings", () => {
  it("KASANE が無ければ、既定の保存先だけ。設定フォルダーは LOCALAPPDATA の下", () => {
    const s = outputSettings(env(), none);
    expect(s.defaultDir).toBe(docs);
    expect(s.kasaneEnv).toBeNull();
    expect(s.kasaneUsable).toBe(false);
    expect(s.kasaneOutputDir).toBeNull();
    expect(s.kasaneDataDir).toBe(path.join("C:\\Users\\x\\AppData\\Local", "applet", "kasane"));
  });
  it("KASANE があれば、その値を返し、出力先は KASANE\\kasane-mcp", () => {
    const s = outputSettings(env({ KASANE: kasane }), none);
    expect(s.kasaneEnv).toBe(kasane);
    expect(s.kasaneUsable).toBe(true);
    expect(s.kasaneOutputDir).toBe(path.join(kasane, "kasane-mcp"));
    expect(s.kasaneDataDir).toBe(kasane);
    expect(s.kasaneAllowed).toBe(false);
  });
  it("前後の二重引用符と空白を外す", () => {
    expect(outputSettings(env({ KASANE: ` "${kasane}" ` }), none).kasaneEnv).toBe(kasane);
  });
  it("絶対パスでない、または実在しない KASANE は、使えない", () => {
    expect(outputSettings(env({ KASANE: "relative\\dir" }), none).kasaneUsable).toBe(false);
    expect(outputSettings(env({ KASANE: path.join(kasane, "nope") }), none).kasaneUsable).toBe(false);
    const file = path.join(kasane, "f.txt");
    writeFileSync(file, "x");
    expect(outputSettings(env({ KASANE: file }), none).kasaneUsable).toBe(false);
  });
});

describe("resolveDestination", () => {
  it("省略・default は、既定の保存先", () => {
    expect(resolveDestination(undefined, env({ KASANE: kasane }), none)).toEqual({ ok: true, dir: docs, destination: "default" });
    expect(resolveDestination("default", env(), none)).toMatchObject({ ok: true, dir: docs });
  });
  it("許可が無ければ、KASANE は断る。断る文面に、設定の書き方が入る", () => {
    const r = resolveDestination("kasane", env({ KASANE: kasane }), none);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain(ALLOW_ENV);
      expect(r.message).toContain("claude_desktop_config.json");
    }
  });
  it("許可は、値が 1 のときだけ（true や yes は許可にならない）", () => {
    for (const v of ["0", "true", "yes", "", " 1"]) expect(resolveDestination("kasane", env({ KASANE: kasane, [ALLOW_ENV]: v }), none).ok).toBe(false);
  });
  it("許可があって KASANE が使えるときは、KASANE\\kasane-mcp", () => {
    expect(resolveDestination("kasane", env({ KASANE: kasane, [ALLOW_ENV]: "1" }), none)).toEqual({ ok: true, dir: path.join(kasane, "kasane-mcp"), destination: "kasane" });
  });
  it("許可があっても、KASANE が未設定・実在しないときは断る（フォルダーは作らない）", () => {
    expect(resolveDestination("kasane", env({ [ALLOW_ENV]: "1" }), none).ok).toBe(false);
    const missing = path.join(kasane, "nope");
    const r = resolveDestination("kasane", env({ KASANE: missing, [ALLOW_ENV]: "1" }), none);
    expect(r.ok).toBe(false);
    expect(readdirSync(kasane)).toEqual([]);
  });
});

describe("KASANE への保存", () => {
  it("サブフォルダーに保存し、設定フォルダーの既存のファイルには触れない", () => {
    writeFileSync(path.join(kasane, "project.json"), "KEEP");
    mkdirSync(path.join(kasane, "backup"));
    const dest = resolveDestination("kasane", env({ KASANE: kasane, [ALLOW_ENV]: "1" }), none);
    expect(dest.ok).toBe(true);
    if (!dest.ok) return;
    const r = createKeymapFile(good(), { dir: dest.dir, name: "t" });
    expect(r.ok).toBe(true);
    expect(readFileSync(path.join(kasane, "project.json"), "utf8")).toBe("KEEP");
    expect(readdirSync(kasane).sort()).toEqual(["backup", "kasane-mcp", "project.json"]);
    expect(readdirSync(path.join(kasane, "kasane-mcp"))).toHaveLength(1);
  });
  it("kasane が自動で読む特別な名前（kasane-import.json、kasane-recovery.kasane.json）では、書かない", () => {
    for (const name of ["kasane-import", "kasane-recovery", "../kasane-import", "kasane-recovery.kasane.json"]) {
      const r = createKeymapFile(good(), { dir: docs, name });
      expect(r.ok).toBe(true);
      if (r.ok) {
        const base = path.basename(r.path);
        expect(base.startsWith("kasane-mcp-")).toBe(true);
        expect(base).not.toBe("kasane-import.json");
        expect(base).not.toBe("kasane-recovery.kasane.json");
      }
    }
    expect(readdirSync(docs).every((f) => f.startsWith("kasane-mcp-"))).toBe(true);
  });
});

describe("KASANE をレジストリから読む（クライアントが環境変数を絞るとき）", () => {
  it("プロセスの環境変数に無ければ、レジストリの値を使い、取得元を返す", () => {
    const s = outputSettings(env(), () => kasane);
    expect(s.kasaneEnv).toBe(kasane);
    expect(s.kasaneEnvSource).toBe("registry");
    expect(s.kasaneUsable).toBe(true);
    expect(s.kasaneDataDir).toBe(kasane);
  });
  it("プロセスの環境変数があれば、そちらを優先し、レジストリは読まない", () => {
    let called = false;
    const s = outputSettings(env({ KASANE: kasane }), () => {
      called = true;
      return "C:\other";
    });
    expect(s.kasaneEnv).toBe(kasane);
    expect(s.kasaneEnvSource).toBe("process");
    expect(called).toBe(false);
  });
  it("どちらにも無ければ、null", () => {
    const s = outputSettings(env(), none);
    expect(s.kasaneEnv).toBeNull();
    expect(s.kasaneEnvSource).toBeNull();
  });
  it("レジストリの値でも、許可と実在の確認は同じ", () => {
    expect(resolveDestination("kasane", env(), () => kasane).ok).toBe(false); // 許可なし
    expect(resolveDestination("kasane", env({ [ALLOW_ENV]: "1" }), () => kasane)).toMatchObject({ ok: true, dir: path.join(kasane, "kasane-mcp") });
    expect(resolveDestination("kasane", env({ [ALLOW_ENV]: "1" }), () => path.join(kasane, "nope")).ok).toBe(false);
  });
  it.skipIf(process.platform !== "win32")("実際のレジストリの読み取りが、例外にならない（値があれば文字列、無ければ null）", () => {
    const v = readKasaneFromRegistry(process.env);
    expect(v === null || typeof v === "string").toBe(true);
  });
});
