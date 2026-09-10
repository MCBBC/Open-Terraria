// SW-FX26 微债凑批（2026-09-10）逐笔定谳/修复矩阵。每笔独立可回滚：
//   ① TILE_BY_KEY['chest']=16 域差定谳（BJ54 翻案:内部 id 域≠原版 TileID 域,键表无罪）
//   ② itemNames 49 键缺口回填（FX22:items 6147-6195 在而 itemNames 缺,atlas-append 通道补）
//   ③ VanillaSpawner 注释误标纠偏（303=BunnySlimed 非"万圣黑猫";667=GoldenSlime 非"派对史莱姆"）
//   ④ anchors yOff 提取器复位修复（FX18/BJ40:DrawYOffset=0 缺省随 addTile 复位,
//      TileObjectData.cs:1793/:2005/:2013——151 格残留 -2/2/+4 清零,显式值保留）
//   ⑤ tile 590 宝石树苗 fw:3 定谳翻案（占用面 w:1 h:2 与 TileObjectData 1×2 一致,
//      fw:3=54px 风格带宽 = frameX/54 宝石序号域,WorldGen.cs:73470 AttemptToGrowTreeFromSapling case 590）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE_BY_KEY, TILE_DEFS, T, VANILLA_TILE_ID } from '../src/data/tiles';
import manifestJson from '../src/data/tile-anchors.json';
import goldenJson from './golden/tile-anchor-authority.json';

const here = dirname(fileURLToPath(import.meta.url));
const vanillaJson = JSON.parse(readFileSync(join(here, '../public/sprites/vanilla.json'), 'utf8')) as {
  items: Record<string, { name?: string }>;
  itemNames: Record<string, string>;
};

describe('SW-FX26 ① TILE_BY_KEY chest 键域（BJ54 翻案:内部 id 域,非原版 TileID 域）', () => {
  it("TILE_BY_KEY['chest'] 指涉 chest def 本体（键表零占用）", () => {
    const id = TILE_BY_KEY['chest'];
    expect(id).toBe(T.CHEST);                       // 内部注册序 16（tiles.ts :66 def 顺序）
    expect(TILE_DEFS[id].key).toBe('chest');
    expect(TILE_DEFS[id].vanilla?.sheet).toBe(21);  // 原版宝箱 TileID 21（渲染/掉落换算走 vanilla 域）
    expect(VANILLA_TILE_ID.get(21)).toBe(id);       // 反向表同锚（tiles.ts :992 注释:两域必须经表换算）
  });

  it("键表无重复键侵占（'chest' 唯一 def 键,v_ 批量键不冲突）", () => {
    const keys = TILE_DEFS.map((d) => d.key).filter((k) => k === 'chest');
    expect(keys).toHaveLength(1);
  });
});

describe('SW-FX26 ② itemNames 6147-6195 成对回填（FX22 定谳）', () => {
  it('49 键 items/itemNames 成对且 round-trip 相等', () => {
    for (let id = 6147; id <= 6195; id++) {
      const k = String(id);
      expect(vanillaJson.items[k], `items[${k}] 在库`).toBeTruthy();
      expect(vanillaJson.itemNames[k], `itemNames[${k}] 缺`).toBeTruthy();
      expect(vanillaJson.itemNames[k]).toBe(vanillaJson.items[k].name);
    }
  });

  it('items 与 itemNames 全域计数相等（成对写契约,防再次漏半边）', () => {
    expect(Object.keys(vanillaJson.itemNames).length).toBe(Object.keys(vanillaJson.items).length);
  });

  it('抽验命名法与既有条目同源（TEdit 显示名,非 CamelCase 变量名）', () => {
    expect(vanillaJson.itemNames['6147']).toBe('Giant Tiki');
    expect(vanillaJson.itemNames['6148']).toBe('Trusty Cattiva');
    expect(vanillaJson.itemNames['6195']).toBe('Guide to Old World Parkour (Inactive)');
  });
});

describe('SW-FX26 ③ VanillaSpawner 注释域纠偏（只动注释,代码零改）', () => {
  const src = readFileSync(join(here, '../src/world/spawn/VanillaSpawner.ts'), 'utf8');

  it('303 槽注释 = BunnySlimed（NPCID.cs:11677;原版万圣档 NPC.cs:1639 即掷 303）', () => {
    expect(src).not.toContain('万圣黑猫');            // 旧误标（黑猫类 HoppinJack=304 不在此槽）
    const lines = src.split('\n');
    const d303 = lines.filter((l) => /return D\(303\)/.test(l));
    expect(d303.length).toBeGreaterThanOrEqual(4);    // 四处节日档全补名（SW-FX26）
    for (const l of d303) expect(l).toMatch(/BunnySlimed|史莱姆兔/);
  });

  it('667 槽注释 = GoldenSlime（NPCID.cs:12405;NPC.cs:5252-5261 十周年掷）', () => {
    expect(src).not.toContain('派对史莱姆');
    expect(src).toContain('GoldenSlime');
  });
});

describe('SW-FX26 ④ anchors yOff 提取器复位（FX18/BJ40 定谳+修复）', () => {
  it('运行时表与金标逐字一致（recon-tileobj 双写同源）', () => {
    expect(goldenJson).toEqual(manifestJson);
  });

  it('家族头缺省继承残留清零：CopyFrom(Style3x2) 族 14/17/77 yOff=0（反编译块无 DrawYOffset）', () => {
    const tiles = manifestJson.tiles as Record<string, { yOff: number }>;
    for (const t of ['14', '17', '77', '590', '21', '3']) {
      expect(tiles[t].yOff, `tiles[${t}].yOff`).toBe(0);
    }
  });

  it('显式 DrawYOffset 钉值保留（复位只清残留,不吞显式写）', () => {
    const tiles = manifestJson.tiles as Record<string, { yOff: number }>;
    expect(tiles['454'].yOff).toBe(-2);   // TileObjectData.cs:3166
    expect(tiles['699'].yOff).toBe(2);    // :3450
    expect(tiles['217'].yOff).toBe(2);    // :3355
    expect(tiles['227'].yOff).toBe(-20);  // :2184（StyleDye 前缀块）
    expect(tiles['81'].yOff).toBe(-8);
    expect(tiles['701'].yOff).toBe(-16);
  });
});

describe('SW-FX26 ⑤ tile 590 宝石树苗双域定谳（FX18 剩债翻案）', () => {
  it('占用面 w:1 h:2 = 原版 TileObjectData 1×2（TileObjectData.cs:4919-4931）', () => {
    const def = TILE_DEFS[TILE_BY_KEY['v_590_gem_saplings']];
    expect(def.w).toBe(1);
    expect(def.h).toBe(2);
    const a = (manifestJson.tiles as Record<string, { w: number; h: number }>)['590'];
    expect(a.w).toBe(1);   // 提取器权威表与 def 占用面一致
    expect(a.h).toBe(2);
  });

  it('渲染面 fw:3 = 54px 风格带宽 = frameX/54 宝石序号域（WorldGen.cs:73470,刻意约定非缺陷）', () => {
    const def = TILE_DEFS[TILE_BY_KEY['v_590_gem_saplings']];
    expect(def.vanilla?.fw).toBe(3);       // 3×18=54px:Game.ts 树苗成长 /54 与放置帧 style*fw*18 同域
    expect(def.vanilla?.fh).toBe(2);
  });
});
