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

describe("全文を読む（kasane_read_doc の中身）", () => {
  const idx = DocsIndex.load(env);
  it("ページ名・番号・URI のどれでも、同じページが見つかる", () => {
    for (const q of ["07-emergency", "7", "emergency", "07-emergency.html", "kasane-doc://manual/ja/07-emergency"]) {
      expect(idx.find(q, "ja")?.id, q).toBe("manual/ja/07-emergency");
    }
    expect(idx.find("cli-tutorial", "ja")?.slug).toBe("cli-tutorial");
    expect(idx.find("nope", "ja")).toBeUndefined();
  });
  it("全文を返し、続きが無ければ next は無い", () => {
    const r = idx.read("07-emergency", "ja");
    expect(r.ok).toBe(true);
    expect(r.text).toContain("緊急解除");
    expect(r.next).toBeUndefined();
    expect(r.total).toBe(r.text!.length);
  });
  it("節を指定すると、その節だけを返す", () => {
    const all = idx.read("07-emergency", "ja").text!;
    const sec = idx.read("07-emergency", "ja", "組み合わせ");
    if (sec.ok) expect(sec.text!.length).toBeLessThan(all.length);
    expect(idx.read("07-emergency", "ja", "zzzz").ok).toBe(false);
  });
  it("長いページは、offset で続きを読め、つなぐと全文になる", () => {
    const all = idx.read("07-emergency", "ja", undefined, 0, 1_000_000).text!;
    const parts: string[] = [];
    let off = 0;
    for (let i = 0; i < 100; i++) {
      const r = idx.read("07-emergency", "ja", undefined, off, 60);
      expect(r.ok).toBe(true);
      parts.push(r.text!);
      if (r.next === undefined) break;
      expect(r.next).toBeGreaterThan(off);
      off = r.next;
    }
    expect(parts.join("")).toBe(all);
    expect(parts.length).toBeGreaterThan(1);
  });
  it("範囲外の offset は、エラー", () => expect(idx.read("07-emergency", "ja", undefined, 999999).ok).toBe(false));
});

describe("英語のマニュアル", () => {
  const idx = DocsIndex.load(env);
  it("読み込み、言語ごとに分ける。CLI チュートリアルは、どちらの一覧にも入る", () => {
    expect(idx.languages()).toEqual(["ja", "en"]);
    expect(idx.list("en").map((p) => p.slug)).toContain("07-emergency");
    expect(idx.list("en").map((p) => p.slug)).toContain("cli-tutorial");
    expect(idx.list("en").every((p) => p.slug === "cli-tutorial" || p.lang === "en")).toBe(true);
  });
  it("題名から、サイト名（kasane Help）を除く", () => expect(idx.find("7", "en")?.title).toBe("7. Emergency Release"));
  it("英語で検索すると、英語のページが出る。日本語の検索には、英語のページは混ざらない", () => {
    expect(idx.search("emergency release", 5, "en")[0].uri).toContain("manual/en/07-emergency");
    expect(idx.search("緊急解除", 5, "ja").every((h) => !h.uri.includes("/en/"))).toBe(true);
  });
  it("英語の複数形でも見つかる（combinations → combination）", () => expect(idx.search("combinations", 5, "en")[0].slug).toBe("07-emergency"));
  it("全文を、英語で読める", () => expect(idx.read("emergency", "en").text).toContain("hold the left and right Ctrl"));
});
