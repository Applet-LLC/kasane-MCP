import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

export interface DocsLocation {
  /** kasane のインストール先（見つからなければ null）。 */
  home: string | null;
  /** manual/ja のフォルダ。 */
  manualDir: string | null;
  /** manual/en のフォルダ。 */
  manualDirEn: string | null;
  /** TUTORIAL-CLI.md のパス。 */
  tutorialPath: string | null;
  /** どの方法で見つけたか。 */
  source: "KASANE_HOME" | "registry" | "default" | "none";
}

const DEFAULT_HOME = "C:\\Program Files\\applet\\kasane";

function fromRegistry(): string | null {
  if (process.platform !== "win32") return null;
  // インストーラーが InstallDir を書いているかは未確認。無ければ null を返して既定の場所へ進む。
  const keys = ["HKLM\\SOFTWARE\\applet\\kasane", "HKLM\\SOFTWARE\\WOW6432Node\\applet\\kasane"];
  for (const key of keys) {
    try {
      const out = execFileSync("reg", ["query", key, "/v", "InstallDir"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
      const m = /InstallDir\s+REG_SZ\s+(.+)/i.exec(out);
      if (m) return m[1].trim();
    } catch {
      /* 次へ */
    }
  }
  return null;
}

function build(home: string, source: DocsLocation["source"]): DocsLocation | null {
  const manualDir = path.join(home, "manual", "ja");
  const tutorialPath = path.join(home, "docs", "TUTORIAL-CLI.md");
  const manualDirEn = path.join(home, "manual", "en");
  const hasManual = existsSync(manualDir);
  const hasEn = existsSync(manualDirEn);
  const hasTutorial = existsSync(tutorialPath);
  if (!hasManual && !hasEn && !hasTutorial) return null;
  return { home, manualDir: hasManual ? manualDir : null, manualDirEn: hasEn ? manualDirEn : null, tutorialPath: hasTutorial ? tutorialPath : null, source };
}

/** KASANE_HOME → レジストリ → 既定の場所、の順で探す。 */
export function locateDocs(env: NodeJS.ProcessEnv = process.env): DocsLocation {
  const candidates: Array<[string | null | undefined, DocsLocation["source"]]> = [
    [env.KASANE_HOME, "KASANE_HOME"],
    [fromRegistry(), "registry"],
    [DEFAULT_HOME, "default"],
  ];
  for (const [home, source] of candidates) {
    if (!home) continue;
    const loc = build(home, source);
    if (loc) return loc;
  }
  return { home: null, manualDir: null, manualDirEn: null, tutorialPath: null, source: "none" };
}
