// 消耗品审计余项批回归（2026-08-22，docs/audit/item-audit-2026-08-22.md
// 补 B「散件消耗品」❌ 11 件 6 组 + 补 C「火把神药水 5573」余项）：
//   A. 微光永久六件 5337-5342：旗→属性结算消费端（UpdatePermanentBoosters
//      Player.cs:12446-12463 / :18931 / :19242/:19259 / :28676）
//   B. 货郎背包 5343：NPC.peddlersSatchelWasUsed → 旅商股票 +1
//      （Player.cs:44749-44762 + Chest.SetupTravelShop :1271-1273）
//   C. 恶魔之心 3335：extraAccessory → 第 6 配饰槽（:44575-44581/:51212 +
//      Inventory.accSlotMax 消费端；★:18139-18145 难度门偏差备案）
//   D. 红药水 678：普通世界 11 减益×3600s（:42271-42283）/ getGood 3 掷×1800s
//      （:42210-42269 十八态表）；35 Silenced 本批新增（:9737/:51383 消费端）
//   E. 火把神药水 5573 效果端：buff 376 → TorchGodsFlavor（:39529-39583 每 tick
//      1/10 扫屏）→ 弹 1084（AI_202 :37557-37596）抵达转换 tile 帧样式；
//      BiomeTorchPlaceStyle 群系表（:39586-39635）
//   F. ⚠️ 三小件核对：1345 彩带 / 1124 蜂巢（挥动+通用消耗 :42602）、
//      5328 金锁（R9 批已修，本批只核对消费链在位）
// 标杆：Terarria1457/（树基准 1457;本文件所涉数值两版同值,行号锚沿用 1456 段——
//      两树并存可解析;药水 case 288-305 段 1456/1457 逐字节同）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { BuffType, BUFF_DEFS } from '../src/stats/Buffs';
import { TILE_DEFS, T } from '../src/data/tiles';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import {
  biomeTorchPlaceStyle, IS_BIOME_TORCH_STYLE, TORCH_DUST_BY_STYLE,
} from '../src/world/Torch';
import { TorchGodHelperProj } from '../src/entities/WeaponProj';

const gameSrc = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
const playerSrc = readFileSync(new URL('../src/entities/Player.ts', import.meta.url), 'utf8');
const saveSrc = readFileSync(new URL('../src/save/SaveFile.ts', import.meta.url), 'utf8');
const restoreSrc = readFileSync(new URL('../src/mainFlow.ts', import.meta.url), 'utf8');
const buffsSrc = readFileSync(new URL('../src/stats/Buffs.ts', import.meta.url), 'utf8');

/** BUFF_BY_VANILLA 同构反查（Game.ts:135-136 同式——消耗品桥施加门） */
const BUFF_BY_VANILLA = new Map<number, BuffType>();
for (const [bt, d] of Object.entries(BUFF_DEFS)) BUFF_BY_VANILLA.set(d.vanillaBuff, Number(bt) as BuffType);

const mkPlayer = (): Player => new Player(0, 0, new Inventory());

/** 确定性 LCG（同种子双跑对拍用——5343 旅商股票 +1 差分） */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ============ A. 微光永久六件 5337-5342：旗 → 属性结算消费端 ============
describe('A① 神盾果 5338 usedAegisFruit → 防御 +4（UpdatePermanentBoosters :12447-12449）', () => {
  it('旗置位前 defense 基线 0，置位后 +4（裸装玩家）', () => {
    const p = mkPlayer();
    expect(p.defense).toBe(0);
    p.usedAegisFruit = true;
    expect(p.defense).toBe(4);
  });
  it('旗置位不重复叠加（getter 幂等，重算式聚合）', () => {
    const p = mkPlayer();
    p.usedAegisFruit = true;
    expect(p.defense).toBe(4);
    expect(p.defense).toBe(4);
  });
});

describe('A② 软糖虫 5341 usedGummyWorm → 钓力 +3（:12451-12453）', () => {
  // ★补 B 审计表记「+2」系误——反编译终值 fishingSkill += 3（1456 :12451-12453 ≡ 1457 :12952-12955 同值）
  it('equipStats.fishingSkill 旗置位后 +3', () => {
    const p = mkPlayer();
    const base = p.equipStats.fishingSkill;
    expect(base).toBe(0);
    p.usedGummyWorm = true;
    expect(p.equipStats.fishingSkill).toBe(3);
  });
});

