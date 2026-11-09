// 公開するパッケージの中身を点検する（npm publish の前に実行する）。
// dist/ があること、テスト用のフィクスチャ（kasane のマニュアルの写しなど）や、
// 開発用のファイルが入っていないことを確かめる。
import { execFileSync } from "node:child_process";

const out = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8", shell: process.platform === "win32" });
const files = JSON.parse(out)[0].files.map((f) => f.path.replace(/\\/g, "/"));

const must = ["dist/index.js", "package.json", "README.md", "LICENSE"];
const forbidden = [/^test\//, /^src\//, /^\.github\//, /^tools\//, /^scripts\//, /\.kasane\.json$/, /^\.env/];

const missing = must.filter((m) => !files.includes(m));
const bad = files.filter((f) => forbidden.some((re) => re.test(f)));
console.log(`${files.length} files in package`);
if (missing.length || bad.length) {
  if (missing.length) console.error("missing:", missing.join(", "));
  if (bad.length) console.error("must not be published:", bad.join(", "));
  process.exit(1);
}
console.log("package contents OK");
