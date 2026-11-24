import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { locateDocs, type DocsLocation } from "./locate.js";
import { parseManualHtml, parseMarkdown, type Section } from "./html.js";

export type Lang = "ja" | "en";

export interface DocPage {
  /** resources の URI。 */
  uri: string;
  /** "manual/ja/07-emergency" や "cli-tutorial" など。 */
  id: string;
  /** ページの短い名前。"07-emergency" や "cli-tutorial"。kasane_read_doc の page に渡す。 */
  slug: string;
  /** マニュアルの言語。CLI チュートリアルは日本語だけなので ja。 */
  lang: Lang;
  title: string;
  sections: Section[];
}

export interface SearchHit {
  uri: string;
  slug: string;
  pageTitle: string;
  heading: string;
  score: number;
  excerpt: string;
}

export const TUTORIAL_URI = "kasane-doc://cli-tutorial";
export const TUTORIAL_SLUG = "cli-tutorial";
export const manualUri = (page: string, lang: Lang = "ja") => `kasane-doc://manual/${lang}/${page}`;

/** 1 回に返す本文の上限（文字数）。これを超えるページは、続きを offset で読む。 */
export const READ_LIMIT = 24000;

export interface ReadResult {
  ok: boolean;
  error?: string;
  page?: DocPage;
  /** 返した本文。 */
  text?: string;
  /** 全文の長さ。 */
  total?: number;
  /** 続きがあるとき、次に渡す offset。 */
  next?: number;
}

export class DocsIndex {
  readonly pages: DocPage[] = [];
  constructor(readonly location: DocsLocation) {}

  static load(env: NodeJS.ProcessEnv = process.env): DocsIndex {
    const idx = new DocsIndex(locateDocs(env));
    idx.loadFrom();
    return idx;
  }

  private loadManual(dir: string, lang: Lang): void {
    const files = readdirSync(dir).filter((f) => f.endsWith(".html")).sort();
    for (const f of files) {
      const slug = f.replace(/\.html$/, "");
      const p = parseManualHtml(readFileSync(path.join(dir, f), "utf8"));
      this.pages.push({ uri: manualUri(slug, lang), id: `manual/${lang}/${slug}`, slug, lang, title: p.title || slug, sections: p.sections });
    }
  }

  private loadFrom(): void {
    const { manualDir, manualDirEn, tutorialPath } = this.location;
    if (tutorialPath) {
      const p = parseMarkdown(readFileSync(tutorialPath, "utf8"), "KeymapTool（CLI）チュートリアル");
      this.pages.push({ uri: TUTORIAL_URI, id: "cli-tutorial", slug: TUTORIAL_SLUG, lang: "ja", title: p.title, sections: p.sections });
    }
    if (manualDir) this.loadManual(manualDir, "ja");
    if (manualDirEn) this.loadManual(manualDirEn, "en");
  }

  /** 読める言語。 */
  languages(): Lang[] {
    return (["ja", "en"] as const).filter((l) => this.pages.some((p) => p.lang === l && p.id.startsWith("manual/")));
  }

  /** マニュアルの先頭行（「かさね1.01 2026-11-02 …」）。バージョンの検出に使う。 */
  manualHeader(): string | null {
    const dir = this.location.manualDir ?? this.location.manualDirEn;
    if (!dir) return null;
    try {
      const html = readFileSync(path.join(dir, "index.html"), "utf8");
      return /<div class="pagehead">([\s\S]*?)<\/div>/.exec(html)?.[1].replace(/<[^>]+>/g, " ") ?? null;
    } catch {
      return null;
    }
  }

  get(uri: string): DocPage | undefined {
    return this.pages.find((p) => p.uri === uri);
  }

  /** 言語ごとのページ一覧。CLI チュートリアルは日本語だけなので、どちらの言語にも入れる。 */
  list(lang: Lang): DocPage[] {
    return this.pages.filter((p) => p.slug === TUTORIAL_SLUG || (p.id.startsWith("manual/") && p.lang === lang));
  }

