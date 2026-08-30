// IIII83 批 · SmallHoles(#9 窗口) 隔离重放 + 池味调用级对拍
//   - dump009(Clay 末,gfb-a) 直构 store → runSmallHolesPass(八字段 zenith) → 对拍 dump010
//   - __swTrCall 调用级日志：每次 tileRunner 的 r4/trNum3 → 与 x86 .lty 泵池味比对
// 用法：cd game && SW_III83_SH=1 npx vitest run tools/_iii83sh.test.ts
import { it } from 'vitest';
const RUN = !!process.env.SW_III83_SH;
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { runSmallHolesPass } from '../src/world/gen/vanilla/MissingCavesPass';
import { RNG } from '../src/core/rng';
import { TILE_DEFS, TILE_BY_KEY, T } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const G2 = process.env.SW_III83_G2 ?? '/tmp/iii82-out/x86-gfb-a';
const SEED = process.env.SW_III83_SEED ?? '9293480';
const W = Number(process.env.SW_III83_W ?? 4200), H = Number(process.env.SW_III83_H ?? 1200);
const N = W * H;

const FLAG_ALIAS: Record<string, string> = {
  notraps: 'noTraps', constant: 'theConstant', notthebees: 'notTheBees',
  tenthanniversary: 'tenthAnniversary', fortheworthy: 'getGoodWorld',
};
const FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW_III83_FLAGS
  ?? 'everything,remix,drunkWorld,notTheBees,noTraps,theConstant,tenthAnniversary,getGoodWorld')
  .split(',').filter(Boolean)) FLAGS[FLAG_ALIAS[f.toLowerCase()] ?? f] = true;

const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

function load(idx: number, nm: string, ext: string): Buffer {
  return readFileSync(`${G2}/${String(idx).padStart(3, '0')}_${nm}.${ext}`);
}
function chOf(idx: number, nm: string) {
  const le16 = (b: Buffer) => new Uint16Array(b.buffer.slice(0));
  return {
    t: le16(load(idx, nm, 'typ')), a: load(idx, nm, 'act'), w: le16(load(idx, nm, 'wal')),
    l: load(idx, nm, 'liq'), lt: load(idx, nm, 'lty'), hf: load(idx, nm, 'half'), sl: load(idx, nm, 'slope'),
  };
}

/** dump009 → TileStore（ghost type 照抄；liquidType 按 vanilla+1 映射） */
function buildStoreFrom(ch: ReturnType<typeof chOf>): TileStore {
  const st = new TileStore(W, H);
  for (let i = 0; i < N; i++) {
    st.type[i] = REV.get(ch.t[i]) ?? 0;
    st.flags[i] = ch.a[i] ? 1 : 0;
    st.wall[i] = ch.w[i];
    st.liquid[i] = ch.l[i];
    st.liquidType[i] = ch.l[i] > 0 ? ch.lt[i] + 1 : 0;
    st.half[i] = ch.hf[i];
    st.slope[i] = ch.sl[i];
  }
  void T;
  return st;
}

