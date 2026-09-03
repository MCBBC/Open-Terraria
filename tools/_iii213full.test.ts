// ★IIIII213 一次性仪⑦：REMIX 全链 JS 指纹流（inst 标记）——#49/#98 两 settle 段分离。
// 生成期只有「水体沉降」(#49) 与「二次沉降」(#98) 两个 updateLiquid 消费实例。
// 用法：cd game && SW_I213FULL=1 npx vitest run tools/_iii213full.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I213FULL === '1';
const OUT = process.env.I213_OUT ?? '/tmp/iii213-out';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
void SHEET;

(RUN ? it : it.skip)('iii213 full chain liqlog', async () => {
  const fnvTable = new Uint8Array(2 * 1024 * 1024);
  const lines: string[] = [];
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  const rels = new Map<number, number>();
  type SimT = LiquidSim & {
    world: { store: TileStore }; numLiquid: number; bufCount: number;
    liquids: Array<{ x: number; y: number; kill: number; delay: number }>;
  };
  const proto = LiquidSim.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const oUpd = proto.updateLiquid;
  proto.updateLiquid = function (this: unknown) {
    const r = oUpd.apply(this, arguments);
    const sim = this as unknown as SimT;
    const s = sim.world.store;
    let id = ids.get(sim);
    if (!id) { id = nextId++; ids.set(sim, id); rels.set(id, 0); }
    const rel = (rels.get(id) ?? 0) + 1;
    rels.set(id, rel);
    const nl = sim.numLiquid, nb = sim.bufCount;
    let p = 0;
    for (let k = 0; k < nl; k++) {
      const e = sim.liquids[k]!;
      const ti = e.y * s.w + e.x;
      const dl = e.delay | 0, kl = e.kill | 0;
      fnvTable[p++] = e.x & 0xff; fnvTable[p++] = (e.x >> 8) & 0xff;
      fnvTable[p++] = e.y & 0xff; fnvTable[p++] = (e.y >> 8) & 0xff;
      fnvTable[p++] = dl & 0xff; fnvTable[p++] = (dl >>> 8) & 0xff; fnvTable[p++] = (dl >>> 16) & 0xff; fnvTable[p++] = (dl >>> 24) & 0xff;
      fnvTable[p++] = kl & 0xff; fnvTable[p++] = (kl >>> 8) & 0xff; fnvTable[p++] = (kl >>> 16) & 0xff; fnvTable[p++] = (kl >>> 24) & 0xff;
      fnvTable[p++] = s.liquid[ti];
      fnvTable[p++] = s.liquidType[ti] === 0 ? 0 : s.liquidType[ti] - 1;
    }
    let h = 2166136261 >>> 0;
    for (let q = 0; q < p; q++) { h ^= fnvTable[q]!; h = Math.imul(h, 16777619) >>> 0; }
    lines.push(`I ${id} ${rel} ${nl} ${nb} ${h.toString(16).padStart(8, '0')}`);
    return r;
  };
  try {
    await generateWorld({
      width: 4200, height: 1200,
      seedText: '1138154190', evil: 0,
      seedFlags: { remix: true },
    });
  } finally {
    (proto as unknown as Record<string, unknown>).updateLiquid = oUpd;
  }
  writeFileSync(`${OUT}/j-full-liqlog.txt`, lines.join('\n') + '\n');
  // 段统计
  const byInst = new Map<string, { n: number; first: string; last: string }>();
  for (const l of lines) {
    const [, inst, rel, nl, nb, h] = l.split(' ');
    const rec = byInst.get(inst) ?? { n: 0, first: l, last: l };
    rec.n++; rec.last = l;
    if (rec.n === 1) rec.first = l;
    void rel; void nl; void nb; void h;
    byInst.set(inst, rec);
  }
  for (const [inst, rec] of byInst) {
    console.log(`inst ${inst}: ${rec.n} iters | first ${rec.first} | last ${rec.last}`);
  }
}, 900_000);
