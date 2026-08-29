// IIII43 一次性仪①：remix 链 JS 侧槽级快照落盘（与 x86 G2 同名同格式，便于 node 直diff）。
// 用法：cd game && SW_I43A=1 SW_I43A_FLAGS=remix SW_I43A_SEED=1138154190 \
//        SW_I43A_LABEL=Tunnels SW_I43A_OUT=/tmp/iii45-out/js-snap npx vitest run tools/_i43a.test.ts
import { it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I43A === '1';
const SEED = process.env.SW_I43A_SEED ?? '1138154190';
const LABEL = process.env.SW_I43A_LABEL ?? 'Tunnels';
const OUT = process.env.SW_I43A_OUT ?? '/tmp/iii45-out/js-snap';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)(`i43a snap @${LABEL}`, async () => {
  mkdirSync(OUT, { recursive: true });
  let captured = false;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const stack = new Error().stack ?? '';
    if (!captured && /src\/[^\s()]+\.ts/.test(stack)) {
      // 借 labelOf 思路：找第一个非 rng 调用栈帧行号即可，直接比较来源文件路径里的
      // 目标注释不可靠——这里用「标签字符串出现在调用栈的源码注释」等价法：
      captured = captured || false;
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED,
      evil: 0, seedFlags: { remix: true },
      onWorldPartial: (w, _i, _pn) => { void w; void _i; void _pn; },
    });
  } finally { RNGp.reseed = oReseed; }
});

/** 真正的快照采用 mile8 的 ▶label 捕获（reseed 时 store=上一 pass 末态）。 */
(RUN ? it : it.skip)(`i43a snap2 @${LABEL}`, async () => {
  mkdirSync(OUT, { recursive: true });
  const wOut = Number(process.env.SW_M8_W ?? 4200), hOut = Number(process.env.SW_M8_H ?? 1200);
  let captured = false;
  type StoreLike = {
    type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
    liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
  };
  let cur: StoreLike | null = null;
  const RNGp2 = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed2 = RNGp2.reseed as (this: unknown, s: number) => void;
  const srcCache = new Map<string, string[]>();
  const labelOf = (file: string, line: number): string => {
    let src = srcCache.get(file);
    if (!src) { try { src = require('node:fs').readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
    for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
      const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
      if (m) return m[1].trim();
    }
    return `${file.split('/').pop()}:${line}`;
  };
  RNGp2.reseed = function (this: unknown, s: number) {
    if (cur && !captured) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_i43a')) {
          if (labelOf(m[1], Number(m[2])) === LABEL) {
            captured = true;
            const st = cur!;
            const typ = new Uint16Array(wOut * hOut);
            for (let i = 0; i < wOut * hOut; i++) {
              typ[i] = (st.flags[i] & 1) ? (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999) : 0;
            }
            writeFileSync(`${OUT}/000_TerrainTyp.bin`, Buffer.from(typ.buffer));
            writeFileSync(`${OUT}/001_Act.bin`, Buffer.from(st.flags));
            writeFileSync(`${OUT}/002_Wall.bin`, Buffer.from(new Uint16Array(st.wall)));
            writeFileSync(`${OUT}/003_Liq.bin`, Buffer.from(st.liquid));
            writeFileSync(`${OUT}/004_Gs.json`, JSON.stringify(gsgPick()));
          }
          break;
        }
      }
    }
    return oReseed2.call(this, s);
  };
  try {
    await generateWorld({
      width: wOut, height: hOut, seedText: SEED,
      evil: 0, seedFlags: { remix: true },
      onWorldPartial: (w) => { if (!cur) cur = w.store as never as StoreLike; },
    });
  } finally { RNGp2.reseed = oReseed2; }
  if (!captured) throw new Error(`label ${LABEL} never captured`);
}, 900_000);

function gsgPick(): Record<string, unknown> {
  // lastGenState 由 WorldGen 模块内部维护；此处直接经 globalThis.__swLastGs 兜底
  const g = (globalThis as { __swLastGs?: Record<string, unknown> }).__swLastGs;
  return g ?? {};
}