  /** ページ名（"07-emergency"、"7"、"emergency"、URI など）から、ページを探す。 */
  find(page: string, lang: Lang): DocPage | undefined {
    const q = page.trim().toLowerCase().replace(/\.html$/, "");
    const pool = this.list(lang);
    const fromUri = /^kasane-doc:\/\/manual\/(ja|en)\/([^#]+)/.exec(q);
    if (fromUri) return this.pages.find((p) => p.id === `manual/${fromUri[1]}/${fromUri[2]}`);
    if (q === TUTORIAL_URI.toLowerCase() || q === TUTORIAL_SLUG || q === "tutorial") return pool.find((p) => p.slug === TUTORIAL_SLUG);
    const exact = pool.find((p) => p.slug.toLowerCase() === q);
    if (exact) return exact;
    if (/^\d{1,2}$/.test(q)) return pool.find((p) => p.slug.startsWith(q.padStart(2, "0") + "-"));
    const part = pool.filter((p) => p.slug.toLowerCase().includes(q));
    if (part.length === 1) return part[0];
    const byTitle = pool.filter((p) => p.title.toLowerCase().includes(q));
    return byTitle.length === 1 ? byTitle[0] : undefined;
  }

  /** 節を、見出しの一部（または id）で探す。 */
  findSection(page: DocPage, key: string): Section[] {
    const q = key.trim().toLowerCase();
    const exact = page.sections.filter((s) => s.anchor.toLowerCase() === q || s.heading.toLowerCase() === q);
    if (exact.length) return exact;
    return page.sections.filter((s) => s.heading.toLowerCase().includes(q));
  }

  /** ページ全体（または一部の節）を、読みやすいテキストにする。 */
  render(page: DocPage, sections: Section[] = page.sections): string {
    const parts = [`# ${page.title}`];
    for (const s of sections) {
      // ページ名と同じ見出しは、重ねて出さない。
      parts.push(s.heading && s.heading !== page.title ? `## ${s.heading}\n\n${s.text}` : s.text);
    }
    return parts.join("\n\n");
  }

  /** 全文を、長さの上限つきで返す。長いときは、続きの位置を返す。 */
  read(pageName: string, lang: Lang, section?: string, offset = 0, limit = READ_LIMIT): ReadResult {
    const page = this.find(pageName, lang);
    if (!page) return { ok: false, error: `ページ「${pageName}」が見つかりません。kasane_list_docs でページの一覧を確かめてください。` };
    let sections = page.sections;
    if (section && section.trim()) {
      sections = this.findSection(page, section);
      if (sections.length === 0) {
        const heads = page.sections.map((s) => s.heading).filter(Boolean).join(" / ");
        return { ok: false, page, error: `節「${section}」が見つかりません。このページの節: ${heads}` };
      }
    }
    const full = this.render(page, sections);
    const start = Math.max(0, Math.floor(offset));
    if (start >= full.length && full.length > 0) return { ok: false, page, error: `offset ${start} は全文の長さ（${full.length} 文字）を超えています。` };
    // 区切りのよい位置（改行）で切る。
    let end = Math.min(full.length, start + limit);
    if (end < full.length) {
      const nl = full.lastIndexOf("\n", end);
      if (nl > start + limit / 2) end = nl + 1;
    }
    return { ok: true, page, text: full.slice(start, end), total: full.length, next: end < full.length ? end : undefined };
  }

  search(query: string, limit = 5, lang: Lang = "ja"): SearchHit[] {
    const terms = tokenize(query);
    if (terms.length === 0) return [];
    const hits: SearchHit[] = [];
    for (const page of this.list(lang)) {
      for (const s of page.sections) {
        const body = s.text.toLowerCase();
        const head = s.heading.toLowerCase();
        const title = page.title.toLowerCase();
        let score = 0;
        for (const t of terms) score += count(body, t) + 4 * count(head, t) + 2 * count(title, t);
        if (score > 0) {
          hits.push({ uri: page.uri + (s.anchor ? `#${s.anchor}` : ""), slug: page.slug, pageTitle: page.title, heading: s.heading, score, excerpt: excerpt(s.text, terms) });
        }
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

const CJK = /[぀-ヿ㐀-鿿]/;

/** 空白区切りの語に、日本語は2文字ずつの断片を加える（形態素解析なしの軽量な検索）。英語の複数形（-s）は語幹も加える。 */
export function tokenize(q: string): string[] {
  const out = new Set<string>();
  for (const w of q.toLowerCase().split(/[\s、。,.　]+/).filter(Boolean)) {
    if (!CJK.test(w)) {
      out.add(w);
      if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) out.add(w.slice(0, -1));
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

function excerpt(text: string, terms: string[], width = 240): string {
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
