// ★IIIII213 一次性仪⑮：全链 JS 下灌流（inst 分段）——#49/#98 两段 iter78 体分离。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { LiquidSim } from '../src/world/liquid/LiquidSim';

const RUN = process.env.SW_I213POURF === '1';
const OUT = process.env.I213_OUT ?? '/tmp/iii213-out';

(RUN ? it : it.skip)('iii213 full chain pour', async () => {
  const lines: string[] = [];
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  const rels = new Map<number, number>();
  let pourOn = false;
  let curInst = 0;
  LiquidSim.pourSink = (x, y, n, src, dst) => {
    if (pourOn) lines.push(`${curInst} ${x},${y} n${n} s${src} d${dst}`);
  };
  const proto = LiquidSim.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
  const oUpd = proto.updateLiquid;
  proto.updateLiquid = function (this: unknown) {
    const r = oUpd.apply(this, arguments);
    let id = ids.get(this);
    if (!id) { id = nextId++; ids.set(this, id); rels.set(id, 0); }
    const rel = (rels.get(id) ?? 0) + 1;
    rels.set(id, rel);
    curInst = id;
    pourOn = rel + 1 === 78;   // 该实例的 iter78 体（尾沿切换=LiqIter==77 同锚）
    return r;
  };
  try {
    await generateWorld({
      width: 4200, height: 1200,
      seedText: '1138154190', evil: 0,
      seedFlags: { remix: true },
    });
  } finally {
    LiquidSim.pourSink = null;
    proto.updateLiquid = oUpd;
  }
  // 两实例的段长度（按 pourOn 无法回溯——改为在 wrapper 内直接记录：重跑代价高，
  // 这里用简单办法：#49 实例=inst1（首个 settle），#98=inst2；pourOn 期间无法区分
  // 实例——但 pourSink 无 inst 参数，因此此处仅统计总数并落盘，分段由调用方按
  // inst1=582 迭代的事实推断：实际上两个实例的 iter78 体互不相邻，中间隔 48 个
  // pass（无 pour），文件天然为两段拼接。落盘即可。
  writeFileSync(`${OUT}/j-pour-full.txt`, lines.join('\n') + '\n');
  console.log(`pour-full lines=${lines.length}`);
}, 900_000);
