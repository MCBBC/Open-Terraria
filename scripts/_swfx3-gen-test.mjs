// SW-FX3 一次性：生成 tests/sw-fx3-placestyle-sweep.test.ts（金标独立冻结,不引 items.ts 表结构）。
import { readFileSync, writeFileSync } from 'node:fs';
const gold = JSON.parse(readFileSync('/tmp/swfx3-gold-census.json', 'utf8'));
const rt = await import('/tmp/swfx3-items-bundle.mjs');
const { ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = rt;

const FAMILIES = [
  ['bathtub', 90], ['bed', 79], ['bench', 89], ['bookcase', 101], ['candelabra', 100],
  ['candle', 33], ['chair', 15], ['chandelier', 34], ['chest', 21], ['door_closed', 10],
  ['dresser', 88], ['grandfather_clock', 104], ['lantern', 42], ['piano', 87], ['table', 14],
  ['tombstone_v', 85], ['workbench', 18], ['v_93_lamps', 93], ['v_103_bowls', 103],
  ['v_105_statue', 105], ['v_13_placed_bottles', 13], ['v_144_timers', 144],
  ['v_172_sinks', 172], ['v_240_wall_hangings_3x3', 240], ['v_242_paintings_6x4', 242],
  ['v_245_paintings_2x3', 245], ['v_246_paintings_3x2', 246], ['v_337_text_statue', 337],
  ['v_376_fishing_crates', 376], ['v_420_logicgate', 420], ['v_440_gemlocks', 440],
  ['v_441_fakecontainers', 441], ['v_572_souls_in_a_bottle', 572],
];

const defOfVidRt = (vid) => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  if (k === undefined) return undefined;
  const idx = ITEM_BY_KEY[k];
  return idx === undefined ? undefined : ITEM_DEFS[idx];
};

const dataOut = [];
let total = 0;
for (const [tk, sheet] of FAMILIES) {
  const members = [];
  for (const [vidStr, rec] of Object.entries(gold)) {
    if (rec.ct !== sheet) continue;
    const vid = Number(vidStr);
    const d = defOfVidRt(vid);
    if (!d || d.tile !== tk) continue;
    members.push([vid, rec.ps ?? 0]);
  }
  members.sort((a, b) => a[0] - b[0]);
  total += members.length;
  const rows = [];
  for (let i = 0; i < members.length; i += 6) {
    rows.push('    ' + members.slice(i, i + 6).map(([v, p]) => `[${v}, ${p}]`).join(', ') + ',');
  }
  dataOut.push({ tk, rows });
}

const goldBlocks = dataOut.map(({ tk, rows }) => `  '${tk}': [\n${rows.join('\n')}\n  ],`).join('\n');

