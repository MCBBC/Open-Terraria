// BJ399（2026-09-29）两件清偿判别面：
//   件 1 405/406 条件格高欠高修复（BJ389 RULE5_DEBT 债清偿）——原版 GetTileDrawData
//     条件覆写：405 壁炉 :5514-5528（tileHeight=16 缺省 :5516、fy>0 才 18 :5517-5520，
//     ★无 frameX 耦合——frameX≥54 静止列只门 addFrY 动画 :5521-5525，不门格高）；
//     406 烟囱 :5448-5464（tileHeight=16 缺省 :5450、fy%54≥36 才 18 :5451-5454——%54
//     不是 %18：语义=3×3 物体的底行带）。本仓 vanilla.json grid[1]=16 恒画 16=底行
//     欠高 2px。修=drawAdjust 仅 sh 条件覆写（sx/sy 不触——addFrY 动画由 TileAnim
//     fireplaceAddFrY/chimneyAddFrY helper 独占，2026-08-30 摘案教训=绝对 sy 覆写与
//     helper 相冲）；recon 债登记 RULE5_DEBT 摘除（exempt=[752]、rule5Debt=[]）。
//   件 2 CheckOrb 破珠/心掉落词缀未掷（BJ394 域外普查补收）——原版 CheckOrb
//     （WorldGen.cs:54634-54819）tile 31 战利品十发全带显式 pfix=-1（:54718-54763）→
//     Item.NewItem 内 item.Prefix(prefix)（Item.cs:49735）=Prefix(-1) 自然掷全链。
//     珠/心是 Tile 被打碎 → CheckOrb 专段【物品】掉落（31 无 tile 侧 GetItemDrops 份，
//     BJ394 通用 KillTile_DropItems 面不覆盖此处）→ 本仓在 smashOrbHeart 接
//     rollNaturalPrefixForVid。普查（grep NewItem.*-1 全量）：
//       ① CheckOrb ×10（本件）/② KillTile_DropItems :64468/:64472 noPrefix?-4:-1
//       （BJ394 已接）/③ Player.cs:42409 DropItemFromExtractinator RequestNewItem(-1)
//       （本件接 dropFromExtractinator）/④ Wiring.cs:2589 通电提取机 NewItem(-1)
//       （本件接 dropItemStackImpl）/⑤ NPC.cs:43488 AI_127_Pal_GiveRewerd NewItem(-1)
//       （本件接 Enemy.ts palAI 奖赏面）;NPC.cs:45326=BJ390 已接。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { drawAdjust } from '../src/render/VanillaTiler';
import {
  rollNaturalPrefixForVid, rollablePrefixes, PREFIX_POOLS, prefixStat,
} from '../src/data/vanillaPrefixes';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } from '../src/data/items';
import { isPrefixableAccessory } from '../src/items/Inventory';
import { RNG } from '../src/core/rng';

const iidOf = (vid: number): number => ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid] ?? ''] ?? -1;

/** 种子化 [0,1) 源（绑定 this——RNG.next 为方法引用不能裸传） */
const seeded = (seed: number): (() => number) => {
  const r = new RNG(seed);
  return () => r.next();
};

// ────────────────────────────── 件 1：405/406 条件格高 16/18 ──────────────────────────────

