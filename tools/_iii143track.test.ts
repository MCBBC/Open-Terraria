// IIII110b:FTW 标准短轨三分支逐值账本(JS 侧镜像 SW_TRKLOG 口径)——
// hydrate 基座(_iii135replay 同口径)+ runMicroBiomesPass 重放。
// 掷流经 globalThis.__swOnRoll(raw 值,UnifiedRandom.internalSample 统一漏斗)
// == x86 JJHook.OnRoll 同位(值/序可比)。事件流与 rig 补丁面同构
// (KTI/KTO 仅顶层清巷击杀,递归链不发——化石 404/堆 2x1/宝石 frame178 内层抑制):
//   T|ATT|x,y|mm=min,max|rc=<累计>|ok=
//   E|KTI|x,y|t=<vanillaSheet>|w=|fy=|rc=<进入前累计>
//   E|KTO|x,y|d=<该格掷数>
// 落盘 $SW_I143_OUT/js-trk.txt(缺省 /tmp/iii143-out)。
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { runMicroBiomesPass } from '../src/world/gen/vanilla/MicroBiomesPass';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { TrackGenerator } from '../src/world/gen/vanilla/TrackPass';

const BASE = process.env.SW_I135_BASE ?? '/tmp/iii133-out/js';
const SEED = Number(process.env.SW_I135_SEED ?? '1671560105');
const OUT = process.env.SW_I143_OUT ?? '/tmp/iii143-out';

const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[i] = s;
}

it('III143 JS track ledger', () => {
  const hdr = JSON.parse(readFileSync(`${BASE}/base_hdr.json`, 'utf8'));
  const stl = new TileStore(hdr.w as number, hdr.h as number);
  const rec = stl as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType',
    'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${BASE}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer.slice(buf.byteOffset, buf.byteOffset + len * bytesPer)));
  }
  try {
    restoreGenSolid(new Map(JSON.parse(readFileSync(`${BASE}/base_gensolid.json`, 'utf8')) as Array<[number, boolean]>));
  } catch { /* none */ }
  const gs = JSON.parse(readFileSync(`${BASE}/base_gs.json`, 'utf8')) as unknown as GenState;
  const chests = JSON.parse(readFileSync(`${BASE}/base_chests.json`, 'utf8'));

  const rows: string[] = [];
  let drawIdx = 0;
  let tag = '-';
  let ktDepth = 0;                      // >0 = 已在顶层 KillTile 子树内
  const g = globalThis as { __swOnRoll?: unknown };
  const oRoll = g.__swOnRoll;

  g.__swOnRoll = (value: number): void => {
    rows.push(`R|${drawIdx}|${value}|${tag}`);
    drawIdx++;
  };

  const TP = TrackGenerator.prototype as unknown as Record<string | symbol, ((...a: unknown[]) => unknown) & { __i143?: boolean }>;

  // ---- killTileLane 专用包装(KTI/KTO 仅顶层;d=本次顶层调用掷差) ----
  {
    const origKt = TP['killTileLane'];
    Object.defineProperty(TP, 'killTileLane', {
      value: function (this: unknown, ...a: unknown[]) {
        const isTop = ktDepth === 0;
        let emitted = false;
        let r0 = 0;
        const x = a[1] as number, y = a[2] as number;
        const oldTag = tag;
        if (isTop) {
          ktDepth++;
          r0 = drawIdx;
          if (stl.inBounds(x, y)) {
            const i = stl.idx(x, y);
            if (stl.flags[i] !== 0) {                       // !active 早退零掷零事件(rig 同构无行)
              const sheet = SHEET_OF[stl.type[i]!] ?? -1;
              rows.push(`E|KTI|${x},${y}|t=${sheet}|w=${stl.wall[i]}|fy=${stl.frameY[i]}|rc=${r0}`);
              emitted = true;
              tag = 'KT';
            }
          }
        }
        try {
          return (origKt as (...z: unknown[]) => void).apply(this, a);
        } finally {
          if (isTop) {
            ktDepth--;
            tag = oldTag;
            if (emitted) rows.push(`E|KTO|${x},${y}|d=${drawIdx - r0}`);
          }
        }
      },
      writable: true, configurable: true,
    });
    (origKt as unknown as { __i143?: boolean }).__i143 = true;
  }

  // ---- 通用包装(带 tag 切换与进入行) ----
  const wrapFn = (name: string, onEnter: ((args: unknown[], self: unknown, r0: number) => string | null) | null,
    tagSet: string | null): void => {
    const orig = TP[name];
    if (!orig || orig.__i143) return;
    Object.defineProperty(TP, name, {
      value: function (this: unknown, ...args: unknown[]) {
        const r0 = drawIdx;
        const enterLine = onEnter?.(args, this, r0) ?? null;
        if (enterLine !== null) rows.push(enterLine);
        const oldTag = tagSet !== null ? tag : null;
        if (tagSet !== null) tag = tagSet;
        try {
          return orig.apply(this, args);
        } finally {
          if (tagSet !== null) tag = oldTag as string;
        }
      },
      writable: true, configurable: true,
    });
    orig.__i143 = true;
  };

  wrapFn('attemptFossilShatter', () => 'E|FOS', 'FOS');
  wrapFn('squareFrameTrack', (a, _s, r0) => `E|KSQ|${a[1]},${a[2]}|rc=${r0}`, 'SQ');
  wrapFn('wuTileFrame', null, 'TF');
  wrapFn('smoothSlope', (a) => `E|SS|${a[0]},${a[1]},nb=${a[2]}`, 'SS');

  // place(ox,oy,min,max,rng):ATT 行(rc 用完成后累计)
  wrapFn('place', null, null);
  {
    const wrappedPlace = TP['place'];
    TP['place'] = function (this: unknown, ...a: unknown[]): boolean {
      const ok = (wrappedPlace as (...x: unknown[]) => boolean).apply(this, a);
      rows.push(`T|ATT|${a[0]},${a[1]}|mm=${a[2]},${a[3]}|rc=${drawIdx}|ok=${ok ? 1 : 0}`);
      return ok;
    } as never;
  }

  try {
    runMicroBiomesPass(stl, rng0(), gs, chests as never);
  } finally {
    writeFileSync(`${OUT}/js-trk.txt`, rows.join('\n') + '\n');
    console.log(`I143 ledger rows=${rows.length} draws=${drawIdx} -> ${OUT}/js-trk.txt`);
    const atts = rows.filter((r) => r.startsWith('T|ATT'));
    console.log(`ATT rows=${atts.length} last5=[${atts.slice(-5).join(' ; ')}]`);
    console.log(`TARGET ATT row: ${atts.find((r) => r.startsWith('T|ATT|824,946')) ?? '(none)'}`);
    g.__swOnRoll = oRoll;
  }
}, 900_000);

function rng0(): RNG {
  return new RNG(SEED);
}
