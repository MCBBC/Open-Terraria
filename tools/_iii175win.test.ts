// IIII175 批一次性取证仪（源=_iii170win 克隆，窗=[Water..Spider]）：REMIX #62
//   Water_Chests 10 箱错位首骰分叉 + Spider 段对照。窄窗版（UHBC/Surf/Junc 三段已由
//   IIII170 批 js/win-values.txt 全量在案，本仪不重采）。
//   窗=▶UnderwaterChests reseed 开（---PASS 61 Jungle Chests Placement,x86 AfterPass(61)
//   同界）→ ▶SpiderCaves reseed 记 ---PASS 62 Water Chests（+箱面/液面快照）→
//   ▶DirtWallCleanup reseed 记 ---END 63 Spider Caves 并关窗。兜底：generateWorld 返回
//   后窗未关也落盘（防上游槽 reseed 缺失时 worker OOM）。
// 值行格式 `ln|value|M|instId`；事件行 ab/abx/g|tag/lend；pass62 段逐掷附站点。
// 用法：cd game && SW_I175WIN=1 npx vitest run tools/_iii175win.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I175WIN === '1';
const OUT = process.env.SW_I175_OUT ?? '/tmp/iii175-out/js';
const SEED = process.env.SW_I175_SEED ?? '1138154190';

(RUN ? it : it.skip)('iii175 remix Water..Spider window value stream', { timeout: 900_000 }, async () => {
  const wgPath = new URL('../src/world/gen/WorldGen.ts', import.meta.url).pathname.replace(/^\/private/, '');
  const wgSrc = readFileSync(wgPath, 'utf8').split('\n');
  let LN_UWAT = -1, LN_SPIDER = -1, LN_DWC = -1;
  for (let i = 0; i < wgSrc.length; i++) {
    const t = wgSrc[i]!;
    if (!t.includes('rng.reseed')) continue;
    const seg = wgSrc.slice(Math.max(0, i - 1), i + 1).join(' ');
    if (LN_UWAT < 0 && /▶UnderwaterChests/.test(seg)) LN_UWAT = i + 1;
    else if (LN_SPIDER < 0 && /▶SpiderCaves/.test(seg)) LN_SPIDER = i + 1;
    else if (LN_DWC < 0 && /▶DirtWallCleanup/.test(seg)) LN_DWC = i + 1;
  }
  console.log(`anchors: Uwat#${LN_UWAT} Spider#${LN_SPIDER} DWC#${LN_DWC}`);
  if (LN_UWAT < 0 || LN_SPIDER < 0 || LN_DWC < 0) throw new Error('WorldGen.ts 行号锚失效');

  mkdirSync(OUT, { recursive: true });
  const g = globalThis as unknown as Record<string, unknown>;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const oRoll = g.__swOnRoll as ((v: number, inst?: object) => void) | undefined;

  let valsF = `${OUT}/win-values.txt`;
  let evsF = `${OUT}/win-events.txt`;
  let sitesF = `${OUT}/die-sites-pass62.txt`;
  try { appendFileSync(valsF, '---RUN\n'); } catch { /* new */ }
  const vals: string[] = [];
  const evs: string[] = [];
  const sites: string[] = [];
  let flushed = 0;
  const flush = (): void => {
    if (vals.length) { appendFileSync(valsF, vals.splice(0).join('\n') + '\n'); flushed++; }
    if (evs.length) appendFileSync(evsF, evs.splice(0).join('\n') + '\n');
    if (sites.length) appendFileSync(sitesF, sites.splice(0).join('\n') + '\n');
  };
  let curStore: unknown = null;
  let winOn = false;
  let ln = 0;
  let mainInst: object | null = null;
  const instIds = new WeakMap<object, number>();
  let instSeq = 0;
  let segSites = false;

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
    console.log(`[SNAP] ${tag} liquid/liqtype dumped w=${stt.w} h=${stt.h}`);
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

  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let siteLine = -1;
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii175')) { siteLine = Number(m[2]); break; }
    }
    if (winOn) mainInst = null;
    if (siteLine === LN_UWAT) {
      winOn = true; ln = 0; mainInst = null; segSites = true;
      vals.push('---PASS 61 Jungle Chests Placement');
      console.log('[WIN] opened (water)');
    } else if (siteLine === LN_SPIDER && winOn) {
      vals.push('---PASS 62 Water Chests');
      segSites = false;
      console.log(`[WIN] ---PASS 62 at ln=${ln}`);
      try { chestSnap('pass62end'); liquidSnap('pass62end'); } catch (e) { console.log(`[SNAP] failed ${e}`); }
      flush();
    } else if (siteLine === LN_DWC && winOn) {
      vals.push('---END 63 Spider Caves');
      console.log(`[WIN] ---END 63 at ln=${ln} -> close`);
      flush();
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
    g.__swRollN = ln;
    if (vals.length >= 200_000) flush();
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
    if (winOn) { vals.push('---FALLBACK-CLOSE'); flush(); winOn = false; }
    const chests = (w as unknown as { chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }> }).chests;
    writeFileSync(`${OUT}/js-chests-final.txt`,
      chests.map((c) => `${c.x},${c.y}|${JSON.stringify(c.items.filter(Boolean).map((i) => `${i!.id}x${i!.stack}`))}`).join('\n') + '\n');
    console.log(`[WIN] final chests=${chests.length} flushes=${flushed}`);
  } finally {
    flush();
    RNGp.reseed = oReseed;
    g.__swOnRoll = oRoll;
    delete g.__swChestEv; delete g.__swAbGate; delete g.__swRollN;
  }
});