(RUN ? it : it.skip)('SmallHoles 隔离重放 + 调用级液型对拍', async () => {
  // ── A) gs 捕获（真管线跑到 SmallHoles 头即中止）──
  let gsCap: GenState | null = null;
  const g0 = globalThis as { __swShGsCap?: (gs: GenState, st: TileStore) => void };
  g0.__swShGsCap = (gs) => {
    if (!gsCap) {
      // 浅拷贝够用（TileRunner 只读常量字段；数组字段在 pass 后才被改写）
      gsCap = { ...gs } as unknown as GenState;
      throw new Error('SW_SH_CAP_ABORT');
    }
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0,
      seedFlags: Object.keys(FLAGS).length > 0 ? FLAGS : undefined,
      onProgress: () => {}, onWorldPartial: () => {},
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    if (!msg.includes('SW_SH_CAP_ABORT')) throw e;
  } finally { g0.__swShGsCap = undefined; }
  if (!gsCap) throw new Error('gs capture failed');
  const gs = gsCap!;
  console.log('gs:', JSON.stringify({
    seed: gs.seed, ws: gs.worldSurface, wsH: gs.worldSurfaceHigh, genWS: gs.genWorldSurface,
    genWSH: gs.genWorldSurfaceHigh, rock: gs.rockLevel, genRock: gs.genRockLayer,
    waterLine: gs.waterLine, lavaLine: gs.lavaLine, beach: gs.beachDistance,
    ud: gs.undergroundDesert, flags: Object.keys(FLAGS),
  }));

  // ── B) 重放 ──
  const pre = chOf(9, 'Clay');
  const postX = chOf(10, 'Small_Holes');
  const st = buildStoreFrom(pre);
  const rng = new RNG(gs.seed);
  const calls: Array<Record<string, number>> = [];
  const g1 = globalThis as { __swTrCall?: (o: Record<string, unknown>) => void };
  g1.__swTrCall = (o) => { calls.push(o as Record<string, number>); };
  try {
    runSmallHolesPass(st, rng, gs);
  } finally { g1.__swTrCall = undefined; }
  console.log(`runner calls=${calls.length}`);

  // ── C) 调用→格影射（粗菱形半径标记；同格多 call 取首者）──
  const cellOwner = new Map<number, number>();   // cellIdx → call 序号
  for (let ci = 0; ci < calls.length; ci++) {
    const c = calls[ci];
    // 用 strength 近似菱形半径（首步最大）；实际随 num2 衰减，这里只粗标记用于分组
    const R = Math.ceil((c.strength as number) * 0.5);
    const cx = c.i as number, cy = c.j as number;
    for (let y = Math.max(1, cy - R); y <= Math.min(H - 1, cy + R); y++) {
      for (let x = Math.max(1, cx - R); x <= Math.min(W - 1, cx + R); x++) {
        if (Math.abs(x - cx) + Math.abs(y - cy) > R * 1.6) continue;
        const idx = y * W + x;
        if (!cellOwner.has(idx)) cellOwner.set(idx, ci);
      }
    }
  }

  // ── D) 类型差异统计（与 x86 .lty）──
  const diffCells: Array<{ x: number; y: number; vx: number; vj: number; owner: number }> = [];
  for (let i = 0; i < N; i++) {
    if (!(st.liquid[i] > 0 || postX.l[i] > 0)) continue;
    const vl = postX.l[i] > 0 ? postX.lt[i] : 0;     // vanilla 编码
    const jl = st.liquid[i] > 0 ? SHEETvalid(st.type[i]) : 0;
    void jl;
    const jv = st.liquid[i] > 0 ? st.liquidType[i] - 1 : 0;
    if (vl !== jv) {
      diffCells.push({ x: i % W, y: (i / W) | 0, vx: vl, vj: jv, owner: cellOwner.get(i) ?? -1 });
    }
  }
  console.log(`diff pool-type cells=${diffCells.length} (x86-enc: 0水/1岩浆/2蜜/3微光)`);
  const vc = new Map<string, number>();
  for (const d of diffCells) { const k = `${d.vx}>${d.vj}`; vc.set(k, (vc.get(k) ?? 0) + 1); }
  console.log('pairs:', [...vc.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' '));
  const ownCount = new Map<number, number>();
  for (const d of diffCells) ownCount.set(d.owner, (ownCount.get(d.owner) ?? 0) + 1);
  const sortedOwners = [...ownCount.entries()].sort((a, b) => b[1] - a[1]);
  console.log('owner calls(top10):', sortedOwners.slice(0, 10).map(([ci, n]) => `#${ci}(n=${n})`).join(' '));
  for (const [ci] of sortedOwners.slice(0, 12)) {
    if (ci < 0) { console.log('  owner=?cells (cross-call overlaps)', ); continue; }
    const c = calls[ci];
    console.log(`  call#${ci}: pos=(${c.i},${c.j}) type=${c.type} str=${c.strength} steps=${c.steps} r4=${c.r4} trNum3=${c.trNum3} nDiff=${ownCount.get(ci)} ndiffYrange=${range(diffCells.filter(d => d.owner === ci))}`);
  }
  // 调用侧全局画像：全部 type=-2/-1 的 trNum3 分布、与 truth 中同 call 是否一致
  let nNeg = 0, negLava = 0, negWater = 0;
  for (const c of calls) {
    if ((c.type as number) === -2) {
      nNeg++;
      if (c.trNum3 === 1) negLava++; else negWater++;
    }
  }
  console.log(`type=-2 calls=${nNeg} (trNum3=1岩浆 ${negLava} / 0水 ${negWater})`);
  writeFileSync('/tmp/iii83-out/sh-calls.json', JSON.stringify(calls));
  writeFileSync('/tmp/iii83-out/sh-diff.json', JSON.stringify(diffCells));

  // helper：校验用
  function SHEETvalid(_t: number): number { return 0; }
  function range(arr: typeof diffCells): string {
    if (!arr.length) return '-';
    const ys = arr.map(d => d.y), xs = arr.map(d => d.x);
    return `x[${Math.min(...xs)},${Math.max(...xs)}]y[${Math.min(...ys)},${Math.max(...ys)}]`;
  }
}, 300_000);
