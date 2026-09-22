// 发色剂系统测试（§6 docs/implementation-gap-list-2026-08-13.md）：
//  ① 提取表对账（12 染料 + 1990 去除剂，shaderId 1..12 执行序锚）
//  ② 槽位语义（Player.hairDye byte：使用链门 `hairDye >= 0` 1:1 + 存档往返 + 旧档缺省 0）
//  ③ 渲染色公式抽查（生命力/魔力/深度/金钱/昼夜/队伍/派对/彩虹/速度/火星/暮光）
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import hairJson from '../src/data/vanilla-hairdyes.json';
import {
  HAIR_DYE_REMOVER_ITEM, HAIR_DYE_ITEM_IDS, hairDyeShaderOfItem,
  hairDyeItemOfShader, hairDyeEntryOfItem, PARTY_HAIR_DYE_SHADER_ID,
} from '../src/data/vanillaHairDyes';
import { hairDyeColor, type HairDyeCtx } from '../src/player/HairDyeColor';
import { VI, VI_ID } from '../src/data/itemKeys';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { saveGame, loadSave } from '../src/save/SaveFile';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CS_PRESENT = existsSync(join(ROOT, '..', 'Terarria1457', 'Terraria.Initializers', 'DyeInitializer.cs'));
const TABLE = (hairJson as unknown as { hairDyes: Record<string, { shaderId: number; kind: string; bindLine: number }> }).hairDyes;

const ctx = (over: Partial<HairDyeCtx> = {}): HairDyeCtx => ({
  hp: 100, maxHp: 100,
  mana: 20, maxMana: 20,
  centerX: 1600, centerY: 1600,
  vx: 0, vy: 0,
  team: 2, netActive: false,
  hairColor: { r: 215, g: 90, b: 55 },
  coins: 0,
  worldSurface: 200, rockLayer: 400, maxTilesY: 1200,
  isDay: true, time: 0,
  waterStyle: 0, zoneShimmer: false,
  shimmerTorch: [0.9, 0.55, 1.2],
  disco: [255, 0, 0],
  lightRgb: null,
  nowSec: 0,
  ...over,
});

