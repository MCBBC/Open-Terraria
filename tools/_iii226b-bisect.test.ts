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
  let lastTyp: Uint16Array | null = null;

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
        const typ = new Uint16Array(N);
        for (let i = 0; i < N; i++) typ[i] = SHEET[st.type[i]!]!;
        try { writeFileSync(`${OUT}/b_${anchor}.typ`, Buffer.from(typ.buffer, typ.byteOffset, typ.byteLength)); } catch { /* ignore */ }
        lastTyp = typ;
        // 与 G2 直接逐格比(G2 typ=vanilla 型号;air=0)
        const f = `${process.env.HOME}/GoldenChains/golden-grvfix/${anchor}.typ`;
        let buf: Buffer;
        try { buf = readFileSync(f); } catch { rows.push(`${anchor} G2-MISSING`); return; }
        const g2 = new Uint16Array(buf.buffer, buf.byteOffset, N);
        let a = 0, t = 0, sw = 0;
        let first = -1;
        for (let i = 0; i < N; i++) {
          const gv = g2[i]!, jv = typ[i]!;
          if (gv === jv) continue;
          if (jv === 0) { a++; }
          else if (gv === 0) { t++; }
          else sw++;
          if (first < 0) first = i;
        }
        rows.push(`${anchor} A=${a} T=${t} SWAP=${sw} first=(${first % W},${(first / W) | 0})`);
      },
    });
  } finally {
    g.__swI226B = undefined;
  }
  writeFileSync(`${OUT}/bisect.log`, rows.join('\n') + '\n');
});
