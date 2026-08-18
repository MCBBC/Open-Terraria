// 一次性诊断（YYY 批 2026-08-18）：gen 期 KillTile 尾级联取证。
// ① 统计沉降期 destroyObj 闸内的级联组杀（check2x2/checkSuper 整组拆除）——
//    预期 = #49 残差 10 格（484×3 组 + 485×2 组的上半）在源头被清；
// ② (2679,714)（UUU R0 仲裁格，484 滚仙人掌族）在槽 13 末态（=dump053 Smooth_
//    World 末）与 vanilla 逐通道对拍。
// 用法：cd game && SW_YYY=1 npx vitest run tools/_yyycasc.test.ts（跑完即删）
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_YYY === '1';
const G2 = '/tmp/sw-slp/g';
const W = 4200, H = 1200;

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
    world: { store: { w: number; type: Int32Array; flags: Uint8Array } };
  };
  const orig = proto.killTileGen;
  const cascade: Array<{ x: number; y: number; sheet: number }> = [];
  const total: Array<{ x: number; y: number; sheet: number }> = [];
  proto.killTileGen = function (this: typeof proto, x: number, y: number) {
    const st = this.world.store;
    const t = st.type[this.idx(x, y)];
    const rec = { x, y, sheet: SHEET[t] ?? -1 };
    total.push(rec);
    if (this.destroyObj) cascade.push(rec);
    return orig.call(this, x, y);
  };

  let slot13: { type: Int32Array; flags: Uint8Array } | null = null;
  await generateWorld({
    width: W, height: H, seedText: '9293480', evil: 0,
    onWorldPartial: (_w, i) => { if (i === 13 && !slot13) slot13 = { type: _w.store.type as never, flags: _w.store.flags as never }; },
  });
  proto.killTileGen = orig;

  const byGrp = new Map<string, number>();
  for (const c of cascade) byGrp.set(`${c.sheet}`, (byGrp.get(`${c.sheet}`) ?? 0) + 1);
  console.log(`killTileGen total=${total.length} cascade(group-kill)=${cascade.length}`);
  console.log(`cascade by sheet: ${[...byGrp.entries()].map(([s, n]) => `sheet${s}×${n}`).join(' ') || '(none)'}`);
  console.log(`cascade cells: ${cascade.map((c) => `(${c.x},${c.y})s${c.sheet}`).join(' ')}`);

  // (2679,714) + 5×5 邻域 vs dump053
  const pre = `${G2}/053_Smooth_World`;
  if (!existsSync(`${pre}.typ`)) { console.log('(no dump053)'); return; }
  const b = readFileSync(`${pre}.typ`);
  const t16 = new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
  const va = readFileSync(`${pre}.act`);
  let mism = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = 2679 + dx, y = 714 + dy;
      const i = y * W + x;
      const v0 = va[i]! ? t16[i]! : 0;
      const j0 = slot13!.flags[i]! ? (SHEET[slot13!.type[i]!] >= 0 ? SHEET[slot13!.type[i]!]! : 9999) : 0;
      const a0 = slot13!.flags[i]! & 1, av0 = va[i]! ? 1 : 0;
      if (v0 !== j0 || a0 !== av0) { mism++; console.log(`  ✗ (${x},${y}) vanilla t${v0}/a${av0} vs js t${j0}/a${a0}`); }
      else console.log(`  ✓ (${x},${y}) t${v0} a${av0}`);
    }
  }
  console.log(`(2679,714)±2: ${mism === 0 ? '全等（UUU R0 仲裁格在 #53 已由 UUU 侧修复收口）' : `${mism} 差`}`);
}, 300_000);
