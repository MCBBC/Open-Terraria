// 一次性诊断（SSSSSS-NOTRAPS 批）：JS notraps 世界稀疏对象计数 vs 侦察金标
// （/tmp/notraps86/nt-recon-result.json van_notraps.famCount）。流稳健签名——
// mile8 槽对拍被并行会话 hellfort 在途域污染时的替代验收。
// 用法：cd game && SW_SSSS=1 npx vitest run tools/_ssssss-count.test.ts
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const RUN = process.env.SW_SSSS === '1';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('notraps famCount', async () => {
  const world = await generateWorld({
    width: 4200, height: 1200, seedText: '1896728457', evil: 1,
    seedFlags: { noTraps: true },
  });
  const st = world.store;
  const N = st.w * st.h;
  const fam: Record<string, number> = {};
  const want = [135, 137, 141, 443, 654, 105, 21, 467, 138, 484, 664, 665, 711, 712, 713, 714, 715, 716, 12];
  for (const s of want) fam[`t${s}`] = 0;
  let wireRed = 0, actuator = 0;
  for (let i = 0; i < N; i++) {
    if (st.flags[i]) {
      const s = SHEET[st.type[i]]!;
      if (fam[`t${s}`] !== undefined) fam[`t${s}`]!++;
    }
    if (st.wire[i] & 1) wireRed++;
    if ((st.wire[i] >>> 4) & 1) actuator++;
  }
  const gasId = VANILLA_ITEM_KEY_BY_ID[5346] ? ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[5346]!] ?? -1 : -1;
  let gasChests = 0;
  for (const c of world.chests) {
    if (c.items.some((it) => it && it.id === gasId)) gasChests++;
  }
  // 死箱残数（(D) 后仍为 467@fx144&fy0 且无线——vanilla 4）
  let deadLeft = 0;
  for (let y = 0; y < st.h - 1; y++) {
    for (let x = 0; x < st.w - 1; x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && SHEET[st.type[i]] === 467 && st.frameX[i] === 144 && st.frameY[i] === 0
        && !(st.wire[i] & 1) && !(st.wire[st.idx(x + 1, y)] & 1)
        && !(st.wire[st.idx(x, y + 1)] & 1) && !(st.wire[st.idx(x + 1, y + 1)] & 1)) deadLeft++;
    }
  }
  console.log('[SSSSS] famCount =', JSON.stringify(fam));
  console.log(`[SSSSS] wireRed=${wireRed} actuator=${actuator} gasTrapChests=${gasChests} (gasItemId=${gasId}) deadLeft=${deadLeft} chests=${world.chests.length}`);
}, 600_000);
