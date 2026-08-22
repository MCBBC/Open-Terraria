// JJJJJJ 批①：盲区全链体检（JS generateWorld ↔ /tmp/vserver86 x86 .wld 帧级对拍）。
// x86 .wld 是唯一含帧通道的二进制真值（mile8 的 /tmp/sw-slp/g* 无帧）——本探针
// 一次产出 slope/half/frameX/frameY 四盲区通道 + typ/act 背景差的全量账。
// 口径：
//   - 仅双方 active 且 type（投影 vanilla sheet）相等的格参与帧差裁决（帧债=纯帧差）；
//   - typ/act 差单列（背景噪声——上游掷流分歧域，帧差在这些格上无意义）；
//   - 帧差族键 = (sheet, Δfrx, Δfry)，附样本坐标；
//   - slope/half 同口径单列（x86 .wld 有此两通道真值）。
// 用法：cd game && SW_JF=1 npx vitest run tools/_jjjjjj-frame.test.ts
//   SW_JF_CHAIN=s9293480_e0,s12345,m20260811（逗号多名，缺省前三链全跑）
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_JF === '1';
const VSRV = '/tmp/vserver86';
const CHAINS: Record<string, { file: string; seed: string; evil: 0 | 1; size: 0 | 1 }> = {
  s9293480_e0: { file: 's9293480_e0.wld', seed: '9293480', evil: 0, size: 0 },
  s12345: { file: 's12345.wld', seed: '12345', evil: 1, size: 0 },
  m20260811: { file: 'm20260811.wld', seed: '20260811', evil: 0, size: 1 },
};
const pick = (process.env.SW_JF_CHAIN ?? 's9293480_e0,s12345').split(',');

(RUN ? it : it.skip)('jjjjjj frame-channel audit vs x86 wld', async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  for (const name of pick) {
    const c = CHAINS[name];
    if (!c) { console.log(`unknown chain ${name}`); continue; }
    const t0 = Date.now();
    const wld = parseWld(new Uint8Array(readFileSync(`${VSRV}/${c.file}`)));
    const dims = SIZE_DIMS[c.size];
    const world = await generateWorld({ size: c.size, width: dims.width, height: dims.height, seedText: c.seed, evil: c.evil });
    const st = world.store;
    const w = wld.tilesWide, h = wld.tilesHigh, n = w * h;
    if (st.w !== w || st.h !== h) { console.log(`${name}: 尺寸不符`); continue; }
    const wt = wld.tiles;
    let actDiff = 0, typDiff = 0, frameDiff = 0, slopeDiff = 0, halfDiff = 0;
    const fam = new Map<string, { n: number; samples: string[] }>();
    const slopeFam = new Map<string, { n: number; samples: string[] }>();
    const halfFam = new Map<string, { n: number; samples: string[] }>();
    const bump = (m: Map<string, { n: number; samples: string[] }>, k: string, x: number, y: number) => {
      const e = m.get(k) ?? { n: 0, samples: [] };
      e.n++;
      if (e.samples.length < 5) e.samples.push(`(${x},${y})`);
      m.set(k, e);
    };
    for (let i = 0; i < n; i++) {
      const x = i % w, y = (i / w) | 0;
      const va = wt.active[i]!, ja = st.flags[i]! & 1;
      const vt = va ? wt.type[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      if (va !== ja || (va && vt !== jt)) {
        if (va !== ja) actDiff++;
        typDiff++;
        continue;   // 背景差域：帧差无意义
      }
      if (!va) continue;
      const vfx = wt.frameX[i]! & 0xffff, vfy = wt.frameY[i]! & 0xffff;
      const jfx = st.frameX[i]! & 0xffff, jfy = st.frameY[i]! & 0xffff;
      if (vfx !== jfx || vfy !== jfy) {
        frameDiff++;
        const dfx = (jfx - vfx) | 0, dfy = (jfy - vfy) | 0;
        bump(fam, `t${vt} fx${vfx}>${jfx} fy${vfy}>${jfy}`, x, y);
        void dfx; void dfy;
      }
      if ((wt.slope[i]! ?? 0) !== st.slope[i]!) bump(slopeFam, `t${vt} ${(wt.slope[i] ?? 0)}>${st.slope[i]}`, x, y), slopeDiff++;
      if ((wt.half[i]! ?? 0) !== st.half[i]!) bump(halfFam, `t${vt} ${(wt.half[i] ?? 0)}>${st.half[i]}`, x, y), halfDiff++;
    }
    console.log(`\n===== ${name} (${c.file} seed=${c.seed} evil=${c.evil}) ${((Date.now() - t0) / 1000).toFixed(0)}s =====`);
    console.log(`背景差: act=${actDiff} typ=${typDiff} | 盲区: frame=${frameDiff} slope=${slopeDiff} half=${halfDiff}`);
    const top = [...fam.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25);
    for (const [k, v] of top) console.log(`  帧 ${k} ×${v.n}  @${v.samples.join(' ')}`);
    const ts = [...slopeFam.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    for (const [k, v] of ts) console.log(`  坡 ${k} ×${v.n}  @${v.samples.join(' ')}`);
    const th = [...halfFam.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    for (const [k, v] of th) console.log(`  半 ${k} ×${v.n}  @${v.samples.join(' ')}`);
    writeFileSync(`/tmp/jjjjjj-frames-${name}.json`, JSON.stringify({
      chain: name, actDiff, typDiff, frameDiff, slopeDiff, halfDiff,
      families: [...fam.entries()].map(([k, v]) => ({ key: k, n: v.n, samples: v.samples })),
      slope: [...slopeFam.entries()].map(([k, v]) => ({ key: k, n: v.n })),
      half: [...halfFam.entries()].map(([k, v]) => ({ key: k, n: v.n })),
    }));
  }
}, 900_000);