describe('BJ399-件1 drawAdjust 405 壁炉条件格高（TileDrawing.cs:5516-5520）', () => {
  const st = new TileStore(8, 8);
  const IMG_W = 108, IMG_H = 306;   // Tiles_405.png 实测（BJ389 recon 工具 png 容量同源）

  it('底行 fy=18 → sh=18（源矩形向下溢 2px）;顶行 fy=0 → 不覆写（缺省 16）', () => {
    const bottom = drawAdjust(405, 0, 18, 0, 0, IMG_W, IMG_H, st, 64);
    expect(bottom.sh).toBe(18);
    expect(bottom.sx).toBeUndefined();   // sx/sy 不触——addFrY 动画由 helper 独占
    expect(bottom.sy).toBeUndefined();
    expect(bottom.sw).toBeUndefined();   // 宽度轴无覆写（16 缺省）
    const top = drawAdjust(405, 0, 0, 0, 0, IMG_W, IMG_H, st, 64);
    expect(top.sh).toBeUndefined();
  });

  it('静止列 fx≥54 与格高【无】耦合：底行仍 sh=18（原版门只读 tileFrameY :5517）', () => {
    // 2026-08-30 摘案的 frameX 门只门 num37（addFrY 动画）;tileHeight 条件独立
    expect(drawAdjust(405, 54, 18, 0, 0, IMG_W, IMG_H, st, 64).sh).toBe(18);
    expect(drawAdjust(405, 72, 18, 0, 0, IMG_W, IMG_H, st, 64).sh).toBe(18);
    expect(drawAdjust(405, 54, 0, 0, 0, IMG_W, IMG_H, st, 64).sh).toBeUndefined();
  });

  it('双样式两列全行抽样：18 带（fy=18/36…）恒 18、0 带恒缺省——无越界请求', () => {
    for (const fx of [0, 18, 36, 54, 72, 90]) {
      expect(drawAdjust(405, fx, 0, 0, 0, IMG_W, IMG_H, st, 64).sh).toBeUndefined();
      expect(drawAdjust(405, fx, 18, 0, 0, IMG_W, IMG_H, st, 64).sh).toBe(18);
    }
  });

  it('源码钉：条件 verbatim（fy>0）+ 仅 sh 注记（sy helper 独占防 2026-08-30 复发）', () => {
    const src = readFileSync('src/render/VanillaTiler.ts', 'utf8');
    expect(src).toContain('case 405: if (fy > 0 && fit(fx, fy, 16, 18)) a.sh = 18; break;');
    expect(src).toContain('case 406: if (fy % 54 >= 36 && fit(fx, fy, 16, 18)) a.sh = 18; break;');
  });
});

describe('BJ399-件1 drawAdjust 406 烟囱条件格高（TileDrawing.cs:5450-5454）', () => {
  const st = new TileStore(8, 8);
  const IMG_W = 54, IMG_H = 392;   // Tiles_406.png 实测（7×56 带）

  it('底行 fy=36 → sh=18;顶/中行 fy=0/18 → 缺省 16', () => {
    expect(drawAdjust(406, 0, 36, 0, 0, IMG_W, IMG_H, st, 64).sh).toBe(18);
    expect(drawAdjust(406, 0, 0, 0, 0, IMG_W, IMG_H, st, 64).sh).toBeUndefined();
    expect(drawAdjust(406, 0, 18, 0, 0, IMG_W, IMG_H, st, 64).sh).toBeUndefined();
  });

  it('%54 语义判别子（≠%18）：折带存储 fy=54→0 带(16)、fy=90→36 带(18)', () => {
    // fy=90: 90%54=36 → 18;fy=54: 54%54=0 → 16;fy=72: 72%54=18 → 16。
    // 若错写成 %18 则 54/72/90 全判 0 带 → 恒 16=判别失效
    expect(drawAdjust(406, 0, 90, 0, 0, IMG_W, IMG_H, st, 64).sh).toBe(18);
    expect(drawAdjust(406, 0, 54, 0, 0, IMG_W, IMG_H, st, 64).sh).toBeUndefined();
    expect(drawAdjust(406, 0, 72, 0, 0, IMG_W, IMG_H, st, 64).sh).toBeUndefined();
  });

  it('三列全行抽样（3×3 物体 fw=3）：仅底行带 18', () => {
    for (const fx of [0, 18, 36]) {
      expect(drawAdjust(406, fx, 36, 0, 0, IMG_W, IMG_H, st, 64).sh).toBe(18);
      expect(drawAdjust(406, fx, 0, 0, 0, IMG_W, IMG_H, st, 64).sh).toBeUndefined();
      expect(drawAdjust(406, fx, 18, 0, 0, IMG_W, IMG_H, st, 64).sh).toBeUndefined();
    }
  });
});

// ────────────────────────────── 件 2：CheckOrb 破珠/心掉落词缀 ──────────────────────────────