describe('A③ 银河珍珠 5340 usedGalaxyPearl → 幸运 +0.03（:28676-28678）', () => {
  it('luckState.usedGalaxyPearl 置位后 luck +0.03', () => {
    const p = mkPlayer();
    const base = p.luck;
    p.luckState.usedGalaxyPearl = true;
    expect(p.luck).toBeCloseTo(base + 0.03, 5);
  });
  it('持久化：SaveFile permanentUpgrades 增 usedGalaxyPearl 位（PL:53835/:54303——'
    + '此前五件入档、5340 漏档=读档后可重复吃且加成丢失）', () => {
    expect(saveSrc).toContain('usedGalaxyPearl: player.luckState.usedGalaxyPearl');
    expect(restoreSrc).toContain('g.player.luckState.usedGalaxyPearl = pu.usedGalaxyPearl');
  });
});

describe('A④ 仙馔 5342 usedAmbrosia → 镐速-0.05/砌速+0.05/墙速+0.05（:12455-12462）', () => {
  /** Game 侧 placeSpeed*Raw 桩（私有方法 Object.create 直调）。
   *  ★SW-BJ59：tileSpeed 聚合单源迁移至 Player.placeSpeedTileRaw（Game 委托）——
   *  桩换真 Player 实例（mkPlayer 同款），仙馔位经 usedAmbrosia 置位（防双抄漂移） */
  const mkPlace = (ambrosia: boolean) => {
    const g = Object.create(Game.prototype) as unknown as {
      placeSpeedTileRaw: () => number; placeSpeedWallRaw: () => number;
    } & Record<string, unknown>;
    const p = mkPlayer();
    p.usedAmbrosia = ambrosia;
    g.player = p;
    return g;
  };
  it('placeSpeedTileRaw：仙馔 1→1.05（:12458 tileSpeed += 0.05）', () => {
    expect(mkPlace(false).placeSpeedTileRaw()).toBe(1);
    expect(mkPlace(true).placeSpeedTileRaw()).toBeCloseTo(1.05, 5);
  });
  it('placeSpeedWallRaw：仙馔 1→1.05（:12459 wallSpeed += 0.05）', () => {
    expect(mkPlace(false).placeSpeedWallRaw()).toBe(1);
    expect(mkPlace(true).placeSpeedWallRaw()).toBeCloseTo(1.05, 5);
  });
  it('镐速链含仙馔 -0.05 项（:12457 pickSpeed -= 0.05f → Game pickSpeed 加法链）', () => {
    expect(gameSrc).toContain('- (this.player.usedAmbrosia ? 0.05 : 0)');
  });
});

describe('A⑤ 神盾水晶 5337 usedAegisCrystal → 生命再生计时 +0.2/t（:18931-18933）', () => {
  it('lifeRegenTime 加法独立项 +0.2（★V2a 复核勘误:原版 :18930-18934 为加法并列项非乘算——曾写 (1+蜂蜜)×1.2,蜂蜜同挂 3.6/t vs 原版 3.2/t）', () => {
    expect(playerSrc).toContain('if (this.usedAegisCrystal) this.lifeRegenTime += 0.2;');
    expect(playerSrc).not.toContain('* (this.usedAegisCrystal ? 1.2 : 1)');
  });
  it('使用链：六件 flagOnce 一次性门 + 重复使用不消耗（:44768-44801 !used* 门）', () => {
    for (const [vid, flag] of [
      [5337, 'usedAegisCrystal'], [5338, 'usedAegisFruit'], [5339, 'usedArcaneCrystal'],
      [5341, 'usedGummyWorm'], [5342, 'usedAmbrosia'],
    ] as const) {
      expect(gameSrc).toContain(`case ${vid}: if (!p.${flag}) flagOnce(() => { p.${flag} = true; });`);
    }
  });
  it('UseSound：六件 = Item92（Item.cs SetDefaults 各 case；旧全程无声）', () => {
    expect(gameSrc).toContain('if (pvid >= 5337 && pvid <= 5342) this.playUseSound(pvid, \'pickup\');');
  });
});

