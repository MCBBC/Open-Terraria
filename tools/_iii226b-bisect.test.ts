// IIII226b 批 bisect 仪:graveyard 链 G2(~/GoldenChains/golden-grvfix) 逐槽对拍。
// 在 JS 槽末(=该槽最后一个原版 pass 完成点)落 typ 十六进制 FNV 折算 diff 摘要,
// 与 G2 对应槽末文件直接比对,定位绿带 0..96 内的漂移引入槽。
// 用法: cd game && SW_I226B=1 SW_MB_1457=1 npx vitest run tools/_iii226b-bisect.test.ts
import { it } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';

const RUN = process.env.SW_I226B === '1';
const OUT = process.env.SW_I226B_OUT ?? '/tmp/iii226b-out';
const SEED = process.env.SW_I226B_SEED ?? 'nightofthelivingdead|20260903';

/** JS 槽名 → G2 末成员槽文件前缀 */
const ANCHORS: Record<string, string> = {
  原版地形: '000_Terrain',
  沙丘: '001_Dunes',
  洞穴: '014_Wavy_Caves',
  生物群系: '035_Gems',
  引力沙: '037_Create_Ocean_Caves',
  微光: '038_Shimmer',
  清理: '039_Clean_Up_Dirt',
  结构: '047_Hives',
  水体沉降: '049_Settle_Liquids',
  沙上清水: '050_Remove_Water_From_Sand',
  半砖平滑: '053_Smooth_World',
  薄冰: '055_Ice',
  生命水晶: '057_Life_Crystals',
  雕像宝箱: '063_Spider_Caves',
  苔藓: '065_Moss',
  快清理: '070_Quick_Cleanup',
  瓦罐: '071_Pots',
  地表陷阱: '076_Traps',
  矿骨堆: '077_Piles',
  地表装饰: '076_Traps',
  长苔藓: '094_Moss_Grass',
  丛林墙: '095_Muds_Walls_In_Jungle',
  蜂巢幼虫: '096_Larva',
  微群系: '097_Micro_Biomes',
};

(RUN ? it : it.skip)('iii226b grv per-slot bisect vs G2', { timeout: 1_800_000 }, async () => {
  const g = globalThis as Record<string, unknown>;
  const { TILE_DEFS } = await import('../src/data/tiles');
  const { generateWorld } = await import('../src/world/gen/WorldGen');
  const W = 4200, H = 1200, N = W * H;
  const SHEET = new Int32Array(TILE_DEFS.length).fill(9999);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  const rows: string[] = [];

  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: 0 as -1 | 0 | 1,
      seedFlags: { graveyardBloodmoonStart: true },
      onWorldPartial: (w2, _i, name) => {
        const anchor = ANCHORS[name];
        if (!anchor) return;
        const st = w2.store as {
          type: Uint16Array; flags: Uint8Array; wall: Uint16Array;
          liquid: Uint8Array; liquidType: Uint8Array; half: Uint8Array; slope: Uint8Array; wire: Uint8Array;
        };
        // 八通道逐格比(G2 侧 vanilla 型号空间;JS 9999 哨兵→0)
        const jtyp = new Uint16Array(N);
        const jwal = new Uint16Array(N);
        const jact = new Uint8Array(N), jliq = new Uint8Array(N), jlty = new Uint8Array(N);
        const jhalf = new Uint8Array(N), jslope = new Uint8Array(N), jinact = new Uint8Array(N);
        for (let i = 0; i < N; i++) {
          jtyp[i] = SHEET[st.type[i]!]!;
          jwal[i] = st.wall[i]!;
          jact[i] = st.flags[i]! & 1;
          jliq[i] = st.liquid[i]!;
          jlty[i] = st.liquid[i]! > 0 ? (st.liquidType[i]! > 0 ? st.liquidType[i]! - 1 : 0) : 0;
          jhalf[i] = st.half[i]!;
          jslope[i] = st.slope[i]!;
          jinact[i] = (st.wire[i]! >>> 5) & 1;
        }
        try {
          writeFileSync(`${OUT}/b_${anchor}.typ`, Buffer.from(jtyp.buffer, jtyp.byteOffset, jtyp.byteLength));
          writeFileSync(`${OUT}/b_${anchor}.lty`, Buffer.from(jlty.buffer, jlty.byteOffset, jlty.byteLength));
          writeFileSync(`${OUT}/b_${anchor}.liq`, Buffer.from(jliq.buffer, jliq.byteOffset, jliq.byteLength));
          writeFileSync(`${OUT}/b_${anchor}.act`, Buffer.from(jact.buffer, jact.byteOffset, jact.byteLength));
          writeFileSync(`${OUT}/b_${anchor}.wal`, Buffer.from(jwal.buffer, jwal.byteOffset, jwal.byteLength));
        } catch { /* ignore */ }
        const cmp16 = (js: Uint16Array, g2f: string) => {
          let buf2: Buffer;
          try { buf2 = readFileSync(g2f); } catch { return `${g2f}:G2MISS`; }
          const g2 = new Uint16Array(buf2.buffer, buf2.byteOffset, N);
          let d = 0, first = -1;
          for (let i = 0; i < N; i++) {
            const gv = g2[i]!, jv = js[i] === 9999 ? 0 : js[i]!;
            if (gv !== jv) { d++; if (first < 0) first = i; }
          }
          return `${d}${first >= 0 ? `@(${first % W},${(first / W) | 0})` : ''}`;
        };
        const cmp8 = (js: Uint8Array, g2f: string) => {
          let buf2: Buffer;
          try { buf2 = readFileSync(g2f); } catch { return `${g2f}:G2MISS`; }
          const g2 = new Uint8Array(buf2.buffer, buf2.byteOffset, N);
          let d = 0, first = -1;
          for (let i = 0; i < N; i++) {
            if (g2[i] !== js[i]) { d++; if (first < 0) first = i; }
          }
          return `${d}${first >= 0 ? `@(${first % W},${(first / W) | 0})` : ''}`;
        };
        const gdir = `${process.env.HOME}/GoldenChains/golden-grvfix`;
        const gf = (ext: string) => gdir + '/' + anchor + '.' + ext;
        const line = [anchor,
          'typ:' + cmp16(jtyp, gf('typ')),
          'wal:' + cmp16(jwal, gf('wal')),
          'act:' + cmp8(jact, gf('act')),
          'liq:' + cmp8(jliq, gf('liq')),
          'lty:' + cmp8(jlty, gf('lty')),
          'half:' + cmp8(jhalf, gf('half')),
          'slope:' + cmp8(jslope, gf('slope')),
          'act2:' + cmp8(jinact, gf('inact')),
        ].join(' ');
        rows.push(line);
      },
    });
  } finally {
    g.__swI226B = undefined;
  }
  writeFileSync(`${OUT}/bisect.log`, rows.join('\n') + '\n');
});
