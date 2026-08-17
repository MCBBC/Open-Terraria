// 165 族每槽计数对账（env 门控=SW_165P=1）：生成 4200×1200 seed 9293480
// （= /tmp/sw-num4/van_x86_g dump 同参），每槽后数 165 总量，与原版逐 pass
// dump 的 typ 通道 165 计数对拍——定位首个计数分叉槽。
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_165P === '1';
const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

/** dump idx → (typ) 165 计数（缓存） */
function vanCount(idx: number, name: string): number {
  const f = `${VG}/${String(idx).padStart(3, '0')}_${name}.typ`;
  if (!existsSync(f)) return -1;
  const a = new Uint16Array(readFileSync(f).buffer.slice(0));
  let c = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === 165) c++;
  return c;
}

(RUN ? it : it.skip)('per-pass 165 count parity', async () => {
  const samples: Array<{ i: number; name: string; c: number }> = [];
  const world = await generateWorld({
    width: W, height: H, seedText: '9293480', evil: 0,
    onWorldPartial: (w, i, name) => {
      const st = w.store;
      let c = 0;
      for (let k = 0; k < st.type.length; k++) {
        if (st.flags[k] && SHEET[st.type[k]] === 165) c++;
      }
      samples.push({ i, name, c });
    },
  });
  const st = world.store;
  let c = 0;
  for (let k = 0; k < st.type.length; k++) if (st.flags[k] && SHEET[st.type[k]] === 165) c++;
  samples.push({ i: -1, name: 'FINAL', c });
  for (const s of samples) console.log(`${String(s.i).padStart(3)} ${s.name.padEnd(34)} ${s.c}`);
  writeFileSync('/tmp/165passes-js.json', JSON.stringify(samples));
  // 对照原版边界计数（dump 全集已预扫：关键边界硬编码对照）
  const vanKey: Array<[number, string, number]> = [
    [63, 'Spider_Caves', vanCount(63, 'Spider_Caves')],
    [64, 'Gem_Caves', vanCount(64, 'Gem_Caves')],
    [65, 'Moss', vanCount(65, 'Moss')],
    [69, 'Floating_Island_Houses', vanCount(69, 'Floating_Island_Houses')],
    [70, 'Quick_Cleanup', vanCount(70, 'Quick_Cleanup')],
    [71, 'Pots', vanCount(71, 'Pots')],
    [85, 'Webs_And_Honey', vanCount(85, 'Webs_And_Honey')],
    [92, 'Gems_In_Ice_Biome', vanCount(92, 'Gems_In_Ice_Biome')],
    [93, 'Random_Gems', vanCount(93, 'Random_Gems')],
    [102, 'Water_Plants', vanCount(102, 'Water_Plants')],
    [103, 'Stalac', vanCount(103, 'Stalac')],
    [104, 'Remove_Broken_Traps', vanCount(104, 'Remove_Broken_Traps')],
    [105, 'Final_Cleanup', vanCount(105, 'Final_Cleanup')],
  ];
  console.log('—— 原版边界（dump typ 通道）——');
  for (const [i, n, v] of vanKey) console.log(`${String(i).padStart(3)} ${n.padEnd(34)} ${v}`);
}, 600_000);
