// IIII198: 导线注入实验——slot57 末把 x86 w.wld 的 wire 位注入 JS store,
// 观测 #105 罐杀/苔藓/泡泡分歧是否坍缩(=wire 门假说判定)。
import { it as itRaw } from 'vitest';
// ★IIIII229(⑩ 212 章 M3 门控卫生批):一次性仪默认 skip,不在常态 vitest 收集执行面;用法 SW_I198INJECT=1 npx vitest run tools/_iii198inject.test.ts
const RUN = process.env.SW_I198INJECT === '1';
const it = RUN ? itRaw : itRaw.skip;

import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

it('iii198 wire injection', async () => {
  const buf = readFileSync('/Users/vinlic/GoldenChains/i106/x86-iamerror/w.wld');
  const wld = parseWld(new Uint8Array(buf.buffer, buf.byteOffset));
  const tw = wld.tilesWide;
  let injected = 0;
  await generateWorld({
    width: 4200, height: 1200, seedText: '1.1.1.0.iamerror|106103', evil: -1,
    seedFlags: {},
    onWorldPartial: (w, i) => {
      if (i !== 57) return;
      const st = w.store as unknown as { wire: Uint8Array; w: number };
      for (let y = 0; y < 1200; y++) for (let x = 0; x < 4200; x++) {
        const iv = y * tw + x;
        st.wire[y * 4200 + x] = wld.tiles.wire[iv];
        injected++;
      }
      console.log(`[inj] injected ${injected} wire bytes at slot57 end`);
    },
  });
  // 本测试只看 mile8 式聚合——直接对拍 x86 dump:
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) { const s = TILE_DEFS[i]?.vanilla?.sheet; if (typeof s === 'number') SHEET[i] = s; }
  // 简化:重跑成本高,这里不重复聚合——聚合由后续 mile8 跑;此处保存快照供 _iii198diff 用
  console.log('[inj] done');
}, 900_000);
