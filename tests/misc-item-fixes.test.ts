// 补 C 审计（docs/audit/item-audit-2026-08-22.md「buffType 余量 / other 类全量补审计」）
// 趣味件 ❌13 + ⚠️4 修复批回归锁。标杆 = ../Terarria1456/（行号均亲核反编译原文；
// 1457 已核全同——各项行为/数值在 1457 逐条比对无差异,行号仍标 1456 口径）：
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
//   968 棉花糖          Player.cs:50955-50994（1456 :49606-49645；holdStyle 1 静持 +
//                       燃着篝火 frameY<54 门，miscTimer>900 → 掉 969 烤棉花糖）
//                       ——2026-08-23 实装转正：态机 FunItems.marshmallowRoastStep +
//                       探测格 marshmallowProbeTile + Game.checkMarshmallowRoast
//                       （miscTimer=Player 字段 :1339，1456 :1244）
//   425 仙灵铃          Player.cs:52252-52272（左键直用三选一 27/101/102——QuickBuff 同入口）
//   5343 货郎背包       Player.cs:44749-44762（一次性旗 → 旅商股票 +1，Chest.cs:1271）
//   ⚠️ 星云图标 173-181 Player.cs:56091-56121 NebulaLevelup + :11660 UpdateBuffs_NebulaBuffs
//   ⚠️ 3353 机械矿车     Mount.cs:1505-1506 frontTextureGlow=MinecartMechMount[1]
//   ⚠️ 5644 占卜球       （Game.ts:9382 已实装批）回归锁
//   ⚠️ 1450/4673/508    （FunItems.ts 已实装批）回归锁
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  instrumentUseSound, drumSoundFile, bubbleWandGoreRoll, hiveBeeRoll,
  fairyBellVariant, chestLockOf,
  marshmallowRoastStep, marshmallowProbeTile, MARSHMALLOW_FRAME, MARSHMALLOW_COOK_TICKS,
} from '../src/items/FunItems';
import { FUN_USE_VIDS, Game } from '../src/core/Game';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { World } from '../src/world/World';
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

