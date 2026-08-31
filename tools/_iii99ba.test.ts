// IIII99 批一次性探针：sparkle/rainbow #32 Dungeon 域「banner 受理序对账仪」。
//   设计：复用 _iii91win 反演重放（基座=dump31_Slush 注入）跑单段 DungeonPass，
//   以 __wvLines 抓 dg_ba0/dg_baT/dg_bz/dg_baP/DG-ban 每轮候选（i,x,y,ok），
//   与 rig snaplog.txt 的 BANCND/BANACC 行逐条对齐——首个失配候选序=纯写入债位。
// 用法：cd game && SW_I99BA=1 SW_I99BA_G2=/tmp/iii80-out/x86-sparkle \
//         SW_I99BA_SNAP=/tmp/iii91-out/x86r-sparkle/snaplog.txt \
//         SW_I99BA_SEED=771004 SW_I99BA_FLAGS=hallowOnTheSurface \
//         npx vitest run tools/_iii99ba.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { flipGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I99BA === '1';
const G2 = process.env.SW_I99BA_G2 ?? '/tmp/iii80-out/x86-sparkle';
const SNAP = process.env.SW_I99BA_SNAP ?? '/tmp/iii91-out/x86r-sparkle/snaplog.txt';
const SEEDV = process.env.III99_SEEDV ?? '771004';
const W = Number(process.env.SW_I99BA_W ?? 4200), H = Number(process.env.SW_I99BA_H ?? 1200);
const N = W * H;
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_I99BA_FLAGS ?? '').split(',').filter(Boolean)) FLAGS[f] = true;

interface Ch { t: Uint16Array; a: Uint8Array }
function le16(p: string): Uint16Array {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer.slice(0));
}

(RUN ? it : it.skip)('III99 sparkle banner-order parity probe', async () => {
  // ── 相 0：管线跑到 ▶Dungeon 头捕获 store/gs/chests（i87 钩同款，seen==4=dgLayout 尾）──
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let q = 0; q < TILE_DEFS.length; q++) {
    const s2 = TILE_DEFS[q]?.vanilla?.sheet;
    if (typeof s2 === 'number') SHEET[q] = s2;
  }
  SHEET[0] = 0;

  interface Cap { store: TileStore; gs: unknown; chests: unknown[] }
  let cap: Cap | null = null;
  let done = false;
  let seen = -1;
  const grab = (stRaw: unknown, gRaw: unknown, chRaw: unknown): void => {
    if (done) return;
    done = true;
    cap = { store: stRaw as TileStore, gs: gRaw, chests: JSON.parse(JSON.stringify(chRaw ?? [])) };
  };
  (globalThis as Record<string, unknown>).__swI87Cap = (stRaw: unknown, gRaw: unknown, chRaw: unknown) => {
    seen++;
    if (seen !== 4 || done) return;
    grab(stRaw, gRaw, chRaw);
    (globalThis as Record<string, unknown>).swI99AbortFlag = true;
    throw Object.assign(new Error('SW_I99_ABORT'), { swAbort: true });
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEEDV, evil: 0,
      seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
      onProgress: () => {},
    });
  } catch (e) {
    if (!(e as { swAbort?: boolean })?.swAbort) throw e;
  }
  delete (globalThis as Record<string, unknown>).__swI87Cap;
  if (!cap) throw new Error('capture failed');

  // ── 相 1：注入 dump31 基座 + 候选序追踪跑 DungeonPass ──
  const c: Cap = cap as unknown as Cap;
  const st = c.store;
  const REV = new Map<number, number>();
  for (let q = 0; q < TILE_DEFS.length; q++) {
    const s2 = TILE_DEFS[q]?.vanilla?.sheet;
    if (typeof s2 === 'number' && !REV.has(s2)) REV.set(s2, q);
  }
  const ch: Ch = {
    t: le16(`${G2}/031_Slush.typ`), a: readFileSync(`${G2}/031_Slush.act`),
  };
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(ch.t[i]) ?? 0;
    st.flags[i] = ch.a[i] ? 1 : 0;
    if (!ch.a[i] && ch.t[i] === 0 && st.wire[i]) st.wire[i] = 0;
  }
  // inact 位
  const ia = readFileSync(`${G2}/031_Slush.inact`);
  for (let i = 0; i < N; i++) st.wire[i] = (st.wire[i] & ~32) | (ia[i] ? 32 : 0);

  // 完整通道装载（wal/liq/half/slope/lty/frx/fry）
  const ld16 = (p: string, arr: Uint16Array): void => {
    const b = readFileSync(p);
    arr.set(new Uint16Array(b.buffer.slice(0)));
  };
  const ld8 = (p: string, arr: Uint8Array): void => { arr.set(readFileSync(p)); };
  ld16(`${G2}/031_Slush.wal`, st.wall);
  ld8(`${G2}/031_Slush.liq`, st.liquid);
  const lty = readFileSync(`${G2}/031_Slush.lty`);
  for (let i = 0; i < N; i++) st.liquidType[i] = st.liquid[i] > 0 ? lty[i] + 1 : 0;
  ld8(`${G2}/031_Slush.half`, st.half);
  ld8(`${G2}/031_Slush.slope`, st.slope);
  try {
    ld16(`${G2}/031_Slush.frx`, st.frameX);
    ld16(`${G2}/031_Slush.fry`, st.frameY);
  } catch { /* 无帧链 */ }

  const evd: Array<Record<string, unknown>> = [];
  (globalThis as Record<string, unknown>).__swDgDecor = evd;

  const rng = new RNG((c.gs as { seed?: number }).seed ?? Number(SEEDV));
  flipGenSolid([481, 482, 483], false);
  runDungeonPass(st, rng, c.gs as never, c.chests as never);
  flipGenSolid([481, 482, 483], true);
  delete (globalThis as Record<string, unknown>).__swDgDecor;

  writeFileSync(process.env.SW_I99BA_OUT ?? '/tmp/iii99-out/i99ba-decor.json', JSON.stringify(evd));
  console.log(`decor events=${evd.length} -> /tmp/iii99-out/i99ba-decor.json`);

  // ── 相 2：与 rig snaplog 对账：BANCND 序列坐标 vs 我方 KCHv2/C/L 事件 ──
  const snapLines = readFileSync(SNAP, 'utf8').split('\n');
  const bancnd = snapLines.filter((l) => l.includes('|BANCND ') || l.includes('|BANACC ')).slice(0, 400);
  const kch = snapLines.filter((l) => l.includes('|KCH '));
  console.log(`rig BANCND/BANACC lines=${bancnd.length} KCH=${kch.length}`);
  console.log('first rig KCH:', kch[0]);
  const mineKills = evd.filter((e) => e.k === 'KCHv2');
  const mineChand = evd.filter((e) => e.k === 'C');
  console.log(`mine KCHv2 kills=${mineKills.length} chandelier places=${mineChand.length}`);
  for (const e of mineKills.slice(0, 10)) console.log('MINE', JSON.stringify(e));
  for (const e of mineChand.filter((p) => Math.abs(Number(p.x) - 3682) < 30 && Math.abs(Number(p.y) - 557) < 300).slice(0, 10)) {
    console.log('CHAND', JSON.stringify(e));
  }
}, 900_000);
