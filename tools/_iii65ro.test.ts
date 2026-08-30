// IIII65 一次性仪 v1：Dungeon pass 主流值流窗口（d61layoutStart..dungeonW）单实例捕获。
// 与 IIII59 _iii61rolls 差别：主实例绑定改走 RNG.prototype.reseed 钩（每次 reseed 后
// 读 `this.vanilla`＝当前 pass 主 UnifiedRandom）——修掉旧版「窗口内首掷即绑」把入口
// 私有流(TowerEntrance windowType Next(3))误当主流的病根；窗口扩至 d61layoutStart 起，
// 对照 x86 rig marks 段界（layoutStart/End、dungeonL/E/PD/Pi/S/D/Wstart/W）。
// 用法：cd game && SW_I65RO=1 npx vitest run tools/_iii65ro.test.ts
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I65RO === '1';
const SEED = process.env.SW_M8_SEED ?? '51620200';
const OUTDIR = process.env.SW_I65_DIR ?? '/tmp/iii65-out';

(RUN ? it : it.skip)('iii65 roll-window', async () => {
  const g = globalThis as unknown as { __wvLines?: string[]; __swWvLog?: unknown };
  g.__wvLines = [];
  g.__swWvLog = `${OUTDIR}/wv-js.tmp`;

  let phase: 'pre' | 'open' | 'closed' = 'pre';
  let mainInst: object | null = null;
  let mainId = -1;
  let closedPos = -1;
  let scanLen = 0;
  const ids = new Map<object, number>();
  const idOf = (o: object): number => {
    let v = ids.get(o);
    if (v === undefined) { v = ids.size + 1; ids.set(o, v); }
    return v;
  };
  const arr: number[] = [];
  const marks: Array<[string, number]> = [];

  // ── 主实例精确绑定：每次 RNG.reseed（=每 pass 头「Main.rand=new UnifiedRandom(_seed)」）
  // 完成后，`this.vanilla` 即新主实例。同一 RNG 对象被管线复用 reseed，无需再判身份。
  const RNGp = RNG.prototype as unknown as Record<string, (...a: never[]) => void>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    oReseed.call(this, s);
    const van = (this as unknown as { vanilla?: object }).vanilla;
    if (van) mainInst = van;
  };

  (globalThis as unknown as { __swOnRoll?: (value: number, inst: object) => void }).__swOnRoll =
    (value: number, inst: object) => {
      const L = g.__wvLines!;
      while (scanLen < L.length) {
        const ln = L[scanLen++];
        if (!ln.startsWith('MARK|')) continue;
        const tag = ln.slice(5);
        if (phase === 'open') marks.push([tag, arr.length]);
        if (tag.startsWith('d61layoutStart') && phase === 'pre') { phase = 'open'; marks.push([`OPEN@${tag}`, arr.length]); }
        else if (tag.startsWith('dungeonLate') && phase === 'open') { phase = 'closed'; closedPos = arr.length; marks.push(['CLOSE', arr.length]); break; }
      }
      if (phase !== 'open') return;
      if (mainInst !== null && inst !== mainInst) return;   // 只收 pass 主实例（ctx.rng 的 UnifiedRandom）
      const id = idOf(inst);
      if (mainId < 0) mainId = id;
      arr.push(value >>> 0);
    };

  try {
    await generateWorld({ width: 4200, height: 1200, seedText: SEED, evil: -1, seedFlags: { drunkWorld: true } });
  } finally {
    delete (globalThis as unknown as { __swOnRoll?: unknown }).__swOnRoll;
  }
  console.log(`[i65ro] len=${arr.length} mainId=${mainInst ? 'bound' : 'UNBOUND'} closed=${closedPos}`);
  for (const [m, n] of marks) console.log(`[i65romark] ${m} @${n}`);
  writeFileSync(`${OUTDIR}/js-rolls65.txt`, arr.join('\n') + '\n');
  writeFileSync(`${OUTDIR}/js-marks65.json`, JSON.stringify(marks.map(([m, n]) => ({ m, n }))));
}, 900_000);
