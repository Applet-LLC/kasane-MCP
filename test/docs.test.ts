import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DocsIndex, tokenize } from "../src/docs/index.js";
import { locateDocs } from "../src/docs/locate.js";
import { parseManualHtml, parseMarkdown } from "../src/docs/html.js";

const home = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "home");
const env = { KASANE_HOME: home } as NodeJS.ProcessEnv;

describe("locateDocs", () => {
  it("KASANE_HOME を最優先で使う", () => {
    const loc = locateDocs(env);
    expect(loc.source).toBe("KASANE_HOME");
    expect(loc.manualDir).toContain("manual");
    expect(loc.tutorialPath).toContain("TUTORIAL-CLI.md");
  });
});

describe("parseManualHtml", () => {
  const page = parseManualHtml(
    '<html><head><title>7. 緊急解除 - かさね ヘルプ</title></head><body><nav>ナビ</nav><main><div class="pagehead">かさね</div><h1 id="a">7. 緊急解除</h1><p>本文&amp;説明</p><h2 id="b">組み合わせを変える</h2><ul><li>キー-1 <strong>欄</strong></li></ul><pre>KeymapTool --list</pre></main></body></html>',
  );
  it("タイトルから、サイト名を除く", () => expect(page.title).toBe("7. 緊急解除"));
  it("見出し単位に分け、ナビとヘッダーを含めない", () => {
    expect(page.sections.map((s) => s.heading)).toEqual(["7. 緊急解除", "組み合わせを変える"]);
    expect(JSON.stringify(page)).not.toContain("ナビ");
    expect(page.sections[0].text).toContain("本文&説明");
    expect(page.sections[1].text).toContain("- キー-1 欄");
    expect(page.sections[1].text).toContain("KeymapTool --list");
  });
});

describe("parseMarkdown", () => {
  it("コードブロック内の # を見出しにしない", () => {
    const p = parseMarkdown("# 題\n\n## 一\n```\n## not heading\n```\n## 二\n本文", "x");
    expect(p.title).toBe("題");
    expect(p.sections.map((s) => s.heading)).toEqual(["題", "一", "二"]);
  });
});

describe("DocsIndex", () => {
  const idx = DocsIndex.load(env);
  it("マニュアルとチュートリアルを読み込む", () => {
    expect(idx.get("kasane-doc://manual/ja/07-emergency")).toBeDefined();
    expect(idx.get("kasane-doc://cli-tutorial")).toBeDefined();
  });
  it("「緊急解除」で、緊急解除のページが先頭に出る", () => {
    const hits = idx.search("緊急解除");
    expect(hits[0].uri).toContain("07-emergency");
  });
  it("該当しない語は空", () => expect(idx.search("zzzzqqqq")).toEqual([]));
  it("空のクエリは空", () => expect(idx.search("  ")).toEqual([]));
});

describe("tokenize", () => {
  it("日本語は2文字ずつ、英数字は語のまま", () => {
    expect(tokenize("緊急解除 KC_A")).toEqual(["緊急", "急解", "解除", "kc_a"]);
  });
});
