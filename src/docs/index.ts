import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { locateDocs, type DocsLocation } from "./locate.js";
import { parseManualHtml, parseMarkdown, type Section } from "./html.js";

export interface DocPage {
  /** resources の URI。 */
  uri: string;
  /** "manual/ja/07-emergency" や "cli-tutorial" など。 */
  id: string;
  title: string;
  sections: Section[];
}

export interface SearchHit {
  uri: string;
  pageTitle: string;
  heading: string;
  score: number;
  excerpt: string;
}

export const TUTORIAL_URI = "kasane-doc://cli-tutorial";
export const manualUri = (page: string) => `kasane-doc://manual/ja/${page}`;

export class DocsIndex {
  readonly pages: DocPage[] = [];
  constructor(readonly location: DocsLocation) {}

  static load(env: NodeJS.ProcessEnv = process.env): DocsIndex {
    const idx = new DocsIndex(locateDocs(env));
    idx.loadFrom();
    return idx;
  }

  private loadFrom(): void {
    const { manualDir, tutorialPath } = this.location;
    if (tutorialPath) {
      const p = parseMarkdown(readFileSync(tutorialPath, "utf8"), "KeymapTool（CLI）チュートリアル");
      this.pages.push({ uri: TUTORIAL_URI, id: "cli-tutorial", title: p.title, sections: p.sections });
    }
    if (manualDir) {
      const files = readdirSync(manualDir).filter((f) => f.endsWith(".html")).sort();
      for (const f of files) {
        const page = f.replace(/\.html$/, "");
        const p = parseManualHtml(readFileSync(path.join(manualDir, f), "utf8"));
        this.pages.push({ uri: manualUri(page), id: `manual/ja/${page}`, title: p.title || page, sections: p.sections });
      }
    }
  }

  /** マニュアルの先頭行（「かさね1.01 2026-11-02 …」）。バージョンの検出に使う。 */
  manualHeader(): string | null {
    const { manualDir } = this.location;
    if (!manualDir) return null;
    try {
      const html = readFileSync(path.join(manualDir, "index.html"), "utf8");
      return /<div class="pagehead">([\s\S]*?)<\/div>/.exec(html)?.[1].replace(/<[^>]+>/g, " ") ?? null;
    } catch {
      return null;
    }
  }

  get(uri: string): DocPage | undefined {
    return this.pages.find((p) => p.uri === uri);
  }

  /** ページ全体を、読みやすいテキストにする。 */
  render(page: DocPage): string {
    const parts = [`# ${page.title}`];
    for (const s of page.sections) {
      // ページ名と同じ見出しは、重ねて出さない。
      parts.push(s.heading && s.heading !== page.title ? `## ${s.heading}\n\n${s.text}` : s.text);
    }
    return parts.join("\n\n");
  }

  search(query: string, limit = 5): SearchHit[] {
    const terms = tokenize(query);
    if (terms.length === 0) return [];
    const hits: SearchHit[] = [];
    for (const page of this.pages) {
      for (const s of page.sections) {
        const body = s.text.toLowerCase();
        const head = s.heading.toLowerCase();
        const title = page.title.toLowerCase();
        let score = 0;
        for (const t of terms) score += count(body, t) + 4 * count(head, t) + 2 * count(title, t);
        if (score > 0) {
          hits.push({ uri: page.uri + (s.anchor ? `#${s.anchor}` : ""), pageTitle: page.title, heading: s.heading, score, excerpt: excerpt(s.text, terms) });
        }
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

const CJK = /[぀-ヿ㐀-鿿]/;

/** 空白区切りの語に、日本語は2文字ずつの断片を加える（形態素解析なしの軽量な検索）。 */
export function tokenize(q: string): string[] {
  const out = new Set<string>();
  for (const w of q.toLowerCase().split(/[\s、。,.　]+/).filter(Boolean)) {
    if (!CJK.test(w)) {
      out.add(w);
      continue;
    }
    if (w.length <= 2) out.add(w);
    for (let i = 0; i + 2 <= w.length; i++) out.add(w.slice(i, i + 2));
  }
  return [...out];
}

function count(haystack: string, needle: string): number {
  let n = 0;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
}

function excerpt(text: string, terms: string[], width = 160): string {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const start = Math.max(0, at - 40);
  const s = text.slice(start, start + width).replace(/\s+/g, " ").trim();
  return (start > 0 ? "…" : "") + s + (start + width < text.length ? "…" : "");
}
