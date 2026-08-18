// WWW #58b（SW_WWW58B=1）：Statues 尝试环 C# 直译参考（含 SolidTile2 底座+液体门），
// 在 golden57 上跑，按放置序对比 golden58 —— 定位 JS 谓词缺门 or 掷流自差。
import { it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';

const RUN = process.env.SW_WWW58B === '1';
const G2 = '/tmp/sw-slp/g';
const BDIR = '/tmp/www-b';
const W = 4200, H = 1200, N = W * H;
const SEED = 9293480;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number' && !REV.has(s)) REV.set(s, i); }
const DUMPNAME = new Map<number, string>();
for (const f of readdirSync(G2)) { const m = /^(\d{3})_(.+)\.typ$/.exec(f); if (m) DUMPNAME.set(Number(m[1]), m[2]); }
const gPath = (idx: number, ext: string) => `${G2}/${String(idx).padStart(3, '0')}_${DUMPNAME.get(idx)}.${ext}`;
const rd8 = (idx: number, ext: string) => new Uint8Array(readFileSync(gPath(idx, ext)).buffer.slice(0));
const rd16 = (idx: number, ext: string) => new Uint16Array(readFileSync(gPath(idx, ext)).buffer.slice(0));

(RUN ? it : it.skip)('#58b faithful reference', () => {
  const t = rd16(57, 'typ'), a = rd8(57, 'act'), w = rd16(57, 'wal'), l = rd8(57, 'liq'), lt = rd8(57, 'lty'), hf = rd8(57, 'half'), sl = rd8(57, 'slope');
  const dir = `${BDIR}/s17`;
  const gs = JSON.parse(readFileSync(`${dir}/gs.json`, 'utf8')) as GenState;
  const gensolid = new Map(JSON.parse(readFileSync(`${dir}/gensolid.json`, 'utf8')) as Array<[number, boolean]>);
  const iw = new Uint32Array(readFileSync(`${dir}/ids35.bin`).buffer.slice(0));
  const ids35 = new Map<number, number>();
  for (let q = 0; q < iw.length; q += 2) ids35.set(iw[q]!, iw[q + 1]!);
  // 直读 golden57 的参考谓词（sheet 空间）
  const active = (x: number, y: number) => y >= 0 && y < H && a[y * W + x] === 1;
  const solidOf = (sh: number): boolean => {
    const id = REV.get(sh) ?? -1;
    if (gensolid.has(id)) return !!gensolid.get(id);
    return !!TILE_DEFS[id]?.solid;
  };
  // SolidTile2(i,j)（cs:70497→70178）：active && tileSolid && slope==0 && !halfBrick && !inActive
  const solidTile2 = (x: number, y: number): boolean => {
    if (y < 0 || y >= H) return false;
    const i = y * W + x;
    return a[i] === 1 && solidOf(t[i]!) && sl[i] === 0 && hf[i] === 0;
  };
  const LIST: Array<[number, number]> = [];
  for (let i = 0; i < 44; i++) LIST.push([105, i]);
  LIST[34] = [349, 0];
  LIST[43] = [105, 50];
  for (const s of [63, 64, 65, 66, 68, 69, 70, 71, 72, 73, 75, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 77, 78, 67, 74, 37, 2]) LIST.push([105, s]);
  const count = Math.trunc(LIST.length * 2 * (W / 4200));
  const yMin = Math.trunc((gs.worldSurface * 2 + gs.rockLevel) / 3);
  const oceanTop = (gs.worldSurface + gs.rockLevel) / 2 + 40;
  const rng = new RNG(SEED);
  let num = 0;
  const placed: string[] = [];
  for (let i = 0; i < count; i++) {
    if (num >= LIST.length) num = 0;
    const [typ, style] = LIST[num]!;
    let done = false, fail = 0;
    while (!done) {
      let x = rng.int(20, W - 21);
      let y = rng.int(yMin, H - 301);
      let guard = 100;
      while (y <= oceanTop && (x < gs.beachDistance || x > W - gs.beachDistance)) {
        guard--;
        if (guard <= 0) break;
        x = rng.int(20, W - 21);
        y = rng.int(yMin, H - 301);
      }
      if (guard <= 0) { done = true; break; }
      while (y < H && !active(x, y)) y++;
      if (y >= H) { done = true; break; }
      y--;
      // Place2xX 净空 + SolidTile2 底座 + PlaceTile 液体门（105 WaterPlacement 不允许）
      let ok = true;
      for (let dx = 0; dx < 2 && ok; dx++) for (let dy = -2; dy <= 0 && ok; dy++) if (active(x + dx, y + dy)) ok = false;
      if (ok && (!solidTile2(x, y + 1) || !solidTile2(x + 1, y + 1))) ok = false;
      // 105 不在 PlaceTile 液体拒绝列表（cs:59491-59497）——液体中照放
      if (ok) { placed.push(`${x},${y - 2}`); num++; done = true; }
      else { fail++; if (fail >= 10000) done = true; }
    }
  }
  // golden58 雕像（减去 golden57 既存 14 座）
  const t57 = rd16(57, 'typ'), a57 = rd8(57, 'act');
  const collect = (tA: Uint16Array, aA: Uint8Array) => {
    const out: string[] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (aA[i] && (tA[i] === 105 || tA[i] === 349) && (!aA[i - 1] || (tA[i - 1] !== 105 && tA[i - 1] !== 349)) && (!aA[i - W] || (tA[i - W] !== 105 && tA[i - W] !== 349))) out.push(`${x},${y}`);
    }
    return out;
  };
  const pre = new Set(collect(t57, a57));
  const gold = collect(rd16(58, 'typ'), rd8(58, 'act')).filter(p => !pre.has(p));
  const pset = new Set(placed), gset = new Set(gold);
  let firstMiss = -1;
  placed.forEach((p, q) => { if (!gset.has(p) && firstMiss < 0) firstMiss = q; });
  console.log(`ref placed=${placed.length} golden(pass新增)=${gold.length} 前4ref=${placed.slice(0, 4).join(' ')} 前4gold=${gold.slice(0, 4).join(' ')}`);
  console.log(`ref-only=${placed.filter(p => !gset.has(p)).length} gold-only=${gold.filter(p => !pset.has(p)).length}`);
  console.log(`first ref-miss @#${firstMiss} ${placed[firstMiss]}`);
}, 300_000);
