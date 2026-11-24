const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function inline(s: string): string {
  return decode(s.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, "[図: $1]").replace(/<[^>]+>/g, ""));
}

export interface Section {
  /** 見出し。ページ冒頭（最初の見出しより前）は空文字。 */
  heading: string;
  /** 見出しの id（アンカー用）。 */
  anchor: string;
  text: string;
}

export interface ParsedPage {
  title: string;
  sections: Section[];
}

/** マニュアルの HTML（<main> の中）を、見出し単位のテキストにする。 */
export function parseManualHtml(html: string): ParsedPage {
  const title = inline((/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s*-\s*(かさね ヘルプ|kasane Help)\s*$/, ""));
  let body = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1] ?? html;
  body = body.replace(/<div class="pagehead">[\s\S]*?<\/div>/i, "");
  body = body.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");

  const sections: Section[] = [];
  let cur: Section = { heading: "", anchor: "", text: "" };
  const push = () => {
    cur.text = cur.text.replace(/\n{3,}/g, "\n\n").trim();
    if (cur.heading || cur.text) sections.push(cur);
  };

  const re = /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>|<pre[^>]*>([\s\S]*?)<\/pre>|<li[^>]*>([\s\S]*?)<\/li>|<tr[^>]*>([\s\S]*?)<\/tr>|<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[1]) {
      const level = Number(m[1]);
      const text = inline(m[3]).trim();
      if (level <= 2) {
        push();
        cur = { heading: text, anchor: /id="([^"]+)"/.exec(m[2])?.[1] ?? "", text: "" };
      } else {
        cur.text += `\n\n${text}\n`;
      }
    } else if (m[4] !== undefined) {
      cur.text += `\n${decode(m[4].replace(/<[^>]+>/g, ""))}\n`;
    } else if (m[5] !== undefined) {
      cur.text += `- ${inline(m[5]).replace(/\s+/g, " ").trim()}\n`;
    } else if (m[6] !== undefined) {
      const cells = [...m[6].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => inline(c[1]).replace(/\s+/g, " ").trim());
      cur.text += `| ${cells.join(" | ")} |\n`;
    } else if (m[7] !== undefined) {
      const t = inline(m[7]).replace(/\s+/g, " ").trim();
      if (t) cur.text += `\n${t}\n`;
    }
  }
  push();
  return { title, sections };
}

/** TUTORIAL-CLI.md を、## 見出し単位に分ける。 */
export function parseMarkdown(md: string, fallbackTitle: string): ParsedPage {
  const lines = md.split(/\r?\n/);
  let title = fallbackTitle;
  const sections: Section[] = [];
  let cur: Section = { heading: "", anchor: "", text: "" };
  let fence = false;
  const push = () => {
    cur.text = cur.text.trim();
    if (cur.heading || cur.text) sections.push(cur);
  };
  for (const line of lines) {
    if (/^```/.test(line)) fence = !fence;
    const h = !fence ? /^(#{1,2})\s+(.*)$/.exec(line) : null;
    if (h) {
      if (h[1].length === 1 && title === fallbackTitle) title = h[2].trim();
      push();
      cur = { heading: h[2].trim(), anchor: "", text: "" };
    } else {
      cur.text += line + "\n";
    }
  }
  push();
  return { title, sections };
}
