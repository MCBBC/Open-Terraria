// 召唤/事件道具审计修复批回归（2026-08-22，docs/audit/item-audit-2026-08-22.md
// 「召唤物/事件触发/功能杂项/电路工具」分区 ❌1 + ⚠️useTime 五件 + ⚠️BOSS_FAMILY 四对）：
//   ① 1133 蜜蜂分泌物丛林可用门（Player.cs:51415-51417 `type==1133 && !ZoneJungle →
//      flag=false`——丛林外整支不可用：不挥动/不消耗/无冷却/无提示）
//   ② useTime 五件：43 克眼 30→45（门拦下不挥动不置冷却）/ 2767 日耀碑牌 60→45 /
//      2350 回归药水引导 90→30（表条目）/ 849 致动器放置 5→10 / 3620 致动魔杖 15→5
//   ③ BOSS_FAMILY 补机械三王/史后四对（SummonItemCheck Player.cs:41521-41524 同型门）
//   ④ vanilla-itemcombat.json 补 544/556/557/2350 useTime 条目（提取器盲区，
//      tools/extract-itemcombat.mjs 已加回填防重生成丢失）
// 测试缝说明：updateUse 物品链无单测缝（Game 构造依赖渲染器），门/冷却落点用
// 花括号配平源断言（同 tests/handover-1457-gates.test.ts 惯例）；
// useSuspiciousEye / bossFamilyActive / useWireTool 三个窄方法用 Game.prototype 桩直驱。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/core/Game';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { VI_ID } from '../src/data/itemKeys';
import { World } from '../src/world/World';
import { Wiring, TOOL_ACTUATOR, TOOL_RED } from '../src/world/Wiring';
import { TileStore } from '../src/world/TileStore';
import { Inventory } from '../src/items/Inventory';
import { TILE } from '../src/core/constants';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LINES = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8').split('\n');