describe('BJ399-件2 CheckOrb 战利品池词缀域普查（WorldGen.cs:54695-54766）', () => {
  const ORB = [96, 64, 162, 115, 111] as const;
  const HEART = [800, 1256, 802, 3062, 1290] as const;

  /** 原版 Prefix(-1) 消费域复刻：pool=rollablePrefixes(vid, isPrefixableAccessory(iid)) */
  const poolOf = (vid: number): number[] | null =>
    rollablePrefixes(vid, isPrefixableAccessory(iidOf(vid)));

  it('枪弓池：96 火枪 / 800 葬送者（:54748/:54718）', () => {
    expect(poolOf(96)).toEqual(PREFIX_POOLS.PrefixesForGunsBows);
    expect(poolOf(800)).toEqual(PREFIX_POOLS.PrefixesForGunsBows);
  });

  it('魔法池：64 毒荆棘 Vilethorn / 1256 猩红法杖（:54754/:54724）', () => {
    expect(poolOf(64)).toEqual(PREFIX_POOLS.PrefixesForMagic);
    expect(poolOf(1256)).toEqual(PREFIX_POOLS.PrefixesForMagic);
  });

  it('近战池：162 血腥獠牙 Ball O\' Hurt / 802 腐烂之叉（:54757/:54727）', () => {
    expect(poolOf(162)).toEqual(PREFIX_POOLS.PrefixesForSpears);
    expect(poolOf(802)).toEqual(PREFIX_POOLS.PrefixesForSpears);
  });

  it('配饰池 19：111 星辰能量带 / 1290 恐慌项链——isPrefixableAccessory 位真值', () => {
    expect(iidOf(111)).toBeGreaterThan(0);
    expect(iidOf(1290)).toBeGreaterThan(0);
    expect(isPrefixableAccessory(iidOf(111))).toBe(true);
    expect(isPrefixableAccessory(iidOf(1290))).toBe(true);
    expect(poolOf(111)).toEqual(PREFIX_POOLS.PrefixesForAccessories);
    expect(poolOf(1290)).toEqual(PREFIX_POOLS.PrefixesForAccessories);
    expect(poolOf(111)!.length).toBe(19);
  });

  it('宠物无池：115 暗影珠 / 3062 猩红之心（light pet 非配饰）→ roll 恒 0（原版 Prefix 提前 false 同相）', () => {
    expect(isPrefixableAccessory(iidOf(115))).toBe(false);
    expect(isPrefixableAccessory(iidOf(3062))).toBe(false);
    expect(poolOf(115)).toBeNull();
    expect(poolOf(3062)).toBeNull();
    for (let i = 0; i < 500; i++) {
      expect(rollNaturalPrefixForVid(115, false, seeded(i * 31 + 7))).toBe(0);
      expect(rollNaturalPrefixForVid(3062, false, seeded(i * 31 + 7))).toBe(0);
    }
  });

  it('自然掷抽验：96/111 各 2000 种子非零档全落池内（TryGet 门后）', () => {
    const gunPool = PREFIX_POOLS.PrefixesForGunsBows;
    let nonzero96 = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rollNaturalPrefixForVid(96, false, seeded(i * 6151 + 3));
      if (r !== 0) { nonzero96++; expect(gunPool).toContain(r); }
    }
    expect(nonzero96).toBeGreaterThan(500);   // 枪弓池无 mercy 全拦,1/4 早退+门重掷 → 出词缀率 >25%
    const accPool = PREFIX_POOLS.PrefixesForAccessories;
    let nonzero111 = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rollNaturalPrefixForVid(111, true, seeded(i * 8297 + 5));
      if (r !== 0) { nonzero111++; expect(accPool).toContain(r); }
    }
    expect(nonzero111).toBeGreaterThan(1000); // 配饰池 75% 词缀率（BJ394 同判例）
  });

  it('TryGet 判别面保留：池内 kb 乘子档对 0kb 物品不出（若池含 kb 档则逐种子验）', () => {
    for (const vid of [96, 800, 64, 1256, 162, 802]) {
      const pool = poolOf(vid)!;
      const hasKb = pool.some((p) => prefixStat(p).kb !== 1);
      if (!hasKb) continue;
      for (let i = 0; i < 1500; i++) {
        const r = rollNaturalPrefixForVid(vid, false, seeded(i * 4903 + vid));
        if (r !== 0) expect(prefixStat(r).kb).not.toBe(0);
      }
    }
  });

  it('火枪弹 97（首破伴随掉落 :54720/:54750 七参 NewItem 无 prefix 参）无池=恒 0', () => {
    expect(poolOf(97)).toBeNull();
    for (let i = 0; i < 200; i++) {
      expect(rollNaturalPrefixForVid(97, false, seeded(i * 13 + 97))).toBe(0);
    }
  });
});

