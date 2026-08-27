// QQQQQQQQ：m 链 mile8 克隆 + 箱事件监听（__swChestEv/__swChestDbg 全程打印）
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';

(it as never as { skip?: boolean });
const RUN = process.env.SW_QM === '1';
(RUN ? it : it.skip)('m-chain chest event trace', async () => {
  const g = globalThis as Record<string, unknown>;
  const evs: string[] = [];
  g.__swChestEv = (p: string, i: number, j: number, x?: number) => {
    evs.push(`${p} ${i},${j}${p === 'abx' ? '=' + x : ''}`);
  };
  g.__swChestDbg = (i: number, gy: number, why: string) => evs.push(`dbg ${i},${gy} <- ${why}`);
  const writes: string[] = [];
  g.__swJCDebug = () => true;
  g.__swChestWrite = (i: number, topY: number, tile: number, style: number, fx: number) => {
    if (i > 4680 && i < 4800 && topY > 680 && topY < 760) {
      console.log(`>>write ${i},${topY} t${tile} sty${style} fx${fx}`);
    }
    void writes;
  };
  let worldRef: unknown = null;
  const partialHookOrig = undefined;
  try {
    await generateWorld({
      onWorldPartial: ((w: unknown, idx: number) => {
        if (idx >= 105) {
          const ww = w as { store?: unknown };
          void ww;
          // 记录最终世界引用
          worldRef = w;
        }
      }) as never,
      width: Number(process.env.SW_QM_W ?? 6400), height: Number(process.env.SW_QM_H ?? 1800),
      seedText: process.env.SW_QM_SEED ?? '20260811',
      evil: Number(process.env.SW_QM_EVIL ?? 0) as -1 | 0 | 1,
      ...(process.env.SW_QNOFLAG ? {} : { seedFlags: { ...(process.env.SW_QM_FLAGS ? JSON.parse(process.env.SW_QM_FLAGS) : {}) } }),
    } as never);
  } finally {
    // 只打 Jungle Chests Placement 相邻段（pass 头重置后连续段不可辨——按坐标过滤）
    const rel = evs.filter((l) => {
      if (!/^ab|^abx|^dbg/.test(l)) return false;
      const m = l.match(/\s(\d+),(\d+)/);
      if (!m) return false;
      const x = Number(m[1]), y = Number(m[2]);
      return x > 4200 && x < 5200 && y > 500 && y < 1500;
    });
    console.log(`total=${evs.length} related=${rel.length}`);
    console.log(rel.join('\n'));
    // 终态地图（若拿到 world 引用）
    const wr = worldRef as null | { store: { type: Uint16Array; flags: Uint8Array; idx: (x: number, y: number) => number } };
    if (wr?.store?.idx) {
      const { store } = wr;
      for (let y = 738; y <= 746; y++) {
        let line = `y=${y} `;
        for (let x = 4732; x <= 4742; x++) {
          const ii = store.idx(x, y);
          const SHEETL = (t: number) => (t < 4000 ? -999 : t); // 占位，下面直接用 TILE_DEFS sheet
          void SHEETL;
          line += `${store.flags[ii] ? String(store.type[ii]).padStart(4) : '   .'}`;
        }
        console.log(line);
      }
      console.log('内部 id 直读（映射 vanilla 需查表）：');
    }
    void partialHookOrig;
  }
}, 600000);