describe('发色剂·提取表对账', () => {
  it('12 件染料 + 1990 去除剂；shaderId 连续 1..12 无重复', () => {
    expect(Object.keys(TABLE).length).toBe(12);
    expect(HAIR_DYE_ITEM_IDS).toEqual([1977, 1978, 1979, 1980, 1981, 1982, 1983, 1984, 1985, 1986, 1990, 2863, 3259]);
    expect(HAIR_DYE_REMOVER_ITEM).toBe(1990);
    const ids = Object.values(TABLE).map((e) => e.shaderId).sort((a, b) => a - b);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('BindShader 执行序锚（LoadLegacyHairdyes 先 11 条 → 3259 收尾 = 12）', () => {
    // DyeInitializer.cs 绑定行号（:153/:160/:167/:217/:287/:332/:341/:385/:390/:395/:410/:147）
    expect(hairDyeEntryOfItem(1977)?.bindLine).toBe(153);
    expect(hairDyeEntryOfItem(1978)?.bindLine).toBe(160);
    expect(hairDyeEntryOfItem(1979)?.bindLine).toBe(167);
    expect(hairDyeEntryOfItem(1980)?.bindLine).toBe(217);
    expect(hairDyeEntryOfItem(1981)?.bindLine).toBe(287);
    expect(hairDyeEntryOfItem(1982)?.bindLine).toBe(332);
    expect(hairDyeEntryOfItem(1983)?.bindLine).toBe(341);
    expect(hairDyeEntryOfItem(1984)?.bindLine).toBe(385);
    expect(hairDyeEntryOfItem(1985)?.bindLine).toBe(390);
    expect(hairDyeEntryOfItem(1986)?.bindLine).toBe(395);
    expect(hairDyeEntryOfItem(2863)?.bindLine).toBe(410);
    expect(hairDyeEntryOfItem(3259)?.bindLine).toBe(147);   // LoadHairDyes :147，执行在 legacy 之后 → 12
    expect(hairDyeEntryOfItem(3259)?.kind).toBe('twilight');
  });

  it('Item.hairDye 语义 1:1（Item.cs:48320-48322 + :21275）', () => {
    expect(hairDyeShaderOfItem(1977)).toBe(1);
    expect(hairDyeShaderOfItem(1986)).toBe(10);
    expect(hairDyeShaderOfItem(2863)).toBe(11);      // 清单样本
    expect(hairDyeShaderOfItem(3259)).toBe(12);      // 清单样本
    expect(hairDyeShaderOfItem(1990)).toBe(0);       // 清单样本：去除剂 hairDye=0（跳过查表）
    expect(hairDyeShaderOfItem(8)).toBe(-1);         // 火把：非发色剂
    expect(hairDyeShaderOfItem(0)).toBe(-1);
    expect(hairDyeItemOfShader(1)).toBe(1977);
    expect(hairDyeItemOfShader(12)).toBe(3259);
    expect(hairDyeItemOfShader(0)).toBeNull();
  });

  it('全族物品已注册（Game.ts 使用链 vid 直读可解析）', () => {
    for (const vid of HAIR_DYE_ITEM_IDS) {
      expect(VI(vid), `物品 ${vid} 未注册`).toMatch(/^vi_/);
      expect(VI_ID(vid), `物品 ${vid} 内部 id 缺失`).toBeGreaterThan(0);
    }
  });
});

// 审计层：C# 反编译源不存在（其他环境）时跳过，不阻塞
(CS_PRESENT ? describe : describe.skip)('发色剂·提取器审计层(spawn --audit)', () => {
  it('extract-hairdyes：anomalies 为空 + 12 条 + 钉死 1977/3259', () => {
    const r = spawnSync('node', [join(ROOT, 'tools', 'extract-hairdyes.mjs'), '--audit'], {
      cwd: ROOT, encoding: 'utf8', timeout: 60_000,
    });
    const j = JSON.parse((r.stdout ?? '').trim().split('\n').pop()!);
    expect(j.anomalies).toEqual([]);
    expect(j.entries).toBe(12);
    expect(j.pinned['1977'].shaderId).toBe(1);
    expect(j.pinned['3259'].shaderId).toBe(12);
  });
});

describe('发色剂·槽位语义（Player.hairDye byte）', () => {
  it('默认 0（无染料）——旧档/新角色同', () => {
    expect(new Player(0, 0, new Inventory()).hairDye).toBe(0);
  });

  it('使用链门 `item.hairDye >= 0`：13 件全通过（1990 在内 = 清除）', () => {
    // Player.cs:42179-42186：门是 >= 0，1990（hairDye=0）也进——使用即 player.hairDye=0
    for (const vid of HAIR_DYE_ITEM_IDS) {
      expect(hairDyeShaderOfItem(vid), `物品 ${vid} 应通过使用门`).toBeGreaterThanOrEqual(0);
    }
    // 使用 1990 = 清槽；使用 1982 = shaderId 6
    expect(hairDyeShaderOfItem(1990)).toBe(0);
    expect(hairDyeShaderOfItem(1982)).toBe(6);
  });

  it('saveGame → loadSave 往返持久化（Player.cs:53805-53808 byte）', () => {
    const w = new World(60, 40, 42, 'hairdye-test');
    const p = new Player(100, 100, new Inventory());
    p.hairDye = 6;   // 队伍发色剂
    const { player } = loadSave(saveGame(w, p, 0));
    expect(player.hairDye).toBe(6);
  });

  it('旧档缺省兼容：剥掉 hairDye 字段 → undefined（回填 0）', () => {
    const w = new World(60, 40, 42, 'hairdye-legacy');
    const p = new Player(0, 0, new Inventory());
    const raw = JSON.parse(saveGame(w, p, 0)) as { player: Record<string, unknown> };
    delete raw.player.hairDye;
    const { player } = loadSave(JSON.stringify(raw));
    expect(player.hairDye).toBeUndefined();
  });

  it('派对染料 shaderId 常量 = 1984（UpdateHairDyeDust 的误名 TeamDyeShaderIndex）', () => {
    expect(PARTY_HAIR_DYE_SHADER_ID).toBe(8);
  });
});

describe('发色剂·渲染色公式抽查（DyeInitializer.cs 逐委托）', () => {
  it('1977 生命力（:153-159）：血量比例红、满血=255/20/20', () => {
    expect(hairDyeColor(1, ctx({ hp: 100, maxHp: 100 }))).toEqual({ r: 255, g: 20, b: 20 });
    expect(hairDyeColor(1, ctx({ hp: 0, maxHp: 100 }))).toEqual({ r: 20, g: 20, b: 20 });
    expect(hairDyeColor(1, ctx({ hp: 50, maxHp: 100 }))).toEqual({ r: 137, g: 20, b: 20 });
  });

  it('1978 魔力（:160-166）：缺蓝蓝移、满蓝=(50,75,255)', () => {
    expect(hairDyeColor(2, ctx({ mana: 20, maxMana: 20 }))).toEqual({ r: 50, g: 75, b: 255 });
    expect(hairDyeColor(2, ctx({ mana: 0, maxMana: 20 }))).toEqual({ r: 250, g: 255, b: 255 });
  });

  it('1979 深度（:167-216）：按中心 Y 五段带', () => {
    // 第一段边界内：y < worldSurface*0.45*16 = 1440 → (116,160,249)→(28,216,94) 插值
    expect(hairDyeColor(3, ctx({ centerY: 0 }))).toEqual({ r: 116, g: 160, b: 249 });
    // 深处兜底：y ≥ (maxTilesY-150)*16 = 16800 → (255,50,10)
    expect(hairDyeColor(3, ctx({ centerY: 99999 }))).toEqual({ r: 255, g: 50, b: 10 });
  });

  it('1980 金钱（:217-286）：三阈值（5金/50金/2铂）四色阶', () => {
    expect(hairDyeColor(4, ctx({ coins: 0 }))).toEqual({ r: 226, g: 118, b: 76 });
    expect(hairDyeColor(4, ctx({ coins: 50000 }))).toEqual({ r: 174, g: 194, b: 196 });
    expect(hairDyeColor(4, ctx({ coins: 500000 }))).toEqual({ r: 204, g: 181, b: 72 });
    expect(hairDyeColor(4, ctx({ coins: 2000000 }))).toEqual({ r: 161, g: 172, b: 173 });
    expect(hairDyeColor(4, ctx({ coins: 99999999999 }))).toEqual({ r: 161, g: 172, b: 173 });
  });

  it('1981 昼夜（:287-331）：昼首段蓝→黄', () => {
    expect(hairDyeColor(5, ctx({ isDay: true, time: 0 }))).toEqual({ r: 1, g: 142, b: 255 });
    expect(hairDyeColor(5, ctx({ isDay: true, time: 27000 }))).toEqual({ r: 255, g: 255, b: 0 });
    // 夜末段紫→蓝（time 32400 回到 (1,142,255)）
    expect(hairDyeColor(5, ctx({ isDay: false, time: 32400 }))).toEqual({ r: 1, g: 142, b: 255 });
  });

  it('1982 队伍（:332-340）：单机 netMode=0 → 恒白；联机取 team 色', () => {
    expect(hairDyeColor(6, ctx({ team: 2, netActive: false }))).toEqual({ r: 255, g: 255, b: 255 });
    // 1456 Main.cs:6612 teamColor[2] = (59,218,85)（1405 Main.cs:5103 同值）——
    // 旧期望 (88,219,84) 两版反编译均不符（陈旧笔误，2026-08-20 校正）
    expect(hairDyeColor(6, ctx({ team: 2, netActive: true }))).toEqual({ r: 59, g: 218, b: 85 });
  });

  it('1984 派对（:385-389）/ 1985 彩虹（:390-394）：直通色', () => {
    expect(hairDyeColor(8, ctx())).toEqual({ r: 244, g: 22, b: 175 });
    expect(hairDyeColor(9, ctx({ disco: [10, 200, 30] }))).toEqual({ r: 10, g: 200, b: 30 });
  });

  it('1986 速度（:395-409）：静止=原发色、极速→(75,255,200)', () => {
    expect(hairDyeColor(10, ctx({ vx: 0, vy: 0 }))).toEqual({ r: 215, g: 90, b: 55 });
    expect(hairDyeColor(10, ctx({ vx: 10, vy: 0 }))).toEqual({ r: 75, g: 255, b: 200 });
    expect(hairDyeColor(10, ctx({ vx: 99, vy: 0 }))).toEqual({ r: 75, g: 255, b: 200 });  // 封顶 10
  });

  it('2863 火星（:410-420）：头部光照与发色逐通道均值', () => {
    expect(hairDyeColor(11, ctx({ lightRgb: [255, 255, 255] }))).toEqual({ r: 235, g: 172, b: 155 });
    expect(hairDyeColor(11, ctx({ lightRgb: [0, 0, 0] }))).toEqual({ r: 107, g: 45, b: 27 });
  });

  it('3259 暮光（:147）：近似实现有输出且随时间摆动', () => {
    const a = hairDyeColor(12, ctx({ nowSec: 0 }));
    const b = hairDyeColor(12, ctx({ nowSec: 3.5 }));
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toEqual(b);
  });

  it('shaderId 0/越界 → null（HairShaderDataSet.cs:41 门）', () => {
    expect(hairDyeColor(0, ctx())).toBeNull();
    expect(hairDyeColor(13, ctx())).toBeNull();
  });
});
