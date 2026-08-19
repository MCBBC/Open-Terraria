// 一次性诊断（GGGGG 批）：m/s 链 #58 Statues 放置全集对拍 + 残差格邻域帧取证。
// m8 harness 同款 reseed 拦截：在 ▶UndergroundHousesAndBuriedChests 重播点（=雕像
// pass 末态）快照 store，与 golden 058 全量 diff；并打印 105/349/135 放置集对拍与
// 残差邻域的 JS 帧型（Check* 判据取证）。
// 用法：cd game && SW_G5=1 SW_G5_SEED=20260811 SW_G5_EVIL=0 SW_G5_W=6400 SW_G5_H=1800 \
//      SW_G5_G2=/tmp/sw-slp/g-m20260811 npx vitest run tools/_g5trace.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_G5 === '1';
const G2 = process.env.SW_G5_G2 ?? '/tmp/sw-slp/g';
const SEED = process.env.SW_G5_SEED ?? '9293480';
const EVIL = Number(process.env.SW_G5_EVIL ?? 0);
const W = Number(process.env.SW_G5_W ?? 4200), H = Number(process.env.SW_G5_H ?? 1200), N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const le16 = (p: string): Uint16Array => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const u8 = (p: string): Uint8Array => readFileSync(p);

interface St8 { type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array; frameX: Uint16Array; frameY: Uint16Array }

(RUN ? it : it.skip)('g5 statues placement set vs golden 058', async () => {
  let curStore: St8 | null = null;
  let snap: St8 | null = null;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  const wsrc = readFileSync(new URL('../src/world/gen/WorldGen.ts', import.meta.url), 'utf8').split('\n');
  const grab = (c: St8): St8 => ({ type: c.type.slice(), flags: c.flags.slice(), wall: c.wall.slice(), liquid: c.liquid.slice(), liquidType: c.liquidType.slice(), half: c.half.slice(), slope: c.slope.slice(), wire: c.wire.slice(), frameX: c.frameX.slice(), frameY: c.frameY.slice() });
  let pre: St8 | null = null;
  RNGp.reseed = function (this: unknown, s: number) {
    if (curStore) {
      const stack = new Error().stack ?? '';
      const m = stack.match(/(\/[^\s()]+WorldGen\.ts):(\d+):\d+/);
      const line = m ? wsrc[Number(m[2]) - 1] : undefined;
      if (!pre && line?.includes('Statues cs:16947')) pre = grab(curStore);
      if (!snap && line?.includes('UndergroundHousesAndBuriedChests')) snap = grab(curStore);
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1,
      onWorldPartial: (w) => { if (!curStore) curStore = w.store as never as St8; },
    });
  } finally { RNGp.reseed = oReseed; }

  const gt = le16(`${G2}/058_Statues.typ`), ga = u8(`${G2}/058_Statues.act`);
  const g57t = le16(`${G2}/057_Life_Crystals.typ`), g57a = u8(`${G2}/057_Life_Crystals.act`);
  const st = snap!;
  // 1) 放置集对拍：vanilla 057→058 新增的 105/349/135 格 vs JS 同类格
  const vSet: string[] = [], jSet: string[] = [];
  for (let i = 0; i < N; i++) {
    const va57 = g57a[i], va = ga[i];
    const vt57 = va57 ? g57t[i] : 0, vt = va ? gt[i] : 0;
    if (va && !va57 && (vt === 105 || vt === 349 || vt === 135)) vSet.push(`${vt}@(${i % W},${(i / W) | 0})`);
    const ja = st.flags[i], jsh = SHEET[st.type[i]];
    const j57sh = -1; // JS 057 态不可得——用 golden 057 替代（#57 绿 ⇒ 两态一致）
    void j57sh;
    if (ja && (va57 ? !(vt57 === 105 || vt57 === 349 || vt57 === 135) : true)
      && (jsh === 105 || jsh === 349 || jsh === 135)) jSet.push(`${jsh}@(${i % W},${(i / W) | 0})`);
  }
  const vk = new Set(vSet), jk = new Set(jSet);
  const onlyV = vSet.filter(x => !jk.has(x));
  const onlyJ = jSet.filter(x => !vk.has(x));
  console.log(`vanilla placements=${vSet.length} JS=${jSet.length} onlyVanilla=${onlyV.length} onlyJS=${onlyJ.length}`);
  console.log(`onlyVanilla: ${onlyV.slice(0, 12).join(' ')}`);
  console.log(`onlyJS: ${onlyJ.slice(0, 12).join(' ')}`);
  // 2) #58 残差格（8 通道 act/typ 差）邻域的 JS 帧型打印
  const diffs: number[] = [];
  for (let i = 0; i < N; i++) {
    const va = ga[i], ja = st.flags[i] & 1;
    if (va !== ja || (va ? gt[i] : 0) !== (ja ? SHEET[st.type[i]] : 0)) diffs.push(i);
  }
  console.log(`8ch diff cells=${diffs.length}`);
  const shown = new Set<number>();
  const dumpNb = (tag: string, s: St8, x: number, y: number) => {
    console.log(`\n=== ${tag} @(${x},${y})`);
    for (let dy = -4; dy <= 3; dy++) {
      let row = `  y${y + dy}: `;
      for (let dx = -6; dx <= 6; dx++) {
        const j = (y + dy) * W + (x + dx);
        if (j < 0 || j >= N) { row += '         ·'; continue; }
        const ja = s.flags[j];
        const jsh = ja ? SHEET[s.type[j]] : -1;
        const cell = ja ? `${jsh}/${s.frameX[j] ?? 0},${s.frameY[j] ?? 0}` : '·';
        row += cell.padStart(14);
      }
      console.log(row);
    }
  };
  for (const i of diffs.slice(0, 200)) {
    const x = i % W, y = (i / W) | 0;
    if (shown.has(i)) continue;
    console.log(`\n=== diff @(${x},${y}) golden=${ga[i] ? gt[i] : '·'} js=${st.flags[i] ? SHEET[st.type[i]] : '·'}`);
    for (let dy = -4; dy <= 3; dy++) {
      let row = `  y${y + dy}: `;
      for (let dx = -6; dx <= 6; dx++) {
        const j = (y + dy) * W + (x + dx);
        if (j < 0 || j >= N) { row += '         ·'; continue; }
        const ja = st.flags[j];
        const jsh = ja ? SHEET[st.type[j]] : -1;
        let cell = ja ? `${jsh}` : '·';
        if (ja) cell += `/${st.frameX[j] ?? 0},${st.frameY[j] ?? 0}`;
        const gv = ga[j] ? gt[j] : '·';
        if ((ga[j] ? 1 : 0) !== ja || (ga[j] ? gt[j] : 0) !== (ja ? jsh : 0)) cell = `[${gv}>${ja ? jsh : '·'}]`;
        row += cell.padStart(12);
      }
      console.log(row);
    }
    if (pre) { dumpNb('PRE (#57 state, frames)', pre, x, y); }
    for (let dy = -5; dy <= 4; dy++) for (let dx = -7; dx <= 7; dx++) shown.add((y + dy) * W + (x + dx));
  }
}, 900_000);