describe('A⑥ 奥秘水晶 5339 usedArcaneCrystal → 魔力再生双消费端（:19242-19246/:19259-19262）', () => {
  it('manaRegenDelay -= 0.05（衰减段）', () => {
    expect(playerSrc).toContain('if (this.usedArcaneCrystal) this.manaRegenDelay -= 0.05;');
  });
  it('manaRegen += statManaMax2/50（回蓝段，2% 上限档）', () => {
    expect(playerSrc).toContain('if (this.usedArcaneCrystal) manaRegen += Math.floor(smm / 50);');
  });
});

// ============ B. 货郎背包 5343：旅商股票 +1 ============
describe('B 货郎背包 5343 peddlersSatchelWasUsed → SetupTravelShop num+1（Chest.cs:1271-1273）', () => {
  /** buildTravelStock 桩：同种子 LCG 双跑——旗标支无掷（num++ 纯加算），
   *  两跑消费同一随机序列 → 货架数恰差 1 */
  const runStock = (satchel: boolean, seed: number): number => {
    const w = new World(60, 60, 30, 'satchel');
    w.flags.hardMode = false;
    if (satchel) w.flags.peddlersSatchelUsed = true;
    const g = Object.create(Game.prototype) as unknown as {
      buildTravelStock: () => Array<[number, number]>;
    } & Record<string, unknown>;
    g.world = w;
    g.player = { luck: 0 };
    const rand = lcg(seed);
    vi.spyOn(Math, 'random').mockImplementation(rand);
    return g.buildTravelStock().length;
  };
  it('同种子对拍：旗置位后货架恰 +1（:1271 num++ 无掷）', () => {
    for (const seed of [20260822, 1456, 42]) {
      const without = runStock(false, seed);
      const withFlag = runStock(true, seed);
      expect(withFlag).toBe(without + 1);
    }
  });
  it('使用链静态锚：case 5343 置 world.flags.peddlersSatchelUsed + 世界公告'
    + '（:44756-44758 Main.NewText(Misc.PeddlersSatchelUsed, ChatColors.World)）', () => {
    expect(gameSrc).toContain('if (!this.world.flags.peddlersSatchelUsed) {');
    expect(gameSrc).toContain("Lang.text('Misc.PeddlersSatchelUsed')");
  });
});

// ============ C. 恶魔之心 3335：第 6 配饰槽 ============
describe('C 恶魔之心 3335 extraAccessory → 配饰槽容量（:44575-44581）', () => {
  it('逐槽解锁真值（★清偿刀 P :12669-12690——accSlotMax 连续界退役）：'
    + '经典 8 锁/大师无心态 8 锁 9 开/专家+心 8 开', () => {
    // ★2026-08-28 门（extraAccessory && (expertMode||gameMenu)）+ 大师水晶槽
    //  :12685-12689 无道具门;连续界在「大师无恶魔心」态反相已清偿（demon-heart-slots 判别锁）
    const p = mkPlayer();
    expect(p.inv.isItemSlotUnlockedAndUsable(8)).toBe(false);   // 经典:锁
    p.inv.extraAccessory = true;
    expect(p.inv.isItemSlotUnlockedAndUsable(8)).toBe(false);   // 旗在格锁(cs:18402)
    p.inv.gateExpert = true;
    expect(p.inv.isItemSlotUnlockedAndUsable(8)).toBe(true);    // 专家:第 6 槽(armor[8])
    p.inv.gateExpert = false;
    p.inv.gateMaster = true;
    expect(p.inv.isItemSlotUnlockedAndUsable(8)).toBe(true);    // 大师:心槽开
    expect(p.inv.isItemSlotUnlockedAndUsable(9)).toBe(true);    // 大师:原生第 7 格(9 号槽,无心亦开)
  });
  it('消费端在位：装备枚举/聚合以逐槽解锁谓词为门（★清偿刀 P）', () => {
    expect(playerSrc.match(/isItemSlotUnlockedAndUsable/g)?.length).toBeGreaterThanOrEqual(6);
    expect(gameSrc).toContain('if (!p.inv.isItemSlotUnlockedAndUsable(acc)) continue;');
  });
  it('使用链：专家/大师门 + 经典惰性 + 已用不重播（★V2a ⚠️f：经典 CanUse false :51212≡1457:52689'
    + ' =整支不可用三无;已用 !extraAccessory 门防重播音）', () => {
    expect(gameSrc).toContain("if (!(this.world.isExpert || this.world.isMaster)) break;");
    expect(gameSrc).toContain("if (!p.inv.extraAccessory) flagOnce(() => { p.inv.extraAccessory = true; });");
  });
  it('★清偿刀 P 逐槽谓词在案（:12669-12689——「大师无恶魔心」8 锁 9 开,连续界建模退役）', () => {
    expect(readFileSync(new URL('../src/items/Inventory.ts', import.meta.url), 'utf8'))
      .toContain('isItemSlotUnlockedAndUsable(slot: number, gameMenu = false)');
  });
});

