// 165 族槽位边界对账（env 门控=SW_165B=1）：4200×1200 seed 9293480（dump 同参），
// 在与原版 dump 对齐的槽边界抓全量 state，对拍 typ/act/wal 三通道 + 165 双向差。
// 目标：找 D(输出)−D(输入) 跳变最大的槽 = 165 漂移的其余贡献 pass。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_165B === '1';
const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
/** 槽号 → 对齐 dump（该槽【完成后】的原版边界） */
const ALIGN: Array<[number, number, string]> = [
  [12, 52, 'Shell_Piles'],
  [13, 53, 'Smooth_World'],
  [14, 54, 'Waterfalls'],
  [17, 55, 'Life_Crystals'],
  [18, 63, 'Spider_Caves'],
  [19, 64, 'Gem_Caves'],
  [20, 65, 'Moss'],
  [24, 69, 'Floating_Island_Houses'],
  [25, 70, 'Quick_Cleanup'],
  [26, 71, 'Pots'],
  [31, 76, 'Traps'],
  [32, 77, 'Piles'],
  [39, 85, 'Webs_And_Honey'],
  [40, 86, 'Weeds'],
  [41, 88, 'Jungle_Plants'],
  [42, 89, 'Vines'],
  [43, 90, 'Flowers'],
  [44, 91, 'Mushrooms'],
  [45, 93, 'Random_Gems'],
  [46, 94, 'Moss_Grass'],
  [48, 96, 'Larva'],
  [51, 99, 'Tile_Cleanup'],
  [53, 101, 'Micro_Biomes'],
  [54, 102, 'Water_Plants'],
  [55, 103, 'Stalac'],
  [56, 104, 'Remove_Broken_Traps'],
  [57, 105, 'Final_Cleanup'],
];
const ALIGN_MAP = new Map(ALIGN.map(([slot, idx, name]) => [slot, { idx, name }]));

function diffBoundary(st: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array }, idx: number, name: string, label: string) {
  const vt = new Uint16Array(readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.typ`).buffer.slice(0));
  const va = readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.act`);
  const vw = new Uint16Array(readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.wal`).buffer.slice(0));
  let typ = 0, act = 0, wal = 0, v165 = 0, j165 = 0;
  const pairM = new Map<string, number>();
  for (let i = 0; i < W * H; i++) {
    const ja = st.flags[i] !== 0;
    const jt = ja ? SHEET[st.type[i]] : -1;
    const vAc = va[i] !== 0;
    const vt2 = vAc ? vt[i] : -1;
    if (jt === -2) continue; // unmapped（不应出现）
    if (vAc !== ja) act++;
    if (vt2 !== jt) { typ++; const k = `${vt2}>${jt}`; pairM.set(k, (pairM.get(k) ?? 0) + 1); }
    if (vw[i] !== st.wall[i]) wal++;
    if (vt2 === 165 && jt !== 165) v165++;
    if (jt === 165 && vt2 !== 165) j165++;
  }
  const top = [...pairM.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  // 关键族双向计数（62 蛛网 / 28 瓦罐 / 51 / 165 / active 翻转）
  const dir = (t: number) => [pairM.get(`${t}>-1`) ?? 0, pairM.get(`-1>${t}`) ?? 0];
  console.log(`${label} → dump${String(idx).padStart(3, '0')}_${name}: typ=${typ} act=${act} wal=${wal} | v165only=${v165} j165only=${j165} | 62=${JSON.stringify(dir(62))} 28=${JSON.stringify(dir(28))} 51=${JSON.stringify(dir(51))} 165=${JSON.stringify(dir(165))}`);
  return { typ, act, wal, v165, j165 };
}

(RUN ? it : it.skip)('aligned slot boundary diff', async () => {
  let prev: { type: Uint16Array; flags: Uint8Array; wall: Uint16Array } | null = null;
  const results: Array<{ label: string; d: ReturnType<typeof diffBoundary> }> = [];
  await generateWorld({
    width: W, height: H, seedText: '9293480', evil: 0,
    onWorldPartial: (w, i, name) => {
      const al = ALIGN_MAP.get(i);
      const st = w.store;
      if (al) {
        const label = `slot${String(i).padStart(2)}_${name}`;
        results.push({ label, d: diffBoundary({ type: st.type, flags: st.flags, wall: st.wall }, al.idx, al.name, label) });
      }
      // 前一快照（首个对齐槽的【输入】基线）：在首个对齐槽开始前抓一次
      if (i === 17 && !prev) {
        prev = { type: st.type.slice(), flags: st.flags.slice(), wall: st.wall.slice() };
      }
    },
  });
  if (prev) results.unshift({ label: 'slot18_in(≈dump062)', d: diffBoundary(prev, 62, 'Water_Chests', 'slot18_in') });
  console.log('—— 汇总（typ 差 / v165only / j165only）——');
  for (const r of results) console.log(`${r.label.padEnd(24)} typ=${String(r.d.typ).padStart(6)} 165v=${String(r.d.v165).padStart(5)} 165j=${String(r.d.j165).padStart(5)}`);
}, 600_000);
