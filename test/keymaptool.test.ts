import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KeymapTool, KeymapToolError, parseKeymap, parseList, type Runner } from "../src/adapters/keymaptool.js";

const fx = (name: string) => readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "keymaptool", name), "utf8");

describe("parseList（実機の出力）", () => {
  const list = parseList(fx("list.txt"));
  it("台数と各デバイスを読む", () => {
    expect(list.deviceCount).toBe(4);
    expect(list.devices).toHaveLength(4);
    expect(list.devices[0]).toMatchObject({ uniqId: "55F70000", hasLayerMap: true, enabled: true, modelKey: "F1DF0000", binding: "model" });
    expect(list.devices[1].hardwareId).toBe("HID\\VID_04F2&PID_0400&REV_0103");
    expect(list.licenseHint).toBeUndefined();
  });
  it("UniqId がすべて 0 なら、ライセンスの兆候を返す", () => {
    const l = parseList("DeviceCount=1\n  UniqId=00000000 HasLayerMap=0 Enabled=0 ActiveLayerMask=0x0001 HardwareId=X\n");
    expect(l.licenseHint).toContain("ライセンス");
  });
});

describe("parseKeymap（実機の出力）", () => {
  const km = parseKeymap(fx("get.txt"));
  it("ヘッダーとキーを読む", () => {
    expect(km.uniqId).toBe("55F70000");
    expect(km.layerCount).toBe(16);
    expect(km.keyCount).toBe(109);
    expect(km.entries[0]).toEqual({ source: "0x0001", layers: [{ layer: 0, type: "key", typeCode: 2, param1: 0, param2: "0x0001" }] });
  });
  it("未知の Type は unknown にする", () => {
    const k = parseKeymap("UniqId=1 BlobLength=1\n  Layers=16 KeyCount=1\n    [0] SourceScanCode=0x003A\n      L1: Type=99 Param1=0 Param2=0x0000\n");
    expect(k.entries[0].layers[0].type).toBe("unknown(99)");
  });
});

describe("KeymapTool の呼び出し", () => {
  const calls: string[][] = [];
  const run: Runner = async (_exe, args) => {
    calls.push(args);
    return { ok: true, stdout: args[0] === "--list" ? fx("list.txt") : fx("get-layer-state.txt") };
  };
  const tool = new KeymapTool("C:\\fake\\KeymapTool.exe", run);

  it("読み取りコマンドを引数つきで起動する", async () => {
    const s = await tool.layerState("55F70000");
    expect(calls.at(-1)).toEqual(["--get-layer-state", "55F70000"]);
    expect(s).toMatchObject({ uniqId: "55F70000", layerMap: true, nicola: false });
  });
  it("不正な UniqId は、起動せずに拒否する", async () => {
    const before = calls.length;
    for (const bad of ["", "ZZZ", "123456789", "55F70000 --off", "55F7;calc"]) {
      await expect(tool.layerState(bad)).rejects.toBeInstanceOf(KeymapToolError);
    }
    expect(calls.length).toBe(before);
  });
  it("許可リストに無いコマンドは拒否する", async () => {
    await expect(tool.deviceRead("--off" as never, "55F70000")).rejects.toBeInstanceOf(KeymapToolError);
    await expect(tool.deviceRead("--set-scope" as never, "55F70000")).rejects.toBeInstanceOf(KeymapToolError);
  });
  it("KeymapTool が無いときは、分かる文言で失敗する", async () => {
    await expect(new KeymapTool(null).list()).rejects.toThrow(/見つかりません/);
  });
  it("使い方が返ったら、エラーにする", async () => {
    const t = new KeymapTool("x", async () => ({ ok: true, stdout: "Usage:\n  KeymapTool.exe --list\n" }));
    await expect(t.list()).rejects.toThrow(/使い方/);
  });
});