// ============ D. 红药水 678：11 减益清单 + getGood 分支 + Silenced ============
describe('D 红药水 678（Player.cs:42205-42284）', () => {
  it('普通世界固定 11 减益 = :42271-42283 原表（20/22/23/24/30/31/32/33/35/36/68）'
    + '——旧表 [20..30,33,68] 混入 21/25-29 且漏 31/32/35/36 已纠', () => {
    const m = gameSrc.match(/const RED_BUFFS = \[([^\]]+)\];/);
    expect(m).not.toBeNull();
    expect(m![1].split(',').map((s) => Number(s.trim()))).toEqual([20, 22, 23, 24, 30, 31, 32, 33, 35, 36, 68]);
  });
  it('11 减益全部可经 BUFF_BY_VANILLA 反查（消耗品桥施加门不落空）', () => {
    for (const vb of [20, 22, 23, 24, 30, 31, 32, 33, 35, 36, 68]) {
      expect(BUFF_BY_VANILLA.has(vb), `vanillaBuff ${vb} 缺 BUFF_DEFS`).toBe(true);
    }
  });
  it('getGood 世界 3 掷 × 1800s：十八态表 = :42210-42269（16/111/114/8/105/17/116/5/113/7/6/104/115/2/9/3/117/1）且全可反查', () => {
    const m = gameSrc.match(/const GETGOOD_TABLE = \[([^\]]+)\];/);
    expect(m).not.toBeNull();
    expect(m![1].split(',').map((s) => Number(s.trim()))).toEqual(
      [16, 111, 114, 8, 105, 17, 116, 5, 113, 7, 6, 104, 115, 2, 9, 3, 117, 1]);
    for (const vb of m![1].split(',').map((s) => Number(s.trim()))) {
      expect(BUFF_BY_VANILLA.has(vb), `vanillaBuff ${vb} 缺 BUFF_DEFS`).toBe(true);
    }
    expect(gameSrc).toContain('p.buffs.apply(bt, 3600);    // time=216000t');
    expect(gameSrc).toContain('p.buffs.apply(bt, 1800);    // time=108000t');
  });
  it('useTime 17（Item.cs:9336 useStyle9 饮用；旧 30 系变性药水档串写）', () => {
    expect(gameSrc).toContain('consume(); p.useTime = 17; this.sfx.play(\'drink\');    // useTime 17（Item.cs:9336）');
  });
});

