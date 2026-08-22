// 补 C 审计（docs/audit/item-audit-2026-08-22.md「buffType 余量 / other 类全量补审计」）
// 趣味件 ❌13 + ⚠️4 修复批回归锁。标杆 = ../Terarria1456/（行号均亲核反编译原文）：
//   507 铃 / 508 竖琴   Player.cs:45905-45936（ItemCheck_PlayInstruments——★纯音效
//                       无弹体：PlaySound(Item26/35) + Main.musicPitch，审计"音效弹"系误记）
//   4673 鼓槌           Player.cs:46003-46023（站鼓组 tile 486 才发声）+ PlayDrums :46106
//   1345 彩带           Item.cs:16620-16629——★原版零使用效果（Player.cs 全源零引用，
//                       仅 Main.cs:26764/:26777 微光绘制），consumable=1 走 :42602
//                       通用消耗；审计"彩纸弹"系与彩带炮 6658/弹 178 混淆
//   1124 蜂巢           Player.cs:42946-42958（挥动 1/30 发蜂弹 181）+ beeType/beeDamage :12006/:12017
//   3020-3023          ★审计误记"绳圈"——ItemID.cs:7579-7585 = TendonHook/ThornHook/
//                       IlluminantHook/WormHook 四钩爪（shoot 486-489 aiStyle 7），
//                       本仓 grappleHooks.ts:136-139 已全量在表（钩爪放置=铺绳不成立）
//   5328 金锁           Player.cs:40946-41010 PlaceThing_LockChest + Chest.Lock Chest.cs:409-473
//   968 棉花糖          Player.cs:49604-49641（holdStyle 1 静持 + 燃着篝火 frameY<54 门，
//                       miscTimer>900 → 掉 969 烤棉花糖）
//   425 仙灵铃          Player.cs:52252-52272（左键直用三选一 27/101/102——QuickBuff 同入口）
//   5343 货郎背包       Player.cs:44749-44762（一次性旗 → 旅商股票 +1，Chest.cs:1271）
//   ⚠️ 星云图标 173-181 Player.cs:56091-56121 NebulaLevelup + :11660 UpdateBuffs_NebulaBuffs
//   ⚠️ 3353 机械矿车     Mount.cs:1505-1506 frontTextureGlow=MinecartMechMount[1]
//   ⚠️ 5644 占卜球       （Game.ts:9382 已实装批）回归锁
//   ⚠️ 1450/4673/508    （FunItems.ts 已实装批）回归锁
import { describe, it, expect } from 'vitest';
import {
  instrumentUseSound, drumSoundFile, bubbleWandGoreRoll, hiveBeeRoll,
  fairyBellVariant, chestLockOf,
} from '../src/items/FunItems';
import { FUN_USE_VIDS } from '../src/core/Game';
import { HOOK_ITEMS, HOOK_PROJ_STATS } from '../src/data/grappleHooks';
import { BUFF_DEFS } from '../src/stats/Buffs';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { itemUseSoundWav } from '../src/data/itemUseSound';
import { ITEM_BY_KEY } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { MOUNT_DATA } from '../src/entities/Mounts';
import { Minecart } from '../src/entities/Minecart';
import zhHans from '../public/l10n/zh-Hans.json';

/** 确定性 LCG（种子化随机源——掷骰断言用） */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// ❌ 音效"弹"族（507/508/4673/1345）——原版均为无弹体纯演出/消耗件
// ---------------------------------------------------------------------------
describe('❌507 铃（Player.cs:45905-45936 与 508 共段）', () => {
  it('音色 Item35（:45930-45933 sItem.type==507 分支）、竖琴恒 Item26', () => {
    expect(instrumentUseSound(507)).toBe('Item_35');
    expect(instrumentUseSound(508)).toBe('Item_26');
  });
  it('注册 + 数据锚：FUN_USE_VIDS 在册、useTime 12（Item.cs:7392-7402）', () => {
    expect(FUN_USE_VIDS.has(507)).toBe(true);
    expect(itemCombat(507)?.useTime).toBe(12);
    expect(itemFuncOfVid(507)?.useStyle).toBe(1);      // 挥动（508 为 5 静持）
  });
});

