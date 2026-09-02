// IIII175 批一次性取证仪（源=_iii170win 克隆，窗=[UHBC..Spider]）：REMIX #62
//   Water_Chests 10 箱错位首骰分叉 + UHBC 尾 Δ6 + Junc 尾 Δ1 三账并采。
//   窗=▶UndergroundHousesAndBuriedChests reseed 开（---START 58,x86 AfterPass(58) 同界）→
//   ▶SurfaceChests reseed 记 ---PASS 59 Buried Chests → ▶ChestsInJungleShrines reseed 记
//   ---PASS 60 Surface Chests → ▶UnderwaterChests reseed 记 ---PASS 61 Jungle Chests
//   Placement → ▶SpiderCaves reseed 记 ---PASS 62 Water Chests（+箱面/液面快照）→
//   **其后首个 reseed（=槽头 509 行 pass64 重播）记 ---END 63 Spider Caves 并关窗**
//   （GemCaves 槽头 reseed 无注释锚,按序闭合;兜底 generateWorld 返回仍开着也落盘）。
// 值行 `ln|value|M|instId`；事件 ab/abx/g|tag/lend；全段 400 行站点环形缓冲（pass 边界落盘）
//   → sites-<seg>.txt（UHBC 尾 +1 骰与 pass62 受理面取证用）。
// 用法：cd game && SW_I175WIN=1 npx vitest run tools/_iii175win.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I175WIN === '1';
const OUT = process.env.SW_I175_OUT ?? '/tmp/iii175-out/js';
const SEED = process.env.SW_I175_SEED ?? '1138154190';