describe('D′ Silenced(35) 沉默——红药水 11 减益之一，本批新增', () => {
  it('BUFF_DEFS 挂 vanillaBuff 35（图标 Buff_35.png 在盘）', () => {
    expect(BUFF_DEFS[BuffType.Silenced].vanillaBuff).toBe(35);
    expect(BUFF_DEFS[BuffType.Silenced].descKey).toBe('BuffDescription.Silenced');
  });
  it('进 DEBUFFS 集（Main.debuff[35]=true，Main.cs:8815——护士可计价清除）', () => {
    const p = mkPlayer();
    p.buffs.apply(BuffType.Silenced, 60);
    expect(p.buffs.debuffCount()).toBe(1);
    expect(p.buffs.debuffCount(61)).toBe(0);   // >60s 门（:39466-39472 buffTime>60）
  });
  it('难度加时集含 35（BuffID.cs:28 BuffTimeIsExtendedWithGameDifficulty——'
    + '专家 ×2/大师 ×2.5 由 buffs.apply 消费；集为 vanillaBuff id 域,模块内私有故静态锚）', () => {
    expect(buffsSrc).toContain(
      'const BUFF_TIME_EXTENDED_BY_DIFFICULTY = new Set([20, 22, 23, 24, 323, 30, 31, 32, 33, 35, 36, 39, 44, 324, 46, 47, 69, 70, 80]);');
    expect(buffsSrc).toContain('[BuffType.Silenced]: { vanillaBuff: 35,');
  });
  it('消费端：mana>0 物品整支不可用（:51383-51385 sItem.mana > 0 && silence → flag=false）', () => {
    expect(gameSrc).toContain('if ((cw.mana ?? 0) > 0 && this.player.buffs.has(BuffType.Silenced)) {');
  });
});

// ============ E. 火把神转换链（5573 效果端） ============
describe('E① BiomeTorchPlaceStyle 群系→样式表（Player.cs:39586-39635）', () => {
  const z = (over: Partial<Parameters<typeof biomeTorchPlaceStyle>[0]> = {}) =>
    biomeTorchPlaceStyle({
      shimmer: false, dungeon: false, temple: false, underworld: false,
      glowshroom: false, hallow: false, corrupt: false, crimson: false,
      snow: false, jungle: false, desert: false, undergroundDesert: false,
      aboveSurface: true, remixWorld: false, ...over,
    });
  it('优先级链逐档（:39592-39638）：微光23>地牢13>神庙21>地狱7>蘑菇22>神圣20>腐化18>猩红19>雪9>丛林21>沙漠16', () => {
    expect(z({ shimmer: true })).toBe(23);
    expect(z({ dungeon: true })).toBe(13);
    expect(z({ temple: true })).toBe(21);
    expect(z({ underworld: true })).toBe(7);
    expect(z({ glowshroom: true })).toBe(22);
    expect(z({ hallow: true })).toBe(20);
    expect(z({ corrupt: true })).toBe(18);
    expect(z({ crimson: true })).toBe(19);
    expect(z({ snow: true })).toBe(9);
    expect(z({ jungle: true })).toBe(21);
  });
  it('沙漠双支（:39632-39638）：地表沙漠 16 / 地下沙漠 16 / remix 地表沙漠 16；无命中群系 = 0', () => {
    expect(z({ desert: true })).toBe(16);
    expect(z({ desert: true, aboveSurface: false })).toBe(0);              // 地下非地下沙漠 → 普通炬
    expect(z({ undergroundDesert: true, aboveSurface: false })).toBe(16);
    expect(z({ desert: true, aboveSurface: false, remixWorld: true })).toBe(16);
    expect(z()).toBe(0);
  });
  it('IsABiomeTorch 集 = TorchID.cs:12（转换只认群系炬；彩炬/诅咒等不转）', () => {
    expect([...IS_BIOME_TORCH_STYLE].sort((a, b) => a - b)).toEqual(
      [0, 7, 9, 13, 16, 18, 19, 20, 21, 22, 23].sort((a, b) => a - b));
    expect(IS_BIOME_TORCH_STYLE.has(3)).toBe(false);   // 绿炬非群系炬
  });
  it('TorchID.Dust 尾迹表 = TorchID.cs:77-81（24 样式全表）', () => {
    expect(TORCH_DUST_BY_STYLE).toHaveLength(24);
    expect(TORCH_DUST_BY_STYLE[0]).toBe(6);
    expect(TORCH_DUST_BY_STYLE[9]).toBe(135);     // 冰雪炬
    expect(TORCH_DUST_BY_STYLE[23]).toBe(310);    // 微光炬
  });
});

