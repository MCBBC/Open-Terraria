// HHHH 批一次性探针：链内 statues 入口快照（__swStatCap 钩子，含 GenSolid 态）→ 重播
// runStatuesPass 于副本（记录 RNG 掷序）→ /tmp/hhhh-js-stt.log。用后即删。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { runStatuesPass } from '../src/world/gen/vanilla/StatuesPass';
import { snapshotGenSolid, restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

const snap = { st: null as TileStore | null, gs: null as GenState | null, solid: null as Map<number, boolean> | null };
(globalThis as Record<string, unknown>).__swStatCap = (gs: GenState, st: TileStore) => {
  const c = new TileStore(st.w, st.h);
  c.type.set(st.type); c.flags.set(st.flags); c.wall.set(st.wall);
  c.liquid.set(st.liquid); c.slope.set(st.slope); c.half.set(st.half);
  c.liquidType.set(st.liquidType);
  snap.st = c; snap.gs = gs; snap.solid = snapshotGenSolid();
};

it('statue trace', () => {
  chainCheckpoints('9293480', 0);   // 链跑到尾（钩子在 statues 入口抓快照）
  const st = snap.st!, gs = snap.gs!;
  restoreGenSolid(snap.solid!);     // 还原 statues 时点的 gen-solid 翻转态
  const base = new RNG(9293480);    // ≡ statues pass 头 replay()
  const log: string[] = [];
  const rng = {
    int(a: number, b: number): number {
      const v = base.int(a, b);
      log.push(`int(${a},${b})=${v}`);
      return v;
    },
    next(): number { return base.next(); },
    reseed(): void { /* no-op */ },
  } as unknown as RNG;
  runStatuesPass(st, rng, gs);
  writeFileSync('/tmp/hhhh-js-stt.log', log.join('\n') + '\n');
  console.log(`rolls logged: ${log.length}`);
}, 600000);