(RUN ? it : it.skip)('iii175 remix UHBC..Spider window value stream', { timeout: 900_000 }, async () => {
  const wgPath = new URL('../src/world/gen/WorldGen.ts', import.meta.url).pathname.replace(/^\/private/, '');
  const wgSrc = readFileSync(wgPath, 'utf8').split('\n');
  let LN_UHBC = -1, LN_SURF = -1, LN_JUNC = -1, LN_UWAT = -1, LN_SPIDER = -1;
  for (let i = 0; i < wgSrc.length; i++) {
    const t = wgSrc[i]!;
    if (!t.includes('rng.reseed')) continue;
    const seg = wgSrc.slice(Math.max(0, i - 1), i + 1).join(' ');
    if (LN_UHBC < 0 && /▶UndergroundHousesAndBuriedChests/.test(seg)) LN_UHBC = i + 1;
    else if (LN_SURF < 0 && /▶SurfaceChests/.test(seg)) LN_SURF = i + 1;
    else if (LN_JUNC < 0 && /▶ChestsInJungleShrines/.test(seg)) LN_JUNC = i + 1;
    else if (LN_UWAT < 0 && /▶UnderwaterChests/.test(seg)) LN_UWAT = i + 1;
    else if (LN_SPIDER < 0 && /▶SpiderCaves/.test(seg)) LN_SPIDER = i + 1;
  }
  console.log(`anchors: UHBC#${LN_UHBC} Surf#${LN_SURF} Junc#${LN_JUNC} Uwat#${LN_UWAT} Spider#${LN_SPIDER}`);
  if (LN_UHBC < 0 || LN_SURF < 0 || LN_JUNC < 0 || LN_UWAT < 0 || LN_SPIDER < 0) throw new Error('WorldGen.ts 行号锚失效');

  mkdirSync(OUT, { recursive: true });
  const g = globalThis as unknown as Record<string, unknown>;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const oRoll = g.__swOnRoll as ((v: number, inst?: object) => void) | undefined;

  const valsF = `${OUT}/win-values.txt`;
  const evsF = `${OUT}/win-events.txt`;
  const vals: string[] = [];
  const evs: string[] = [];
  const RING = 400;
  const ring: string[] = [];
  let seg = '';
  const dumpRing = (): void => {
    if (ring.length) writeFileSync(`${OUT}/sites-${seg}.txt`, ring.join('\n') + '\n');
    ring.length = 0;
  };
  let curStore: unknown = null;
  let winOn = false;
  let spiderSeen = false;
  let ln = 0;
  let mainInst: object | null = null;
  const instIds = new WeakMap<object, number>();
  let instSeq = 0;

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
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii175')) {
        out.push(`${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`);
        if (++n >= 2) break;
      }
    }
    return out.join(' | ');
  };
  const liquidSnap = (tag: string): void => {
    const stt = curStore as unknown as { liquid: Uint8Array; liquidType: Uint8Array; w: number; h: number } | null;
    if (!stt) { console.log(`[SNAP] ${tag} no store`); return; }
    writeFileSync(`${OUT}/${tag}-liquid.bin`, Buffer.from(stt.liquid.buffer, stt.liquid.byteOffset, stt.liquid.length));
    writeFileSync(`${OUT}/${tag}-liqtype.bin`, Buffer.from(stt.liquidType.buffer, stt.liquidType.byteOffset, stt.liquidType.length));
    console.log(`[SNAP] ${tag} liquid/liqtype w=${stt.w} h=${stt.h}`);
  };
  const chestSnap = (tag: string): void => {
    const stt = curStore as unknown as { flags: Uint8Array; type: Uint16Array; w: number; h: number; idx: (x: number, y: number) => number } | null;
    if (!stt) { console.log(`[SNAP] ${tag} no store`); return; }
    const cells: Array<[number, number, number]> = [];
    for (let y = 0; y < stt.h; y++) {
      for (let x = 0; x < stt.w; x++) {
        const i2 = stt.idx(x, y);
        if ((stt.flags[i2]! & 1) && (stt.type[i2] === 21 || stt.type[i2] === 467)) cells.push([x, y, stt.type[i2]!]);
      }
    }
    const s = new Set(cells.map((c) => `${c[0]},${c[1]}`));
    const tl = cells.filter((c) => !s.has(`${c[0] - 1},${c[1]}`) && !s.has(`${c[0]},${c[1] - 1}`)).map((c) => `${c[0]},${c[1]}|t${c[2]}`).sort();
    writeFileSync(`${OUT}/${tag}-chests.txt`, tl.join('\n') + '\n');
    console.log(`[SNAP] ${tag} chest toplefts=${tl.length}`);
  };
  const closeWin = (marker: string): void => {
    vals.push(marker);
    dumpRing();
    writeFileSync(valsF, vals.join('\n') + '\n');
    writeFileSync(evsF, evs.join('\n') + '\n');
    vals.length = 0; evs.length = 0;
    winOn = false;
  };

  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let siteLine = -1;
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii175')) { siteLine = Number(m[2]); break; }
    }
    if (winOn) mainInst = null;
    if (siteLine === LN_UHBC) {
      winOn = true; ln = 0; mainInst = null; seg = 'uhbc'; spiderSeen = false;
      vals.push('---START 58');
      console.log('[WIN] opened (uhbc)');
    } else if (winOn && siteLine === LN_SURF) {
      vals.push('---PASS 59 Buried Chests');
      dumpRing(); seg = 'surf';
      console.log(`[WIN] ---PASS 59 at ln=${ln}`);
    } else if (winOn && siteLine === LN_JUNC) {
      vals.push('---PASS 60 Surface Chests');
      dumpRing(); seg = 'junc';
      console.log(`[WIN] ---PASS 60 at ln=${ln}`);
    } else if (winOn && siteLine === LN_UWAT) {
      vals.push('---PASS 61 Jungle Chests Placement');
      dumpRing(); seg = 'water';
      console.log(`[WIN] ---PASS 61 at ln=${ln}`);
    } else if (winOn && siteLine === LN_SPIDER) {
      vals.push('---PASS 62 Water Chests');
      dumpRing(); seg = 'spider'; spiderSeen = true;
      console.log(`[WIN] ---PASS 62 at ln=${ln}`);
      try { chestSnap('pass62end'); liquidSnap('pass62end'); } catch (e) { console.log(`[SNAP] failed ${e}`); }
    } else if (winOn && spiderSeen) {
      // SpiderCaves 后首个 reseed（=槽头 :509 pass64 重播,无注释锚）
      closeWin('---END 63 Spider Caves');
      spiderSeen = false;
      console.log(`[WIN] ---END 63 at ln=${ln} -> closed`);
    }
    return oReseed.call(this, s);
  };

  g.__swOnRoll = (v: number, inst?: object) => {
    if (!winOn || !inst) return;
    ln++;
    const isMain = mainInst === null ? (mainInst = inst, true) : inst === mainInst;
    const rec = `${ln}|${v}|${isMain ? 'M' : 'X'}|${instId(inst)}`;
    vals.push(rec);
    ring.push(`${rec} @ ${siteOf()}`);
    if (ring.length > RING) ring.shift();
    g.__swRollN = ln;
    oRoll?.(v, inst);
  };

  g.__swChestEv = (p: string, i: number, j: number, x?: number) => {
    if (!winOn) return;
    evs.push(`${p}|${i}|${j}|${x ?? ''}|n=${ln}`);
  };
  g.__swAbGate = (tag: string, ai: number, aj: number, extra?: number) => {
    if (!winOn) return;
    evs.push(`g|${tag}|${ai}|${aj}|${extra ?? ''}|n=${ln}`);
  };

  try {
    const w = await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: -1 as -1 | 0 | 1,
      seedFlags: { remix: true },
      onWorldPartial: (w2) => { curStore = (w2 as unknown as { store: unknown }).store; },
    });
    if (winOn) { closeWin('---FALLBACK-CLOSE'); console.log('[WIN] fallback close'); }
    const chests = (w as unknown as { chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }> }).chests;
    writeFileSync(`${OUT}/js-chests-final.txt`,
      chests.map((c) => `${c.x},${c.y}|${JSON.stringify(c.items.filter(Boolean).map((i) => `${i!.id}x${i!.stack}`))}`).join('\n') + '\n');
    console.log(`[WIN] final chests=${chests.length}`);
  } finally {
    if (winOn) closeWin('---FALLBACK-CLOSE-FINALLY');
    RNGp.reseed = oReseed;
    g.__swOnRoll = oRoll;
    delete g.__swChestEv; delete g.__swAbGate; delete g.__swRollN;
  }
});