/** torchGodsFlavor 桩：小世界 + 雪原群系 + 指定样式火把。
 *  ★清偿刀 V（2026-09-29）夹具定谳：world.h 不得用 64——underworld 门 =
 *  `p.y > (h-200)*16`（Game.biomeTorchZonesAt,Player.cs:40574 [1457] 1:1;
 *  UnderworldLayer = maxTilesY-200,Main.cs:2886 = 世界高度比例面,原版在
 *  64 高世界同样恒地狱）→ 64 高使阈值 (64-200)*16 = -2176px 退化恒真,
 *  样式恒 7（地狱）,雪原 9 不可达（旧红:expected 7 to be 9）。h=300 →
 *  阈值 1600px（100 格）,夹具玩家 p.y=467 在其上 → underworld=false。
 *  生产零修刀（本仓式与原版逐式对拍一致）。 */
const mkFlavor = (torch: { x: number; y: number; style: number } | null, zoneSnow = true) => {
  const w = new World(64, 300, 32, 'torchflavor');
  if (torch) w.store.setTileSilent(torch.x, torch.y, T.TORCH, 0, torch.style * 22);
  const p = mkPlayer();
  p.x = 30 * 16 + 8 - 10; p.y = 30 * 16 + 8 - 21;   // cx,cy = 格中心 (488,488)
  const spawned: TorchGodHelperProj[] = [];
  const g = Object.create(Game.prototype) as unknown as {
    torchGodsFlavor: () => void;
  } & Record<string, unknown>;
  g.world = w;
  g.player = p;
  g.scene = { zoneSnow, belowSurface: true, zoneDungeon: false };
  g.renderer = { canvas: { width: 320, height: 320 } };
  g.entities = { projectiles: spawned as unknown[], nextId: 1, add: (e: TorchGodHelperProj) => { spawned.push(e); } };
  g.chunks = { markDirtyArea: () => {} };
  g.spawnDust = () => null;
  return { g, w, p, spawned };
};

describe('E② TorchGodsFlavor 扫描门（:39529-39583）', () => {
  it('雪原 + 异群系群系炬（丛林 21）→ 1/10 掷过后发 1084 指向目标格，目标样式 = 当期群系 9', () => {
    const { g, spawned } = mkFlavor({ x: 30, y: 28, style: 21 });
    const rand = lcg(7);
    let first = true;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      if (first) { first = false; return 0.04; }   // 首掷 <0.1 过门
      return rand();
    });
    g.torchGodsFlavor();
    expect(spawned).toHaveLength(1);
    expect(spawned[0].projId).toBe(1084);
    expect(spawned[0].style).toBe(9);
    expect(spawned[0].tx).toBe(30);
    expect(spawned[0].ty).toBe(28);
  });
  it('样式已匹配（雪原炬 9）→ 不发（:39556 num6 != style 门）', () => {
    const { g, spawned } = mkFlavor({ x: 30, y: 28, style: 9 });
    vi.spyOn(Math, 'random').mockReturnValue(0.04);
    g.torchGodsFlavor();
    expect(spawned).toHaveLength(0);
  });
  it('非群系炬（绿炬 3）→ 不发（IsABiomeTorch 门 :39554）', () => {
    const { g, spawned } = mkFlavor({ x: 30, y: 28, style: 3 });
    vi.spyOn(Math, 'random').mockReturnValue(0.04);
    g.torchGodsFlavor();
    expect(spawned).toHaveLength(0);
  });
  it('1/10 掷未过（≥0.1）→ 不扫不发（:39531 Main.rand.Next(10) != 0）', () => {
    const { g, spawned } = mkFlavor({ x: 30, y: 28, style: 21 });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    g.torchGodsFlavor();
    expect(spawned).toHaveLength(0);
  });
  it('buff 376 未在役不调（fixedUpdate 门——UpdateBuffs :10594-10596 施加链）', () => {
    expect(gameSrc).toContain('if (this.player.buffs.has(BuffType.TorchGodPotion)) this.torchGodsFlavor();');
  });
});

