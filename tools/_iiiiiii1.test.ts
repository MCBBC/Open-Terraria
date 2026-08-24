// 一次性诊断（IIIIIII 批 2026-08-24）：CONST 链（1321365005+theConstant）Dungeon pass
// 掷流值级对拍 + 槽快照落盘。捕获：
//   ① ▶Dungeon→▶MountainCaveOpenings 窗内全部 RNG draw（a/b/d 三元组，格式同
//     /tmp/rrrrrr-out/vtup.txt——vanilla x86-1456 冻结件同窗流）→ /tmp/iii-out/jtup-iii.txt
//   ② LavaLayerCavererPass __swLL 取证钩事件（begin/loop2/end 的流位）
//   ③ 两份 8ch 快照（pre=▶Dungeon / post=▶MountainCaveOpenings）→ /tmp/iii-out/jsconst-{pre,post}.*
// 用法：cd game && SW_III=1 npx vitest run tools/_iiiiiii1.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_III === '1';
const SEED = process.env.SW_III_SEED ?? '1321365005';
const EVIL = Number(process.env.SW_III_EVIL ?? -1);
const OUT = '/tmp/iii-out';
const W = Number(process.env.SW_III_W ?? 4200), H = Number(process.env.SW_III_H ?? 1200);
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

interface Store {
  w: number; h: number; idx(x: number, y: number): number;
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
}

(RUN ? it : it.skip)('CONST chain dungeon-pass tuple log + snapshots', async () => {
  let store: Store | null = null;
  const draws: string[] = [];
  let inWin = false;            // ▶Dungeon..▶MountainCaveOpenings
  let count = 0;                // 流位（窗内）
  const llEvents: string[] = [];
  (globalThis as { __swLL?: unknown }).__swLL = (kind: string, x: number, t: number, b: number, c: number) => {
    llEvents.push(`${kind} ${count} x=${x} top=${t} bot=${b} ctr=${c}`);
  };

  const p = Object.getPrototypeOf((new RNG(1) as unknown as { vanilla: object }).vanilla) as Record<string, unknown>; // UnifiedRandom.prototype
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  const idOf = (o: unknown): number => {
    const k = o as object;
    let v = ids.get(k);
    if (v === undefined) { v = nextId++; ids.set(k, v); }
    return v;
  };
  let mainId = -1;
  const oNI = p.nextInt as (this: unknown, m: number) => number;
  const oNR = p.nextIntRange as (this: unknown, a: number, b: number) => number;
  const oND = p.nextDouble as (this: unknown) => number;
  const oNX = p.next as (this: unknown) => number;
  const oRe = (RNG.prototype as unknown as Record<string, unknown>).reseed as (this: RNG, s: number) => void;
  const logDraw = (self: unknown, line: string) => {
    if (!inWin) return;
    const id = idOf(self);
    count++;
    if (id !== mainId) { draws.push(`S${id} ${line}`); return; }
    // 主流掷附调用点（文件基名:行）——与 vanilla 源行对读用
    const st0 = new Error().stack ?? '';
    let site = '';
    for (const ln of st0.split('\n')) {
      const m = ln.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iiiiiii')) {
        site = `${m[1].split('/').pop()}:${m[2]}`;
        break;
      }
    }
    draws.push(`${line} @${site}`);
  };
  p.nextInt = function (this: unknown, m: number) {
    const v = oNI.call(this, m);
    logDraw(this, `a ${m} ${v}`);
    return v;
  };
  p.nextIntRange = function (this: unknown, a: number, b: number) {
    const v = oNR.call(this, a, b);
    logDraw(this, `b ${a},${b} ${v}`);
    return v;
  };
  p.nextDouble = function (this: unknown) {
    const v = oND.call(this);
    logDraw(this, `d ${v}`);
    return v;
  };
  p.next = function (this: unknown) {
    const v = oNX.call(this);
    logDraw(this, `x ${v}`);
    return v;
  };
  const RP = RNG.prototype as unknown as Record<string, unknown>;
  RP.reseed = function (this: RNG, s: number) {
    if (store && s === Number(SEED)) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iiiiiii')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === 'Dungeon' && !inWin) {
            oRe.call(this, s);
            mainId = idOf(this.vanilla);
            inWin = true; count = 0; snap('pre'); console.log('[win-open] ▶Dungeon mainId=', mainId);
            return;
          } else if (lab === 'MountainCaveOpenings' && inWin) {
            inWin = false;
            snap('post');
            console.log(`[win-close] ▶MountainCaveOpenings draws=${count}`);
          }
          break;
        }
      }
    }
    return oRe.call(this, s);
  };
  const snap = (tag: string) => {
    if (!store) return;
    const n = store.w * store.h;
    const typ = new Uint16Array(n);
    for (let i = 0; i < n; i++) typ[i] = SHEET[store.type[i]!] < 0 ? 9999 : SHEET[store.type[i]!]!;
    const lt = new Uint8Array(n);
    for (let i = 0; i < n; i++) lt[i] = store.liquidType[i]! > 0 ? store.liquidType[i]! - 1 : 0;
    const ia = new Uint8Array(n);
    for (let i = 0; i < n; i++) ia[i] = (store.wire[i]! >>> 5) & 1;
    writeFileSync(`${OUT}/jsconst-${tag}.typ`, Buffer.from(typ.buffer));
    writeFileSync(`${OUT}/jsconst-${tag}.act`, Buffer.from(store.flags));
    writeFileSync(`${OUT}/jsconst-${tag}.wal`, Buffer.from(new Uint16Array(store.wall).buffer));
    writeFileSync(`${OUT}/jsconst-${tag}.liq`, Buffer.from(store.liquid));
    writeFileSync(`${OUT}/jsconst-${tag}.half`, Buffer.from(store.half));
    writeFileSync(`${OUT}/jsconst-${tag}.slope`, Buffer.from(store.slope));
    writeFileSync(`${OUT}/jsconst-${tag}.lty`, Buffer.from(lt));
    writeFileSync(`${OUT}/jsconst-${tag}.inact`, Buffer.from(ia));
    console.log(`[snap] ${tag} @draws=${count}`);
  };
  p.reseed = function (this: RNG, s: number) {
    if (store && s === Number(SEED)) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_iiiiiii')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === 'Dungeon' && !inWin) { inWin = true; count = 0; snap('pre'); console.log('[win-open] ▶Dungeon'); }
          else if (lab === 'MountainCaveOpenings' && inWin) {
            inWin = false;
            snap('post');
            console.log(`[win-close] ▶MountainCaveOpenings draws=${count}`);
          }
          break;
        }
      }
    }
    return oRe.call(this, s);
  };
  const t0 = Date.now();
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      seedFlags: { theConstant: true },
      onWorldPartial: (w) => { if (!store) store = w.store as never as Store; },
    });
  } finally {
    p.nextInt = oNI; p.nextIntRange = oNR; p.nextDouble = oND;
    (RNG.prototype as unknown as Record<string, unknown>).reseed = oRe;
    delete (globalThis as { __swLL?: unknown }).__swLL;
  }
  writeFileSync(`${OUT}/jtup-iii.txt`, draws.join('\n'));
  writeFileSync(`${OUT}/ll-iii.txt`, llEvents.join('\n'));
  console.log(`draws=${draws.length} llEvents=${llEvents.length} done ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}, 600_000);
