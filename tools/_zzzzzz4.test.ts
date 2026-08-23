// 一次性诊断（ZZZZZZ 批）：CONST #49 相位网格 JS 侧——LiquidSim.waterCheck 进/出
// 落盘 liq/act 网格（与 x86 Z49 钩同相位序 wc0e/wc0x/...）。用毕即删。
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const RUN = process.env.SW_Z4 === '1';
const W = Number(process.env.SW_Z4_W ?? 4200), H = Number(process.env.SW_Z4_H ?? 1200);
const SEED = process.env.SW_Z4_SEED ?? '1321365005';
const FLAGS = (process.env.SW_Z4_FLAGS ?? 'theConstant').split(',').filter(Boolean);
const EVIL = Number(process.env.SW_Z4_EVIL ?? -1);
const OUT = process.env.SW_Z4_OUT ?? '/tmp/zz49-out-js';

(RUN ? it : it.skip)('zzzzzz const phase grids js', async () => {
  mkdirSync(OUT, { recursive: true });
  let idx = -1;
  let inWC = false;
  const proto = LiquidSim.prototype as unknown as Record<string, (...a: never[]) => unknown>;
  const oWC = proto.waterCheck!;
  const dump = (tag: string, sim: { world: { store: { liquid: Uint8Array; flags: Uint8Array; type: Uint16Array; w: number; h: number } } }) => {
    const st = sim.world.store;
    writeFileSync(`${OUT}/${tag}.liq`, Buffer.from(st.liquid.buffer, st.liquid.byteOffset, st.liquid.length));
    const act = new Uint8Array(st.flags.length);
    for (let i = 0; i < st.flags.length; i++) act[i] = st.flags[i]! & 1;
    writeFileSync(`${OUT}/${tag}.act`, Buffer.from(act.buffer, 0, act.length));
    writeFileSync(`${OUT}/phases.txt`, `${tag}\n`, { flag: 'a' });
  };
  const uls = new Map<number, string[]>();
  const oUpd = (proto as Record<string, (...a: never[]) => unknown>).update!;
  (proto as Record<string, (...a: never[]) => unknown>).update = function (this: unknown, ...a: never[]) {
    const r = oUpd.apply(this, a);
    const e = a[0] as never as { x: number; y: number };
    const st = (this as never as { world: { store: { liquid: Uint8Array; w: number } } }).world.store;
    const arr = uls.get(idx) ?? [];
    arr.push(`${e.x} ${e.y} ${st.liquid[e.y * st.w + e.x]} t${st.liquidType[e.y * st.w + e.x]! - 1}`);
    uls.set(idx, arr);
    return r;
  };
  proto.waterCheck = function (this: unknown, ...a: never[]) {
    const sim = this as never as { world: { store: { liquid: Uint8Array; flags: Uint8Array; type: Uint16Array; w: number; h: number } } };
    if (inWC) return oWC.apply(this, a);
    inWC = true;
    idx++;
    dump(`wc${idx}e`, sim);
    const r = oWC.apply(this, a);
    dump(`wc${idx}x`, sim);
    inWC = false;
    return r;
  };
  const seedFlags: Record<string, boolean> = {};
  for (const f of FLAGS) seedFlags[f] = true;
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: Object.keys(seedFlags).length ? seedFlags : undefined,
    });
  } finally { proto.waterCheck = oWC; }
  for (const [k, arr] of uls) writeFileSync(`${OUT}/ul${k}.txt`, arr.join('\n') + '\n');
  console.log(`[z4] phases dumped to ${OUT}`);
}, 600_000);
