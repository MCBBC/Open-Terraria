// 一次性诊断（任务代号 FFFFFFF 批，2026-08-27）：g#98 液体二次沉降窗——
//  流位占账仪 v2：全局掷账（pass 链 RNG 单实例跨槽复用）+ r30Sink + __swLqKill。
//  产物：/tmp/fff2-out/{j-ledger.txt,j-r30.txt,j-kills.txt}
//  用法：cd game && SW_FFF=1 npx vitest run tools/_fff1.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const RUN = process.env.SW_FFF === '1';
const SEED = process.env.SW_FFF_SEED ?? '9293480';
const EVIL = process.env.SW_FFF_EVIL !== undefined ? Number(process.env.SW_FFF_EVIL) : 0;
const W = Number(process.env.SW_FFF_W ?? 4200), H = Number(process.env.SW_FFF_H ?? 1200);
const OUT = '/tmp/fff2-out';

(RUN ? it : it.skip)('fff g98 window ledger', async () => {
  mkdirSync(OUT, { recursive: true });
  const ledger: string[] = [];
  const r30: string[] = [];
  const kills: string[] = [];
  let seq30 = 0;
  let simId = 0;
  let curEpoch = -1;
  let G = 0; // 全局掷账（原版 MainRolls/InternalSample 主实例口径的同构物）

  LiquidSim.r30Sink = (x, y, v, num1, lq, rq, self) => {
    r30.push(`${curEpoch}\t${++seq30}\t${G}\t${x} ${y} v${v} n${num1} ${lq}/${rq}/${self}`);
  };
  (globalThis as { __swLqKill?: unknown }).__swLqKill = (
    x: number, y: number, sheet: number, fx: number, fy: number, liq: number, lty: number,
  ) => {
    kills.push(`${curEpoch}\t${G}\tK ${x} ${y} s${sheet} fx${fx} fy${fy} l${liq}/${lty}`);
  };

  type SimLike = { passRng?: Record<string, unknown> };
  const proto = LiquidSim.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const oQW = proto.quickWater, oWC = proto.waterCheck;

  proto.quickWater = function (this: unknown) {
    const s = this as SimLike;
    simId++;
    curEpoch = simId;
    const rng = s.passRng as Record<string, unknown> | undefined;
    ledger.push(`${simId} QW.b G=${G} rng=${rng ? (rng as { __f?: number }).__f ?? 'shared' : 'null'}`);
    if (rng && !(rng as { __f?: number }).__f) {
      (rng as { __f?: number }).__f = 1;
      for (const m of ['nextInt', 'nextIntRange', 'next', 'nextDouble']) {
        const om = rng[m] as ((...a: number[]) => number) | undefined;
        if (typeof om !== 'function') continue;
        rng[m] = function (this: unknown, ...a: number[]) {
          G++;
          return om!.apply(this, a);
        };
      }
    }
    const r = oQW.apply(this, arguments as never);
    ledger.push(`${simId} QW.e G=${G}`);
    return r;
  };
  proto.waterCheck = function (this: unknown) {
    const s = this as SimLike;
    void s;
    ledger.push(`${simId} WC.b G=${G}`);
    const r = oWC.apply(this, arguments as never);
    ledger.push(`${simId} WC.e G=${G}`);
    return r;
  };

  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    });
  } finally {
    proto.quickWater = oQW; proto.waterCheck = oWC;
    LiquidSim.r30Sink = null;
    delete (globalThis as { __swLqKill?: unknown }).__swLqKill;
  }
  writeFileSync(`${OUT}/j-ledger.txt`, ledger.join('\n'));
  writeFileSync(`${OUT}/j-r30.txt`, r30.join('\n'));
  writeFileSync(`${OUT}/j-kills.txt`, kills.join('\n'));
  console.log(`sims=${simId} r30rows=${r30.length} kills=${kills.length} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 900_000);
