// IIII170 批一次性取证仪（源=_iii160ab 克隆，AMENDED）：REMIX 掷流窗延展至 Junc。
//   窗=▶UHBC reseed 开（---START 58）→ ▶Surf reseed 记 ---PASS 59 Buried Chests →
//   ▶Junc reseed 记 ---PASS 60 Surface Chests → ▶UnderwaterChests reseed 记
//   ---END 61 Jungle Chests Placement 并关窗。marker 语义与 x86 JJHook.AfterPass
//   的 SW_ROLLWIN 文件逐行同构（---PASS n = 该 pass 尾=次 pass 头边界）。
// 值行格式 `ln|value|M|instId`（主实例）/ `ln|value|X|instId`（其余实例）——主实例锚
//   =窗内第一掷（与 x86 ln==1→MainInst 同式）。XTRA 双侧都有 ⇒ 离线过滤。
// 另：pass-60 段（▶Surf..▶Junc 之间）逐掷附 1-2 层 src 调用点 → die-sites-pass60.txt；
//   placeBuriedChest ab/abx/land 台账（n=窗内 ln）→ win-events.txt。
// 用法：cd game && SW_I170WIN=1 npx vitest run tools/_iii170win.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I170WIN === '1';
const OUT = process.env.SW_I170_OUT ?? '/tmp/iii170-out/js';
const SEED = process.env.SW_I170_SEED ?? '1138154190';

(RUN ? it : it.skip)('iii170 remix UHBC..Junc window value stream', { timeout: 900_000 }, async () => {
  const wgPath = new URL('../src/world/gen/WorldGen.ts', import.meta.url).pathname.replace(/^\/private/, '');
  const wgSrc = readFileSync(wgPath, 'utf8').split('\n');
  let LN_STAT = -1, LN_UHBC = -1, LN_SURF = -1, LN_JUNC = -1, LN_UWAT = -1;
  for (let i = 0; i < wgSrc.length; i++) {
    const t = wgSrc[i]!;
    if (!t.includes('rng.reseed(gs.seed)')) continue;
    const seg = wgSrc.slice(Math.max(0, i - 1), i + 1).join(' ');
    if (LN_STAT < 0 && /▶Statues\s/.test(seg) && t.includes('rng.reseed')) LN_STAT = i + 1;
    else if (LN_UHBC < 0 && /▶UndergroundHousesAndBuriedChests/.test(seg) && t.includes('rng.reseed')) LN_UHBC = i + 1;
    else if (LN_SURF < 0 && /▶SurfaceChests/.test(seg) && t.includes('rng.reseed')) LN_SURF = i + 1;
    else if (LN_JUNC < 0 && /▶ChestsInJungleShrines/.test(seg) && t.includes('rng.reseed')) LN_JUNC = i + 1;
    else if (LN_UWAT < 0 && /▶UnderwaterChests/.test(seg) && t.includes('rng.reseed')) LN_UWAT = i + 1;
  }
  console.log(`anchors: Statues#${LN_STAT} UHBC#${LN_UHBC} Surf#${LN_SURF} Junc#${LN_JUNC} Uwat#${LN_UWAT}`);
  if (LN_UHBC < 0 || LN_SURF < 0 || LN_JUNC < 0 || LN_UWAT < 0) throw new Error('WorldGen.ts 行号锚失效——槽体注释可能被移动');

  mkdirSync(OUT, { recursive: true });
  const g = globalThis as unknown as Record<string, unknown>;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const oRoll = g.__swOnRoll as ((v: number, inst?: object) => void) | undefined;

  const vals: string[] = [];
  const evs: string[] = [];
  const sites: string[] = [];
  let winOn = false;
  let ln = 0;
  let mainInst: object | null = null;
  const instIds = new WeakMap<object, number>();
  let instSeq = 0;
  let seg = '';            // 当前段名（离线切片/逐掷站点捕获域）
  let segSites = false;    // pass-60 段逐掷站点捕获

  const instId = (o: object): number => {
    let id = instIds.get(o);
    if (id === undefined) { id = ++instSeq; instIds.set(o, id); }
    return id;
  };
  const siteOf = (): string => {
    const st = (new Error().stack ?? '').split('\n');
    let n = 0;
    const out: string[] = [];
    for (const line of st) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii170')) {
        out.push(`${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`);
        if (++n >= 2) break;
      }
    }
    return out.join(' | ');
  };

  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let siteLine = -1;
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii170')) { siteLine = Number(m[2]); break; }
    }
    if (siteLine === LN_UHBC) {
      winOn = true; ln = 0; mainInst = null; seg = 'uhbc'; segSites = false;
      vals.push('---START 58');
      console.log('[WIN] opened (uhbc)');
    } else if (siteLine === LN_SURF && winOn) {
      vals.push('---PASS 59 Buried Chests');
      seg = 'surf'; segSites = true;
      console.log(`[WIN] ---PASS 59 at ln=${ln}`);
    } else if (siteLine === LN_JUNC && winOn) {
      vals.push('---PASS 60 Surface Chests');
      seg = 'junc'; segSites = false;
      console.log(`[WIN] ---PASS 60 at ln=${ln}`);
    } else if (siteLine === LN_UWAT && winOn) {
      vals.push('---END 61 Jungle Chests Placement');
      console.log(`[WIN] ---END 61 at ln=${ln} -> close`);
      writeFileSync(`${OUT}/win-values.txt`, vals.join('\n') + '\n');
      writeFileSync(`${OUT}/win-events.txt`, evs.join('\n') + '\n');
      writeFileSync(`${OUT}/die-sites-pass60.txt`, sites.join('\n') + '\n');
      winOn = false; segSites = false;
    }
    return oReseed.call(this, s);
  };

  g.__swOnRoll = (v: number, inst?: object) => {
    if (!winOn || !inst) return;
    ln++;
    const isMain = mainInst === null ? (mainInst = inst, true) : inst === mainInst;
    vals.push(`${ln}|${v}|${isMain ? 'M' : 'X'}|${instId(inst)}`);
    if (segSites) sites.push(`${ln}|${v}|${siteOf()}`);
    if (typeof g.__swRollN !== 'undefined' || true) g.__swRollN = ln;
    oRoll?.(v, inst);
  };

  g.__swChestEv = (p: string, i: number, j: number, x?: number) => {
    if (!winOn) return;
    evs.push(`${p}|${i}|${j}|${x ?? ''}|n=${ln}`);
  };
  g.__swAbGate = (tag: string, ai: number, aj: number, extra?: number) => {
    if (!winOn) return;
    if (tag === 'land') evs.push(`land|${ai}|${aj}|${extra ?? ''}|n=${ln}`);
  };

  try {
    const w = await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: -1 as -1 | 0 | 1,
      seedFlags: { remix: true },
    });
    const chests = (w as unknown as { chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }> }).chests;
    writeFileSync(`${OUT}/js-chests-final.txt`,
      chests.map((c) => `${c.x},${c.y}|${JSON.stringify(c.items.filter(Boolean).map((i) => `${i!.id}x${i!.stack}`))}`).join('\n') + '\n');
    console.log(`[WIN] final chests=${chests.length}`);
  } finally {
    RNGp.reseed = oReseed;
    g.__swOnRoll = oRoll;
    delete g.__swChestEv; delete g.__swAbGate; delete g.__swRollN;
  }
});