describe('❌508 竖琴回归锁（已实装批，FunItems.ts）', () => {
  it('注册在册 + useTime 12（Item.cs:7403-7413）+ 无 UseSound（音在 PlayInstruments 段）', () => {
    expect(FUN_USE_VIDS.has(508)).toBe(true);
    expect(itemCombat(508)?.useTime).toBe(12);
    expect(itemUseSoundWav(508)).toBeNull();
  });
});

describe('❌4673 鼓槌回归锁（Player.cs:46003-46023 + PlayDrums :46106-46156）', () => {
  it('注册在册 + 10 档音色边界（1/10 步进阈值递减、兜底 Item60）', () => {
    expect(FUN_USE_VIDS.has(4673)).toBe(true);
    expect(drumSoundFile(0)).toBe('Item_60');
    expect(drumSoundFile(0.95)).toBe('Item_59');       // > 9×0.1
    expect(drumSoundFile(0.11)).toBe('Item_55');       // > 1×0.1
  });
  it('鼓组 tile 486 在库（发声门 = 玩家中心格站上鼓组）', () => {
    const t = TILE_BY_KEY['v_486_drum_set'];
    expect(t).toBeDefined();
    expect(TILE_DEFS[t]?.vanilla?.sheet).toBe(486);    // TileID.DrumSet（TileID.cs:1405）
  });
});