function lineOf(anchor: string): number {
  const i = LINES.findIndex((l) => l.includes(anchor));
  expect(i, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return i;
}

/** 锚点行起花括号配平取整块（含锚行；锚行内自闭合的 `{}` 不提前终止——逐行末判深度） */
function blockFrom(anchor: string, occurrence = 1): string {
  let seen = 0;
  let start = -1;
  for (let i = 0; i < LINES.length; i++) {
    if (LINES[i].includes(anchor)) { seen++; if (seen === occurrence) { start = i; break; } }
  }
  expect(start, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  let depth = 0;
  let opened = false;
  const out: string[] = [];
  for (let i = start; i < LINES.length; i++) {
    out.push(LINES[i]);
    for (const ch of LINES[i]) {
      if (ch === '{') { depth++; opened = true; }
      else if (ch === '}') depth--;
    }
    if (opened && depth <= 0) break;
  }
  return out.join('\n');
}

/** switch case 块：`case N:` 行 → 下一个 `break;` 行（case 体无自有花括号配平语义） */
function caseBlock(caseAnchor: string): string {
  const start = lineOf(caseAnchor);
  const end = LINES.findIndex((l, i) => i > start && l.trim().startsWith('break;'));
  expect(end, `break after ${caseAnchor} not found`).toBeGreaterThan(start);
  return LINES.slice(start, end + 1).join('\n');
}

// ---------------------------------------------------------------------------
// ④+② 数据面：vanilla-itemcombat.json 条目（Item.cs SetDefaults 权威值）
// ---------------------------------------------------------------------------
describe('itemcombat 表条目（Item.cs SetDefaults）', () => {
  it('机械三王召唤物 544/556/557 补条目 useTime=useAnimation=45 + consumable', () => {
    // Item.cs:7855-7862/:7987-7994/:8000-8007（DisabledBossSummonVariant if 块内,
    // 深度 1 扫描盲区——此前整条缺,Game 侧靠 `?? 45` 兜底）
    for (const vid of [544, 556, 557]) {
      const c = itemCombat(vid);
      expect(c, `vid ${vid}`).not.toBeNull();
      expect(c!.useTime, `vid ${vid} useTime`).toBe(45);
      expect(c!.useAnimation, `vid ${vid} useAnimation`).toBe(45);
      expect(c!.consumable, `vid ${vid} consumable`).toBe(true);
    }
  });

  it('回归药水 2350 补 useTime=useAnimation=30（引导冷却 3 倍拉长根因）', () => {
    // Item.cs:23621 `useTime = (useAnimation = 30)` 链式赋值未解析——此前表条目
    // 只有 consumable/useTurn,Game.ts:9020 `?? 90` 兜底错值
    const c = itemCombat(2350)!;
    expect(c.useTime).toBe(30);
    expect(c.useAnimation).toBe(30);
    expect(c.consumable).toBe(true);
    // 对照组：传送药水 2351 本就 17,不得被回填波及
    expect(itemCombat(2351)!.useTime).toBe(17);
  });

  it('克眼 43 / 日耀碑牌 2767 useTime 45；致动器 849=10 / 致动魔杖 3620=5', () => {
    expect(itemCombat(43)!.useTime).toBe(45);      // Item.cs:1873
    expect(itemCombat(2767)!.useTime).toBe(45);    // Item.cs:26389
    expect(itemCombat(849)!.useTime).toBe(10);     // Item.cs:11315
    expect(itemCombat(3620)!.useTime).toBe(5);     // Item.cs:32588
  });
});

// ---------------------------------------------------------------------------
// ③ BOSS_FAMILY 四对（SummonItemCheck :41521-41524 同型门收口）
// ---------------------------------------------------------------------------
const FAMILY = (Game as unknown as { BOSS_FAMILY: Record<string, number[]> }).BOSS_FAMILY;

describe('BOSS_FAMILY 机械三王/史后四对', () => {
  it('twins:[125,126] / destroyer:[134] / skeletron_prime:[127] / queen_slime:[657]', () => {
    // 双子任一体存活即拦（原版 544 对 125/126 逐 NPC 判定,两条并列）
    expect(FAMILY.twins).toEqual([125, 126]);
    expect(FAMILY.destroyer).toEqual([134]);
    expect(FAMILY.skeletron_prime).toEqual([127]);
    expect(FAMILY.queen_slime).toEqual([657]);
  });

  it('bossFamilyActive:家族任一成员在场即拦;其他 Boss(含已死同型)在场不拦', () => {
    const g = Object.create(Game.prototype) as unknown as {
      entities: { enemies: Array<{ dead: boolean; vanillaId: number }> };
      bossFamilyActive: (f: number[]) => boolean;
    };
    const withEnemies = (list: Array<{ dead: boolean; vanillaId: number }>) => {
      g.entities = { enemies: list };
      return g;
    };
    // 毁灭者召唤物 556：毁灭者 134 在场 → 拦；双子 126 在场 → 不拦（旧"任意 Boss"门白烧）
    expect(withEnemies([{ dead: false, vanillaId: 134 }]).bossFamilyActive(FAMILY.destroyer)).toBe(true);
    expect(withEnemies([{ dead: false, vanillaId: 126 }]).bossFamilyActive(FAMILY.destroyer)).toBe(false);
    // 双子门：任一体现活即拦;全灭(或仅剩尸体)不拦
    expect(withEnemies([{ dead: false, vanillaId: 125 }]).bossFamilyActive(FAMILY.twins)).toBe(true);
    expect(withEnemies([{ dead: true, vanillaId: 125 }]).bossFamilyActive(FAMILY.twins)).toBe(false);
    expect(withEnemies([
      { dead: true, vanillaId: 125 },
      { dead: false, vanillaId: 126 },
    ]).bossFamilyActive(FAMILY.twins)).toBe(true);
    // 史莱姆皇后 657 / 机械颅 127 同门
    expect(withEnemies([{ dead: false, vanillaId: 657 }]).bossFamilyActive(FAMILY.queen_slime)).toBe(true);
    expect(withEnemies([{ dead: false, vanillaId: 4 }]).bossFamilyActive(FAMILY.queen_slime)).toBe(false);
    expect(withEnemies([{ dead: false, vanillaId: 127 }]).bossFamilyActive(FAMILY.skeletron_prime)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ① 1133 蜜蜂分泌物丛林门（Player.cs:51415-51417）
// ---------------------------------------------------------------------------
describe('1133 蜜蜂分泌物丛林可用门', () => {
  it('case 1133 前置 !zoneJungle 静默门:门外不召唤/不消耗/不置冷却', () => {
    const blk = caseBlock('case 1133:');
    // 门与召唤同表达式——门外短路,summonBoss/consume/useTime 全在门内
    expect(blk).toContain('this.scene?.zoneJungle && this.summonBoss(\'queen_bee\'');
    expect(blk).toContain('consume()');
    expect(blk).toContain('p.useTime = 45');
    // 门必须先于召唤（&& 短路序:zoneJungle 在前）
    const gate = blk.indexOf('this.scene?.zoneJungle');
    const summon = blk.indexOf("summonBoss('queen_bee'");
    expect(gate).toBeGreaterThan(-1);
    expect(summon).toBeGreaterThan(gate);
    // 旧实现无门（注释误记"无门"系 1405 口径）——不得回退成无条件召唤
    expect(blk).not.toMatch(/if \(this\.summonBoss\('queen_bee'/);
  });

  it('useStyle4 举持动画对 1133 例外:丛林门外不挥动（整支不可用语义）', () => {
    // switch 前的无条件 useSwing 已改为排除 1133（挥动移入 case 成功分支）。
    // ★邻近查找（2026-08-22）：行偏移锚被后续批在 useSwing 行与 switch 之间插注释
    // （UseSound Item92 段）移位——改为窗口内找 switch 行,语义不变
    const swingLine = lineOf('if (pvid !== 1133) this.useSwing(heldDef);');
    const nearSwitch = LINES.slice(swingLine + 1, swingLine + 6).findIndex((l) => l.includes('switch (pvid) {'));
    expect(nearSwitch).toBeGreaterThanOrEqual(0);
    // case 成功分支内补挥动
    const blk = caseBlock('case 1133:');
    expect(blk).toContain('this.useSwing(heldDef)');
    const gate = blk.indexOf('this.scene?.zoneJungle');
    const swing = blk.indexOf('this.useSwing(heldDef)');
    expect(swing).toBeGreaterThan(gate);
  });
});

// ---------------------------------------------------------------------------
// ② useTime 五件（代码落点）
// ---------------------------------------------------------------------------
describe('useTime 五件落点（Game.ts）', () => {
  it('克眼 43:白天/同型拦下不挥动不置冷却,成功支 useTime=itemCombat(43)??45', () => {
    const blk = blockFrom('if (viIdFromKey(heldDef.key) === 43) {');
    // 门拦下（白天/场上已有 NPC 4）→ 整支不可用:挥动移入成功分支
    expect(blk).toContain('!this.world.clock.isDay && this.useSuspiciousEye()');
    const gate = blk.indexOf('this.useSuspiciousEye()');
    const swing = blk.indexOf('this.useSwing(');
    expect(swing).toBeGreaterThan(gate);
    // useTime 45（Item.cs:1873）——旧写死 30 且在门外的整支路径
    expect(blk).toContain('itemCombat(43)?.useTime ?? 45');
    expect(blk).not.toMatch(/useTime = 30/);
    // 消耗在成功支内
    const consume = blk.indexOf('inv.removeAt');
    expect(consume).toBeGreaterThan(gate);
  });

  it('日耀碑牌 2767:成功支 useTime=itemCombat(2767)??45（旧 60）', () => {
    const blk = blockFrom('if (useSolarTablet(this.world, this.eclipseHost())) {');
    expect(blk).toContain('itemCombat(2767)?.useTime ?? 45');
    expect(blk).not.toMatch(/useTime = 60/);
  });

  it('回归药水 2350 引导走 itemCombat(tvid)?.useTime（表 30 生效,兜 90 不再命中）', () => {
    // 传送族引导冷却统一读表（Game.ts TELEPORT_ITEM_VIDS 支）——2350 表条目补 30 后
    // 该路径即得原版值;此处锁"读表"不回退成写死
    const blk = blockFrom('const useTime = itemCombat(tvid)?.useTime ?? 90;');
    expect(blk).toContain('const useTime = itemCombat(tvid)?.useTime ?? 90;');
    // 2350 触发 tick 20（:42444 itemTime==20）不受冷却改动影响
    expect(blk).toContain('tvid === 2350 ? 20 :');
  });

  it('致动器 849 放置 useTime=10、红扳手 509=5（逐工具读表,旧统一 5）', () => {
    const blk = blockFrom('if (placed) {');   // useWireTool 放置支（全仓唯一）
    expect(blk).toContain('inv.remove(VI_ID(530), needWire)');
    expect(blk).toContain('inv.remove(VI_ID(849), needActuator)');
    expect(blk).toContain('itemCombat(viIdFromKey(itemDef.key))?.useTime ?? 5');
    expect(blk).not.toMatch(/useTime = 5;/);
  });

  it('致动魔杖 3620 翻转 useTime=5（旧 15）', () => {
    const blk = blockFrom('if (wt.rod) {');
    expect(blk).toContain('itemCombat(3620)?.useTime ?? 5');
    expect(blk).not.toMatch(/useTime = 15/);
  });
});

// ---------------------------------------------------------------------------
// ② 行为面：useWireTool 直驱（致动器/魔杖/扳手三工具冷却）
// ---------------------------------------------------------------------------
/** useWireTool 可驱动的最小 Game 桩（真实 Wiring + Inventory） */
function wireGame() {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const world = new World(80, 80, 20, 'wg');
  const wiring = new Wiring(world.store);
  const inv = new Inventory();
  const player = { cx: 40 * TILE, cy: 40 * TILE, useTime: 0, inv };
  g.world = world;
  g.wiring = wiring;
  g.player = player;
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  g.netCanEditTile = () => true;
  g.inTileRange = () => true;
  return {
    g: g as unknown as { useWireTool: (tx: number, ty: number, d: unknown) => void },
    world, wiring, inv, player,
  };
}

const defOf = (vid: number): unknown => {
  const key = VANILLA_ITEM_KEY_BY_ID[vid];
  expect(key, `no item key for vid ${vid}`).toBeTruthy();
  return ITEM_DEFS[ITEM_BY_KEY[key!]!];
};

describe('useWireTool 逐工具 useTime（Item.cs:11315/:32588）', () => {
  it('致动器 849 放置:置 WIRE_ACTUATOR + useTime 10（旧统一 5,冷却减半偏差）', () => {
    const { g, world, inv, player } = wireGame();
    inv.add(VI_ID(849), 5);
    g.useWireTool(30, 30, defOf(849));
    expect(world.store.wire[world.store.idx(30, 30)] & TileStore.WIRE_ACTUATOR)
      .toBe(TileStore.WIRE_ACTUATOR);
    expect(player.useTime).toBe(10);
  });

  it('致动魔杖 3620 翻转:已有致动器格 actuate 成功 + useTime 5（旧 15）', () => {
    const { g, wiring, player } = wireGame();
    expect(wiring.placeActuator(30, 30)).toBe(true);
    g.useWireTool(30, 30, defOf(3620));
    expect(player.useTime).toBe(5);
  });

  it('红扳手 509 铺红线:置 WIRE_RED + useTime 5（原版不变,防回归）', () => {
    const { g, world, inv, player } = wireGame();
    inv.add(VI_ID(530), 10);
    g.useWireTool(30, 30, defOf(509));
    expect(world.store.wire[world.store.idx(30, 30)] & TileStore.WIRE_RED)
      .toBe(TileStore.WIRE_RED);
    expect(player.useTime).toBe(5);
  });

  it('材料不足不放置不置冷却（门先于 useTime）', () => {
    const { g, world, player } = wireGame();
    g.useWireTool(30, 30, defOf(849));   // 无 849 库存
    expect(world.store.wire[world.store.idx(30, 30)] & TileStore.WIRE_ACTUATOR).toBe(0);
    expect(player.useTime).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ② 行为面：useSuspiciousEye 门（克眼 43 消耗语义）
// ---------------------------------------------------------------------------
describe('useSuspiciousEye 门（43 白天/同型拦下不消耗）', () => {
  function eyeGame(opts: { day: boolean; enemies: Array<{ dead: boolean; vanillaId: number }> }) {
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    const toasts: string[] = [];
    const summoned: string[] = [];
    g.world = { clock: { isDay: opts.day } };
    g.cb = { onToast: (t: string) => toasts.push(t) };
    g.entities = { enemies: opts.enemies };
    g.spawnEyePending = true;
    g.findOffscreenSpawnPoint = () => ({ tx: 40, ty: 20 });
    g.summonBossAtTx = (key: string) => { summoned.push(key); return true; };
    return {
      g: g as unknown as { useSuspiciousEye: () => boolean },
      toasts,
      summoned,
    };
  }

  it('白天 → false + 提示,不召唤不置 spawnEyePending', () => {
    const { g, toasts, summoned } = eyeGame({ day: true, enemies: [] });
    expect(g.useSuspiciousEye()).toBe(false);
    expect(summoned).toHaveLength(0);
    expect(toasts.length).toBeGreaterThan(0);
  });

  it('夜晚场上已有 NPC 4 → false（SummonItemCheck 43↔4 同型拦,不消耗）', () => {
    const { g, summoned } = eyeGame({ day: false, enemies: [{ dead: false, vanillaId: 4 }] });
    expect(g.useSuspiciousEye()).toBe(false);
    expect(summoned).toHaveLength(0);
  });

  it('夜晚其他 Boss 在场不拦（此前误用全 Boss 门会白吞眼球）', () => {
    const { g, summoned } = eyeGame({ day: false, enemies: [{ dead: false, vanillaId: 50 }] });
    expect(g.useSuspiciousEye()).toBe(true);
    expect(summoned).toEqual(['eye_of_cthulhu']);
  });
});

// ---------------------------------------------------------------------------
// ① 行为面：1133 门表达式语义（zoneJungle 取 SceneMetrics 既有位）
// ---------------------------------------------------------------------------
describe('1133 门取位（SceneMetrics.zoneJungle）', () => {
  it('scene.zoneJungle 为 SceneMetrics 既有字段（非自造状态）', async () => {
    const { EMPTY_SCENE } = await import('../src/world/SceneMetrics');
    const s = EMPTY_SCENE as unknown as Record<string, unknown>;
    expect('zoneJungle' in s).toBe(true);
    // 与同族群系门（4988 zoneHallow / 5120 zoneSnow）同一取位口径
    expect('zoneHallow' in s).toBe(true);
    expect('zoneSnow' in s).toBe(true);
  });

  it('TOOL 掩码:849 单放致动器位（wireTool.place=TOOL_ACTUATOR,逐工具读表前提）', () => {
    const key = VANILLA_ITEM_KEY_BY_ID[849];
    expect(ITEM_DEFS[ITEM_BY_KEY[key!]!]?.wireTool?.place).toBe(TOOL_ACTUATOR);
    const wkey = VANILLA_ITEM_KEY_BY_ID[509];
    expect(ITEM_DEFS[ITEM_BY_KEY[wkey!]!]?.wireTool?.place).toBe(TOOL_RED);
  });
});
