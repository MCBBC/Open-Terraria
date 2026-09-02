// IIII111c 批（2026-09-02）一次性诊断：涂装双链单格写入时序铅簿镜像（SW_I111C 铅簿）。
// 镜像 x86 仪具 JJHook.SW_I109_TRACE（/tmp/iii151-out/patch-i109.py，i106 血统 rig，
// 1540 文件 dump 与 G2 逐字节全等认证）的单元格事件词表：
//   x86 侧事件 = LQC-in（LiquidCheck 入口）/ LQC-DRAIN（邻格异型清零）/
//   CLMT-in（CreateLiquidMergeTile 入口）/ CLMT-STF（尾 SquareTileFrame，Liquid.cs:1377）/
//   STF-in（SquareTileFrame 九宫）/ TF-in（TileFrame 入口）/
//   TF-INVCLR-pre/post（cs:82623-82627 !active 支 ClearBlockPaintAndCoating 前后）/
//   KT-in / PT-in / CES-in/out（DoCoatEverythingEcho_SingleTile）。
// JS 侧镜像 = LiquidSim 原型钩（createMergeTile / squareTileFrameGen / killTileAt）
//   + onWorldPartial 槽末单元格快照（镜像 x86 per-pass dump）。定罪结论见
//   docs/worldgen/content-parity-vs-vanilla-2026-08-16.md「XLV · IIII111c 批」章。
// 用法：cd game && SW_I111C=1 SW_I111C_CHAIN=invisibleplane npx vitest run tools/_iii111c.test.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I111C === '1';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const CHAINS: Record<string, { seed: string; cells: Array<[number, number]> }> = {
  invisibleplane: { seed: 'invisibleplane|106106', cells: [[2309, 555], [2310, 555]] },
  negativeinfinity: { seed: 'negativeinfinity|106109', cells: [[2624, 725], [2623, 725]] },
};

(RUN ? it : it.skip)('III111c paint cell leadbook mirror', async () => {
  const chain = process.env.SW_I111C_CHAIN ?? 'invisibleplane';
  const cfg = CHAINS[chain];
  if (!cfg) throw new Error(`unknown SW_I111C_CHAIN=${chain}`);
  const OUT = process.env.SW_I111C_OUT ?? '/tmp/iii151-out';
  mkdirSync(OUT, { recursive: true });
  const rows: string[] = [];
  const cellSet = new Set(cfg.cells.map(([x, y]) => `${x},${y}`));
  const stOf = (w: unknown): Record<string, Uint8Array | Uint16Array> =>
    ((w as { store: unknown }).store) as never;

  const snap = (stv: Record<string, Uint8Array | Uint16Array>, x: number, y: number): string => {
    const i = y * 4200 + x;
    const typ = stv.type as Uint16Array;
    const coat = stv.coat as Uint8Array;
    const cb = (c: number): string => ((coat[i]! & c) ? 1 : 0).toString();
    // JS coat 常量 INV_B=2/INV_W=4/FB_B=8/FB_W=16 → x86 位包序 b,iw,fb,fbw
    return `typ=${typ[i]} act=${(stv.flags as Uint8Array)[i]} wal=${(stv.wall as Uint16Array)[i]}` +
      ` liq=${(stv.liquid as Uint8Array)[i]} lty=${(stv.liquidType as Uint8Array)[i]}` +
      ` pnt=${(stv.paint as Uint8Array)[i]} pwal=${(stv.paintWall as Uint8Array)[i]}` +
      ` cbt=${cb(2)}${cb(4)}${cb(8)}${cb(16)}`;
  };

  // ---- LiquidSim 原型钩（finalGenMergeScan 实例同样走原型） ----
  const LSM = LiquidSim.prototype as unknown as Record<string, ((...a: never[]) => unknown) & { __i111c?: boolean }>;
  const stOfSim = (self: unknown): Record<string, Uint8Array | Uint16Array> =>
    ((self as { world: { store: unknown } }).world.store) as never;

  const om = LSM.createMergeTile;
  LSM.createMergeTile = function (this: unknown, x: number, y: number, ...rest: never[]): unknown {
    const hit = cellSet.has(`${x},${y}`);
    if (hit) rows.push(`CLMT-in ${x},${y} ${snap(stOfSim(this), x, y)}`);
    const out = (om as (...a: unknown[]) => unknown).apply(this, [x, y, ...rest] as never[]);
    if (hit) rows.push(`CLMT-out ${x},${y} ${snap(stOfSim(this), x, y)}`);
    return out;
  };
  const osq = LSM.squareTileFrameGen;
  LSM.squareTileFrameGen = function (this: unknown, x: number, y: number, ...rest: never[]): unknown {
    if (cellSet.has(`${x},${y}`)) rows.push(`STF-in ${x},${y}`);
    return (osq as (...a: unknown[]) => unknown).apply(this, [x, y, ...rest] as never[]);
  };
  const ok = LSM.killTileAt;
  LSM.killTileAt = function (this: unknown, x: number, y: number, ...rest: never[]): unknown {
    if (cellSet.has(`${x},${y}`)) rows.push(`KT-in ${x},${y} ${snap(stOfSim(this), x, y)}`);
    return (ok as (...a: unknown[]) => unknown).apply(this, [x, y, ...rest] as never[]);
  };

  await generateWorld({
    width: 4200, height: 1200, seedText: cfg.seed, evil: 0,
    onWorldPartial: (w, i, pn) => {
      const stv = stOf(w);
      for (const [x, y] of cfg.cells) rows.push(`SLOT ${String(i).padStart(3)} ${pn} ${x},${y} ${snap(stv, x, y)}`);
    },
  });

  const path = `${OUT}/js-i109-${chain}.log`;
  writeFileSync(path, `# IIII111c JS leadbook mirror chain=${chain}\n` + rows.join('\n') + '\n');
  console.log(`[i111c] ${rows.length} rows -> ${path}`);
}, 600_000);
