// IIII112b 一次性段内事件仪（win 埋箱段）：▶UndergroundHousesAndBuriedChests 起、
// ▶SurfaceChests 止：
//   ① 段末整 store 落盘（▶SurfaceChests 时点）→ /tmp/iii148-out/end-win/
//   ② 箱事件（placeBuriedChest 成功/拒绝+原因）→ js-chest.log（rc=掷数计镜）
//   ③ 屋事件（__swHouseGate 拒门 / __swHouseRooms 定形）→ js-house.log
// 用法：cd game && SW_I148S=1 npx vitest run tools/_iii148seg.test.ts
import { it } from 'vitest';
import { readFileSync, createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I148S === '1';
const OUT = process.env.SW_I148S_OUT ?? '/tmp/iii148-out';
const SEED = process.env.SW_I148S_SEED ?? '20260907';
const EVIL = Number(process.env.SW_I148S_EVIL ?? -1);
const FLAGS = Object.fromEntries((process.env.SW_I148S_FLAGS ?? 'worldIsFrozen')
  .split(',').filter(Boolean).map((f) => [f, true]));

const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire'] as const;

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

(RUN ? it : it.skip)('win buried segment event capture', async () => {
  mkdirSync(`${OUT}/end-win`, { recursive: true });
  const chestLog = createWriteStream(`${OUT}/js-chest.log`);
  const houseLog = createWriteStream(`${OUT}/js-house.log`);
  const linesC: string[] = [], linesH: string[] = [];
  const g = globalThis as Record<string, unknown>;
  let rc = 0;
  g.__swOnRoll = () => { rc++; };
  g.__swChestWrite = (i: number, topY: number, tile: number, style: number, fx: number) => {
    const sh = TILE_DEFS[tile]?.vanilla?.sheet ?? -1;
    linesC.push(`${rc}|W|i=${i},gy=${topY},sheet=${sh},style=${style},fx=${fx}`);
  };
  g.__swChestDbg = (i: number, gy: number, why: string) => {
    linesC.push(`${rc}|R|i=${i},gy=${gy},why=${why}`);
  };
  g.__swHouseGate = (gate: string, ox: number, oy: number) => {
    linesH.push(`${rc}|NO|gate=${gate},ox=${ox},oy=${oy}`);
  };
  g.__swHouseRooms = (ox: number, oy: number, rooms: string) => {
    linesH.push(`${rc}|RM|ox=${ox},oy=${oy},rooms=${rooms}`);
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  let live: unknown = null;
  let on = false;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    let lab = '';
    for (const line of stack.split('\n')) {
      const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
      if (m && !m[1].includes('/core/rng') && !m[1].includes('_iii148seg')) {
        lab = labelOf(m[1], Number(m[2]));
        break;
      }
    }
    if (lab === 'UndergroundHousesAndBuriedChests') {
      if (!on) { linesC.push(`${rc}|SEGSTART`); linesH.push(`${rc}|SEGSTART`); }
      on = true;
    }
    else if (lab === 'SurfaceChests' && on) {
      on = false;
      linesC.push(`${rc}|SEGEND`);
      linesH.push(`${rc}|SEGEND`);
      // 段末整 store 落盘
      const st = live as unknown as Record<string, Uint8Array | Uint16Array>;
      const hdr: Record<string, number> = { w: (st as unknown as { w: number }).w, h: (st as unknown as { h: number }).h };
      for (const c of CHANS) {
        const a = st[c]!;
        writeFileSync(`${OUT}/end-win/base_${c}.bin`, Buffer.from(a.buffer, a.byteOffset, a.byteLength));
        hdr[`${c}_len`] = a.length;
      }
      writeFileSync(`${OUT}/end-win/base_hdr.json`, JSON.stringify(hdr));
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: EVIL as -1 | 0 | 1, seedFlags: FLAGS,
      onWorldPartial: (w) => { if (!live) live = w.store; },
    });
  } finally {
    RNGp.reseed = oReseed;
    delete g.__swOnRoll;
    delete g.__swChestWrite;
    delete g.__swChestDbg;
    delete g.__swHouseGate;
    delete g.__swHouseRooms;
  }
  chestLog.write(linesC.join('\n') + '\n');
  houseLog.write(linesH.join('\n') + '\n');
  await new Promise<void>((res) => { chestLog.end(res); houseLog.end(); });
  console.log(`chest events=${linesC.length} house events=${linesH.length} rc=${rc} -> ${OUT}`);
}, 900_000);