describe('E③ 弹 1084 抵达转换（AI_202 :37557-37596）', () => {
  it('抵达 16px 内 → 以 (tx,ty,style) 调转换回调 + Kill（:37562-37572；帧写入在'
    + ' Game 侧回调——下方静态锚）', () => {
    const w = new World(32, 32, 16, 'conv');
    w.store.setTileSilent(10, 10, T.TORCH, 0, 21 * 22);
    const converted: Array<[number, number, number]> = [];
    const bolt = new TorchGodHelperProj(10 * 16 + 8 - 8, 10 * 16 + 8, 1, 0, 9, 10, 10,
      (tx, ty, st) => { converted.push([tx, ty, st]); },
      () => {});
    const sfx: string[] = [];
    bolt.fixedUpdate(1 / 60, {
      world: { store: w.store },
      playSfxWav: (f: string) => { sfx.push(f); },
    } as never);
    expect(converted).toEqual([[10, 10, 9]]);
    expect(bolt.dead).toBe(true);
    expect(sfx).toContain('Item_10');            // Kill 音（:67611）
  });
  it('未抵达（>16px）→ 存活续飞（timeLeft 300t 等价由调用方节流,此处只证距离门）', () => {
    const w = new World(64, 64, 32, 'conv1');
    const bolt = new TorchGodHelperProj(10 * 16, 10 * 16 + 8, 4, 0, 9, 20, 10,
      () => { throw new Error('不应提前转换'); },
      () => {});
    bolt.fixedUpdate(1 / 60, { world: { store: w.store }, playSfxWav: () => {} } as never);
    expect(bolt.dead).toBe(false);
    expect(bolt.x).toBe(10 * 16 + 12);           // 3 次/tick × vx4（extraUpdates=2）
  });
  it('Game 侧转换回调静态锚：tile 4 校验门 + frameY = style×22（:37566-37571）', () => {
    expect(gameSrc).toContain('if (!st.flags[ci] || st.type[ci] !== T.TORCH) return;');
    expect(gameSrc).toContain('st.frameY[ci] = cs * 22;');
  });
});

// ============ F. ⚠️ 三小件核对 ============
describe('F 彩带 1345 / 蜂巢 1124：挥动 + 通用消耗（:42602 consumable 门）', () => {
  it('1345 数据锚：useStyle1/useTime=useAnimation=20/autoReuse/consumable，无 shoot/createTile'
    + '（Item.cs:16620-16629——原版零使用效果,纯挥动+白耗）', () => {
    const c = itemCombat(1345);
    expect(c?.consumable).toBe(true);
    expect(c?.autoReuse).toBe(true);
    expect(itemFuncOfVid(1345)?.useStyle).toBe(1);
    expect(itemFuncOfVid(1345)?.createTile === undefined || itemFuncOfVid(1345)?.createTile === null).toBe(true);
    expect(c?.shoot ?? 0).toBe(0);
  });
  it('1124 数据锚：useTime 10/useAnimation 15/autoReuse/consumable，无 createTile'
    + '（Item.cs:13816-13825；挥动发蜂在 updateSwingHits hiveBeeRoll）', () => {
    const c = itemCombat(1124);
    expect(c?.consumable).toBe(true);
    expect(c?.useTime).toBe(10);
    expect(c?.useAnimation).toBe(15);
    expect(c?.autoReuse).toBe(true);
    expect(itemFuncOfVid(1124)?.createTile === undefined || itemFuncOfVid(1124)?.createTile === null).toBe(true);
  });
  it('两件均已入 FUN_USE_VIDS 使用链（挥动+消耗+冷却）', () => {
    // 2026-08-26 演奏通道批扩容：4057/4372/4715 三吉他 + 1305 The Axe（见 Game.ts 注）
    expect(gameSrc).toContain('const FUN_USE_VIDS = new Set([');
    expect(gameSrc).toContain('4057, 4372, 4715,   // 吉他三件');
    expect(gameSrc).toContain('1305,               // The Axe');
    expect(gameSrc).toContain('case 1345:');
    expect(gameSrc).toContain('case 1124:');
    expect(gameSrc).toContain('case 4057:');
    expect(gameSrc).toContain('case 4715:');
    expect(gameSrc).toContain('case 1305:');
  });
});

describe('F′ 金锁 5328（R9 批已修——本批只核对不重复修）', () => {
  it('样式表消费链在位：chestLockOf → frameX 平移 + 消耗（:40946-41010）', () => {
    expect(gameSrc).toContain('const spec = chestLockOf(sheet, st.frameX[ti0]);');
    expect(gameSrc).toContain('case 5328: {');
  });
});
