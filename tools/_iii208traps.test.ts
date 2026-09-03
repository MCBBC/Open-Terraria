// IIII208 批一次性取证仪②：GFB #76 Traps 域细粒度定位。
// 借 TrapsPass 既有三仪（__swTrapHm 阶段标 / __swTntEv TNT 流 / __swTrapEv placeTrap 流）
// 在每阶段末 dump 探针格 (978,413)/(979,412)/(324,545) 邻域 → js-trapstages.txt；
// 全事件流 → js-trapsev.txt（cap 400k 行）。
// 用法：cd game && SW_I208TRAPS=1 SW_I208_OUT=/tmp/iii208-out npx vitest run tools/_iii208traps.test.ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';

const RUN = process.env.SW_I208TRAPS === '1';
const OUT = process.env.SW_I208_OUT ?? '/tmp/iii208-out';
const SEED = process.env.SW_I208_SEED ?? '9293480';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('iii208 traps stage probes', { timeout: 1_800_000 }, async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  mkdirSync(OUT, { recursive: true });
  const stageLines: string[] = [];
  const evLines: string[] = [];
  let store: TileStore | null = null;
  let stage = 'pre';

  const dumpCells = (tag: string): string => {
    if (!store) return `${tag}: no store`;
    const lines: string[] = [`${tag}`];
    const probe = (x: number, y: number): string => {
      const i = store!.idx(x, y);
      return `(${x},${y}) sh=${SHEET[store!.type[i]]} actv=${store!.flags[i] & 1} sl=${store!.slope[i]} hf=${store!.half[i]} inact=${(store!.wire[i] >>> 5) & 1} paint=${store!.paint[i]}`;
    };
    for (let y = 408; y <= 417; y++) {
      const row: string[] = [];
      for (let x = 974; x <= 984; x++) {
        const i = store.idx(x, y);
        row.push(`${SHEET[store.type[i]]}/${store.flags[i] & 1}/${store.slope[i]}/${store.half[i]}`);
      }
      lines.push(`y=${y}: ${row.join(' ')}`);
    }
    lines.push(probe(324, 545), probe(325, 545), probe(324, 546), probe(325, 546));
    return lines.join('\n');
  };

  (g as { __swTrapHm?: unknown }).__swTrapHm = (l: string) => {
    if (l === 'traps-head' || l === 'traps-post-mainloop' || l === 'traps-post-tnt' || l === 'traps-sand-head' || l === 'traps-post-sand') {
      stage = l;
      stageLines.push(dumpCells(`== stage ${l} ==`));
    } else {
      stage = l;
    }
  };
  (g as { __swTntEv?: unknown }).__swTntEv = (m: string) => {
    if (evLines.length < 300_000) evLines.push(`TNT[${stage}] ${m}`);
  };
  (g as { __swTrapEv?: unknown }).__swTrapEv = (kind: string, a: number, b: number, v: number) => {
    // 主循环事件量巨大且非本批疑点——只留非主循环段（TNT 段/沙穴段）事件
    if (evLines.length < 300_000 && !stage.startsWith('traps-main')) evLines.push(`TRP[${stage}] ${kind} ${a} ${b} ${v}`);
  };

  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: 0 as -1 | 0 | 1,
      seedFlags: { remix: true, drunkWorld: true, notTheBees: true, noTraps: true, theConstant: true, tenthAnniversary: true, getGoodWorld: true },
      onWorldPartial: (w2) => { store = (w2 as unknown as { store: TileStore }).store; },
    });
  } finally {
    stageLines.push(dumpCells('== final =='));
    writeFileSync(`${OUT}/js-trapstages.txt`, stageLines.join('\n') + '\n');
    writeFileSync(`${OUT}/js-trapsev.txt`, evLines.join('\n') + '\n');
    (g as { __swTrapHm?: unknown }).__swTrapHm = undefined;
    (g as { __swTntEv?: unknown }).__swTntEv = undefined;
    (g as { __swTrapEv?: unknown }).__swTrapEv = undefined;
  }
});
