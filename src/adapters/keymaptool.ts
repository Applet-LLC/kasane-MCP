import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * KeymapTool.exe の読み取り系コマンドだけを、許可リスト方式で起動する。
 * KeymapTool は --json を持たず、出力は平文なので、パーサーはこのファイルに閉じ込める。
 */

/** 読み取りだけのコマンド（デバイスを指定するもの）。書き込み系（--set-*、--on、--off、--apply* など）は入れない。 */
export const DEVICE_READ_COMMANDS = ["--get", "--get-layer-state", "--get-features", "--get-scope", "--get-config"] as const;
export type DeviceReadCommand = (typeof DEVICE_READ_COMMANDS)[number];

const UNIQ_ID = /^[0-9A-Fa-f]{1,8}$/;

export type RunResult = { ok: true; stdout: string } | { ok: false; error: string; stdout: string };

export type Runner = (exe: string, args: string[]) => Promise<RunResult>;

export const defaultRunner: Runner = (exe, args) =>
  new Promise((resolve) => {
    execFile(exe, args, { timeout: 10_000, windowsHide: true, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) resolve({ ok: false, error: (stderr || error.message).trim(), stdout: stdout ?? "" });
      else resolve({ ok: true, stdout });
    });
  });

export function locateKeymapTool(home: string | null, env: NodeJS.ProcessEnv = process.env): string | null {
  const candidates = [env.KASANE_KEYMAPTOOL, home ? path.join(home, "KeymapTool.exe") : undefined];
  return candidates.find((c): c is string => !!c && existsSync(c)) ?? null;
}

export class KeymapToolError extends Error {}

export class KeymapTool {
  constructor(
    readonly exe: string | null,
    private readonly run: Runner = defaultRunner,
  ) {}

  private async exec(args: string[]): Promise<string> {
    if (!this.exe) throw new KeymapToolError("KeymapTool.exe が見つかりません。kasane をインストールするか、環境変数 KASANE_HOME を設定してください。");
    const r = await this.run(this.exe, args);
    // 引数が足りないときなどは、使い方を出して終わる。見た目で判定する。
    if (!r.ok) throw new KeymapToolError(`KeymapTool の実行に失敗しました: ${r.error || "終了コードが 0 ではありません"}`);
    if (r.stdout.startsWith("Usage:")) throw new KeymapToolError("KeymapTool が引数を受け付けませんでした（使い方が表示されました）。");
    return r.stdout;
  }

  async list(): Promise<DeviceList> {
    return parseList(await this.exec(["--list"]));
  }

  async deviceRead(cmd: DeviceReadCommand, uniqId: string): Promise<string> {
    if (!(DEVICE_READ_COMMANDS as readonly string[]).includes(cmd)) throw new KeymapToolError(`許可されていないコマンドです: ${cmd}`);
    if (!UNIQ_ID.test(uniqId)) throw new KeymapToolError("UniqId は 16進数の最大8桁です（例: 55F70000）");
    return this.exec([cmd, uniqId]);
  }

  async layerState(id: string) {
    return parseLayerState(await this.deviceRead("--get-layer-state", id));
  }
  async features(id: string) {
    return parseFeatures(await this.deviceRead("--get-features", id));
  }
  async scope(id: string) {
    return parseScope(await this.deviceRead("--get-scope", id));
  }
  async config(id: string) {
    return parseConfig(await this.deviceRead("--get-config", id));
  }
  async keymap(id: string) {
    return parseKeymap(await this.deviceRead("--get", id));
  }
}

// ---- パーサー（実機の出力を、そのまま test/fixtures に置いて試す） ----

export interface Device {
  uniqId: string;
  hasLayerMap: boolean;
  enabled: boolean;
  activeLayerMask: string;
  hardwareId: string;
  instanceKey?: string;
  modelKey?: string;
  binding?: string;
}
export interface DeviceList {
  deviceCount: number;
  devices: Device[];
  /** ライセンスが無効だと、UniqId だけの一覧になる。 */
  licenseHint?: string;
}

function kv(line: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of line.matchAll(/(\w+)=(\S+)/g)) out[m[1]] = m[2];
  return out;
}