const testFile = `// SW-FX3 placeStyle 缺档邻族普查补齐——32+1 族全成员矩阵金标（1457 终值冻结;
// 1458 同域逐 vid 对拍零差）。金标来源 = scripts/_swfx3-placestyle-census.mjs 结构层
// 重放 Terarria1457 Item.cs SetDefaults1-5 全 placeStyle 写面（共享 case 算式/区间
// if/DefaultTo* 三形态;亲读行号见 items.ts PLACE_STYLE_BACKFILL_1458 SW-FX3 块各注）
// 与运行时 def 全量对拍：545 件缺档由 PLACE_STYLE_BACKFILL_1458（SW-FX3 块）补齐 +
// bench 2413 伪值 23→17 由 SHARED_GROUP_PLACE_STYLE_1457 无条件纠偏（Item.cs:23968）。
// ★金标独立冻结（不引 items.ts 表结构）：删任一族回填行 → 本测试立即红（变异证红）。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { framedCellFrame } from '../src/world/FurnitureStyle';
import { styleDropVid, styleFromFrame, styleDropVidOfFrames } from '../src/data/vanillaStyleDrops';

interface Drop { key: string; n: number }

const keyOfVid = (vid: number): string => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(k, \`vid \${vid} 应有 vi_ 键\`).toBeDefined();
  return k as string;
};
const defOfVid = (vid: number) => {
  const idx = (ITEM_BY_KEY as Record<string, number>)[keyOfVid(vid)];
  expect(idx, \`vid \${vid} 应有 def\`).toBeDefined();
  return ITEM_DEFS[idx as number];
};
const tileIdOf = (tk: string): number => (TILE_BY_KEY as Record<string, number | undefined>)[tk] as number;
const sheetOf = (tk: string): number =>
  (TILE_DEFS[tileIdOf(tk)] as unknown as { vanilla: { sheet: number } }).vanilla.sheet;
const tileFwFh = (tk: string): [number, number] => {
  const td = TILE_DEFS[tileIdOf(tk)] as unknown as { vanilla?: { fw?: number; fh?: number } };
  return [td?.vanilla?.fw ?? 1, td?.vanilla?.fh ?? 1];
};
/** 破坏壳（仿 tests/sw-bj50-campfire-style.test.ts breakShell） */
function breakShell(w: World, drops: Drop[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    world: World; breakTile: (x: number, y: number, byPlayer?: boolean) => void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.spawnDrop = (x: number, y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.recLog = () => {};
  g.dumpChest = () => {};
  // enemies 预置双同型哨兵：墓碑破坏的幽灵掷门（Game.ts:20711-20712 Math.random()<1/num13
  //  && 场上 316 幽灵 <2）以 length<2 门短路,确定性不触发（vanilla Tombstone break
  //  随机刷幽灵支,非本批语义;单哨兵会被 <2 门放过→player.cx 空引用）
  g.entities = { add: () => {}, drops: [], enemies: [{ dead: false, vanillaId: 316 }, { dead: false, vanillaId: 316 }] };
  g.trackTile = 0;
  g.player = undefined;
  return g as unknown as { breakTile: (x: number, y: number, byPlayer?: boolean) => void };
}
const vidOfKey = (key: string | undefined): number =>
  Number(/^vi_(\\d+)_/.exec(key ?? '')?.[1] ?? -1);

// ─── A. 全族矩阵金标：vid → vanilla placeStyle（0=原版缺省档,同样钉死） ───
const GOLD: Readonly<Record<string, ReadonlyArray<readonly [number, number]>>> = {
${goldBlocks}
};

describe('SW-FX3 A. 全族 placeStyle 矩阵（Item.cs 金标,独立冻结）', () => {
  it.each(Object.keys(GOLD))('%s：全成员 def.tile + def.placeStyle == vanilla', (tk) => {
    for (const [vid, exp] of GOLD[tk]) {
      const d = defOfVid(vid);
      expect(d.tile, \`vid \${vid} tile\`).toBe(tk);
      expect(d.placeStyle ?? 0, \`vid \${vid} placeStyle（vanilla \${exp}）\`).toBe(exp);
    }
  });
});

describe('SW-FX3 B. 放置帧合成（framedCellFrame;105 行带 = 本批新 case）', () => {
  it('雕像 105：StyleWrapLimit=55 行带（TileObjectData.cs:3012-3015 + Check2xX :38542-38545 反推同构）', () => {
    expect(framedCellFrame(105, 2, 54, 0, 0)).toEqual([54 * 36, 0]);    // 行 0 末档
    expect(framedCellFrame(105, 2, 55, 0, 0)).toEqual([0, 54]);         // 换行
    expect(framedCellFrame(105, 2, 75, 1, 2)).toEqual([20 * 36 + 18, 54 + 36]); // 活木雕档
    expect(framedCellFrame(105, 2, 0, 1, 1)).toEqual([18, 18]);
  });

  it('竖排/横排族帧抽验（放置帧 ⇄ styleFromFrame 反推闭环）', () => {
    expect(framedCellFrame(172, 2, 28, 0, 0)).toEqual([0, 28 * 38]);     // 水槽竖排 38
    expect(framedCellFrame(33, 1, 25, 0, 0)).toEqual([0, 25 * 22]);      // 蜡烛竖排 22
    expect(framedCellFrame(104, 2, 32, 1, 1)).toEqual([32 * 36 + 18, 18]); // 座钟横排 36
    expect(framedCellFrame(337, 2, 35, 1, 2)).toEqual([35 * 36 + 18, 36]); // 字雕横排 36
    expect(framedCellFrame(376, 2, 25, 1, 1)).toEqual([25 * 36 + 18, 18]); // 板条箱横排 36
    expect(framedCellFrame(242, 6, 61, 5, 3)).toEqual([2 * 108 + 90, 7 * 72 + 54]); // 画 6×4 wrap27
    expect(framedCellFrame(420, 1, 5, 0, 0)).toEqual([0, 90]);           // 逻辑门 Y 轴档
  });
});

describe('SW-FX3 C. 掉落侧新表（337 字雕 / 376 板条箱,Check2xX :38561 / Check4x2 :48689）', () => {
  it('字雕 337：36 档 = 2702+s；越界回落 2702', () => {
    for (let s = 0; s < 36; s++) expect(styleDropVid(337, s), \`style \${s}\`).toBe(2702 + s);
    expect(styleDropVid(337, 36)).toBe(2702);
    expect(styleDropVid(337, 99)).toBe(2702);
  });

  it('板条箱 376：26 档全矩阵（GetItemDrop 逐档）', () => {
    const CRATES = [
      2334, 2335, 2336, 3203, 3204, 3205, 3206, 3207, 3208, 3979, 3980, 3981, 3982,
      3983, 3984, 3985, 3986, 3987, 4405, 4406, 4407, 4408, 4877, 4878, 5002, 5003,
    ];
    for (let s = 0; s < 26; s++) expect(styleDropVid(376, s), \`style \${s}\`).toBe(CRATES[s]);
    expect(styleDropVid(376, 26)).toBe(2334);   // 越界回落 default→style0 档
  });

  it('styleFromFrame[337]/[376] = fx/36（Check2xX :38562 / Check4x2 :48535）', () => {
    expect(styleFromFrame[337](1080, 0)).toBe(30);
    expect(styleFromFrame[376](432, 18)).toBe(12);
    expect(styleDropVidOfFrames(337, 1080, 0)).toBe(2732);
    expect(styleDropVidOfFrames(376, 432, 18)).toBe(3982);
  });
});

describe('SW-FX3 D. 放置→帧→挖掉端到端（每族首/中/末非零成员抽验,锚格命中整件回收）', () => {
  const w = new World(600, 260, 7, 'swfx3');
  const drops: Drop[] = [];
  const g = breakShell(w, drops);
  const st = w.store;

  it.each(Object.keys(GOLD))('%s：端到端挖掉还原', (tk) => {
    const tileId = tileIdOf(tk);
    const sheet = sheetOf(tk);
    const [fw, fh] = tileFwFh(tk);
    const nz = GOLD[tk].filter(([, p]) => p !== 0);
    const picks = nz.length >= 3
      ? [nz[0], nz[Math.floor(nz.length / 2)], nz[nz.length - 1]]
      : [...nz, ...GOLD[tk]].slice(0, 3);
    picks.forEach(([vid, exp], idx) => {
      const d = defOfVid(vid);
      expect(d.tile).toBe(tk);
      expect(d.placeStyle ?? 0).toBe(exp);
      const gi = GOLD[tk].findIndex(([v]) => v === vid);
      const x = 4 + (gi % 20) * 14;
      const y = 6 + idx * (fh + 4) + (Math.floor(gi / 20) % 8) * (fh + 4) * 3;
      for (let dx = 0; dx < fw; dx++) {
        for (let dy = 0; dy < fh; dy++) {
          const [fx, fy] = framedCellFrame(sheet, fw, exp, dx, dy);
          st.setTileSilent(x + dx, y + dy, tileId, fx, fy);
        }
      }
      const before = drops.length;
      g.breakTile(x, y, false);
      const got = drops.slice(before).map((dr) => vidOfKey(dr.key));
      // 期望=生产同入口 styleDropVidOfFrames（门 10 走其内部钳制块,非 styleDropVid 直查）
      const [ax, ay] = framedCellFrame(sheet, fw, exp, 0, 0);
      expect(got, \`vid \${vid}（style \${exp}）挖掉还原,得 \${got}\`).toContain(styleDropVidOfFrames(sheet, ax, ay));
    });
  });
});
`;
writeFileSync('/tmp/swfx3-test-file.txt', testFile);
console.log('families:', FAMILIES.length, 'total entries:', total);
