// IIII104b：FindBoulderTrapSpots 的 cs 直转独立复刻（不经生产类），逐列逐门 trace。
import { readFileSync, existsSync } from 'node:fs';
import { it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const BASE = process.env.SW_I135_BASE ?? '/tmp/iii133-out/js';
const W = Number(process.env.SW_I135_W ?? 4200);

function hydrate(): TileStore {
  const hdr = JSON.parse(readFileSync(`${BASE}/base_hdr.json`, 'utf8'));
  const st = new TileStore(hdr.w as number, hdr.h as number);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType',
    'half', 'slope', 'wire', 'paint', 'paintWall', 'coat'] as const;
  for (const c of CHANS) {
    const len = hdr[`${c}_len`] as number;
    const buf = readFileSync(`${BASE}/base_${c}.bin`);
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(new (bytesPer === 2 ? Uint16Array : Uint8Array)(buf.buffer, buf.byteOffset, len));
  }
  return st;
}

// 工件自跳守卫(2026-09-13):吃 worldgen rig 会话工件(SW_I135_BASE,缺省 /tmp/iii133-out/js);
//  缺失时干净跳过而非 ENOENT 挂红——工件重产/设 env 后照跑。
it.skipIf(!existsSync(`${BASE}/base_hdr.json`))('III135 vanilla-replica boulder scan trace', () => {
  const st = hydrate();
  // ---- 表直转（本文件独立于 MicroBiomesPass.ts，全部从 cs 文本重写）----
  // Main.tileFrameImportant —— 用 framed 字段；Main.tileSolid —— solid；
  // TileID.Sets.IsAContainer={21,467,88};CanDuringGen-false 集（TileID.cs:321）:
  const NOT_CLEAR_SHEETS = new Set([396, 400, 401, 397, 398, 399, 404, 368, 367, 41, 43, 44, 481, 482, 483, 226, 237]);
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const INTERNAL_NOT_CLEAR = (() => {
    const s = new Set<number>();
    for (let i = 0; i < TILE_DEFS.length; i++) if (NOT_CLEAR_SHEETS.has(SHEET[i])) s.add(i);
    return s;
  })();
  const INTERNAL_CONTAINER = (() => {
    const s = new Set<number>();
    for (let i = 0; i < TILE_DEFS.length; i++) if ([21, 467, 88].includes(SHEET[i])) s.add(i);
    return s;
  })();
  const INTERNAL_BOULDER_FORBID_EXTRA = (() => {
    // cs: box 内禁 container||12||665||639 ——12 为 ore 背景板? 逐 sheet 反查内部 id
    const s = new Set<number>();
    for (let i = 0; i < TILE_DEFS.length; i++) if ([12, 665, 639].includes(SHEET[i])) s.add(i);
    return s;
  })();
  void INTERNAL_BOULDER_FORBID_EXTRA;

  const act = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
    return st.flags[st.idx(x, y)] !== 0;
  };
  const tileType = (x: number, y: number): number => st.type[st.idx(x, y)];

  /** cs FindBoulderTrapSpot_CheckSpot(position=(px,py),yPush):返回 true=入列 */
  function checkSpot(px: number, py: number, trace: string[]): string | null {
    // 第一箱体 (X..X+1, Y-4..Y)
    const counts = new Map<number, number>();
    for (let i = px; i < px + 2; i++) {
      for (let j = py - 4; j <= py; j++) {
        if (!act(i, j)) continue;
        const t = tileType(i, j);
        if (!TILE_DEFS[t]?.framed && TILE_DEFS[t]?.solid) counts.set(t, (counts.get(t) ?? 0) + 1);
        if (INTERNAL_NOT_CLEAR.has(t)) return `g1-notclear@(${i},${j})`;
        if (INTERNAL_CONTAINER.has(t)) return `g1-container@(${i},${j})`;
      }
    }
    // 第二箱体 k=X-1..X+2(含), l=Y-5..Y-2(含): 非活 或 container → 拒
    for (let k = px - 1; k <= px + 2; k++) {
      for (let l = py - 5; l <= py - 2; l++) {
        if (!act(k, l)) return `g2-inactive@(${k},${l})`;
        if (INTERNAL_CONTAINER.has(tileType(k, l))) return `g2-container@(${k},${l})`;
      }
    }
    // 下行双格活箱门(cs: tile[x,Y+1]&tile[X+1,Y+1] 均 active → 拒)
    if (act(px, py + 1) && act(px + 1, py + 1)) return `g3-belowboth`;
    // 第三箱体 m=X-2..X+3(含), n=Y-6..Y-1(含): active&&(container||12||665||639) → 拒
    for (let m = px - 2; m <= px + 3; m++) {
      for (let n = py - 6; n <= py - 1; n++) {
        if (!act(m, n)) continue;
        const t = tileType(m, n);
        if (INTERNAL_CONTAINER.has(t) || [SHEET[t]].some(v => v === 12 || v === 665 || v === 639)) {
          return `g4-forbid@(${m},${n})sheet=${SHEET[t]}`;
        }
      }
    }
    let best = -1;
    for (const t of [...counts.keys()].sort((a, b) => a - b)) {
      if (best === -1 || (counts.get(best) ?? 0) < (counts.get(t) ?? 0)) best = t;
    }
    return `OK best=${best}(sheet${SHEET[best]}) counts=${JSON.stringify([...counts.entries()])}`;
  }

  /** cs FindBoulderTrapSpot((x,num3)):向上扫首个 active */
  function scanColumn(x: number, num3: number, trace: string[]): string {
    for (let i = 0; i < 50; i++) {
      if (act(x, num3 - i)) {
        const r = checkSpot(x, num3 - i, trace);
        return `col ${x}: hit (${x},${num3 - i}) yPush=${i} -> ${r}`;
      }
      trace.push(`  col${x} y=${num3 - i} inactive`);
    }
    return `col ${x}: no-active-within-50 (top y=${num3 - 49})`;
  }

  for (const SITE of process.env.SW_I135_VANSITES ? JSON.parse(process.env.SW_I135_VANSITES) : [[2113, 677], [1983, 859]]) {
    const [ox, oy] = SITE as [number, number];
    console.log(`=== vanilla-replica @chest(${ox},${oy}) py=${oy + 1} num3=${oy + 1 - 6} ===`);
    for (const num of [2, 3, 4]) {
      for (const num2 of [2, 3, 4]) {
        let x = ox - Math.trunc(num / 2) * num2;
        const lines: string[] = [];
        let any = false;
        for (let i = 0; i <= num; i++, x += num2) {
          const r = scanColumn(x, oy + 1 - 6, lines);
          if (r.includes('-> OK')) { any = true; console.log(`  (${num},${num2}) ${r}`); }
          else if (process.env.SW_I135_VERBOSE) console.log(`  (${num},${num2}) ${r}`);
        }
        console.log(`  ==> (${num},${num2}) any=${any}`);
      }
    }
    // 该箱正上方全量地形 dump（±16 列 × y[oy-60,oy]）粗样
    if (process.env.SW_I135_VERBOSE) {
      for (let x = ox - 20; x <= ox + 20; x += 4) {
        let top = -1;
        for (let dy = 0; dy < 70; dy++) { if (act(x, oy + 1 - dy)) { top = oy + 1 - dy; break; } }
        console.log(`  colmap x=${x} firstActiveUpIn70=${top}`);
      }
    }
  }
}, 600_000);
