// 一次性诊断（YYY 批 2026-08-18）：gen 期 KillTile 尾级联取证。
// ① 统计沉降期 destroyObj 闸内的级联组杀（check2x2/checkSuper 整组拆除）；
// ② (2679,714)（UUU R0 仲裁格，484 滚仙人掌族）槽 13 末态（=dump053 Smooth_
//    World 末）±2 邻域与 vanilla 逐通道对拍；
// ③ 级联终态净效应：SW_YYY_OFF=1（关级联）与开级联两次生成终态逐格 diff。
// 用法：cd game && SW_YYY=1 npx vitest run tools/_yyycasc.test.ts（跑完即删）
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_YYY === '1';
const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200, N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('cascade kills + (2679,714) arbitration', async () => {
  const { LiquidSim } = await import('../src/world/liquid/LiquidSim');
  const proto = LiquidSim.prototype as unknown as {
    killTileGen: (x: number, y: number) => void;
    destroyObj: boolean;
    idx: (x: number, y: number) => number;
    world: { store: { w: number; type: ArrayLike<number>; flags: Uint8Array } };
  };
  const orig = proto.killTileGen;
  const cascade: Array<{ x: number; y: number; sheet: number }> = [];
  const total: Array<{ x: number; y: number; sheet: number }> = [];
  proto.killTileGen = function (this: typeof proto, x: number, y: number) {
    const st = this.world.store;
    const t = st.type[this.idx(x, y)];
    const rec = { x, y, sheet: SHEET[t as never] ?? -1 };
    total.push(rec);
    if (this.destroyObj) cascade.push(rec);
    return orig.call(this, x, y);
  };

  let slot13: { type: ArrayLike<number>; flags: Uint8Array } | null = null;
  const world = await generateWorld({
    width: W, height: H, seedText: '9293480', evil: 0,
    onWorldPartial: (_w, i) => { if (i === 13 && !slot13) slot13 = { type: _w.store.type, flags: _w.store.flags }; },
  });
  proto.killTileGen = orig;

  const byGrp = new Map<string, number>();
  for (const c of cascade) byGrp.set(`${c.sheet}`, (byGrp.get(`${c.sheet}`) ?? 0) + 1);
  console.log(`[1] killTileGen total=${total.length} cascade(group-kill)=${cascade.length}`);
  console.log(`[1] cascade by sheet: ${[...byGrp.entries()].map(([s, n]) => `sheet${s}×${n}`).join(' ') || '(none)'}`);
  console.log(`[1] cascade cells: ${cascade.map((c) => `(${c.x},${c.y})s${c.sheet}`).join(' ')}`);

  // [2] (2679,714) ±2 邻域 vs dump053
  const pre = `${G2}/053_Smooth_World`;
  if (existsSync(`${pre}.typ`)) {
    const b = readFileSync(`${pre}.typ`);
    const t16 = new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
    const va = readFileSync(`${pre}.act`);
    let mism = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = 2679 + dx, y = 714 + dy;
        const i = y * W + x;
        const v0 = va[i]! ? t16[i]! : 0;
        const j0 = slot13!.flags[i]! ? (SHEET[slot13!.type[i] as never] >= 0 ? SHEET[slot13!.type[i] as never]! : 9999) : 0;
        const a0 = slot13!.flags[i]! & 1, av0 = va[i]! ? 1 : 0;
        if (v0 !== j0 || a0 !== av0) { mism++; console.log(`  ✗ (${x},${y}) vanilla t${v0}/a${av0} vs js t${j0}/a${a0}`); }
      }
    }
    console.log(`[2] (2679,714)±2 共 25 格: ${mism === 0 ? '全等 ✓（UUU R0 仲裁格已收口）' : `${mism} 差`}`);
  } else console.log('[2] (no dump053)');

  // [3] 级联终态净效应：patch squareTileFrameGen 为 no-op（关级联）重跑一次，
  //     与开级联终态逐格 diff
  const stOn = world.store;
  const stfProto = proto as unknown as { squareTileFrameGen: (x: number, y: number) => void };
  const origStf = stfProto.squareTileFrameGen;
  stfProto.squareTileFrameGen = () => { /* off */ };
  const worldOff = await generateWorld({ width: W, height: H, seedText: '9293480', evil: 0 });
  stfProto.squareTileFrameGen = origStf;
  const stOff = worldOff.store;
  let dT = 0, dF = 0, dL = 0;
  const cells: string[] = [];
  for (let i = 0; i < N; i++) {
    const aOn = stOn.flags[i]! & 1, aOff = stOff.flags[i]! & 1;
    const tOn = aOn ? SHEET[stOn.type[i]!] ?? -2 : -1;
    const tOff = aOff ? SHEET[stOff.type[i]!] ?? -2 : -1;
    if (aOn !== aOff || (aOn === 1 && tOn !== tOff)) {
      dT++; if (cells.length < 16) cells.push(`(${i % W},${(i / W) | 0}) onT${tOn}/a${aOn} offT${tOff}/a${aOff}`);
    }
    if (aOn !== aOff) dF++;
    if (stOn.liquid[i] !== stOff.liquid[i]) dL++;
  }
  console.log(`[3] 终态净效应（开级联 vs 关级联）：type/active 差 ${dT} 格，liquid 差 ${dL} 格`);
  if (cells.length) console.log(`[3] 前 16 格：${cells.join(' | ')}`);
}, 600_000);
