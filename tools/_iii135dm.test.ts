// IIII104b（2026-09-01）：FTW Micro_Biomes #97 入口 DeadMansChestBiome 候选枚举门级实验台。
// 单变量口径：base = SW_I121CAP 捕获的「▶微群系 reseed 后 / pass 体前」金色等价态
// （_iii121mb.test.ts 自检 dAct/dTyp/dWal=0 才可信）。本文件不产生产代码改动，只读。
//
// 用法：cd game && npx vitest run tools/_iii135dm.test.ts
// 可选：SW_I135_OUT=<dir>（结果表输出目录，默认 /tmp/iii135-out）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const BASE = process.env.SW_I135_BASE ?? '/tmp/iii133-out/js';
const OUT = process.env.SW_I135_OUT ?? '/tmp/iii135-out';
const G2 = process.env.SW_I135_G2 ?? `${process.env.HOME}/GoldenChains/golden-ftw`;
const W = Number(process.env.SW_I135_W ?? 4200);
const H = Number(process.env.SW_I135_H ?? 1200);
const N = W * H;

// ---- sheet 映射（内部 id ↔ vanilla sheet）----
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[i] = s;
}
/** 由 sheet 反查全部内部 id 集 */
const idsBySheet = (...sheets: number[]): Set<number> => {
  const out = new Set<number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number' && sheets.includes(s)) out.add(i);
  }
  return out;
};

interface ChestLike { x: number; y: number; items: unknown[]; [k: string]: unknown }

function hydrate(): { st: TileStore; chests: ChestLike[] } {
  const hdr = JSON.parse(readFileSync(`${BASE}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType',
    'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${BASE}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    if (buf.length !== len * bytesPer) throw new Error(`base_${c}.bin size mismatch`);
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  const chests = JSON.parse(readFileSync(`${BASE}/base_chests.json`, 'utf8')) as ChestLike[];
  return { st, chests };
}

const van = (id: number): number => (SHEET_OF[id] >= 0 ? SHEET_OF[id] : -1);

it('DMC enumeration gate-level audit over captured base', () => {
  const t0 = Date.now();
  const { st, chests } = hydrate();
  // TileID.Sets.CanBeClearedDuringGeneration 表：从数据层取 —— 经由 NOT_CLEARABLE 反像？
  // ★零假设对照面：直接用 TileRunner.NOT_CLEARABLE（既有移植判例）＋这里独立重算 C# 版
  import('./helpers-i135-notclearable').catch(() => {});
  // 独立重算 CanBeClearedDuringGeneration：cs 定义为 TileID.Sets.CanBeClearedDuringGeneration[type]，
  // 该 BoolSet 在反编译 TileID.cs 内有显式 false 列举——本项目通常已按 sheet 移植。
  // 这里取 TILE_DEFS 的 genClearable 字段？——若不存在，用 NOT_CLEARABLE 的补集并打印假设来源。
  void st; void chests;

  const lines: string[] = [];
  console.log(`[t=${Date.now() - t0}ms] loaded base w=${st.w} h=${st.h} chests=${chests.length}`);
  writeFileSync(`${OUT.replace(/\/$/, '')}/.gitkeep`, '');
}, 900_000);

void G2; void W; void H; void N; void idsBySheet; void mkdirSync; void van;