export function parseList(text: string): DeviceList {
  const lines = text.split(/\r?\n/);
  const countMatch = /DeviceCount=(\d+)/.exec(text);
  const devices: Device[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*UniqId=/.test(lines[i])) continue;
    const a = kv(lines[i]);
    const b = /^\s*InstanceKey=/.test(lines[i + 1] ?? "") ? kv(lines[i + 1]) : {};
    devices.push({
      uniqId: a.UniqId,
      hasLayerMap: a.HasLayerMap === "1",
      enabled: a.Enabled === "1",
      activeLayerMask: a.ActiveLayerMask ?? "",
      hardwareId: a.HardwareId ?? "",
      instanceKey: b.InstanceKey,
      modelKey: b.ModelKey,
      binding: b.Binding,
    });
  }
  const result: DeviceList = { deviceCount: countMatch ? Number(countMatch[1]) : devices.length, devices };
  if (devices.length > 0 && devices.every((d) => d.uniqId === "00000000")) {
    result.licenseHint = "UniqId がすべて 00000000 です。ライセンスが有効になっていない可能性があります（マニュアル「ライセンスの認証」を参照）。";
  }
  return result;
}

export function parseLayerState(text: string) {
  const a = kv(text);
  return {
    uniqId: a.UniqId,
    seq: Number(a.Seq),
    effective: a.Effective,
    active: /Active=(0x[0-9A-Fa-f]+)/.exec(text)?.[1],
    app: /App=(0x[0-9A-Fa-f]+)/.exec(text)?.[1],
    layerMap: a.LayerMap === "ON",
    nicola: a.NICOLA === "ON",
  };
}

export function parseFeatures(text: string) {
  const a = kv(text);
  return { uniqId: a.UniqId, macro: a.Macro === "1", combo: a.Combo === "1", tapDance: a.TapDance === "1", keyOverride: a.KeyOverride === "1" };
}

export function parseScope(text: string) {
  const a = kv(text);
  return { uniqId: a.UniqId, instanceKey: a.InstanceKey, modelKey: a.ModelKey, binding: a.Binding };
}

export function parseConfig(text: string) {
  const a = kv(text);
  return {
    uniqId: a.UniqId,
    tapTermMs: Number(a.TapTermMs),
    comboTermMs: Number(a.ComboTermMs),
    tapDanceTermMs: Number(a.TapDanceTermMs),
    mode: a.mode,
    quicktap: a.quicktap,
    ttcount: a.ttcount === undefined ? undefined : Number(a.ttcount),
  };
}

export const ACTION_TYPES: Record<number, string> = {
  0: "none", 1: "transparent", 2: "key", 3: "MO", 4: "TG", 5: "DF", 6: "OSL", 7: "OSM", 8: "MT", 9: "LT", 10: "MACRO",
  11: "HLP", 12: "TAPDANCE", 13: "modded-key", 14: "LM", 15: "TO", 16: "TT", 17: "MARK",
};

export interface KeymapEntry {
  /** 元のキー（物理スキャンコード）。 */
  source: string;
  layers: Array<{ layer: number; type: string; typeCode: number; param1: number; param2: string }>;
}

export function parseKeymap(text: string) {
  const head = /UniqId=(\w+) BlobLength=(\d+)/.exec(text);
  const dims = /Layers=(\d+) KeyCount=(\d+)/.exec(text);
  const entries: KeymapEntry[] = [];
  let cur: KeymapEntry | null = null;
  for (const line of text.split(/\r?\n/)) {
    const s = /^\s*\[\d+\]\s+SourceScanCode=(0x[0-9A-Fa-f]+)/.exec(line);
    if (s) {
      cur = { source: s[1], layers: [] };
      entries.push(cur);
      continue;
    }
    const l = /^\s*L(\d+):\s+Type=(\d+)\s+Param1=(\d+)\s+Param2=(0x[0-9A-Fa-f]+)/.exec(line);
    if (l && cur) {
      const typeCode = Number(l[2]);
      cur.layers.push({ layer: Number(l[1]), type: ACTION_TYPES[typeCode] ?? `unknown(${typeCode})`, typeCode, param1: Number(l[3]), param2: l[4] });
    }
  }
  return {
    uniqId: head?.[1],
    blobLength: head ? Number(head[2]) : undefined,
    layerCount: dims ? Number(dims[1]) : undefined,
    keyCount: dims ? Number(dims[2]) : entries.length,
    entries,
  };
}