describe('BJ399-件2 普查四面接线源码钉（-1 自然掷全收口）', () => {
  it('① smashOrbHeart：roll 接线在 spawnDrop 第 8 参位（vid+isPrefixableAccessory 单源）', () => {
    const game = readFileSync('src/core/Game.ts', 'utf8');
    // smashOrbHeart 体内：rollNaturalPrefixForVid(vid, …) 先掷、spawnDrop 随件
    const start = game.indexOf('private smashOrbHeart');
    expect(start).toBeGreaterThan(0);
    const end = game.indexOf('\n  private ', start + 10);
    const body = game.slice(start, end);
    expect(body).toMatch(/prefix = rollNaturalPrefixForVid\(vid, isPrefixableAccessory\(iid\), Math\.random\) \|\| undefined/);
    expect(body).toMatch(/spawnDrop\(ax \* TILE \+ 8, ay \* TILE \+ 8, key, 1, undefined, undefined, undefined, prefix\)/);
    expect(body).toContain('WorldGen.cs:54718-54763');   // 原版锚注在位
    // 火枪弹伴随掉落不掷（七参 NewItem 无 prefix 参 → spawnDrop 无第 8 参）
    expect(body).toMatch(/gelKey\) this\.spawnDrop\(ax \* TILE \+ 8, ay \* TILE \+ 8, gelKey, 100\)/);
  });

  it('③ dropFromExtractinator：Player.cs:42409 RequestNewItem(-1) 接线（产物掷后词缀掷）', () => {
    const game = readFileSync('src/core/Game.ts', 'utf8');
    const start = game.indexOf('private dropFromExtractinator');
    const body = game.slice(start, game.indexOf('\n  /**', start + 10));
    expect(body).toContain('Player.cs:42402-42410');
    expect(body).toMatch(/rollNaturalPrefixForVid\(drop\.itemType, isPrefixableAccessory\(ITEM_BY_KEY\[key\]!\), Math\.random\)/);
    expect(body).toMatch(/spawnDrop\(c\.x, c\.y, key, drop\.stack, undefined, undefined, undefined, prefix\)/);
  });

  it('④ dropItemStackImpl：Wiring.cs:2589 通电提取机 NewItem(-1) 接线', () => {
    const game = readFileSync('src/core/Game.ts', 'utf8');
    const start = game.indexOf('private dropItemStackImpl');
    const body = game.slice(start, game.indexOf('\n  /**', start + 10));
    expect(body).toContain('Wiring.cs:2589');
    expect(body).toMatch(/rollNaturalPrefixForVid\(vanillaItemId, isPrefixableAccessory\(ITEM_BY_KEY\[key\]!\), Math\.random\)/);
    expect(body).toMatch(/spawnDrop\(px, py, key, stack, undefined, undefined, undefined, prefix\)/);
  });

  it('⑤ palAI 救援奖赏：NPC.cs:43488 AI_127_Pal_GiveRewerd NewItem(-1) 接线（召唤池域）', () => {
    const enemy = readFileSync('src/entities/Enemy.ts', 'utf8');
    expect(enemy).toContain('NPC.cs:43481-43489');
    expect(enemy).toMatch(/rollNaturalPrefixForVid\(vid, isPrefixableAccessory\(ITEM_BY_KEY\[key\] \?\? -1\),\s*\(\) => Math\.random\(\)\) \|\| undefined/);
    expect(enemy).toMatch(/game\.spawnDrop\(this\.cx, this\.y, key, 1, undefined, undefined, undefined, prefix\)/);
    // 召唤池域前提：5663/5664 确属 Summon 池（词缀域非空=接线有可观测面）
    for (const vid of [5663, 5664]) {
      expect(rollablePrefixes(vid, isPrefixableAccessory(iidOf(vid)))).toEqual(PREFIX_POOLS.PrefixesForSummons);
    }
  });
});