describe('❌1345 彩带（Item.cs:16620-16629——原版零使用效果定谳）', () => {
  it('无 UseSound/shoot/createTile（"彩纸弹"系误记——Player.cs 全源零引用）', () => {
    expect(itemUseSoundWav(1345)).toBeNull();
    expect(itemCombat(1345)?.shoot ?? 0).toBe(0);
    expect(itemFuncOfVid(1345)?.createTile ?? 0).toBe(0);
  });
  it('consumable=1 → 走 :42602 通用消耗门；注册在册', () => {
    expect(itemCombat(1345)?.consumable).toBe(true);
    expect(FUN_USE_VIDS.has(1345)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ❌1124 蜂巢（Player.cs:42946-42958 挥动发蜂）
// ---------------------------------------------------------------------------
describe('❌1124 蜂巢（Player.cs:42946-42958）', () => {
  it('发蜂掷骰：1/30 门（:42948 Next(30)==0）+ 伤 beeDamage(5)=5+Next(2)（:12017-12024）', () => {
    let hits = 0;
    const seen = new Set<number>();
    const r = lcg(20260822);
    for (let i = 0; i < 3000; i++) {
      const roll = hiveBeeRoll(r);
      if (roll) { hits++; seen.add(roll.damage); }
    }
    expect(hits).toBeGreaterThan(60);                  // 期望 100（3000/30），LCG 波动容差
    expect(hits).toBeLessThan(150);
    expect([...seen].every((d) => d === 5 || d === 6)).toBe(true);   // 5+Next(2)
  });
  it('落空返回 null（29/30 概率不生成）', () => {
    expect(hiveBeeRoll(() => 0.5)).toBeNull();         // floor(0.5*30)=15 ≠ 0
    expect(hiveBeeRoll(() => 0.01)).not.toBeNull();    // floor(0.3)=0 命中
  });
  it('数据锚：useTime 10/anim 15 + consumable（Item.cs:13816-13825）+ 注册在册', () => {
    const c = itemCombat(1124)!;
    expect(c.useTime).toBe(10);
    expect(c.useAnimation).toBe(15);
    expect(c.consumable).toBe(true);
    expect(FUN_USE_VIDS.has(1124)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ❌3020-3023（审计误记"绳圈"——实为四钩爪，回归锁既有钩爪链）
// ---------------------------------------------------------------------------
describe('❌3020-3023 四钩爪（ItemID.cs:7579-7585 Tendon/Thorn/Illuminant/Worm Hook）', () => {
  it('物品族 shoot=486+type-3020（Item.cs:27946）全在 HOOK_ITEMS', () => {
    for (let vid = 3020; vid <= 3023; vid++) {
      expect(HOOK_ITEMS[vid]?.shoot).toBe(486 + vid - 3020);
      expect(HOOK_ITEMS[vid]?.shootSpeed).toBe(vid === 3021 ? 16 : 15);  // :27955-27957
    }
  });
  it('弹体 486-489 玩法数值在 HOOK_PROJ_STATS（射程 480/回收 18，Projectile.cs:49706/:49912）', () => {
    for (let p = 486; p <= 489; p++) {
      expect(HOOK_PROJ_STATS[p]?.range).toBe(480);
      expect(HOOK_PROJ_STATS[p]?.retract).toBe(18);
    }
  });
  it('itemfunc 提取缺口登记：3020-3022 无条目（use 链走 HOOK_ITEMS 不饿死）', () => {
    expect(itemFuncOfVid(3020)).toBeNull();
    expect(itemFuncOfVid(3021)).toBeNull();
    expect(itemFuncOfVid(3022)).toBeNull();
    expect(HOOK_ITEMS[3020]).toBeDefined();            // 使用判定不经 itemfunc
  });
});

// ---------------------------------------------------------------------------
// ❌5328 金锁（Player.cs:40946-41010 + Chest.Lock Chest.cs:409-473）
// ---------------------------------------------------------------------------
describe('❌5328 金锁可锁样式表（Chest.cs:419-462 1:1）', () => {
  it('sheet21 常规锁位 1/3/35/37/39 → delta 36 无门（:428-431/:440-442）', () => {
    for (const style of [1, 3, 35, 37, 39]) {
      expect(chestLockOf(21, style * 36)).toEqual({ delta: 36, plantGate: false, ach: 0 });
    }
  });
  it('sheet21 群系锁位 18-22 → delta 180 + 世纪之花门（:432-439 num=180）', () => {
    for (const style of [18, 19, 20, 21, 22]) {
      expect(chestLockOf(21, style * 36)).toEqual({ delta: 180, plantGate: true, ach: 0 });
    }
  });
  it('sheet467 沙漠锁位 12 → delta 36 + 门 + 成就 20（:447-459）；已锁/无锁位 → null', () => {
    expect(chestLockOf(467, 12 * 36)).toEqual({ delta: 36, plantGate: true, ach: 20 });
    expect(chestLockOf(21, 2 * 36)).toBeNull();        // 已锁金箱（style2）default→false
    expect(chestLockOf(21, 23 * 36)).toBeNull();       // 已锁群系箱
    expect(chestLockOf(21, 0)).toBeNull();             // 木箱无锁位
    expect(chestLockOf(467, 13 * 36)).toBeNull();      // 已锁沙漠箱
    expect(chestLockOf(555, 0)).toBeNull();            // 非容器
  });
  it('数据锚：useTime 8/anim 15 + consumable（Item.cs:42246-42255）+ 注册在册', () => {
    const c = itemCombat(5328)!;
    expect(c.useTime).toBe(8);
    expect(c.useAnimation).toBe(15);
    expect(c.consumable).toBe(true);
    expect(FUN_USE_VIDS.has(5328)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ❌968 棉花糖烤制（Player.cs:49604-49641 静持烤制门）
// ---------------------------------------------------------------------------
describe('❌968 火棍棉花糖（holdStyle 1 静持 + 燃着篝火门）', () => {
  it('烤制门数据：篝火 tile 215 在库（TileID.Sets.Campfires）、点燃档 frameY<54 为代码常量', () => {
    const t = TILE_BY_KEY['v_215_campfires'];
    expect(t).toBeDefined();
    expect(TILE_DEFS[t]?.vanilla?.sheet).toBe(215);
  });
  it('产物 969 烤棉花糖在库：buffType 26/buffTime 36000（Item.cs SetFoodDefaults 档）', () => {
    expect(ITEM_BY_KEY['vi_969_CookedMarshmallow']).toBeDefined();
    const f = itemFuncOfVid(969)!;
    expect(f.buffType).toBe(26);
    expect(f.buffTime).toBe(36000);
    expect(f.consumable).toBeTruthy();
  });
  it('手持物 968 holdStyle 1（:49546 静持分支门）在库', () => {
    expect(ITEM_BY_KEY['vi_968_MarshmallowonaStick']).toBeDefined();
    expect(itemFuncOfVid(968)?.holdStyle).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ⚠️425 仙灵铃左键直用（Player.cs:52252-52272 三选一）
// ---------------------------------------------------------------------------
describe('⚠️425 仙灵铃（左键直用 = QuickBuff 同入口三选一）', () => {
  it('三选一只产出 27/101/102（:52258-52265 Next(3)），种子化全档可达', () => {
    const seen = new Set<number>();
    const r = lcg(425);
    for (let i = 0; i < 300; i++) seen.add(fairyBellVariant(r));
    expect([...seen].sort((a, b) => a - b)).toEqual([27, 101, 102]);
    expect(fairyBellVariant(() => 0)).toBe(27);
    expect(fairyBellVariant(() => 0.999)).toBe(102);
  });
  it('三色 BUFF_DEFS 全在库（27/101/102——101/102 缺条目时三掷只蓝档生效）', () => {
    const vanilla = new Set(Object.values(BUFF_DEFS).map((d) => d.vanillaBuff));
    for (const vb of [27, 101, 102]) expect(vanilla.has(vb)).toBe(true);
  });
  it('数据锚：buffType 27 + UseSound Item25（Item.cs:6312-6326）+ 注册在册', () => {
    expect(itemFuncOfVid(425)?.buffType).toBe(27);
    expect(itemUseSoundWav(425)).toBe('Item_25');
    expect(FUN_USE_VIDS.has(425)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ❌5343 货郎的背包（Player.cs:44749-44762 + Chest.cs:1271 旅商股票 +1）
// ---------------------------------------------------------------------------
describe('❌5343 货郎的背包（一次性旗 → 旅商每日股票 +1）', () => {
  it('数据锚：useTime/anim 45 + UseSound Item92（Item.cs:42368-42375）+ 注册在册', () => {
    const c = itemCombat(5343)!;
    expect(c.useTime).toBe(45);
    expect(c.useAnimation).toBe(45);
    expect(itemUseSoundWav(5343)).toBe('Item_92');
    expect(FUN_USE_VIDS.has(5343)).toBe(true);
  });
  it('公告文案键 Misc.PeddlersSatchelUsed 在库（ChatColors.World=50,255,130）', () => {
    expect((zhHans as Record<string, Record<string, string>>).Misc.PeddlersSatchelUsed)
      .toContain('背包');
  });
});

// ---------------------------------------------------------------------------
// ⚠️ 星云增益图标 173-181（NebulaLevelup :56091-56121 档位映射）
// ---------------------------------------------------------------------------
describe('⚠️ 星云增益图标 173-181（Player.nebulaBuffIcons 档位映射）', () => {
  it('档位→原版 buff id：0=伤 179-181 / 1=命 173-175 / 2=魔 176-178（:56109/:56113/:56117）', async () => {
    const { Player } = await import('../src/entities/Player');
    const p = new Player(0, 0);
    p.nebulaLevelup(0);                                 // 伤 L1 → 179
    p.nebulaLevelup(0);
    p.nebulaLevelup(1);                                 // 命 L1 → 173
    p.nebulaLevelup(2);                                 // 魔 L1 → 176
    p.nebulaLevelup(2);
    p.nebulaLevelup(2);                                 // 魔 L3 → 178
    const icons = p.nebulaBuffIcons();
    const vbOf = (fam: number) => icons.find((n) => n.fam === fam)?.vanillaBuff;
    expect(vbOf(0)).toBe(180);                          // 179+2-1
    expect(vbOf(1)).toBe(173);                          // 173+1-1
    expect(vbOf(2)).toBe(178);                          // 176+3-1
    expect(icons.every((n) => n.secs === 8)).toBe(true);   // 480t/60
  });
  it('等级 0 族不出块；nebulaCancel 清族（右键 DelBuff 等价）', async () => {
    const { Player } = await import('../src/entities/Player');
    const p = new Player(0, 0);
    expect(p.nebulaBuffIcons()).toEqual([]);
    p.nebulaLevelup(0);
    expect(p.nebulaBuffIcons()).toHaveLength(1);
    p.nebulaCancel(0);
    expect(p.nebulaBuffIcons()).toEqual([]);
  });
  it('图标素材 Buff_173-181.png 全在盘（UI 直链 /sprites/vanilla/）', async () => {
    const fs = await import('node:fs');
    for (let vb = 173; vb <= 181; vb++) {
      expect(fs.existsSync(`public/sprites/vanilla/Buff_${vb}.png`)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ⚠️3353 机械矿车皮肤分档（Mount.cs:1505-1506 发光层）
// ---------------------------------------------------------------------------
describe('⚠️3353 机械矿车（mount 11 皮肤/发光层分档）', () => {
  it('mount 11 frontTexture=Mech + frontTextureGlow=MechGlow（Mount.cs:1505-1506）', () => {
    const m = MOUNT_DATA['11'];
    expect(m?.frontTexture).toBe('Mount_MinecartMech.png');
    expect(m?.frontTextureGlow).toBe('Mount_MinecartMechGlow.png');
  });
  it('矿车实体随 mount 档取发光层（applyMountStats 接线）；普通矿车 6/13 无发光层', () => {
    const mech = new Minecart();
    mech.mountId = 11;
    mech.applyMountStats();
    expect(mech.textureGlow).toBe('Mount_MinecartMechGlow.png');
    expect(mech.texture).toBe('vanilla/Mount_MinecartMech.png');   // CART_MOUNT_TEXTURES 前缀
    const wood = new Minecart();
    wood.mountId = 13;
    wood.applyMountStats();
    expect(wood.textureGlow).toBeNull();
  });
  it('发光贴图在盘（Mount_MinecartMechGlow.png）', async () => {
    const fs = await import('node:fs');
    expect(fs.existsSync('public/sprites/vanilla/Mount_MinecartMechGlow.png')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ⚠️5644 占卜球 / ⚠️1450 泡泡棒回归锁（已实装批）
// ---------------------------------------------------------------------------
describe('⚠️5644 占卜球 + ⚠️1450 泡泡棒回归锁（已实装批）', () => {
  it('5644：useTime/anim 100、不消耗（Item.cs:44324-44333）；不在 FUN_USE（独立分支）', () => {
    const c = itemCombat(5644)!;
    expect(c.useTime).toBe(100);
    expect(c.useAnimation).toBe(100);
    expect(c.consumable).toBeUndefined();
    expect(FUN_USE_VIDS.has(5644)).toBe(false);
  });
  it('1450：注册在册 + useTime 25（Item.cs:17951-17963）+ gore 掷骰档位链稳定', () => {
    expect(FUN_USE_VIDS.has(1450)).toBe(true);
    expect(itemCombat(1450)?.useTime).toBe(25);
    const roll = bubbleWandGoreRoll(lcg(1450));
    if (roll) expect([411, 412, 413, 414, 415]).toContain(roll.goreType);
  });
});
