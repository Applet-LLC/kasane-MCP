import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { defaultOutputDir } from "./write.js";

/** 環境変数 KASANE（kasane の設定フォルダー）の下に、専用のサブフォルダーを作って置く。 */
export const KASANE_SUBDIR = "kasane-mcp";
/** ユーザー自身が、MCP の設定の env に書いたときだけ、KASANE への出力を許す。 */
export const ALLOW_ENV = "KASANE_MCP_ALLOW_KASANE_DIR";

export type Destination = "default" | "kasane";

export interface OutputSettings {
  /** destination を省略したときの保存先。 */
  defaultDir: string;
  /** 環境変数 KASANE の値（前後の空白と二重引用符を除いたもの）。無ければ null。 */
  kasaneEnv: string | null;
  /** KASANE が、絶対パスで、実在するフォルダーか。 */
  kasaneUsable: boolean;
  /** KASANE への出力に使うフォルダー（KASANE\kasane-mcp）。KASANE が使えないときは null。 */
  kasaneOutputDir: string | null;
  /** ユーザーが、KASANE への出力を許可しているか。 */
  kasaneAllowed: boolean;
  /** kasane が実際に使う設定フォルダー（KASANE があればそこ、無ければ %LOCALAPPDATA%\applet\kasane）。 */
  kasaneDataDir: string | null;
}

/** 環境変数の値から、前後の空白と二重引用符を外す（インストーラーで貼ったパスに付きやすい）。 */
function clean(v: string | undefined): string | null {
  const s = (v ?? "").trim().replace(/^"+|"+$/g, "").trim();
  return s === "" ? null : s;
}

export function outputSettings(env: NodeJS.ProcessEnv = process.env): OutputSettings {
  const kasaneEnv = clean(env.KASANE);
  const usable = !!kasaneEnv && path.isAbsolute(kasaneEnv) && existsSync(kasaneEnv) && statSync(kasaneEnv).isDirectory();
  const local = env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "applet", "kasane") : null;
  return {
    defaultDir: defaultOutputDir(env),
    kasaneEnv,
    kasaneUsable: usable,
    kasaneOutputDir: usable ? path.join(kasaneEnv!, KASANE_SUBDIR) : null,
    kasaneAllowed: env[ALLOW_ENV] === "1",
    kasaneDataDir: kasaneEnv ?? local,
  };
}

export type ResolvedDestination = { ok: true; dir: string; destination: Destination } | { ok: false; message: string };

/** 保存先を決める。KASANE は、ユーザーの許可（env）と、実在するフォルダーがそろったときだけ。 */
export function resolveDestination(destination: Destination | undefined, env: NodeJS.ProcessEnv = process.env): ResolvedDestination {
  const s = outputSettings(env);
  if (destination !== "kasane") return { ok: true, dir: s.defaultDir, destination: "default" };

  if (!s.kasaneAllowed) {
    return {
      ok: false,
      message:
        "KASANE（kasane の設定フォルダー）への保存は、ユーザーが許可していないため、できません。許可するには、MCP の設定（Claude Desktop なら claude_desktop_config.json）の kasane の項目に、" +
        `"env": { "${ALLOW_ENV}": "1" } を書いて、アプリを起動し直してもらってください。許可がなくても、${s.defaultDir} には保存できます。`,
    };
  }
  if (!s.kasaneEnv) return { ok: false, message: "環境変数 KASANE が設定されていないため、KASANE には保存できません。" };
  if (!s.kasaneUsable) return { ok: false, message: `環境変数 KASANE（${s.kasaneEnv}）が、絶対パスの実在するフォルダーではないため、保存できません。設定フォルダーは、新しく作りません。` };
  return { ok: true, dir: s.kasaneOutputDir!, destination: "kasane" };
}