describe('❌4673 鼓槌回归锁（Player.cs:47003-47025 + PlayDrums :47108-47157 + LP:1238 映射）', () => {
  it('注册在册 + 10 档音色边界（音型+86 落 Item_139~148、兜底 Item146）', () => {
    expect(FUN_USE_VIDS.has(4673)).toBe(true);
    expect(drumSoundFile(0)).toBe('Item_146');
    expect(drumSoundFile(0.95)).toBe('Item_145');      // 音型 59 → 139+59-53
    expect(drumSoundFile(0.11)).toBe('Item_141');      // 音型 55
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
// 968 棉花糖烤制（Player.cs:50955-50994 静持烤制门——实装转正：态机
//   FunItems.marshmallowRoastStep / 探测格 marshmallowProbeTile /
//   使用链 Game.checkMarshmallowRoast；miscTimer=Player 字段 :1339）
// ---------------------------------------------------------------------------
/** 烤制桩：小世界 + 玩家中置（中心 (392,648)=格(24,40)）+ 手持 968 + 探测格布
 *  篝火；Game 走原型桩（consumable-remainder 同式）——spawnDrop 捕获掉落、
 *  miscTimer 直读 Player 字段（烤制态真身） */
const ROAST_X = 382, ROAST_Y = 627;
const mkRoast = (o: {
  fireFrameY?: number | null;   // null=探测格不布块；数值=篝火 frameY（0 燃着/54 熄灭档边界）
  heldKey?: string | null;      // undefined=968 / null=空手 / 其余=该键物品
  stack?: number;
  timer?: number;               // 预置 miscTimer（烤制态真身）
  dead?: boolean;
  pulley?: boolean;
  facing?: number;
} = {}) => {
  const w = new World(64, 64, 32, 'roast');
  const p = new Player(0, 0, new Inventory());
  p.x = ROAST_X; p.y = ROAST_Y;
  p.facing = o.facing ?? 1;
  p.dead = !!o.dead;
  p.pulley = !!o.pulley;
  const { tx, ty } = marshmallowProbeTile(p.x, p.y, p.w, p.facing);
  if (o.fireFrameY !== null) {
    w.store.setTileSilent(tx, ty, TILE_BY_KEY['v_215_campfires'], 0, o.fireFrameY ?? 0);
  }
  const heldId = o.heldKey === null ? -1
    : ITEM_BY_KEY[o.heldKey ?? 'vi_968_MarshmallowonaStick'];
  p.inv.slots[0] = heldId >= 0 ? { id: heldId, stack: o.stack ?? 1 } : null;
  p.miscTimer = o.timer ?? 0;
  const drops: Array<{ x: number; y: number; key: string; stack: number }> = [];
  let invChanged = 0;
  const g = Object.create(Game.prototype) as unknown as
    { checkMarshmallowRoast: () => void } & Record<string, unknown>;
  g.world = w;
  g.player = p;
  g.cb = { onInventoryChanged: () => { invChanged++; } };
  g.spawnDrop = (x: number, y: number, key: string, stack: number) => {
    drops.push({ x, y, key, stack });
    return null;
  };
  return {
    w, p, drops, tx, ty,
    tick: () => g.checkMarshmallowRoast(),
    invChanged: () => invChanged,
  };
};

describe('968 棉花糖烤制（holdStyle 1 静持 + 燃着篝火 frameY<54 门）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
  it('手持物 968 holdStyle 1（:50881 静持分支门，1456 :49532）在库', () => {
    expect(ITEM_BY_KEY['vi_968_MarshmallowonaStick']).toBeDefined();
    expect(itemFuncOfVid(968)?.holdStyle).toBe(1);
  });
  it('探测格几何 1:1（:50957/:51020/:50960-50961）：中心前 2 格下一行——32×10 整图帧 + 900t 门', () => {
    expect(MARSHMALLOW_FRAME).toEqual({ w: 32, h: 10 });  // Item_968.png 整图（GetDrawHitbox 非 IsFood 无动画）
    expect(MARSHMALLOW_COOK_TICKS).toBe(900);             // :50973 miscTimer > 900
    // 中心 (392,648)=格(24,40)：facing=1 → 探测 (26,41)（+2 列 +1 行）、facing=-1 → (22,41)
    expect(marshmallowProbeTile(382, 627, 20, 1)).toEqual({ tx: 26, ty: 41 });
    expect(marshmallowProbeTile(382, 627, 20, -1)).toEqual({ tx: 22, ty: 41 });
  });
  it('燃着门：点燃档（frameY 0）累积、熄灭档（frameY 54 门界）与空格归零（:50966/:50994）', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.9);   // Next(5)≠0 无加掷
    const lit = mkRoast({ fireFrameY: 0 });
    for (let i = 0; i < 10; i++) lit.tick();
    expect(lit.p.miscTimer).toBe(10);
    expect(lit.drops).toHaveLength(0);
    const unlit = mkRoast({ fireFrameY: 54 });
    unlit.p.miscTimer = 500;
    unlit.tick();
    expect(unlit.p.miscTimer).toBe(0);
    const bare = mkRoast({ fireFrameY: null });
    bare.p.miscTimer = 500;
    bare.tick();
    expect(bare.p.miscTimer).toBe(0);
  });
  it('时长累积：无加掷 +1/tick 恰 901t 烤成（900t 严格不烤）；Next(5)==0 加掷 +2/tick 恰 451t', () => {
    const r09 = () => 0.9;
    let t = 0, cooked = 0;
    for (let i = 0; i < 901; i++) {
      const s = marshmallowRoastStep(t, true, r09);
      t = s.timer;
      if (s.cooked) cooked++;
    }
    expect(cooked).toBe(1);
    expect(t).toBe(0);                                    // 烤成即归零（:50975）
    let u = 0;
    for (let i = 0; i < 900; i++) u = marshmallowRoastStep(u, true, r09).timer;
    expect(u).toBe(900);                                  // >900 严格门：900t 不烤
    let v = 0, cooked2 = 0;
    for (let i = 0; i < 451; i++) {
      const s = marshmallowRoastStep(v, true, () => 0);   // Next(5)==0 恒加掷
      v = s.timer;
      if (s.cooked) cooked2++;
    }
    expect(cooked2).toBe(1);
  });
  it('产物 969 掉落 + 968 消耗：>900t 一 tick 掉 1 熟棉花糖、手持 stack-1；1 堆尽清格（TurnToAir）', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.9);
    const two = mkRoast({ timer: 900, stack: 2 });
    two.tick();
    expect(two.drops).toEqual([{
      x: two.p.cx, y: two.p.cy,                           // QuickSpawnItem(969)→RequestItemAt player.Center（:50976/:7202;RV1 复核：曾左上偏 8px）
      key: 'vi_969_CookedMarshmallow', stack: 1,
    }]);
    expect(two.p.inv.slots[0]).toEqual({ id: ITEM_BY_KEY['vi_968_MarshmallowonaStick'], stack: 1 });  // 消耗 1 不清格
    expect(two.p.miscTimer).toBe(0);                      // :50975
    expect(two.invChanged()).toBe(1);
    const one = mkRoast({ timer: 900, stack: 1 });
    one.tick();
    expect(one.p.inv.slots[0]).toBeNull();                // stack==0 → TurnToAir（:50978-50981）
    const idle = mkRoast({ timer: 100, stack: 3 });       // 未烤成不掉不耗
    idle.tick();
    expect(idle.drops).toHaveLength(0);
    expect(idle.p.inv.slots[0]).toEqual({ id: ITEM_BY_KEY['vi_968_MarshmallowonaStick'], stack: 3 });
  });
  it('离火中断：累积中挖火归零、回火从 0 重积（:50994 else 支）', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.9);
    const r = mkRoast({ fireFrameY: 0, timer: 500 });
    r.tick();
    expect(r.p.miscTimer).toBe(501);                      // 火上继续积
    r.w.store.setTileSilent(r.tx, r.ty, 0, 0, 0);         // 挖掉篝火
    r.tick();
    expect(r.p.miscTimer).toBe(0);
    expect(r.drops).toHaveLength(0);
    r.w.store.setTileSilent(r.tx, r.ty, TILE_BY_KEY['v_215_campfires'], 0, 0);
    r.tick();
    expect(r.p.miscTimer).toBe(1);                        // 从 0 重积
  });
  it('分支外冻结（原版语义）：换持/空手/死亡/pulley 均不清 miscTimer（死亡不跑 ItemCheck、:50881 && !pulley）', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.9);
    for (const o of [
      { heldKey: 'vi_969_CookedMarshmallow' as string | null },   // 换持非 968
      { heldKey: null as string | null },                         // 空手
      { dead: true },
      { pulley: true },                                           // 绳端悬挂（onRope 攀爬不门——原版同）
    ]) {
      const r = mkRoast({ fireFrameY: 0, timer: 500, ...o });
      r.tick();
      expect(r.p.miscTimer).toBe(500);
      expect(r.drops).toHaveLength(0);
    }
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
    const p = new Player(0, 0, new Inventory());
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
    const p = new Player(0, 0, new Inventory());
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
